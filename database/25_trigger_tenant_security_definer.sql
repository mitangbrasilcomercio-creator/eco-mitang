-- ============================================================================
-- 25. TRIGGER DE COERENCIA DE TENANT: DIAGNOSTICO CORRETO SOB RLS
-- ============================================================================
--
-- [PROBLEMA]:
-- A funcao criada na migration 23 consulta 'contas_bancarias' para descobrir o
-- titular da conta. Executando com os privilegios de quem grava, ela esbarra na
-- propria RLS: ao tentar lancar uma transacao do CNPJ B numa conta do CNPJ A, a
-- consulta interna nao enxerga a conta de A e a funcao aborta com
--
--     'Conta bancaria <uuid> nao encontrada.'
--
-- A gravacao e barrada -- que e o comportamento desejado -- mas a mensagem
-- manda quem esta lendo o log procurar por uma conta inexistente, quando o
-- problema real e outro: a conta existe e pertence a outra empresa.
--
-- [CORRECAO]:
-- SECURITY DEFINER para a verificacao enxergar todas as contas e conseguir
-- dizer exatamente qual e a incoerencia. A funcao continua apenas VERIFICANDO
-- -- nao le nem grava nada alem do titular da conta -- e o search_path e fixado
-- para evitar sequestro de resolucao de nomes, cuidado obrigatorio em funcoes
-- SECURITY DEFINER.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_valida_tenant_transacao_bancaria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    empresa_da_conta UUID;
BEGIN
    SELECT empresa_id INTO empresa_da_conta
      FROM contas_bancarias
     WHERE id = NEW.conta_bancaria_id;

    IF empresa_da_conta IS NULL THEN
        RAISE EXCEPTION 'Conta bancaria % nao existe.', NEW.conta_bancaria_id;
    END IF;

    IF NEW.empresa_id <> empresa_da_conta THEN
        RAISE EXCEPTION
            'INTEGRIDADE MULTI-TENANT: lancamento marcado com empresa_id % mas a conta bancaria % pertence a empresa %. O titular da conta define o CNPJ do lancamento.',
            NEW.empresa_id, NEW.conta_bancaria_id, empresa_da_conta;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION fn_valida_tenant_importacao_ofx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    empresa_da_conta UUID;
BEGIN
    SELECT empresa_id INTO empresa_da_conta
      FROM contas_bancarias
     WHERE id = NEW.conta_bancaria_id;

    IF empresa_da_conta IS NOT NULL AND NEW.empresa_id <> empresa_da_conta THEN
        RAISE EXCEPTION
            'INTEGRIDADE MULTI-TENANT: importacao marcada com empresa_id % mas a conta % pertence a empresa %.',
            NEW.empresa_id, NEW.conta_bancaria_id, empresa_da_conta;
    END IF;

    RETURN NEW;
END;
$fn$;

-- Restringe a execucao das funcoes de trigger aos papeis esperados: uma funcao
-- SECURITY DEFINER nao deve ficar disponivel para chamada direta por qualquer um.
REVOKE ALL ON FUNCTION fn_valida_tenant_transacao_bancaria() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_valida_tenant_importacao_ofx() FROM PUBLIC;
