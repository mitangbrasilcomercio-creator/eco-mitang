-- ============================================================================
-- 21. CORRECAO DA ROW-LEVEL SECURITY (ISOLAMENTO MULTI-TENANT REAL)
-- ============================================================================
--
-- [ERRO ANTERIOR - O MAIS GRAVE DO PROJETO]:
-- As 19 policies existentes eram todas 'AS RESTRICTIVE' e nao havia NENHUMA
-- policy PERMISSIVE. No PostgreSQL, policies RESTRICTIVE apenas *restringem* o
-- que ja foi liberado por alguma policy PERMISSIVE. Sem nenhuma PERMISSIVE, o
-- resultado nao e "filtrar por tenant" -- e "negar todas as linhas".
--
-- Isso nunca apareceu porque a aplicacao conectava com o papel 'postgres', que
-- tem BYPASSRLS: a RLS era ignorada por completo. Ou seja, o isolamento
-- multi-tenant estava documentado no README, escrito nas migrations, e nao
-- valia nada na pratica -- em nenhuma das duas pontas.
--
-- Alem disso nenhuma policy tinha WITH CHECK, entao INSERT e UPDATE podiam
-- gravar linhas com o empresa_id de qualquer outro CNPJ. Foi assim que 110
-- transacoes bancarias acabaram com o empresa_id trocado.
--
-- E as tabelas 'clientes' (182 linhas), 'colaboradores', 'cotacoes_itens',
-- 'parcelas_recebimento', 'notas_fiscais_itens' e 'notas_fiscais_duplicatas'
-- nem tinham RLS habilitada.
--
-- [COMO FOI CORRIGIDO]:
-- 1. Uma policy PERMISSIVE FOR ALL por tabela, com USING e WITH CHECK.
-- 2. Leitura enxerga o conjunto de CNPJs permitidos ao usuario
--    ('app.empresa_ids') -- e assim que a visao consolidada da holding funciona.
--    Escrita e sempre travada no CNPJ selecionado ('app.current_empresa_id'),
--    entao e impossivel gravar uma linha no tenant errado.
-- 3. Tabelas-filhas sem empresa_id herdam o isolamento via EXISTS no pai.
-- 4. RLS habilitada nas tabelas que estavam descobertas.
-- 5. GRANTs para o papel da aplicacao e REVOKE dos papeis publicos da Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. FUNCOES DE CONTEXTO
-- ---------------------------------------------------------------------------

-- CNPJ selecionado na requisicao. Destino de toda escrita.
CREATE OR REPLACE FUNCTION app_current_empresa() RETURNS uuid
LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(current_setting('app.current_empresa_id', true), '')::uuid;
$fn$;

-- Conjunto de CNPJs visiveis na leitura. Numa visao consolidada traz todos os
-- CNPJs aos quais o usuario tem acesso; numa visao unica, traz so um.
CREATE OR REPLACE FUNCTION app_empresa_ids() RETURNS uuid[]
LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(
        (SELECT array_agg(t::uuid)
           FROM unnest(string_to_array(NULLIF(current_setting('app.empresa_ids', true), ''), ',')) AS t
          WHERE t <> ''),
        ARRAY[]::uuid[]
    );
$fn$;

CREATE OR REPLACE FUNCTION app_user_role() RETURNS text
LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('app.user_role', true), ''), 'Vendedor');
$fn$;

-- ---------------------------------------------------------------------------
-- 2. TABELAS COM empresa_id: policy padrao
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
    t text;
    tabelas text[] := ARRAY[
        'catalogo_universal', 'clientes', 'cotacoes', 'ordens_servico',
        'colaboradores', 'apontamentos_horas', 'movimentacoes_estoque',
        'planos_faturamento', 'auditorias_qsms', 'registros_nao_conformidade',
        'analytics_vendas_mensal', 'analytics_operacao_qualidade',
        'clientes_historico_alteracoes', 'contas_bancarias',
        'extratos_ofx_importacoes', 'transacoes_bancarias', 'notas_fiscais',
        'orcamentos_historico', 'itens_catalogo', 'importacao_staging'
    ];
    pol record;
