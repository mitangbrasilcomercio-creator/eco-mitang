-- ============================================================================
-- 30. SOCIEDADE, MOVIMENTO DE SOCIO E PENDENCIA COM PROCEDENCIA
-- ============================================================================
--
-- [O PROBLEMA]
-- R$ 715.000,00 sairam da holding para um socio em 2026, e R$ 121.000,00
-- entraram. O sistema classificou parte como "fornecedor" e parte como "outras
-- despesas" -- por acaso da redacao que o banco usou no memo. Nao ha cadastro
-- de socio, nao ha participacao societaria, e nao ha onde registrar que uma
-- pergunta esta em aberto.
--
-- O efeito no resultado nao e pequeno: se esses movimentos forem distribuicao
-- e pagamento de participacao, eles nao sao despesa operacional e nao entram
-- no EBITDA. O sinal do resultado de 2026 muda.
--
-- [A DECISAO DE PROJETO]
-- Nao inventar a resposta. Registrar a pergunta **com a procedencia inteira** --
-- data, valor, conta, empresa, banco, memo -- para que a decisao possa ser
-- tomada depois por quem tem competencia para toma-la, e fique auditavel.
--
-- Diego Ribeiro e funcionario, nao socio: decisao societaria nao e dele. O
-- sistema precisa suportar isso -- ele registra e evidencia, outra pessoa
-- decide.
--
-- E precisa suportar o que ainda vai acontecer: socio novo entrando,
-- percentual mudando, dinheiro entrando e saindo por conta disso.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SOCIOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS socios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            VARCHAR(255) NOT NULL,
    documento       VARCHAR(14),
    tipo_documento  VARCHAR(4) CHECK (tipo_documento IN ('CPF', 'CNPJ')),
    -- Participacao pode estar no nome de terceiro sem deixar de ser do socio.
    -- Na Mitang Brasil a participacao do Diego Fernandes consta no nome da
    -- esposa. Ignorar isso faria o sistema discordar da realidade.
    titular_formal  VARCHAR(255),
    observacao      TEXT,
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_socio_documento UNIQUE (documento)
);

COMMENT ON COLUMN socios.titular_formal IS
    'Quem consta no contrato social, quando difere do socio de fato. '
    'Preenchido apenas quando ha divergencia -- e a divergencia e o dado.';

-- ---------------------------------------------------------------------------
-- 2. PARTICIPACAO COM VIGENCIA
-- ---------------------------------------------------------------------------
-- Participacao muda: socio entra, socio compra parte do outro, percentual se
-- altera. Guardar so o percentual atual apaga a historia e impede responder
-- "quanto era do Paulo em maio?" -- que e exatamente a pergunta que o rateio
-- de resultado faz.
CREATE TABLE IF NOT EXISTS socios_participacoes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_id            UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
    empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    percentual          NUMERIC(7,4) NOT NULL CHECK (percentual > 0 AND percentual <= 100),
    vigencia_inicio     DATE NOT NULL,
    vigencia_fim        DATE,
    documento_referencia VARCHAR(255),
    confirmado          BOOLEAN NOT NULL DEFAULT FALSE,
    observacao          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_vigencia_coerente
        CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

COMMENT ON COLUMN socios_participacoes.confirmado IS
    'FALSE enquanto o percentual for lembranca e nao documento. A tela deve '
    'exibir participacao nao confirmada como estimativa, nunca como fato.';

CREATE INDEX IF NOT EXISTS idx_participacoes_vigencia
    ON socios_participacoes (empresa_id, vigencia_inicio, vigencia_fim);

-- Duas participacoes do mesmo socio na mesma empresa nao podem se sobrepor no
-- tempo -- seriam dois percentuais validos ao mesmo tempo.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE socios_participacoes DROP CONSTRAINT IF EXISTS excl_participacao_sobreposta;
ALTER TABLE socios_participacoes ADD CONSTRAINT excl_participacao_sobreposta
    EXCLUDE USING gist (
        socio_id WITH =,
        empresa_id WITH =,
        daterange(vigencia_inicio, COALESCE(vigencia_fim, 'infinity'::date), '[]') WITH &&
    );

