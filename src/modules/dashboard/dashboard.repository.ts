import { withTenantQuery, TenantContext } from '../../core/database/supabase-pool';
import { Periodo, FaixaGrafico } from '../../core/utils/periodo';
import { CATEGORIA_SWEEP, CATEGORIA_RENDIMENTOS } from '../financeiro/financeiro.repository';

/**
 * ============================================================================
 * REPOSITORIO DO DASHBOARD EXECUTIVO
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * O controller carregava as tabelas INTEIRAS a cada requisicao --
 *     SELECT ... FROM transacoes_bancarias   (sem WHERE de data, sem LIMIT)
 *     SELECT ... FROM notas_fiscais          (idem)
 *     SELECT ... FROM orcamentos_historico   (idem, com itens_json completo)
 * -- e so entao filtrava por periodo em JavaScript. Sao 1.385 transacoes, 172
 * notas e 220 orcamentos trafegados e desserializados para exibir um punhado de
 * totais, em toda visita ao painel.
 *
 * [COMO FOI CORRIGIDO]:
 * Filtro e agregacao acontecem no banco. O que sobe para o Node ja e o
 * resultado. O isolamento por CNPJ vem da RLS, nao de um filtro montado a mao.
 * ============================================================================
 */
export class DashboardRepository {
  /** Totais operacionais do periodo, segregando custodia e rendimento. */
  async totaisPeriodo(ctx: TenantContext, p: Periodo) {
    return withTenantQuery(ctx, async (client) => {
      const tx = await client.query(
        `SELECT
           COALESCE(SUM(valor) FILTER (
             WHERE valor > 0 AND categoria_financeira NOT IN ($3, $4)), 0)      AS entradas_operacionais,
           COALESCE(SUM(ABS(valor)) FILTER (
             WHERE valor < 0 AND categoria_financeira <> $3), 0)                AS saidas_operacionais,
           COALESCE(SUM(valor) FILTER (WHERE categoria_financeira = $4), 0)     AS rendimentos,
           COALESCE(SUM(valor) FILTER (
             WHERE valor > 0 AND categoria_financeira = $3), 0)                 AS resgates_custodia,
           COALESCE(SUM(ABS(valor)) FILTER (
             WHERE valor < 0 AND categoria_financeira = $3), 0)                 AS aplicacoes_custodia,
           COUNT(*)                                                             AS qtd_lancamentos
         FROM transacoes_bancarias
        WHERE is_saldo_informativo = FALSE
          AND data_lancamento BETWEEN $1 AND $2;`,
        [p.inicio, p.fim, CATEGORIA_SWEEP, CATEGORIA_RENDIMENTOS]
      );

      /**
       * Faturamento sai das notas fiscais emitidas -- o fato contabil.
       *
       * [ERRO ANTERIOR]: 'Math.max(faturamentoOrcs, faturamentoNFs)'. Pegar o
       * maior entre orcamentos aprovados e notas emitidas nao concilia nada:
       * sao dois estagios diferentes do mesmo funil, e o maximo entre eles nao
       * corresponde a nenhuma grandeza real.
       */
      const nf = await client.query(
        `SELECT
           COALESCE(SUM(valor_total) FILTER (WHERE direcao = 'EMITIDA'), 0)  AS faturado,
           COUNT(*)             FILTER (WHERE direcao = 'EMITIDA')           AS qtd_emitidas,
           COALESCE(SUM(valor_total) FILTER (WHERE direcao = 'RECEBIDA'), 0) AS compras,
           COUNT(*)             FILTER (WHERE direcao = 'RECEBIDA')          AS qtd_recebidas
         FROM notas_fiscais
        WHERE data_emissao::date BETWEEN $1 AND $2;`,
        [p.inicio, p.fim]
      );

      // Orcamentos aprovados = pipeline comercial, reportado a parte.
      const orc = await client.query(
        `SELECT
           COALESCE(SUM(valor_total) FILTER (WHERE status_aprovacao = 'Compra Aprovada'), 0) AS aprovado,
           COUNT(*) FILTER (WHERE status_aprovacao = 'Compra Aprovada')                      AS qtd_aprovados,
           COALESCE(SUM(valor_total), 0)                                                     AS total_cotado,
           COUNT(*)                                                                          AS qtd_total
         FROM orcamentos_historico
        WHERE data_emissao BETWEEN $1 AND $2;`,
        [p.inicio, p.fim]
      );

      return { tx: tx.rows[0], nf: nf.rows[0], orc: orc.rows[0] };
    });
  }

