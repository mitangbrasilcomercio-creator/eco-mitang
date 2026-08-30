-- ============================================================================
-- 22. PARCEIROS DE NEGOCIO, PLANO DE CONTAS E CONTAS A PAGAR
-- ============================================================================
--
-- [ERRO ANTERIOR]:
-- 1. O modulo de Contas a Pagar (204 obrigacoes, os cards de R$ 99.962,04 e
--    R$ 89.547,79 do painel executivo) NAO tinha tabela nenhuma no banco. Os
--    dados viviam so em 'database/local_mirror/obrigacoes_recorrentes.json'.
-- 2. Pior: 'POST /financeiro/categorizar-transacao' gravava apenas nesse JSON,
--    e o worker diario de sincronizacao sobrescreve o arquivo a partir do
--    Postgres. Toda categorizacao feita pelo usuario era perdida em ate 24h.
-- 3. 'clientes.tipo_entidade' existia no banco, mas foi criada por um script
--    avulso (scripts/classify_business_partners.js) e nao por migration --
--    deriva de schema pura, apesar de o repositorio ja filtrar por ela.
-- 4. 'status_vencimento' era um valor congelado no JSON: um titulo "A_VENCER"
--    continuava "A_VENCER" para sempre, mesmo depois de vencer.
--
-- [COMO FOI CORRIGIDO]:
-- 1. Tabelas reais para parceiros, plano de contas e obrigacoes.
-- 2. Chave natural unica por obrigacao, para o seed ser idempotente.
-- 3. 'status_vencimento' deixa de ser coluna e passa a ser calculado contra a
--    data corrente, pela view vw_obrigacoes_recorrentes.
-- 4. 'clientes.tipo_entidade' formalizada aqui, encerrando a deriva.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE tipo_operacao_financeira AS ENUM ('DESPESA', 'RECEITA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_entidade_parceiro AS ENUM (
        'CLIENTE',
        'COLABORADOR_PJ',
        'SOCIO_DIRETORIA',
        'FORNECEDOR_INSUMO',
        'PRESTADOR_CONTINUO',
        'INFRAESTRUTURA_FIXA',
        'GOVERNO_TRIBUTO',
        'INSTITUICAO_FINANCEIRA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE macro_categoria_conta AS ENUM (
        'RECURSOS_HUMANOS',
        'PRODUCAO_INSUMOS',
        'TRIBUTOS',
        'FINANCEIRO',
        'SERVICOS_TERCEIROS',
        'INFRAESTRUTURA',
        'SOCIOS_DIRETORIA',
        'COMERCIAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_pagamento_obrigacao AS ENUM ('PAGO', 'A_PAGAR', 'PROGRAMADO', 'CANCELADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE recorrencia_obrigacao AS ENUM ('UNICA', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'PARCELADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ---------------------------------------------------------------------------
-- 2. FORMALIZA A COLUNA CRIADA FORA DE MIGRATION (deriva de schema D5)
-- ---------------------------------------------------------------------------
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_entidade VARCHAR(50) NOT NULL DEFAULT 'CLIENTE';
CREATE INDEX IF NOT EXISTS idx_clientes_tipo_entidade ON clientes (empresa_id, tipo_entidade);

-- ---------------------------------------------------------------------------
-- 3. PLANO DE CONTAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plano_contas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    macro_categoria     macro_categoria_conta    NOT NULL,
    categoria_detalhada VARCHAR(150)             NOT NULL,
    tipo_operacao       tipo_operacao_financeira NOT NULL DEFAULT 'DESPESA',
    -- Despesa fixa entra na base de custo recorrente da projecao de runway;
    -- variavel, nao.
    e_custo_fixo        BOOLEAN                  NOT NULL DEFAULT FALSE,
    ativo               BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),

    CONSTRAINT unq_plano_contas UNIQUE (macro_categoria, categoria_detalhada)
);