-- ---------------------------------------------------------------------------
-- 3. MOVIMENTO ENTRE EMPRESA E SOCIO
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE natureza_movimento_socio AS ENUM (
        'APORTE_CAPITAL',          -- socio poe dinheiro na empresa
        'DISTRIBUICAO_LUCRO',      -- dividendo
        'PAGAMENTO_PARTICIPACAO',  -- pagamento pela compra de quotas
        'ADIANTAMENTO',            -- retirada a acertar depois
        'REEMBOLSO_DESPESA',       -- socio pagou algo da empresa e foi ressarcido
        'MUTUO',                   -- emprestimo entre socio e empresa
        'INDEFINIDO'               -- ainda nao se sabe: o estado honesto
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS socios_movimentos (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    socio_id              UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,
    empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    -- A procedencia. Todo movimento aponta para a linha do extrato que o
    -- originou; sem isso o registro vira opiniao.
    transacao_bancaria_id UUID REFERENCES transacoes_bancarias(id) ON DELETE SET NULL,
    data_movimento        DATE NOT NULL,
    valor                 NUMERIC(14,2) NOT NULL CHECK (valor > 0),
    sentido               VARCHAR(8) NOT NULL CHECK (sentido IN ('ENTRADA', 'SAIDA')),
    natureza              natureza_movimento_socio NOT NULL DEFAULT 'INDEFINIDO',
    -- Enquanto INDEFINIDO, aponta para a pergunta aberta.
    pendencia_id          UUID,
    justificativa         TEXT,
    definido_por          VARCHAR(255),
    definido_em           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Sair do estado INDEFINIDO exige dizer quem decidiu e por que.
    CONSTRAINT chk_definicao_tem_autor CHECK (
        natureza = 'INDEFINIDO'
        OR (definido_por IS NOT NULL AND justificativa IS NOT NULL)
    )
);

COMMENT ON TABLE socios_movimentos IS
    'Dinheiro entre a holding e um socio. Natureza INDEFINIDO e estado valido '
    'e esperado: melhor registrar a duvida com procedencia do que adivinhar.';

CREATE INDEX IF NOT EXISTS idx_movimentos_socio ON socios_movimentos (socio_id, data_movimento);
CREATE INDEX IF NOT EXISTS idx_movimentos_indefinidos
    ON socios_movimentos (empresa_id) WHERE natureza = 'INDEFINIDO';

-- ---------------------------------------------------------------------------
-- 4. PENDENCIA DE CLASSIFICACAO
-- ---------------------------------------------------------------------------
-- Uma pergunta aberta sobre um conjunto de lancamentos, com a evidencia
-- inteira e o impacto de cada resposta possivel. Existe para que a decisao
-- possa ser tomada meses depois sem refazer a investigacao.
CREATE TABLE IF NOT EXISTS pendencias_classificacao (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo            VARCHAR(40) NOT NULL UNIQUE,
    titulo            VARCHAR(255) NOT NULL,
    pergunta          TEXT NOT NULL,
    dominio           VARCHAR(24) NOT NULL
        CHECK (dominio IN ('SOCIETARIO', 'FISCAL', 'CATEGORIA', 'CADASTRO', 'OUTRO')),
    status            VARCHAR(16) NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'RESOLVIDA', 'DESCARTADA')),

    valor_envolvido   NUMERIC(14,2),
    qtd_lancamentos   INT,
    periodo_inicio    DATE,
    periodo_fim       DATE,

    -- A procedencia completa: cada lancamento com data, valor, conta, empresa,
    -- banco e memo. E o que Diego pediu para poder decidir depois.
    evidencia         JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- O que eu acho, e por que. Separado da pergunta de proposito: hipotese
    -- nao e resposta.
    hipotese          TEXT,
    impacto           TEXT,

    resolucao         TEXT,
    resolvido_por     VARCHAR(255),
    resolvido_em      TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_resolucao_completa CHECK (
        status <> 'RESOLVIDA'
        OR (resolucao IS NOT NULL AND resolvido_por IS NOT NULL AND resolvido_em IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_pendencias_abertas
    ON pendencias_classificacao (dominio, valor_envolvido DESC) WHERE status = 'ABERTA';

ALTER TABLE socios_movimentos DROP CONSTRAINT IF EXISTS fk_movimento_pendencia;
ALTER TABLE socios_movimentos ADD CONSTRAINT fk_movimento_pendencia
    FOREIGN KEY (pendencia_id) REFERENCES pendencias_classificacao(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS -- as tres tabelas sao multi-tenant
-- ---------------------------------------------------------------------------
ALTER TABLE socios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE socios_participacoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE socios_movimentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendencias_classificacao ENABLE ROW LEVEL SECURITY;

-- 'socios' nao tem empresa_id: um socio participa de varias empresas da
-- holding. A protecao vem por participacao.
DROP POLICY IF EXISTS tenant_isolation ON socios;
CREATE POLICY tenant_isolation ON socios AS PERMISSIVE FOR ALL
    USING (EXISTS (SELECT 1 FROM socios_participacoes p
                    WHERE p.socio_id = socios.id
                      AND p.empresa_id = ANY (app_empresa_ids())))
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS tenant_isolation ON socios_participacoes;
CREATE POLICY tenant_isolation ON socios_participacoes AS PERMISSIVE FOR ALL
    USING (empresa_id = ANY (app_empresa_ids()))
    WITH CHECK (empresa_id = app_current_empresa());

DROP POLICY IF EXISTS tenant_isolation ON socios_movimentos;
CREATE POLICY tenant_isolation ON socios_movimentos AS PERMISSIVE FOR ALL
    USING (empresa_id = ANY (app_empresa_ids()))
    WITH CHECK (empresa_id = app_current_empresa());

-- Pendencia nao tem empresa_id porque pode atravessar empresas (o mesmo socio
-- sacou da Mitang e da Arandu). Visivel a quem tem qualquer tenant.
DROP POLICY IF EXISTS tenant_isolation ON pendencias_classificacao;
CREATE POLICY tenant_isolation ON pendencias_classificacao AS PERMISSIVE FOR ALL
    USING (array_length(app_empresa_ids(), 1) > 0)
    WITH CHECK (array_length(app_empresa_ids(), 1) > 0);

GRANT SELECT, INSERT, UPDATE, DELETE ON socios, socios_participacoes,
      socios_movimentos, pendencias_classificacao TO eco_app;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON socios, socios_participacoes, socios_movimentos,
                      pendencias_classificacao FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON socios, socios_participacoes, socios_movimentos,
                      pendencias_classificacao FROM authenticated;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- DROP TABLE IF EXISTS socios_movimentos, socios_participacoes,
--                      pendencias_classificacao, socios CASCADE;
-- DROP TYPE IF EXISTS natureza_movimento_socio;