  /** Saldo oficial das contas bancarias (LEDGERBAL do extrato). */
  async contasBancarias(ctx: TenantContext) {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        `SELECT id, banco_nome, agencia, conta_numero, saldo_atual, data_ultimo_saldo
           FROM contas_bancarias
          WHERE ativo = TRUE
          ORDER BY banco_nome, conta_numero;`
      );
      return res.rows;
    });
  }

  /**
   * Serie do grafico agregada no banco, uma faixa por linha.
   *
   * [ERRO ANTERIOR]: o controller iterava as faixas em JS e, para cada uma,
   * refiltrava os arrays inteiros ja carregados na memoria -- e ainda
   * inventava duas das quatro series:
   *     emAtrasoSlots.push(fatS * 0.08)   // 8% do faturado, sem origem
   *     aVencerSlots.push(pagS * 0.15)    // 15% do pago, sem origem
   */
  async serieGrafico(ctx: TenantContext, faixas: FaixaGrafico[]) {
    if (faixas.length === 0) return [];

    return withTenantQuery(ctx, async (client) => {
      const inicios = faixas.map((f) => f.inicio);
      const fins = faixas.map((f) => f.fim);
      const chaves = faixas.map((f) => f.chave);

      const res = await client.query(
        `WITH faixas AS (
           SELECT * FROM unnest($1::text[], $2::date[], $3::date[]) AS t(chave, inicio, fim)
         )
         SELECT
           f.chave,
           COALESCE((SELECT SUM(n.valor_total) FROM notas_fiscais n
                      WHERE n.direcao = 'EMITIDA'
                        AND n.data_emissao::date BETWEEN f.inicio AND f.fim), 0) AS faturado,
           COALESCE((SELECT SUM(t.valor) FROM transacoes_bancarias t
                      WHERE t.valor > 0
                        AND t.is_saldo_informativo = FALSE
                        AND t.categoria_financeira NOT IN ($4, $5)
                        AND t.data_lancamento BETWEEN f.inicio AND f.fim), 0) AS recebido,
           COALESCE((SELECT SUM(ABS(t.valor)) FROM transacoes_bancarias t
                      WHERE t.valor < 0
                        AND t.is_saldo_informativo = FALSE
                        AND t.categoria_financeira <> $4
                        AND t.data_lancamento BETWEEN f.inicio AND f.fim), 0) AS pago,
           -- Titulos em aberto de notas emitidas na faixa: dado real, nao 8%.
           COALESCE((SELECT SUM(d.valor_duplicata)
                       FROM notas_fiscais_duplicatas d
                       JOIN notas_fiscais n2 ON n2.id = d.nota_fiscal_id
                      WHERE n2.direcao = 'EMITIDA'
                        AND d.status_cobranca <> 'PAGO'
                        AND d.data_pagamento IS NULL
                        AND d.data_vencimento BETWEEN f.inicio AND f.fim), 0) AS a_receber,
           COALESCE((SELECT SUM(d.valor_duplicata)
                       FROM notas_fiscais_duplicatas d
                       JOIN notas_fiscais n3 ON n3.id = d.nota_fiscal_id
                      WHERE n3.direcao = 'EMITIDA'
                        AND d.status_cobranca <> 'PAGO'
                        AND d.data_pagamento IS NULL
                        AND d.data_vencimento BETWEEN f.inicio AND f.fim
                        AND d.data_vencimento < CURRENT_DATE), 0) AS em_atraso,
           COALESCE((SELECT SUM(o.valor) FROM obrigacoes_recorrentes o
                      WHERE o.status_pagamento IN ('A_PAGAR','PROGRAMADO')
                        AND o.data_vencimento BETWEEN f.inicio AND f.fim), 0) AS a_vencer
         FROM faixas f
         ORDER BY f.inicio;`,
        [chaves, inicios, fins, CATEGORIA_SWEEP, CATEGORIA_RENDIMENTOS]
      );

      return res.rows;
    });
  }

  /**
   * Curva ABC de inadimplencia, a partir dos titulos realmente vencidos.
   *
   * [ERRO ANTERIOR]: percorria itens_json de todos os orcamentos em JS, e caia
   * num default de 28 dias quando nao conseguia ler o vencimento:
   *     Math.max(clientesAtrasoMap[cnpj].maxDiasAtraso, diasAtraso || 28)
   * Um titulo sem data virava "28 dias de atraso" com ar de dado apurado.
   */
  async curvaInadimplencia(ctx: TenantContext, limite = 5) {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        `SELECT n.destinatario_nome                            AS cliente_nome,
                n.destinatario_cnpj_cpf                        AS cnpj,
                SUM(d.valor_duplicata)                         AS valor_atraso,
                COUNT(*)                                       AS parcelas_atrasadas,
                MAX(CURRENT_DATE - d.data_vencimento)          AS dias_atraso,
                MIN(d.data_vencimento)                         AS vencimento_mais_antigo
           FROM notas_fiscais_duplicatas d
           JOIN notas_fiscais n ON n.id = d.nota_fiscal_id
          WHERE n.direcao = 'EMITIDA'
            AND d.status_cobranca <> 'PAGO'
            AND d.data_pagamento IS NULL
            AND d.data_vencimento < CURRENT_DATE
          GROUP BY 1, 2
          ORDER BY 3 DESC
          LIMIT $1;`,
        [limite]
      );
      return res.rows;
    });
  }

  /** Titulos a receber e a pagar dentro da janela do runway. */
  async janelaRunway(ctx: TenantContext, dias: number) {
    return withTenantQuery(ctx, async (client) => {
      const receber = await client.query(
        `SELECT n.id, n.numero_nota AS numero, n.destinatario_nome AS parceiro,
                n.destinatario_cnpj_cpf AS cnpj, d.valor_duplicata AS valor,
                d.data_vencimento AS data_previsao, d.numero_duplicata
           FROM notas_fiscais_duplicatas d
           JOIN notas_fiscais n ON n.id = d.nota_fiscal_id
          WHERE n.direcao = 'EMITIDA'
            AND d.status_cobranca <> 'PAGO'
            AND d.data_pagamento IS NULL
            AND d.data_vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + $1::int)
          ORDER BY d.data_vencimento;`,
        [dias]
      );

      const pagar = await client.query(
        `SELECT id, favorecido_nome AS parceiro, categoria_detalhada AS descricao,
                valor, data_vencimento AS data_previsao, tipo_entidade
           FROM obrigacoes_recorrentes
          WHERE status_pagamento IN ('A_PAGAR', 'PROGRAMADO')
            AND data_vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + $1::int)
          ORDER BY data_vencimento;`,
        [dias]
      );

      return { receber: receber.rows, pagar: pagar.rows };
    });
  }

  /** Ultimos orcamentos do periodo, para o feed de atividades. */
  async atividadesRecentes(ctx: TenantContext, p: Periodo, limite = 15) {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        `SELECT numero_orcamento, vendido_por, cliente_nome, cliente_cnpj_cpf,
                valor_total, data_emissao, status_aprovacao, situacao_geral,
                itens_json, jsonb_array_length(itens_json) AS total_itens
           FROM orcamentos_historico
          WHERE data_emissao BETWEEN $1 AND $2
          ORDER BY data_emissao DESC, created_at DESC
          LIMIT $3;`,
        [p.inicio, p.fim, limite]
      );
      return res.rows;
    });
  }

  /** Extrato recente para o painel de tesouraria. */
  async extratoRecente(ctx: TenantContext, p: Periodo, limite = 300) {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        `SELECT t.id, t.data_lancamento, t.valor, t.memo, t.documento_contraparte,
                t.nome_contraparte, t.categoria_financeira, t.is_saldo_informativo,
                c.banco_nome, c.conta_numero, c.agencia,
                CASE
                  WHEN t.is_saldo_informativo             THEN 'SALDO_INFORMATIVO'
                  WHEN t.categoria_financeira = $4         THEN 'RECEITA_FINANCEIRA'
                  WHEN t.categoria_financeira = $3         THEN 'TRANSFERENCIA_CUSTODIA'
                  ELSE 'OPERACIONAL'
                END AS tipo_classificacao
           FROM transacoes_bancarias t
           JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
          WHERE t.data_lancamento BETWEEN $1 AND $2
          ORDER BY t.data_lancamento DESC, t.created_at DESC
          LIMIT $5;`,
        [p.inicio, p.fim, CATEGORIA_SWEEP, CATEGORIA_RENDIMENTOS, limite]
      );
      return res.rows;
    });
  }

  /** Total efetivamente em custodia (aplicacoes menos resgates, acumulado). */
  async saldoCustodia(ctx: TenantContext) {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        `SELECT COALESCE(SUM(ABS(valor)) FILTER (WHERE valor < 0), 0)
                - COALESCE(SUM(valor) FILTER (WHERE valor > 0), 0) AS saldo_investido
           FROM transacoes_bancarias
          WHERE categoria_financeira = $1
            AND is_saldo_informativo = FALSE;`,
        [CATEGORIA_SWEEP]
      );
      return Number(res.rows[0].saldo_investido || 0);
    });
  }
}
