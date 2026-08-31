import { PoolClient } from 'pg';
import { withTenantQuery, withTenantTransaction, TenantContext } from '../../core/database/supabase-pool';
import { Periodo } from '../../core/utils/periodo';

/**
 * ============================================================================
 * REPOSITORIO FINANCEIRO
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * O controller montava SQL por concatenacao com o header do cliente:
 *     const filterTenant = (empresaId && empresaId !== 'all')
 *       ? `AND empresa_id = '${empresaId}'` : '';
 * Isso e injecao de SQL nao autenticada -- bastava mandar
 * `x-empresa-id: ' OR 1=1--`. E havia ainda um
 *     filterTenant.replace(/empresa_id/g, 'c.empresa_id')
 * reescrevendo a string de filtro na marra.
 *
 * [COMO FOI CORRIGIDO]:
 * 1. Nenhum valor entra em SQL por concatenacao: tudo por $1, $2, ...
 * 2. O filtro por tenant deixou de ser responsabilidade do SQL da aplicacao.
 *    Quem isola e a Row-Level Security (migration 21), alimentada pelo contexto
 *    de 'withTenantQuery'. Nao ha mais como esquecer o filtro numa consulta
 *    nova -- o banco recusa.
 * ============================================================================
 */

export interface FiltroTransacoes {
  tipo?: string;
  banco?: string;
  busca?: string;
  categoria?: string;
  somenteOperacionais: boolean;
  dataInicio?: string;
  dataFim?: string;
  limit: number;
  offset: number;
}

export interface FiltroContasAPagar {
  status?: string;
  tipoEntidade?: string;
  macroCategoria?: string;
  busca?: string;
}

/**
 * Categoria dos rendimentos financeiros.
 *
 * [ERRO ANTERIOR]: o parser gravava 'RECEITA_FINANCEIRA_JUROS' e os tres
 * consumidores consultavam 'RECEITA_FINANCEIRA_RENDIMENTOS'. Nenhuma linha
 * batia, e os rendimentos de CDI apareciam como R$ 0,00 no sistema inteiro.
 * O nome canonico e o do enum tipado em ofx.types.ts.
 */
export const CATEGORIA_RENDIMENTOS = 'RECEITA_FINANCEIRA_JUROS';
export const CATEGORIA_SWEEP = 'APLICACAO_RESGATE_AUTOMATICO';
export const CATEGORIA_TARIFAS = 'TARIFAS_E_DESPESAS_BANCARIAS';

