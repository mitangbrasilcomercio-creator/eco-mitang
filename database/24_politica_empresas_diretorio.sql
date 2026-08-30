-- ============================================================================
-- 24. AJUSTE DA POLICY DE 'empresas' (DIRETORIO DA HOLDING)
-- ============================================================================
--
-- [PROBLEMA IDENTIFICADO NA APLICACAO DA MIGRATION 21]:
-- A policy criada em 21 restringia 'empresas' a 'id = ANY(app_empresa_ids())'.
-- Isso cria um impasse nas rotinas de manutencao: para montar o contexto de
-- tenant e preciso primeiro descobrir quais empresas existem -- e a consulta
-- que descobre isso e barrada por nao haver contexto ainda.
--
-- [DECISAO]:
-- 'empresas' nao e dado de tenant: sao os 4 CNPJs da propria holding, um
-- diretorio interno com razao social, nome fantasia e ramo. Nao ha informacao
-- de cliente, valor ou movimentacao nela.
--
-- Quem pode ver quais CNPJs continua sendo decidido onde sempre foi decidido de
-- verdade: em 'usuarios_empresas', pelo JWT emitido no login. O seletor de
-- empresa do front recebe apenas os CNPJs do token, nunca esta lista crua.
--
-- As tabelas que de fato carregam dado sensivel -- transacoes_bancarias,
-- notas_fiscais, clientes, orcamentos_historico, obrigacoes_recorrentes --
-- seguem com o isolamento estrito da migration 21.
-- ============================================================================

DROP POLICY IF EXISTS tenant_visibilidade ON empresas;

CREATE POLICY diretorio_holding_leitura ON empresas
    AS PERMISSIVE FOR SELECT
    USING (true);

-- Escrita em 'empresas' continua sendo ato administrativo, feito pelo papel de
-- migration. Sem policy de INSERT/UPDATE/DELETE, a RLS nega essas operacoes
-- para o papel da aplicacao.
DO $mig$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eco_app') THEN
        REVOKE INSERT, UPDATE, DELETE ON empresas FROM eco_app;
    END IF;
END $mig$;
