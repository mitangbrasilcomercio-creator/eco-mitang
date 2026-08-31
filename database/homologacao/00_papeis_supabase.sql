-- ============================================================================
-- PAPEIS DA SUPABASE NO CONTAINER DE HOMOLOGACAO
-- ============================================================================
--
-- Roda uma vez, na criacao do volume (/docker-entrypoint-initdb.d).
--
-- Por que existir: producao e Supabase, e a Supabase cria 'anon' e
-- 'authenticated' -- os papeis do PostgREST -- e concede a eles privilegio
-- PADRAO sobre tudo que for criado no schema public. Foi assim que quatro
-- objetos criados DEPOIS da migration 21 (parceiros_negocio, plano_contas,
-- obrigacoes_recorrentes e a view vw_obrigacoes_recorrentes) reapareceram
-- expostos, mesmo com a 21 tendo revogado tudo na epoca: a 21 foi uma
-- varredura unica, nao uma regra permanente.
--
-- Um PostgreSQL puro nao tem esses papeis. Sem eles aqui, a migration que
-- fecha a brecha viraria um no-op em homologacao -- e "passou em homologacao"
-- passaria a significar nada para essa classe de defeito.
--
-- Este arquivo reproduz de proposito o comportamento inseguro da plataforma,
-- para que a migration que o corrige possa ser provada aqui antes de producao.
-- ============================================================================

CREATE ROLE anon          NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role  NOLOGIN NOINHERIT BYPASSRLS;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- O ponto central: privilegio padrao sobre o que ainda vai ser criado.
-- E daqui que vem a exposicao silenciosa de tabela nova.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