export class FinanceiroRepository {
  // -------------------------------------------------------------------------
  // EXTRATO
  // -------------------------------------------------------------------------
  async listarTransacoes(ctx: TenantContext, f: FiltroTransacoes) {
    return withTenantQuery(ctx, async (client) => {
      // O filtro de saldo do dia fica no literal da consulta, nao aqui:
      // condicao invisivel no SQL e condicao que a proxima pessoa nao ve.
      const where: string[] = [];
      const params: any[] = [];

      if (f.somenteOperacionais) {
        params.push(CATEGORIA_SWEEP);
        where.push(`t.categoria_financeira <> $${params.length}`);
      }
      if (f.categoria) {
        params.push(f.categoria);
        where.push(`t.categoria_financeira = $${params.length}`);
      }
      if (f.tipo === 'ENTRADAS') where.push('t.valor > 0');
      else if (f.tipo === 'SAIDAS') where.push('t.valor < 0');

      if (f.banco) {
        params.push(`%${f.banco}%`);
        where.push(`c.banco_nome ILIKE $${params.length}`);
      }
      if (f.busca) {
        params.push(`%${f.busca}%`);
        const i = params.length;
        where.push(`(t.memo ILIKE $${i} OR t.nome_contraparte ILIKE $${i} OR t.documento_contraparte ILIKE $${i})`);
      }
      if (f.dataInicio) {
        params.push(f.dataInicio);
        where.push(`t.data_lancamento >= $${params.length}`);
      }
      if (f.dataFim) {
        params.push(f.dataFim);
        where.push(`t.data_lancamento <= $${params.length}`);
      }

      const clausula = where.join(' AND ');

      // Uma unica varredura devolve a pagina e o total, em vez de duas consultas
      // com a mesma clausula WHERE duplicada a mao (fonte classica de divergencia
      // entre a lista e o contador).
      params.push(f.limit, f.offset);
      const sql = `
        SELECT t.id, t.data_lancamento, t.tipo_operacao, t.valor, t.memo,
               t.documento_contraparte, t.nome_contraparte, t.categoria_financeira,
               t.status_conciliacao, t.empresa_id,
               c.banco_nome, c.conta_numero, c.agencia,
               COUNT(*) OVER () AS total_geral,
               SUM(CASE WHEN t.valor > 0 THEN t.valor ELSE 0 END) OVER () AS soma_entradas,
               SUM(CASE WHEN t.valor < 0 THEN ABS(t.valor) ELSE 0 END) OVER () AS soma_saidas
          FROM transacoes_bancarias t
          JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
         WHERE t.is_saldo_informativo = FALSE
           AND ${clausula}
         ORDER BY t.data_lancamento DESC, t.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length};
      `;

      const res = await client.query(sql, params);
      const total = res.rows.length > 0 ? Number(res.rows[0].total_geral) : 0;
      const somaEntradas = res.rows.length > 0 ? Number(res.rows[0].soma_entradas) : 0;
      const somaSaidas = res.rows.length > 0 ? Number(res.rows[0].soma_saidas) : 0;

      const linhas = res.rows.map(({ total_geral, soma_entradas, soma_saidas, ...linha }) => linha);
      return { linhas, total, somaEntradas, somaSaidas };
    });
  }

