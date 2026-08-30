-- ============================================================================
-- 23. TRAVAS DE INTEGRIDADE FINANCEIRA E INDICES DE CONSULTA REAL
-- ============================================================================
--
-- [ERRO ANTERIOR]:
-- 1. 'extratos_ofx_importacoes.arquivo_hash_sha256' nao tinha UNIQUE. O mesmo
--    extrato do Bradesco foi importado 13 vezes e o de abril do Itau, 3 vezes.
--    Cada reimportacao reexecutava o laco inteiro e reescrevia o saldo da conta.
-- 2. Nada garantia que 'transacoes_bancarias.empresa_id' fosse o mesmo CNPJ
--    dono da conta bancaria do lancamento. Resultado: 110 transacoes com o
--    empresa_id da Mitang Services dentro de contas da Mitang Brasil (48) e da
--    Arandu (62) -- causadas pelo servico de ingestao gravar 'empresaId' em vez
--    do 'resolvedEmpresaId' derivado da conta.
-- 3. Faltavam indices compostos para as consultas que o dashboard e o
--    financeiro realmente fazem (filtro por tenant + periodo + categoria).
--
-- [COMO FOI CORRIGIDO]:
-- Deduplicacao das importacoes, UNIQUE no hash do arquivo, trigger de coerencia
-- de tenant (a conta bancaria e a autoridade sobre a qual CNPJ pertence o
-- lancamento) e os indices que faltavam.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. DEDUPLICACAO DAS IMPORTACOES OFX REPETIDAS
-- ---------------------------------------------------------------------------
-- Mantem a importacao mais antiga de cada arquivo e descarta as repeticoes.
-- 'transacoes_bancarias.importacao_id' tem ON DELETE SET NULL, entao as
-- transacoes sobrevivem apontando para NULL -- e serao reassociadas na
-- re-ingestao limpa da Fase 4.
WITH ranqueadas AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY empresa_id, conta_bancaria_id, arquivo_hash_sha256
               ORDER BY created_at ASC, id ASC
           ) AS posicao
      FROM extratos_ofx_importacoes
)
DELETE FROM extratos_ofx_importacoes
 WHERE id IN (SELECT id FROM ranqueadas WHERE posicao > 1);

-- A partir daqui, reimportar o mesmo arquivo na mesma conta e um erro
-- detectado pelo banco, nao um efeito colateral silencioso.
DO $$ BEGIN
    ALTER TABLE extratos_ofx_importacoes
        ADD CONSTRAINT unq_ofx_arquivo_por_conta
        UNIQUE (empresa_id, conta_bancaria_id, arquivo_hash_sha256);
EXCEPTION
    WHEN duplicate_table THEN null;
    WHEN duplicate_object THEN null;
END $$;

-- ---------------------------------------------------------------------------
-- 2. COERENCIA DE TENANT ENTRE TRANSACAO E CONTA BANCARIA
-- ---------------------------------------------------------------------------
-- CHECK nao cruza tabelas, entao a trava e um trigger. A conta bancaria e a
-- fonte da verdade: um extrato pertence ao CNPJ titular da conta, ponto.
CREATE OR REPLACE FUNCTION fn_valida_tenant_transacao_bancaria()
RETURNS TRIGGER AS $fn$
DECLARE
    empresa_da_conta UUID;
BEGIN
    SELECT empresa_id INTO empresa_da_conta
      FROM contas_bancarias
     WHERE id = NEW.conta_bancaria_id;

    IF empresa_da_conta IS NULL THEN
        RAISE EXCEPTION 'Conta bancaria % nao encontrada.', NEW.conta_bancaria_id;
    END IF;

    IF NEW.empresa_id <> empresa_da_conta THEN
        RAISE EXCEPTION
            'INTEGRIDADE MULTI-TENANT: a transacao foi marcada com empresa_id % mas a conta bancaria % pertence a empresa %. O titular da conta e quem define o CNPJ do lancamento.',
            NEW.empresa_id, NEW.conta_bancaria_id, empresa_da_conta;
    END IF;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valida_tenant_transacao ON transacoes_bancarias;
CREATE TRIGGER trg_valida_tenant_transacao
    BEFORE INSERT OR UPDATE OF empresa_id, conta_bancaria_id ON transacoes_bancarias
    FOR EACH ROW
    EXECUTE FUNCTION fn_valida_tenant_transacao_bancaria();

-- Mesma trava para o log de importacao.
CREATE OR REPLACE FUNCTION fn_valida_tenant_importacao_ofx()
RETURNS TRIGGER AS $fn$
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
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valida_tenant_importacao ON extratos_ofx_importacoes;
CREATE TRIGGER trg_valida_tenant_importacao
    BEFORE INSERT OR UPDATE OF empresa_id, conta_bancaria_id ON extratos_ofx_importacoes
    FOR EACH ROW
    EXECUTE FUNCTION fn_valida_tenant_importacao_ofx();

-- ---------------------------------------------------------------------------
-- 3. INDICES PARA AS CONSULTAS QUE A API REALMENTE FAZ
-- ---------------------------------------------------------------------------
-- Dashboard e DRE filtram por tenant + direcao + periodo.
CREATE INDEX IF NOT EXISTS idx_nf_empresa_direcao_data
    ON notas_fiscais (empresa_id, direcao, data_emissao DESC);

-- Extrato e resumo de caixa filtram por tenant + periodo + categoria,
-- quase sempre descartando os saldos informativos.
CREATE INDEX IF NOT EXISTS idx_tx_empresa_data_categoria
    ON transacoes_bancarias (empresa_id, data_lancamento DESC, categoria_financeira);

CREATE INDEX IF NOT EXISTS idx_tx_operacionais
    ON transacoes_bancarias (empresa_id, data_lancamento DESC)
    WHERE is_saldo_informativo = FALSE;

-- Contas a receber saem das duplicatas em aberto.
CREATE INDEX IF NOT EXISTS idx_nf_dup_status_venc
    ON notas_fiscais_duplicatas (status_cobranca, data_vencimento);

-- Dashboard filtra orcamentos por tenant + periodo + status.
CREATE INDEX IF NOT EXISTS idx_orcamentos_empresa_data_status
    ON orcamentos_historico (empresa_id, data_emissao DESC, status_aprovacao);

-- ---------------------------------------------------------------------------
-- 4. COLUNA DE DIRECAO DE PAGAMENTO NAS DUPLICATAS
-- ---------------------------------------------------------------------------
-- 'a_receber' passa a sair daqui (titulos em aberto), e nao mais da soma cega
-- de todas as notas emitidas -- que contava tambem o que ja foi pago.
ALTER TABLE notas_fiscais_duplicatas
    ADD COLUMN IF NOT EXISTS data_pagamento DATE;
ALTER TABLE notas_fiscais_duplicatas
    ADD COLUMN IF NOT EXISTS transacao_bancaria_id UUID
        REFERENCES transacoes_bancarias(id) ON DELETE SET NULL;
