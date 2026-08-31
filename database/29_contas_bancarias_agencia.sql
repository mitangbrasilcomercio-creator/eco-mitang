-- ============================================================================
-- 29. SEPARA AGENCIA E CONTA, QUE A INGESTAO DO OFX GRUDOU
-- ============================================================================
--
-- [ERRO ANTERIOR]
-- A ingestao do OFX gravou o campo ACCTID inteiro -- que o Itau preenche com
-- agencia + conta concatenadas -- em 'conta_numero', e escreveu '0001' em
-- 'agencia', que e um valor inventado. As duas contas do Itau ficaram assim:
--
--   Mitang Brasil   agencia 0001   conta 2927986634
--   Arandu          agencia 0001   conta 1155995077
--
-- O agente de frontend tinha a informacao certa na especificacao dele (doc 08:
-- "Agencia 2927 / Conta 98663-4") e eu pedi que ele NAO exibisse a agencia ate
-- isto ser corrigido -- exibir '0001' numa proposta comercial faria o cliente
-- pagar na conta errada.
--
-- A separacao correta foi confirmada no PDF do orcamento 010925, emitido pela
-- propria empresa: "Banco: Itau  Conta Corrente: 98663-4  Agencia: 2927".
--
-- [CORRECAO]
-- Agencia e conta voltam a ser campos distintos, e fica registrado o valor
-- original do ACCTID para a conciliacao do OFX continuar casando.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Guarda o identificador que o banco manda no arquivo
-- ---------------------------------------------------------------------------
-- A conciliacao do OFX casa pelo ACCTID. Se ele so existisse concatenado em
-- 'conta_numero', separar os campos quebraria o casamento dos proximos
-- extratos. Passa a viver no seu proprio campo.
ALTER TABLE contas_bancarias
    ADD COLUMN IF NOT EXISTS identificador_ofx VARCHAR(60),
    ADD COLUMN IF NOT EXISTS conta_digito      VARCHAR(4);

COMMENT ON COLUMN contas_bancarias.identificador_ofx IS
    'ACCTID como o banco escreve no arquivo OFX. No Itau vem agencia+conta '
    'concatenadas. E por ele que a ingestao reconhece a conta.';
COMMENT ON COLUMN contas_bancarias.conta_digito IS
    'Digito verificador da conta, separado para exibicao (98663-4).';

-- Preserva o que ja estava gravado antes de mexer.
UPDATE contas_bancarias
   SET identificador_ofx = conta_numero
 WHERE identificador_ofx IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Itau: separa agencia (4 digitos) + conta (5) + digito (1)
-- ---------------------------------------------------------------------------
-- Conferido contra o PDF do orcamento 010925 da Mitang Brasil.
UPDATE contas_bancarias SET
    agencia       = '2927',
    conta_numero  = '98663',
    conta_digito  = '4',
    updated_at    = NOW()
 WHERE banco_codigo = '0341' AND identificador_ofx = '2927986634';

UPDATE contas_bancarias SET
    agencia       = '1155',
    conta_numero  = '99507',
    conta_digito  = '7',
    updated_at    = NOW()
 WHERE banco_codigo = '0341' AND identificador_ofx = '1155995077';

-- A agencia passa a aceitar NULL: exibir vazio e honesto, exibir '0001'
-- inventado nao e. Precisa vir ANTES do UPDATE que grava NULL.
ALTER TABLE contas_bancarias ALTER COLUMN agencia DROP NOT NULL;

-- A conta do Bradesco tem identificador de 5 digitos, sem agencia embutida:
-- nao ha o que separar, e inventar um numero aqui seria repetir o erro que
-- esta migration corrige. Fica marcada como pendente de conferencia.
UPDATE contas_bancarias SET
    agencia    = NULL,
    updated_at = NOW()
 WHERE banco_codigo = '0237' AND agencia = '0001';

COMMENT ON COLUMN contas_bancarias.agencia IS
    'Agencia, sem o digito. NULL quando ainda nao foi conferida contra '
    'documento -- e melhor exibir vazio que exibir um numero inventado.';

-- ---------------------------------------------------------------------------
-- 3. Conferencia
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    grudadas INT;
BEGIN
    -- Agencia com 4 digitos e conta com 5 ou 6 e o formato do Itau; conta com
    -- 10 digitos e o sintoma de que os dois campos voltaram a ser um so.
    SELECT count(*) INTO grudadas
      FROM contas_bancarias
     WHERE length(regexp_replace(conta_numero, '[^0-9]', '', 'g')) >= 10;

    IF grudadas > 0 THEN
        RAISE EXCEPTION 'Restaram % contas com agencia e conta no mesmo campo', grudadas;
    END IF;

    RAISE NOTICE 'Contas bancarias com agencia e conta separadas.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- UPDATE contas_bancarias SET conta_numero = identificador_ofx,
--        agencia = '0001', conta_digito = NULL
--  WHERE identificador_ofx IS NOT NULL;
-- ALTER TABLE contas_bancarias ALTER COLUMN agencia SET NOT NULL;
-- ALTER TABLE contas_bancarias DROP COLUMN IF EXISTS identificador_ofx,
--                             DROP COLUMN IF EXISTS conta_digito;
