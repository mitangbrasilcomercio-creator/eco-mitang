-- ============================================================================
-- 32. OBRIGACAO COM VIGENCIA, PARCELA COM DONO, E FATURA QUE NAO DUPLICA
-- ============================================================================
--
-- Tres defeitos de modelagem que sairam de ler a planilha de receitas e
-- despesas linha por linha, com o Diego explicando o contexto de cada coluna.
--
-- [1] RECORRENCIA SEM VIGENCIA MENTE
-- 'Mensal' hoje quer dizer duas coisas incompativeis: a conta de luz, que
-- nunca acaba, e a Certibrasil, que era 'Mensal' e terminou na parcela 6 de 6
-- em 30/08/2026. Sem data de fim, toda media historica arrasta para sempre o
-- que ja acabou -- o pro-labore da Regina, que deixou a sociedade, continuava
-- entrando no custo mensal.
--
-- [2] PARCELA SEM DONO NAO RESPONDE "QUANTO EU DEVO"
-- Cada parcela e uma linha solta. 'Strema, 19 lancamentos' parecia gasto
-- mensal recorrente quando eram 4 compras parceladas em 4 e 5 vezes. A chave
-- que liga as parcelas da mesma compra e o NUMERO DA NOTA FISCAL -- que ja
-- esta na planilha e nao estava sendo usado.
--
-- [3] FATURA DE CARTAO E AGREGADOR, NAO DESPESA
-- A compra da Hayamax (R$ 7.837,28 em 4x) foi feita no cartao. As parcelas
-- vencem de set a dez/2026, e as faturas desses meses ainda nao foram
-- lancadas. Quando forem, cada parcela vai aparecer duas vezes: como compra e
-- dentro da fatura.
--
-- E a distincao competencia x caixa que governa o projeto inteiro: a COMPRA e
-- a despesa (competencia), a FATURA e a liquidacao (caixa). Somar as duas
-- conta o mesmo dinheiro duas vezes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. VIGENCIA E SITUACAO
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE situacao_obrigacao AS ENUM (
        'ATIVA',              -- vale para o proximo mes
        'ENCERRADA',          -- acabou: parcelas quitadas, contrato encerrado
        'SUSPEITA_DE_PARADA', -- nao aparece ha meses e ninguem confirmou
        'INDEFINIDA'          -- ainda nao classificada
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE motivo_encerramento AS ENUM (
        'PARCELAS',        -- termina quando a ultima parcela vencer
        'CONTRATO',        -- termina em data acordada
        'INDETERMINADO'    -- enquanto durar (luz, aluguel, telefone)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE obrigacoes_recorrentes
    ADD COLUMN IF NOT EXISTS vigencia_inicio    DATE,
    ADD COLUMN IF NOT EXISTS vigencia_fim       DATE,
    ADD COLUMN IF NOT EXISTS encerra_por        motivo_encerramento,
    ADD COLUMN IF NOT EXISTS situacao           situacao_obrigacao NOT NULL DEFAULT 'INDEFINIDA',
    ADD COLUMN IF NOT EXISTS ultima_ocorrencia  DATE;

COMMENT ON COLUMN obrigacoes_recorrentes.vigencia_fim IS
    'NULL quando a obrigacao nao tem fim previsto (luz, aluguel). Preenchida '
    'quando ha ultima parcela ou fim de contrato -- e o que impede a media '
    'historica arrastar o que ja acabou.';
COMMENT ON COLUMN obrigacoes_recorrentes.situacao IS
    'SUSPEITA_DE_PARADA existe porque ausencia no extrato NAO prova que '
    'acabou: o aluguel da Prima sumiu por tres meses e continua ativo -- o que '
    'faltou foi lancamento, nao pagamento.';

-- ---------------------------------------------------------------------------
-- 2. PARCELA COM DONO: O DOCUMENTO FISCAL AGRUPA
-- ---------------------------------------------------------------------------
-- 'parcelas_info' JSONB continua existindo para o que veio da planilha, mas
-- numero e total sobem para coluna: sem isso nao da para perguntar "quais
-- parcelas vencem em setembro" sem varrer JSON.
ALTER TABLE obrigacoes_recorrentes
    ADD COLUMN IF NOT EXISTS documento_numero  VARCHAR(60),
    ADD COLUMN IF NOT EXISTS parcela_numero    INT,
    ADD COLUMN IF NOT EXISTS parcela_total     INT,
    ADD COLUMN IF NOT EXISTS valor_compra      NUMERIC(14,2);

COMMENT ON COLUMN obrigacoes_recorrentes.documento_numero IS
    'Numero da NF-e/NFS-e da compra. E a chave que liga as parcelas de uma '
    'mesma compra: a Strema tem quatro compras distintas (65892, 66155, 66624, '
    '67504) que sem isto pareciam um gasto mensal unico.';

ALTER TABLE obrigacoes_recorrentes DROP CONSTRAINT IF EXISTS chk_parcela_coerente;
ALTER TABLE obrigacoes_recorrentes ADD CONSTRAINT chk_parcela_coerente CHECK (
    (parcela_numero IS NULL AND parcela_total IS NULL)
    OR (parcela_numero >= 1 AND parcela_total >= 1 AND parcela_numero <= parcela_total)
);

CREATE INDEX IF NOT EXISTS idx_obrigacoes_compra
    ON obrigacoes_recorrentes (empresa_id, documento_numero)
    WHERE documento_numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obrigacoes_ativas
    ON obrigacoes_recorrentes (empresa_id, data_vencimento)
    WHERE situacao = 'ATIVA';

-- ---------------------------------------------------------------------------
-- 3. A FATURA DE CARTAO NAO E DESPESA
-- ---------------------------------------------------------------------------
-- 'agregadora' marca a linha que apenas SOMA outras: a fatura do cartao. A
-- despesa foi reconhecida na compra; a fatura e o pagamento dela.
--
-- Somar despesa sem excluir agregadoras conta duas vezes. O cartao Itau de
-- julho fechou em R$ 20.011,80 -- se ele e as compras que o compoem entrarem
-- juntos, o mes ganha R$ 20 mil que nao existem.
ALTER TABLE obrigacoes_recorrentes
    ADD COLUMN IF NOT EXISTS agregadora        BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS agregada_em_id    UUID REFERENCES obrigacoes_recorrentes(id) ON DELETE SET NULL;

COMMENT ON COLUMN obrigacoes_recorrentes.agregadora IS
    'TRUE na fatura de cartao. Toda soma de despesa deve excluir agregadoras, '
    'ou conta a compra e a fatura que a contem.';
COMMENT ON COLUMN obrigacoes_recorrentes.agregada_em_id IS
    'Aponta da parcela para a fatura que a liquida. A compra da Hayamax foi no '
    'cartao: as quatro parcelas vencem dentro de faturas de set a dez/2026.';

CREATE INDEX IF NOT EXISTS idx_obrigacoes_agregadas
    ON obrigacoes_recorrentes (agregada_em_id) WHERE agregada_em_id IS NOT NULL;

-- Fatura nao pode estar dentro de outra fatura.
ALTER TABLE obrigacoes_recorrentes DROP CONSTRAINT IF EXISTS chk_agregadora_nao_agregada;
ALTER TABLE obrigacoes_recorrentes ADD CONSTRAINT chk_agregadora_nao_agregada
    CHECK (NOT (agregadora AND agregada_em_id IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 4. A VISAO QUE RESPONDE "O QUE EU PAGO MES QUE VEM"
-- ---------------------------------------------------------------------------
-- Media historica responde a pergunta errada. Esta visao olha para frente:
-- so o que esta ATIVO, dentro da vigencia, e sem contar agregadora.
CREATE OR REPLACE VIEW vw_obrigacoes_do_mes AS
SELECT
    o.empresa_id,
    e.nome_fantasia                     AS empresa,
    o.favorecido_nome,
    o.categoria_detalhada,
    o.recorrencia,
    o.valor,
    o.data_vencimento,
    o.parcela_numero,
    o.parcela_total,
    o.documento_numero,
    o.situacao,
    o.vigencia_fim,
    CASE
        WHEN o.parcela_total IS NOT NULL AND o.parcela_numero = o.parcela_total
            THEN 'ultima parcela'
        WHEN o.vigencia_fim IS NOT NULL AND o.vigencia_fim <= (CURRENT_DATE + 60)
            THEN 'encerra em ate 60 dias'
        ELSE NULL
    END                                 AS aviso
  FROM obrigacoes_recorrentes o
  JOIN empresas e ON e.id = o.empresa_id
 WHERE o.tipo_operacao = 'DESPESA'
   AND o.situacao = 'ATIVA'
   AND NOT o.agregadora
   AND (o.vigencia_fim IS NULL OR o.vigencia_fim >= CURRENT_DATE);

COMMENT ON VIEW vw_obrigacoes_do_mes IS
    'O que ainda vai ser pago. Exclui agregadora (fatura de cartao), o que ja '
    'encerrou, e o que nao esta confirmado como ativo. Nao usa media historica: '
    'media arrasta despesa morta.';

GRANT SELECT ON vw_obrigacoes_do_mes TO eco_app;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- DROP VIEW IF EXISTS vw_obrigacoes_do_mes;
-- ALTER TABLE obrigacoes_recorrentes
--   DROP COLUMN IF EXISTS vigencia_inicio, DROP COLUMN IF EXISTS vigencia_fim,
--   DROP COLUMN IF EXISTS encerra_por, DROP COLUMN IF EXISTS situacao,
--   DROP COLUMN IF EXISTS ultima_ocorrencia, DROP COLUMN IF EXISTS documento_numero,
--   DROP COLUMN IF EXISTS parcela_numero, DROP COLUMN IF EXISTS parcela_total,
--   DROP COLUMN IF EXISTS valor_compra, DROP COLUMN IF EXISTS agregadora,
--   DROP COLUMN IF EXISTS agregada_em_id;
-- DROP TYPE IF EXISTS situacao_obrigacao; DROP TYPE IF EXISTS motivo_encerramento;
