import { withTenantQuery, TenantContext } from '../../core/database/supabase-pool';
import { Periodo } from '../../core/utils/periodo';
import { CATEGORIA_TARIFAS } from '../financeiro/financeiro.repository';

/**
 * ============================================================================
 * REPOSITORIO DA DRE
 * ============================================================================
 *
 * [ERROS ANTERIORES]:
 * 1. 'AND empresa_id = ' + empresaId concatenado no SQL (injecao).
 * 2. Nenhum filtro de periodo: a DRE do "ano" somava a base inteira, de
 *    qualquer exercicio.
 * 3. As despesas bancarias saiam de
 *        memo ILIKE '%tar%' OR memo ILIKE '%taxa%' OR memo ILIKE '%anu%'
 *    -- '%tar%' casa com TARGET, ALTAIR, MONTARIA, qualquer palavra que
 *    contenha "tar". Despesa operacional entrando na conta errada por
 *    coincidencia de substring.
 *
 * [CORRECOES]:
 * Tudo parametrizado, periodo obrigatorio, e as tarifas saem da categoria
 * financeira ja atribuida na ingestao -- um fato classificado, nao um palpite
 * sobre o texto do memo.
 * ============================================================================
 */
export class DreRepository {
  async apurar(ctx: TenantContext, p: Periodo) {
    return withTenantQuery(ctx, async (client) => {
      const receitas = await client.query(
        `SELECT
           COALESCE(SUM(valor_produtos_servicos) FILTER (WHERE tipo_documento = 'NFE_PRODUTO'), 0)  AS vendas_produtos,
           COALESCE(SUM(valor_produtos_servicos) FILTER (WHERE tipo_documento = 'NFSE_SERVICO'), 0) AS servicos_prestados,
           COALESCE(SUM(valor_impostos_total), 0)                                                   AS total_tributos,
           COALESCE(SUM(valor_descontos), 0)                                                        AS total_descontos,
           COALESCE(SUM(valor_total), 0)                                                            AS receita_bruta_total,
           COUNT(*)                                                                                 AS qtd_notas,
           -- Quantas notas realmente trazem imposto destacado. Se for zero,
           -- nao ha base para calcular deducoes -- e isso precisa aparecer.
           COUNT(*) FILTER (WHERE COALESCE(valor_impostos_total, 0) > 0)                            AS qtd_notas_com_imposto
         FROM notas_fiscais
        WHERE direcao = 'EMITIDA'
          AND data_emissao::date BETWEEN $1 AND $2;`,
        [p.inicio, p.fim]
      );

      /**
       * [ERRO ANTERIOR]: este resultado era rotulado 'cmv_insumos' e tratado
       * como Custo da Mercadoria Vendida. E COMPRA do periodo.
       * CMV = estoque inicial + compras - estoque final, e exige controle de
       * estoque, que o sistema ainda nao tem.
       */
      const compras = await client.query(
        `SELECT COALESCE(SUM(valor_produtos_servicos), 0) AS compras_insumos_periodo,
                COUNT(*)                                  AS qtd_notas
           FROM notas_fiscais
          WHERE direcao = 'RECEBIDA'
            AND tipo_documento = 'NFE_PRODUTO'
            AND data_emissao::date BETWEEN $1 AND $2;`,
        [p.inicio, p.fim]
      );

      const servicosTomados = await client.query(
        `SELECT COALESCE(SUM(valor_total), 0) AS despesas_servicos_pj,
                COUNT(*)                      AS qtd_notas
           FROM notas_fiscais
          WHERE direcao = 'RECEBIDA'
            AND tipo_documento = 'NFSE_SERVICO'
            AND data_emissao::date BETWEEN $1 AND $2;`,
        [p.inicio, p.fim]
      );

      // Tarifas pela categoria atribuida na ingestao, nao por ILIKE no memo.
      const tarifas = await client.query(
        `SELECT COALESCE(SUM(ABS(valor)), 0) AS despesas_bancarias,
                COUNT(*)                     AS qtd_lancamentos
           FROM transacoes_bancarias
          WHERE categoria_financeira = $3
            AND valor < 0
            AND is_saldo_informativo = FALSE
            AND data_lancamento BETWEEN $1 AND $2;`,
        [p.inicio, p.fim, CATEGORIA_TARIFAS]
      );

      // Despesas operacionais que passaram pelo banco mas nao tem nota fiscal
      // (folha PJ paga via PIX, tributos, utilidades). Sem isso o EBITDA sai
      // alto demais.
      const despesasBancarias = await client.query(
        `SELECT categoria_financeira,
                COALESCE(SUM(ABS(valor)), 0) AS total,
                COUNT(*)                     AS quantidade
           FROM transacoes_bancarias
          WHERE valor < 0
            AND is_saldo_informativo = FALSE
            AND categoria_financeira IN ('IMPOSTOS_E_TRIBUTOS', 'FORNECEDORES_OPERACIONAIS',
                                         'OUTRAS_DESPESAS_OPERACIONAIS', 'REPASSES_SOCIOS_DIRETORIA')
            AND data_lancamento BETWEEN $1 AND $2
          GROUP BY 1;`,
        [p.inicio, p.fim]
      );

      /**
       * Mede o risco de dupla contagem entre pagamento a fornecedor e NF-e
       * recebida: mesmo CNPJ da contraparte, mesmo valor, e emissao dentro de
       * uma janela plausivel de pagamento.
       *
       * Existe porque 'FORNECEDORES_OPERACIONAIS' passou a entrar na despesa
       * (antes era descartado). Em vez de escolher entre "some do DRE" e
       * "conta duas vezes", o payload expoe quanto do valor tem nota
       * correspondente -- e quantos lancamentos nem tem CNPJ para parear.
       * A solucao definitiva e a conciliacao documento x extrato.
       */
      const duplicidade = await client.query(
        `SELECT
           COALESCE(SUM(ABS(t.valor)) FILTER (WHERE nf.existe), 0) AS valor_pareado,
           COUNT(*) FILTER (WHERE nf.existe)                       AS qtd_pareada,
           COUNT(*) FILTER (WHERE t.documento_contraparte IS NULL
                               OR t.documento_contraparte = '')    AS qtd_sem_documento
         FROM transacoes_bancarias t
         CROSS JOIN LATERAL (
           SELECT EXISTS (
             SELECT 1 FROM notas_fiscais n
              WHERE n.direcao = 'RECEBIDA'
                AND regexp_replace(COALESCE(n.emitente_cnpj_cpf, ''), '[^0-9]', '', 'g')
                    = regexp_replace(COALESCE(t.documento_contraparte, ''), '[^0-9]', '', 'g')
                AND regexp_replace(COALESCE(t.documento_contraparte, ''), '[^0-9]', '', 'g') <> ''
                AND ABS(n.valor_total - ABS(t.valor)) < 0.02
                AND n.data_emissao::date BETWEEN t.data_lancamento - 45 AND t.data_lancamento + 15
           ) AS existe
         ) nf
        WHERE t.categoria_financeira = 'FORNECEDORES_OPERACIONAIS'
          AND t.valor < 0
          AND t.is_saldo_informativo = FALSE
          AND t.data_lancamento BETWEEN $1 AND $2;`,
        [p.inicio, p.fim]
      );

      return {
        receitas: receitas.rows[0],
        compras: compras.rows[0],
        duplicidade: duplicidade.rows[0],
        servicosTomados: servicosTomados.rows[0],
        tarifas: tarifas.rows[0],
        despesasPorCategoria: despesasBancarias.rows
      };
    });
  }
}