BEGIN
    FOREACH t IN ARRAY tabelas LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
            RAISE NOTICE 'Tabela % nao existe, pulando.', t;
            CONTINUE;
        END IF;

        -- Remove TODAS as policies antigas da tabela (as RESTRICTIVE quebradas)
        FOR pol IN
            SELECT p.polname FROM pg_policy p
            JOIN pg_class c ON c.oid = p.polrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.polname, t);
        END LOOP;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I'
            || ' AS PERMISSIVE FOR ALL'
            || ' USING (empresa_id = ANY (app_empresa_ids()))'
            || ' WITH CHECK (empresa_id = app_current_empresa());', t);

        RAISE NOTICE 'RLS aplicada em %', t;
    END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- 3. CASOS ESPECIAIS
-- ---------------------------------------------------------------------------

-- tickets_triagem usa 'empresa_alvo_id' em vez de 'empresa_id'
DROP POLICY IF EXISTS tenant_isolation_policy_tickets_triagem ON tickets_triagem;
DROP POLICY IF EXISTS tenant_isolation ON tickets_triagem;
ALTER TABLE tickets_triagem ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets_triagem
    AS PERMISSIVE FOR ALL
    USING (empresa_alvo_id = ANY (app_empresa_ids()))
    WITH CHECK (empresa_alvo_id = app_current_empresa());

-- empresas: o usuario so enxerga os CNPJs aos quais tem acesso.
-- Sem WITH CHECK de tenant -- criar/alterar empresa e operacao administrativa,
-- feita pelo papel de migration, nao pelo papel da aplicacao.
DROP POLICY IF EXISTS tenant_isolation ON empresas;
DROP POLICY IF EXISTS tenant_visibilidade ON empresas;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_visibilidade ON empresas
    AS PERMISSIVE FOR SELECT
    USING (id = ANY (app_empresa_ids()));

-- ---------------------------------------------------------------------------
-- 4. TABELAS-FILHAS SEM empresa_id: isolamento herdado do pai
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
    r record;
    filha text;
    fk text;
    pai text;
    filhas text[][] := ARRAY[
        ARRAY['cotacoes_itens',           'cotacao_id',     'cotacoes'],
        ARRAY['parcelas_recebimento',     'plano_id',       'planos_faturamento'],
        ARRAY['notas_fiscais_itens',      'nota_fiscal_id', 'notas_fiscais'],
        ARRAY['notas_fiscais_duplicatas', 'nota_fiscal_id', 'notas_fiscais']
    ];
    i int;
BEGIN
    FOR i IN 1 .. array_length(filhas, 1) LOOP
        filha := filhas[i][1];
        fk    := filhas[i][2];
        pai   := filhas[i][3];

        IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relname = filha AND c.relkind = 'r') THEN
            CONTINUE;
        END IF;

        FOR r IN
            SELECT p.polname FROM pg_policy p
            JOIN pg_class c ON c.oid = p.polrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = filha
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.polname, filha);
        END LOOP;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', filha);

        -- A filha e visivel se o pai for visivel, e gravavel se o pai pertencer
        -- ao CNPJ selecionado.
        EXECUTE format(
            'CREATE POLICY tenant_isolation_herdado ON public.%I'
            || ' AS PERMISSIVE FOR ALL'
            || ' USING (EXISTS (SELECT 1 FROM public.%I p'
            || '   WHERE p.id = public.%I.%I AND p.empresa_id = ANY (app_empresa_ids())))'
            || ' WITH CHECK (EXISTS (SELECT 1 FROM public.%I p'
            || '   WHERE p.id = public.%I.%I AND p.empresa_id = app_current_empresa()));',
            filha, pai, filha, fk, pai, filha, fk);

        RAISE NOTICE 'RLS herdada aplicada em % (via %)', filha, pai;
    END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- 5. PRIVILEGIOS
-- ---------------------------------------------------------------------------
-- Fecha a superficie publica da Supabase (PostgREST). Este ERP acessa o banco
-- exclusivamente pela API Node; 'anon' e 'authenticated' nao devem enxergar
-- nada diretamente.
DO $mig$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    END IF;
END $mig$;

-- Concede o necessario ao papel da aplicacao, se ele ja existir.
-- O papel e criado por scripts/setup_app_role.js (a senha nunca vai para o git).
DO $mig$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eco_app') THEN
        GRANT USAGE ON SCHEMA public TO eco_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eco_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eco_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eco_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT USAGE, SELECT ON SEQUENCES TO eco_app;

        -- O ledger de migrations e somente-leitura para a aplicacao.
        REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM eco_app;
    ELSE
        RAISE NOTICE 'Papel eco_app ainda nao existe. Rode scripts/setup_app_role.js e reaplique os GRANTs.';
    END IF;
END $mig$;
