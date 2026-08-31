-- ============================================================================
-- 27. ORCAMENTOS: PROCEDENCIA, VERSAO E AS REGRAS QUE A PLANILHA REVELOU
-- ============================================================================
--
-- Contexto: os 220 orcamentos em producao vieram de uma extracao por PDF de
-- uma versao antiga da planilha. A leitura do arquivo original (.xlsm, XML
-- cru) mostrou que a extracao perdeu itens em 5 orcamentos e que a planilha
-- carrega informacao que a tabela nao tem onde guardar.
--
-- Esta migration acrescenta as colunas para (a) rastrear de onde cada linha
-- veio, (b) representar o versionamento que o Diego ja pratica com sufixo, e
-- (c) guardar o frete e a base do desconto separados, em vez de so o total.
--
-- Nada e removido. Toda coluna nasce nula e opcional.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Procedencia: de qual arquivo e de qual linha veio este registro
-- ---------------------------------------------------------------------------
-- Sem isso, "de onde saiu este numero?" nao tem resposta seis meses depois.
ALTER TABLE orcamentos_historico
    ADD COLUMN IF NOT EXISTS fonte_arquivo   VARCHAR(120),
    ADD COLUMN IF NOT EXISTS fonte_linha     INT,
    ADD COLUMN IF NOT EXISTS fonte_hash      VARCHAR(64),
    ADD COLUMN IF NOT EXISTS importado_em    TIMESTAMPTZ;

COMMENT ON COLUMN orcamentos_historico.fonte_linha IS
    'Linha na aba Lista_De_Orcamentos da planilha de origem.';
COMMENT ON COLUMN orcamentos_historico.fonte_hash IS
    'SHA-256 do arquivo de origem, para provar contra qual versao foi importado.';

-- ---------------------------------------------------------------------------
-- 2. Versionamento: o sufixo que ja existe na pratica
-- ---------------------------------------------------------------------------
-- O numero segue OOMMAA (ordem no mes, mes, ano) e e a chave que amarra
-- planilha, Word, PDF, nota fiscal e boleto. Quando o mesmo negocio precisa de
-- duas propostas ao mesmo tempo -- o cliente pediu dois formatos --, o Diego
-- escreve '010526-2'. Separar base e versao torna isso consultavel.
ALTER TABLE orcamentos_historico
    ADD COLUMN IF NOT EXISTS numero_base       VARCHAR(40),
    ADD COLUMN IF NOT EXISTS versao            INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS padrao_numeracao  VARCHAR(20),
    -- Aponta para a proposta que originou esta, quando ela e refacao de outra.
    ADD COLUMN IF NOT EXISTS origem_orcamento  VARCHAR(40);

COMMENT ON COLUMN orcamentos_historico.padrao_numeracao IS
    'OOMMAA para a numeracao propria; OUTRO_CNPJ quando a venda saiu por outra '
    'empresa da holding com regra propria (ex.: 01.S.26.042.038 na triangulacao '
    'para a Valaris, em que o cliente compra de um CNPJ que compra da Mitang).';

-- ---------------------------------------------------------------------------
-- 3. Frete e base do desconto, separados do total
-- ---------------------------------------------------------------------------
-- A planilha calcula (mercadoria + frete) x (1 - desconto). O PDF do MESMO
-- orcamento mostra o desconto so sobre a mercadoria e o frete ja liquido. Os
-- dois fecham no mesmo total -- conferido no 010925, R$ 29.558,81, zero de
-- diferenca. Guardar apenas o total perde qual apresentacao usar, e as duas
-- acontecem na operacao: quem decide esta acima do Diego.
ALTER TABLE orcamentos_historico
    ADD COLUMN IF NOT EXISTS frete_bruto     NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS desconto_pct    NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS base_desconto   VARCHAR(24);

ALTER TABLE orcamentos_historico
    DROP CONSTRAINT IF EXISTS chk_base_desconto;
ALTER TABLE orcamentos_historico
    ADD CONSTRAINT chk_base_desconto CHECK (
        base_desconto IS NULL
        OR base_desconto IN ('PRODUTOS', 'PRODUTOS_MAIS_FRETE', 'INDISTINGUIVEL')
    );

-- ---------------------------------------------------------------------------
-- 4. Confiabilidade e divergencias, declaradas em vez de silenciadas
-- ---------------------------------------------------------------------------
-- 2026 e o ano que a empresa vai levar a serio; 2025 fica como historico. E
-- quando o numero e a data de emissao discordam, o registro carrega a
-- divergencia em vez de alguem escolher um lado no escuro.
ALTER TABLE orcamentos_historico
    ADD COLUMN IF NOT EXISTS confiabilidade    VARCHAR(16),
    ADD COLUMN IF NOT EXISTS divergencia_data  JSONB;

ALTER TABLE orcamentos_historico
    DROP CONSTRAINT IF EXISTS chk_confiabilidade;
ALTER TABLE orcamentos_historico
    ADD CONSTRAINT chk_confiabilidade CHECK (
        confiabilidade IS NULL OR confiabilidade IN ('RIGOROSO', 'HISTORICO')
    );

-- ---------------------------------------------------------------------------
-- 5. Indices para as buscas que a tela vai fazer
-- ---------------------------------------------------------------------------
-- O numero e a chave de rastreabilidade: buscar por ele precisa ser imediato.
CREATE INDEX IF NOT EXISTS idx_orcamentos_numero_base
    ON orcamentos_historico (numero_base);
CREATE INDEX IF NOT EXISTS idx_orcamentos_origem
    ON orcamentos_historico (origem_orcamento)
    WHERE origem_orcamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orcamentos_divergencia
    ON orcamentos_historico (empresa_id)
    WHERE divergencia_data IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- ALTER TABLE orcamentos_historico
--     DROP COLUMN IF EXISTS fonte_arquivo, DROP COLUMN IF EXISTS fonte_linha,
--     DROP COLUMN IF EXISTS fonte_hash,    DROP COLUMN IF EXISTS importado_em,
--     DROP COLUMN IF EXISTS numero_base,   DROP COLUMN IF EXISTS versao,
--     DROP COLUMN IF EXISTS padrao_numeracao, DROP COLUMN IF EXISTS origem_orcamento,
--     DROP COLUMN IF EXISTS frete_bruto,   DROP COLUMN IF EXISTS desconto_pct,
--     DROP COLUMN IF EXISTS base_desconto, DROP COLUMN IF EXISTS confiabilidade,
--     DROP COLUMN IF EXISTS divergencia_data;