-- ---------------------------------------------------------------------------
-- 4. PARCEIROS DE NEGOCIO
-- ---------------------------------------------------------------------------
-- Nem todo favorecido de uma obrigacao e um 'cliente'. Colaboradores PJ,
-- socios, concessionarias e a Receita Federal tambem recebem pagamentos.
CREATE TABLE IF NOT EXISTS parceiros_negocio (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    cliente_id     UUID REFERENCES clientes(id) ON DELETE SET NULL,
    nome           VARCHAR(255)          NOT NULL,
    documento      VARCHAR(20),
    tipo_entidade  tipo_entidade_parceiro NOT NULL,
    ativo          BOOLEAN               NOT NULL DEFAULT TRUE,
    observacoes    TEXT,
    created_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parceiros_empresa ON parceiros_negocio (empresa_id, tipo_entidade);
CREATE UNIQUE INDEX IF NOT EXISTS unq_parceiro_empresa_nome
    ON parceiros_negocio (empresa_id, lower(nome));

-- ---------------------------------------------------------------------------
-- 5. OBRIGACOES RECORRENTES (CONTAS A PAGAR)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS obrigacoes_recorrentes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    parceiro_id         UUID REFERENCES parceiros_negocio(id) ON DELETE SET NULL,
    plano_conta_id      UUID REFERENCES plano_contas(id) ON DELETE SET NULL,

    -- Chave natural: torna o seed idempotente e impede lancamento duplicado
    -- do mesmo titulo. Vem do hash ja presente no JSON de origem.
    chave_natural       VARCHAR(64) NOT NULL,

    tipo_operacao       tipo_operacao_financeira   NOT NULL DEFAULT 'DESPESA',
    macro_categoria     macro_categoria_conta      NOT NULL,
    categoria_detalhada VARCHAR(150)               NOT NULL,
    tipo_entidade       tipo_entidade_parceiro     NOT NULL,
    favorecido_nome     VARCHAR(255)               NOT NULL,
    descricao           TEXT,

    banco               VARCHAR(100),
    valor               NUMERIC(14, 2)             NOT NULL,

    -- DATE de verdade, nao string 'DD/MM/AAAA' como no JSON de origem
    data_vencimento     DATE                       NOT NULL,
    data_pagamento      DATE,

    recorrencia         recorrencia_obrigacao      NOT NULL DEFAULT 'UNICA',
    forma_pagamento     VARCHAR(50),
    metodo_pagamento    VARCHAR(50),
    parcelas_info       VARCHAR(100),

    -- Rateio entre os socios (Diego / Paulo Cesar), tipicamente 50/50
    rateio_socios       JSONB                      NOT NULL DEFAULT '{}'::jsonb,

    status_pagamento    status_pagamento_obrigacao NOT NULL DEFAULT 'A_PAGAR',
    observacoes         TEXT,

    created_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW(),

    CONSTRAINT unq_obrigacao_chave_natural UNIQUE (empresa_id, chave_natural),
    CONSTRAINT chk_obrigacao_valor_positivo CHECK (valor > 0),
    -- Um titulo PAGO precisa ter data de pagamento; um nao-pago nao pode ter.
    CONSTRAINT chk_obrigacao_pagamento_coerente CHECK (
        (status_pagamento = 'PAGO'     AND data_pagamento IS NOT NULL) OR
        (status_pagamento <> 'PAGO'    AND data_pagamento IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_obrigacoes_empresa_venc
    ON obrigacoes_recorrentes (empresa_id, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_obrigacoes_status
    ON obrigacoes_recorrentes (empresa_id, status_pagamento);
CREATE INDEX IF NOT EXISTS idx_obrigacoes_tipo_entidade
    ON obrigacoes_recorrentes (empresa_id, tipo_entidade);
CREATE INDEX IF NOT EXISTS idx_obrigacoes_macro
    ON obrigacoes_recorrentes (empresa_id, macro_categoria);

-- ---------------------------------------------------------------------------
-- 6. VIEW COM O STATUS DE VENCIMENTO CALCULADO
-- ---------------------------------------------------------------------------
-- 'status_vencimento' NAO e coluna: no JSON de origem era um valor congelado
-- que envelhecia junto com o arquivo. Aqui e sempre calculado contra a data
-- corrente, entao um titulo vencido ontem aparece como EM_ATRASO hoje.
CREATE OR REPLACE VIEW vw_obrigacoes_recorrentes AS
SELECT
    o.*,
    CASE
        WHEN o.status_pagamento = 'PAGO'                  THEN 'PAGO'
        WHEN o.status_pagamento = 'CANCELADO'             THEN 'CANCELADO'
        WHEN o.data_vencimento < CURRENT_DATE             THEN 'EM_ATRASO'
        WHEN o.data_vencimento <= CURRENT_DATE + 7        THEN 'VENCE_EM_7_DIAS'
        ELSE 'A_VENCER'
    END AS status_vencimento,
    CASE
        WHEN o.status_pagamento IN ('PAGO', 'CANCELADO')  THEN 0
        WHEN o.data_vencimento < CURRENT_DATE             THEN (CURRENT_DATE - o.data_vencimento)
        ELSE 0
    END AS dias_em_atraso
FROM obrigacoes_recorrentes o;

-- ---------------------------------------------------------------------------
-- 7. RLS (mesmo padrao da migration 21)
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['parceiros_negocio', 'obrigacoes_recorrentes'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I;', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I'
            || ' AS PERMISSIVE FOR ALL'
            || ' USING (empresa_id = ANY (app_empresa_ids()))'
            || ' WITH CHECK (empresa_id = app_current_empresa());', t);
    END LOOP;
END $mig$;

-- plano_contas e catalogo compartilhado da holding: leitura livre para quem
-- esta autenticado, escrita restrita ao papel de migration.
ALTER TABLE plano_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plano_contas_leitura ON plano_contas;
CREATE POLICY plano_contas_leitura ON plano_contas
    AS PERMISSIVE FOR SELECT USING (true);

DO $mig$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eco_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON parceiros_negocio, obrigacoes_recorrentes TO eco_app;
        GRANT SELECT ON plano_contas, vw_obrigacoes_recorrentes TO eco_app;
    END IF;
END $mig$;