  // -------------------------------------------------------------------------
  // RESUMO DE CAIXA
  // -------------------------------------------------------------------------
  async resumoCaixa(ctx: TenantContext, p: Periodo) {
    return withTenantQuery(ctx, async (client) => {
      const params = [p.inicio, p.fim, CATEGORIA_SWEEP, CATEGORIA_RENDIMENTOS];

      const fluxo = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN valor > 0 AND categoria_financeira NOT IN ($3, $4)
                             THEN valor ELSE 0 END), 0) AS entradas_operacionais,
           COALESCE(SUM(CASE WHEN valor < 0 AND categoria_financeira <> $3
                             THEN ABS(valor) ELSE 0 END), 0) AS saidas_operacionais,
           COALESCE(SUM(CASE WHEN categoria_financeira = $4
                             THEN valor ELSE 0 END), 0) AS rendimentos_financeiros,
           COALESCE(SUM(CASE WHEN valor > 0 AND categoria_financeira = $3
                             THEN valor ELSE 0 END), 0) AS resgates_automaticos,
           COALESCE(SUM(CASE WHEN valor < 0 AND categoria_financeira = $3
                             THEN ABS(valor) ELSE 0 END), 0) AS aplicacoes_automaticas,
           COUNT(*) AS total_lancamentos
         FROM transacoes_bancarias
        WHERE is_saldo_informativo = FALSE
          AND data_lancamento BETWEEN $1 AND $2;`,
        params
      );

      // Saldo em caixa e o saldo oficial informado pelo banco (LEDGERBAL), nao
      // a soma das transacoes importadas -- que so cobre o periodo carregado.
      const contas = await client.query(
        `SELECT id, banco_nome, agencia, conta_numero, saldo_atual, data_ultimo_saldo
           FROM contas_bancarias
          WHERE ativo = TRUE
          ORDER BY banco_nome, conta_numero;`
      );

      /**
       * [ERRO ANTERIOR]: 'a_receber' somava TODAS as notas fiscais emitidas,
       * inclusive as ja liquidadas. O painel mostrava como pendente dinheiro
       * que ja tinha entrado.
       *
       * [CORRECAO]: sai das duplicatas (titulos) ainda em aberto.
       */
      const receber = await client.query(
        `SELECT COALESCE(SUM(d.valor_duplicata), 0) AS total,
                COUNT(*) AS quantidade,
                COALESCE(SUM(CASE WHEN d.data_vencimento < CURRENT_DATE
                                  THEN d.valor_duplicata ELSE 0 END), 0) AS total_vencido
           FROM notas_fiscais_duplicatas d
           JOIN notas_fiscais n ON n.id = d.nota_fiscal_id
          WHERE n.direcao = 'EMITIDA'
            AND d.status_cobranca <> 'PAGO'
            AND d.data_pagamento IS NULL;`
      );

      const pagar = await client.query(
        `SELECT COALESCE(SUM(valor), 0) AS total,
                COUNT(*) AS quantidade,
                COALESCE(SUM(CASE WHEN data_vencimento < CURRENT_DATE
                                  THEN valor ELSE 0 END), 0) AS total_vencido
           FROM obrigacoes_recorrentes
          WHERE status_pagamento IN ('A_PAGAR', 'PROGRAMADO');`
      );

      return {
        fluxo: fluxo.rows[0],
        contas: contas.rows,
        receber: receber.rows[0],
        pagar: pagar.rows[0]
      };
    });
  }

  // -------------------------------------------------------------------------
  // CONTAS A PAGAR
  // -------------------------------------------------------------------------
  /**
   * [ERRO ANTERIOR]: este endpoint lia de
   * 'database/local_mirror/obrigacoes_recorrentes.json'. Nao existia tabela.
   * Os 204 titulos e os cards de R$ 99.962,04 vinham de um arquivo em disco.
   *
   * [CORRECAO]: le da view vw_obrigacoes_recorrentes, que ainda calcula
   * 'status_vencimento' contra a data de hoje -- no JSON era um valor congelado
   * que nunca envelhecia.
   */
  async listarContasAPagar(ctx: TenantContext, f: FiltroContasAPagar) {
    return withTenantQuery(ctx, async (client) => {
      const where: string[] = ['1 = 1'];
      const params: any[] = [];

      if (f.status && !['all', 'TODAS'].includes(f.status)) {
        if (f.status === 'EM_ATRASO') {
          where.push(`(status_pagamento IN ('A_PAGAR','PROGRAMADO') AND data_vencimento < CURRENT_DATE)`);
        } else if (f.status === 'A_VENCER') {
          where.push(`(status_pagamento IN ('A_PAGAR','PROGRAMADO') AND data_vencimento >= CURRENT_DATE)`);
        } else {
          params.push(f.status);
          where.push(`status_pagamento = $${params.length}::status_pagamento_obrigacao`);
        }
      }
      if (f.tipoEntidade && !['all', 'TODAS'].includes(f.tipoEntidade)) {
        params.push(f.tipoEntidade);
        where.push(`tipo_entidade = $${params.length}::tipo_entidade_parceiro`);
      }
      if (f.macroCategoria && !['all', 'TODAS'].includes(f.macroCategoria)) {
        params.push(f.macroCategoria);
        where.push(`macro_categoria = $${params.length}::macro_categoria_conta`);
      }
      if (f.busca) {
        params.push(`%${f.busca}%`);
        const i = params.length;
        where.push(`(favorecido_nome ILIKE $${i} OR descricao ILIKE $${i} OR categoria_detalhada ILIKE $${i})`);
      }

      const clausula = where.join(' AND ');

      const dados = await client.query(
        `SELECT * FROM vw_obrigacoes_recorrentes
          WHERE ${clausula}
          ORDER BY data_vencimento DESC, valor DESC;`,
        params
      );

      // KPIs agregados no banco, sobre o MESMO recorte filtrado.
      const kpis = await client.query(
        `SELECT
           COUNT(*)                                                              AS total_registros,
           COALESCE(SUM(valor), 0)                                               AS total_geral,
           COALESCE(SUM(valor) FILTER (WHERE status_pagamento = 'PAGO'), 0)      AS total_pago,
           COALESCE(SUM(valor) FILTER (WHERE status_pagamento IN ('A_PAGAR','PROGRAMADO')), 0) AS total_a_pagar,
           COALESCE(SUM(valor) FILTER (WHERE status_vencimento = 'EM_ATRASO'), 0) AS total_em_atraso,
           COALESCE(SUM(valor) FILTER (WHERE macro_categoria = 'RECURSOS_HUMANOS'
                                          OR tipo_entidade = 'COLABORADOR_PJ'), 0) AS total_pessoal,
           COALESCE(SUM(valor) FILTER (WHERE macro_categoria = 'TRIBUTOS'
                                          OR tipo_entidade = 'GOVERNO_TRIBUTO'), 0) AS total_tributos,
           COALESCE(SUM(valor) FILTER (WHERE macro_categoria = 'PRODUCAO_INSUMOS'
                                          OR tipo_entidade = 'FORNECEDOR_INSUMO'), 0) AS total_insumos,
           COALESCE(SUM(valor) FILTER (WHERE categoria_detalhada ILIKE '%PRONAMPE%'), 0) AS total_pronampe
         FROM vw_obrigacoes_recorrentes
        WHERE ${clausula};`,
        params
      );

      return { linhas: dados.rows, kpis: kpis.rows[0] };
    });
  }

  // -------------------------------------------------------------------------
  // PROJECAO FUTURA
  // -------------------------------------------------------------------------
  /**
   * [ERRO ANTERIOR]: a projecao tinha uma lista de custos fixos escrita no
   * codigo e receitas inventadas para novembro (R$ 150.000) e dezembro
   * (R$ 160.000). Numeros que nao vinham de lugar nenhum, apresentados como
   * previsao auditada.
   *
   * [CORRECAO]: saidas saem das obrigacoes recorrentes reais; entradas, das
   * duplicatas em aberto. Mes sem dado fica com zero e e sinalizado -- nunca
   * preenchido com um numero plausivel.
   */
  async basesProjecao(ctx: TenantContext, mesesAdiante: number) {
    return withTenantQuery(ctx, async (client) => {
      const recebiveis = await client.query(
        `SELECT to_char(d.data_vencimento, 'YYYY-MM')          AS competencia,
                COALESCE(SUM(d.valor_duplicata), 0)            AS total,
                COUNT(*)                                       AS quantidade
           FROM notas_fiscais_duplicatas d
           JOIN notas_fiscais n ON n.id = d.nota_fiscal_id
          WHERE n.direcao = 'EMITIDA'
            AND d.status_cobranca <> 'PAGO'
            AND d.data_pagamento IS NULL
            AND d.data_vencimento >= CURRENT_DATE
            AND d.data_vencimento < (CURRENT_DATE + ($1 || ' months')::interval)
          GROUP BY 1 ORDER BY 1;`,
        [String(mesesAdiante)]
      );

      const detalheRecebiveis = await client.query(
        `SELECT n.numero_nota, n.destinatario_nome AS cliente, n.destinatario_cnpj_cpf AS cnpj,
                d.numero_duplicata, d.data_vencimento, d.valor_duplicata AS valor,
                d.status_cobranca
           FROM notas_fiscais_duplicatas d
           JOIN notas_fiscais n ON n.id = d.nota_fiscal_id
          WHERE n.direcao = 'EMITIDA'
            AND d.status_cobranca <> 'PAGO'
            AND d.data_pagamento IS NULL
            AND d.data_vencimento >= CURRENT_DATE
          ORDER BY d.data_vencimento
          LIMIT 200;`
      );

      // Custo fixo mensal: media das obrigacoes MENSAIS efetivamente cadastradas.
      const custoFixo = await client.query(
        `SELECT macro_categoria, tipo_entidade,
                COALESCE(SUM(valor), 0) AS valor_mensal,
                COUNT(*)                AS quantidade
           FROM obrigacoes_recorrentes
          WHERE recorrencia = 'MENSAL'
            AND status_pagamento <> 'CANCELADO'
            AND data_vencimento >= (CURRENT_DATE - INTERVAL '2 months')
          GROUP BY 1, 2
          ORDER BY 3 DESC;`
      );

      const obrigacoesFuturas = await client.query(
        `SELECT to_char(data_vencimento, 'YYYY-MM') AS competencia,
                COALESCE(SUM(valor), 0)             AS total,
                COUNT(*)                            AS quantidade
           FROM obrigacoes_recorrentes
          WHERE status_pagamento IN ('A_PAGAR', 'PROGRAMADO')
            AND data_vencimento >= CURRENT_DATE
            AND data_vencimento < (CURRENT_DATE + ($1 || ' months')::interval)
          GROUP BY 1 ORDER BY 1;`,
        [String(mesesAdiante)]
      );

      const saldo = await client.query(
        `SELECT COALESCE(SUM(saldo_atual), 0) AS saldo_total FROM contas_bancarias WHERE ativo = TRUE;`
      );

      return {
        recebiveisPorMes: recebiveis.rows,
        detalheRecebiveis: detalheRecebiveis.rows,
        custoFixoPorCategoria: custoFixo.rows,
        obrigacoesFuturasPorMes: obrigacoesFuturas.rows,
        saldoAtual: Number(saldo.rows[0].saldo_total)
      };
    });
  }

  // -------------------------------------------------------------------------
  // CATEGORIZACAO
  // -------------------------------------------------------------------------
  /**
   * [ERRO ANTERIOR]: gravava apenas no JSON do local mirror. O worker diario
   * (server.ts) sobrescreve esse arquivo a partir do Postgres, entao toda
   * categorizacao feita pelo usuario era perdida em ate 24 horas -- sem aviso.
   *
   * [CORRECAO]: grava no Postgres. O mirror volta a ser o que sempre deveria
   * ter sido: um cache de leitura, nunca um destino de escrita.
   */
  async categorizarTransacao(
    ctx: TenantContext,
    dados: { transacaoId: string; categoria: string; clienteId?: string; nomeContraparte?: string }
  ) {
    return withTenantTransaction(ctx, async (client: PoolClient) => {
      const res = await client.query(
        `UPDATE transacoes_bancarias
            SET categoria_financeira = $2,
                nome_contraparte     = COALESCE($3, nome_contraparte),
                cliente_id           = COALESCE($4, cliente_id),
                status_conciliacao   = 'CONCILIADO_MANUAL',
                conciliado_em        = NOW(),
                conciliado_por       = $5,
                updated_at           = NOW()
          WHERE id = $1
            AND is_saldo_informativo = FALSE
        RETURNING id, categoria_financeira, nome_contraparte, cliente_id, status_conciliacao;`,
        [
          dados.transacaoId,
          dados.categoria,
          dados.nomeContraparte || null,
          dados.clienteId || null,
          ctx.userId || 'sistema'
        ]
      );
      return res.rows[0] || null;
    });
  }

  /** Categorias disponiveis, para o front montar o seletor sem lista fixa. */
  async listarCategorias(ctx: TenantContext) {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        // Saldo do dia tem categoria 'INFORMATIVO_SALDO' e sao 564 linhas em
        // producao. Sem o filtro, a lista oferece uma categoria que nao e
        // categoria e infla a contagem em 43%.
        `SELECT categoria_financeira, COUNT(*) AS quantidade
           FROM transacoes_bancarias
          WHERE categoria_financeira IS NOT NULL
            AND is_saldo_informativo = FALSE
          GROUP BY 1 ORDER BY 2 DESC;`
      );
      return res.rows;
    });
  }
}
