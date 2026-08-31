-- ============================================================================
-- 26. FECHA A SUPERFICIE PUBLICA DO POSTGREST, DE FORMA PERMANENTE
-- ============================================================================
--
-- [ERRO ANTERIOR]
-- A migration 21 revogou os privilegios de 'anon' e 'authenticated' sobre o
-- schema public. Mas revogar e um ato pontual: ele so alcanca os objetos que
-- existiam naquele instante. A Supabase mantem um ALTER DEFAULT PRIVILEGES
-- concedendo tudo a esses papeis sobre cada objeto NOVO do schema public.
--
-- Resultado, medido em producao em 31/08/2026 -- quatro objetos criados depois
-- da 21, todos com DELETE, INSERT, SELECT, TRUNCATE e UPDATE para 'anon':
--
--   parceiros_negocio          RLS ligada  -> SELECT devolve 0 linhas...
--   obrigacoes_recorrentes     RLS ligada  -> ...mas TRUNCATE nao passa por RLS
--   plano_contas               RLS ligada, sem empresa_id
--   vw_obrigacoes_recorrentes  VIEW, sem RLS -> lia TUDO, de todos os CNPJs
--
-- Os dois efeitos, em ordem de gravidade:
--
--   1. A VIEW vazava por completo. Uma view executa com os privilegios de quem
--      a definiu, nao de quem a consulta: ela atravessava a RLS da tabela por
--      baixo. Qualquer pessoa com a chave anonima do projeto lia todas as
--      obrigacoes recorrentes da holding inteira.
--   2. TRUNCATE nao e filtrado por Row-Level Security. As tres tabelas podiam
--      ser esvaziadas por qualquer portador da chave anonima, mesmo com a
--      policy de tenant funcionando corretamente para SELECT.
--
-- E o mesmo defeito de raiz que fechou o projeto Supabase legado (ver
-- database/PROJETO-LEGADO.md), aqui na base de producao: um mecanismo que
-- corrige o estado presente sem estabelecer a regra futura.
--
-- [CORRECAO]
-- Tres camadas, da mais especifica para a mais ampla:
--
--   1. Revoga o que ja foi concedido (o que a 21 fez).
--   2. Cancela o privilegio PADRAO, para que objeto novo nasca fechado. Esta e
--      a parte que faltava -- sem ela, a proxima tabela repete a historia.
--   3. Revoga USAGE e CREATE no schema public dos dois papeis.
--
-- Sobre a camada 3, com honestidade: ela NAO deixa 'has_schema_privilege'
-- devolver false. USAGE em 'public' tambem vem do pseudo-papel PUBLIC, que
-- todo papel herda, e revogar de PUBLIC atingiria o cluster inteiro -- um
-- risco real numa plataforma gerenciada, em troca de nada. Quem de fato fecha
-- o acesso sao as camadas 1 e 2: sem privilegio em tabela, USAGE no schema nao
-- da acesso a coisa alguma. A camada 3 fica como remocao do grant nominal.
--
-- A invariante que importa e verificada por scripts/verificar_schema.js:
-- zero grants de tabela para anon/authenticated. E ela que o CI observa.
--
-- Seguro porque este ERP nao usa PostgREST: nao ha chamada a supabase-js nem
-- a SUPABASE_ANON_KEY em src/ ou public/. Todo acesso ao banco passa pela API
-- Node com o papel 'eco_app'.
--
-- Se algum dia for preciso usar PostgREST, o caminho e conceder de forma
-- explicita e restrita (schema proprio, tabela a tabela, com policy escrita
-- para 'anon'), nunca reabrindo o schema public inteiro.
-- ============================================================================

DO $mig$
DECLARE
    papel   text;
    criador text;
BEGIN
    FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
            RAISE NOTICE 'Papel % nao existe neste banco, pulando.', papel;
            CONTINUE;
        END IF;

        -- 1. O que ja foi concedido.
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I;', papel);
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I;', papel);
        EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I;', papel);

        -- 2. O que seria concedido daqui em diante.
        --    O privilegio padrao pertence a quem cria o objeto. Cobrimos os
        --    papeis que efetivamente criam tabela neste projeto: o papel atual
        --    (quem roda as migrations) e 'postgres'.
        FOREACH criador IN ARRAY ARRAY[current_user, 'postgres'] LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = criador) THEN
                CONTINUE;
            END IF;
            BEGIN
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I;',
                    criador, papel);
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I;',
                    criador, papel);
                EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I;',
                    criador, papel);
            EXCEPTION WHEN insufficient_privilege THEN
                -- Alterar o padrao de outro papel exige ser ele ou superuser.
                -- Em producao current_user JA e 'postgres', que e o dono da
                -- entrada de pg_default_acl que concede a anon/authenticated
                -- em 'public' -- conferido em 31/08/2026. Entao o caminho que
                -- importa nao cai aqui. Existe uma segunda entrada, de
                -- 'supabase_admin', que rege objetos criados pela propria
                -- plataforma; ela nao alcanca as tabelas deste ERP e nao ha
                -- como (nem por que) altera-la.
                RAISE NOTICE 'Sem permissao para alterar o padrao do papel % para %.', criador, papel;
            END;
        END LOOP;

        -- 3. Remove o grant nominal de schema (ver a ressalva no cabecalho).
        EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I;', papel);
        EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I;', papel);

        RAISE NOTICE 'Superficie de % fechada.', papel;
    END LOOP;
END $mig$;

-- ---------------------------------------------------------------------------
-- A view respeita a RLS de quem consulta, nao de quem a criou.
-- ---------------------------------------------------------------------------
-- Mesmo com o acesso anonimo fechado acima, uma view sem 'security_invoker'
-- continua atravessando a RLS da tabela de baixo para QUALQUER papel que a
-- consulte -- inclusive 'eco_app'. Isso significa que a visao consolidada da
-- holding vazaria por ela mesmo com o isolamento correto nas tabelas.
--
-- security_invoker exige PostgreSQL 15+. Producao roda 17.6.
DO $vw$
DECLARE
    v text;
BEGIN
    FOR v IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'v'
    LOOP
        EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true);', v);
        RAISE NOTICE 'View % passou a respeitar a RLS de quem consulta.', v;
    END LOOP;
END $vw$;

-- ---------------------------------------------------------------------------
-- Garante que o papel da aplicacao continua com o que precisa.
-- ---------------------------------------------------------------------------
-- Os REVOKE acima sao dirigidos a anon/authenticated e nao tocam eco_app, mas
-- reafirmar aqui torna a migration independente da ordem de execucao do
-- scripts/setup_app_role.js.
DO $app$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eco_app') THEN
        GRANT USAGE ON SCHEMA public TO eco_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eco_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eco_app;
        REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM eco_app;
    END IF;
END $app$;
