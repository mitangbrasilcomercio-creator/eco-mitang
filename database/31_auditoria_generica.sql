-- ============================================================================
-- 31. TRILHA DE AUDITORIA GENERICA, NO BANCO
-- ============================================================================
--
-- [ERRO ANTERIOR]
-- A auditoria era por chamada de aplicacao. A tabela
-- 'clientes_historico_alteracoes' existe desde a migration 10, o codigo que
-- escreve nela existe em clientes.repository.ts, e ela esta **vazia em
-- producao**. Alguem esqueceu de chamar, e ninguem percebeu por meses.
--
-- Auditoria que depende de lembrar de chamar nao e auditoria: e uma intencao.
-- E o pior momento para descobrir que a trilha esta vazia e aquele em que se
-- precisa dela.
--
-- [CORRECAO]
-- Trigger no banco. Nao ha caminho de escrita que escape: nem rota nova, nem
-- script de manutencao, nem alguem rodando UPDATE no console da Supabase.
--
-- Decisoes de projeto, e por que:
--
--   1. BIGSERIAL, nao UUID. Esta tabela cresce mais rapido que todas as outras
--      juntas; chave sequencial de 8 bytes indexa melhor que UUID de 16.
--   2. UPDATE que nao muda nada nao vira evento. Sem isso a trilha enche de
--      ruido e a informacao util fica dificil de achar.
--   3. 'updated_at' nunca entra em campos_alterados -- muda sempre, informa nada.
--   4. Colunas de segredo sao mascaradas, nunca copiadas. Guardar senha_hash na
--      auditoria seria criar uma segunda copia do que se esta protegendo.
--   5. A propria auditoria nao e auditavel. Recursao infinita.
--   6. O contexto (quem, por que, de onde) vem de set_config, injetado pelo
--      middleware. Quando faltar, o evento e gravado assim mesmo, com autor
--      nulo -- perder o evento por falta de contexto seria pior.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A TABELA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id                BIGSERIAL PRIMARY KEY,
    -- Nulo quando a tabela auditada nao tem empresa_id (usuarios, socios).
    empresa_id        UUID,
    tabela            TEXT        NOT NULL,
    registro_id       TEXT,
    operacao          CHAR(1)     NOT NULL CHECK (operacao IN ('I', 'U', 'D')),

    dados_antes       JSONB,
    dados_depois      JSONB,
    campos_alterados  TEXT[],

    -- Contexto de quem fez. Nulo quando a escrita veio de script ou console.
    usuario_id        UUID,
    usuario_email     TEXT,
    motivo            TEXT,
    ip_origem         TEXT,
    origem            TEXT,   -- 'API' | 'SCRIPT' | 'CONSOLE'

    ocorrido_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE auditoria_eventos IS
    'Toda mutacao em tabela auditada. Escrita por trigger: nao ha caminho de '
    'escrita na aplicacao que consiga evitar.';
COMMENT ON COLUMN auditoria_eventos.origem IS
    'SCRIPT ou CONSOLE quando o middleware nao injetou contexto -- a ausencia '
    'de autor e ela mesma um dado.';

CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_registro
    ON auditoria_eventos (tabela, registro_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa
    ON auditoria_eventos (empresa_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario
    ON auditoria_eventos (usuario_id, ocorrido_em DESC) WHERE usuario_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. LEITURA DE DADO SENSIVEL
-- ---------------------------------------------------------------------------
-- Mutacao a trigger pega sozinha. Leitura, nao: quem le nao escreve nada. Esta
-- tabela e alimentada explicitamente pela camada de aplicacao, nos poucos
-- pontos em que ler ja e o ato relevante -- salario, exame ocupacional, custo
-- de produto.
CREATE TABLE IF NOT EXISTS auditoria_acessos (
    id            BIGSERIAL PRIMARY KEY,
    usuario_id    UUID,
    usuario_email TEXT,
    empresa_id    UUID,
    tabela        TEXT NOT NULL,
    registro_id   TEXT,
    campos        TEXT[] NOT NULL,
    motivo        TEXT,
    -- Preenchido a partir da Fase 2, quando existir concessao just-in-time.
    concessao_id  UUID,
    ip_origem     TEXT,
    ocorrido_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acessos_registro
    ON auditoria_acessos (tabela, registro_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_acessos_usuario
    ON auditoria_acessos (usuario_id, ocorrido_em DESC);

-- ---------------------------------------------------------------------------
-- 3. COLUNAS QUE NUNCA SAO COPIADAS PARA A TRILHA
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auditoria_mascarar(p JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        (SELECT jsonb_object_agg(
                    chave,
                    CASE WHEN chave IN ('senha_hash', 'senha', 'token', 'refresh_token',
                                        'conteudo_xml', 'secret', 'certificado')
                         THEN '"[protegido]"'::jsonb
                         ELSE valor END)
           FROM jsonb_each(p) AS t(chave, valor)),
        p
    );
$$;

COMMENT ON FUNCTION auditoria_mascarar(JSONB) IS
    'Substitui o valor de colunas de segredo. Guardar senha_hash na auditoria '
    'criaria uma segunda copia do que se esta protegendo. conteudo_xml sai por '
    'volume: uma NF-e inteira por evento estouraria a tabela.';

-- ---------------------------------------------------------------------------
-- 4. O TRIGGER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_antes      JSONB;
    v_depois     JSONB;
    v_alterados  TEXT[];
    v_empresa    UUID;
    v_registro   TEXT;
    v_usuario    UUID;
    v_email      TEXT;
    v_motivo     TEXT;
    v_ip         TEXT;
    v_origem     TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_antes := auditoria_mascarar(to_jsonb(OLD));
        v_depois := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_antes := NULL;
        v_depois := auditoria_mascarar(to_jsonb(NEW));
    ELSE
        v_antes := auditoria_mascarar(to_jsonb(OLD));
        v_depois := auditoria_mascarar(to_jsonb(NEW));

        -- (2) e (3): UPDATE que nao mudou nada nao vira evento, e updated_at
        -- nao conta como mudanca.
        SELECT array_agg(chave ORDER BY chave) INTO v_alterados
          FROM jsonb_each(v_depois) AS d(chave, valor)
         WHERE chave <> 'updated_at'
           AND valor IS DISTINCT FROM (v_antes -> chave);

        IF v_alterados IS NULL OR cardinality(v_alterados) = 0 THEN
            RETURN NULL;
        END IF;
    END IF;

    v_registro := COALESCE(v_depois ->> 'id', v_antes ->> 'id');
    BEGIN
        v_empresa := COALESCE(v_depois ->> 'empresa_id', v_antes ->> 'empresa_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_empresa := NULL;
    END;

    -- (6) Contexto injetado pelo middleware. A ausencia nao impede o registro.
    -- 'app.user_id' e o nome que ja existe desde a migration 21, usado pelas
    -- funcoes de RLS. Nao criar um segundo nome para a mesma coisa.
    BEGIN
        v_usuario := NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_usuario := NULL;
    END;
    v_email   := NULLIF(current_setting('app.usuario_email', TRUE), '');
    v_motivo  := NULLIF(current_setting('app.motivo', TRUE), '');
    v_ip      := NULLIF(current_setting('app.ip_origem', TRUE), '');
    v_origem  := COALESCE(NULLIF(current_setting('app.origem', TRUE), ''),
                          CASE WHEN v_usuario IS NULL THEN 'SCRIPT' ELSE 'API' END);

    INSERT INTO auditoria_eventos (
        empresa_id, tabela, registro_id, operacao, dados_antes, dados_depois,
        campos_alterados, usuario_id, usuario_email, motivo, ip_origem, origem
    ) VALUES (
        v_empresa, TG_TABLE_NAME, v_registro, LEFT(TG_OP, 1), v_antes, v_depois,
        v_alterados, v_usuario, v_email, v_motivo, v_ip, v_origem
    );

    RETURN NULL;   -- AFTER trigger: o retorno e ignorado
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. APLICA EM TODA TABELA DE NEGOCIO
-- ---------------------------------------------------------------------------
-- (5) A propria auditoria fica de fora: auditar a auditoria e recursao.
-- schema_migrations tambem: e ledger de infraestrutura, nao dado de negocio.
DO $$
DECLARE
    t TEXT;
    fora TEXT[] := ARRAY[
        'auditoria_eventos', 'auditoria_acessos', 'schema_migrations',
        'analytics_vendas_mensal', 'analytics_operacao_qualidade'
    ];
    aplicadas INT := 0;
BEGIN
    FOR t IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND NOT (c.relname = ANY (fora))
         ORDER BY c.relname
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I;', t);
        EXECUTE format(
            'CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION fn_auditoria();', t);
        aplicadas := aplicadas + 1;
    END LOOP;

    RAISE NOTICE 'Trigger de auditoria em % tabelas.', aplicadas;
END $$;

-- ---------------------------------------------------------------------------
-- 6. RLS E PRIVILEGIOS
-- ---------------------------------------------------------------------------
-- A trilha e somente-leitura para a aplicacao. Quem escreve e o trigger, que
-- roda como SECURITY DEFINER -- entao eco_app nao precisa de INSERT.
ALTER TABLE auditoria_eventos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_acessos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON auditoria_eventos;
CREATE POLICY tenant_isolation ON auditoria_eventos AS PERMISSIVE FOR ALL
    USING (empresa_id IS NULL OR empresa_id = ANY (app_empresa_ids()))
    WITH CHECK (FALSE);   -- ninguem insere pela aplicacao

DROP POLICY IF EXISTS tenant_isolation ON auditoria_acessos;
CREATE POLICY tenant_isolation ON auditoria_acessos AS PERMISSIVE FOR ALL
    USING (empresa_id IS NULL OR empresa_id = ANY (app_empresa_ids()))
    WITH CHECK (empresa_id IS NULL OR empresa_id = app_current_empresa());

GRANT SELECT ON auditoria_eventos TO eco_app;
GRANT SELECT, INSERT ON auditoria_acessos TO eco_app;
GRANT USAGE, SELECT ON SEQUENCE auditoria_acessos_id_seq TO eco_app;

-- Sem UPDATE nem DELETE: trilha que se pode reescrever nao serve de trilha.
--
-- E sem INSERT em auditoria_eventos. Quem escreve ali e o trigger, que roda
-- como SECURITY DEFINER e portanto nao depende do privilegio de eco_app.
-- A policy ja nega com WITH CHECK (FALSE), mas privilegio e politica devem
-- negar os dois: uma policy alterada por engano nao deve reabrir a porta.
--
-- O REVOKE e necessario porque a migration 21 deixou ALTER DEFAULT PRIVILEGES
-- concedendo SELECT/INSERT/UPDATE/DELETE a eco_app em toda tabela nova. Sem
-- isto, cada tabela criada daqui em diante nasce com mais permissao do que
-- precisa.
REVOKE INSERT, UPDATE, DELETE ON auditoria_eventos FROM eco_app;
REVOKE UPDATE, DELETE ON auditoria_acessos FROM eco_app;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON auditoria_eventos, auditoria_acessos FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON auditoria_eventos, auditoria_acessos FROM authenticated;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- DO $$ DECLARE t TEXT; BEGIN
--   FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--            WHERE n.nspname='public' AND c.relkind='r'
--   LOOP EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I;', t); END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS fn_auditoria();
-- DROP FUNCTION IF EXISTS auditoria_mascarar(JSONB);
-- DROP TABLE IF EXISTS auditoria_eventos, auditoria_acessos;
