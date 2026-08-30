import { Response } from 'express';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { DreRepository } from './dre.repository';
import { memoryCache } from '../../core/cache/memory-cache';
import { resolverPeriodo } from '../../core/utils/periodo';

/**
 * ============================================================================
 * DRE - DEMONSTRACAO DO RESULTADO DO EXERCICIO
 * ============================================================================
 *
 * [ERROS ANTERIORES]:
 * 1. Aliquota inventada: quando as notas nao traziam imposto destacado, o
 *    codigo aplicava
 *        receitaBruta * 0.0865   // "Aliquota media 8.65%"
 *    e apresentava o resultado como deducao apurada. Uma DRE que estima o
 *    proprio imposto e a chuta como se fosse fato.
 * 2. 'const lucroLiquido = ebitda;' com o comentario "Provisao simplificada".
 *    EBITDA e lucro liquido sao coisas diferentes -- o segundo desconta juros,
 *    depreciacao e IR. Chamar um de outro nao e simplificacao, e erro contabil.
 * 3. Despesas bancarias capturadas por 'memo ILIKE %tar%'.
 *
 * [CORRECOES]:
 * Deducao so aparece se houver imposto destacado nas notas; caso contrario vem
 * null com 'base_tributaria_disponivel: false'. EBITDA e lucro liquido sao
 * campos distintos, e o lucro liquido so e calculado quando ha base para isso.
 * ============================================================================
 */
export class DreController {
  constructor(private readonly repo: DreRepository = new DreRepository()) {}

  getDreConsolidada = async (req: TenantRequest, res: Response): Promise<void> => {
    const ctx = req.tenant!;
    const { periodo, ano, data_inicio, data_fim } = req.query;

    // 'ano=2026' continua funcionando (o front usa isso hoje).
    let opcoes: { periodo?: string; dataInicio?: unknown; dataFim?: unknown };
    if (ano && /^\d{4}$/.test(String(ano))) {
      opcoes = { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
    } else {
      opcoes = { periodo: periodo as string, dataInicio: data_inicio, dataFim: data_fim };
    }

    const p = resolverPeriodo(opcoes);
    const chave = `dre:${ctx.empresaIds!.join('+')}:${p.inicio}:${p.fim}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const base = await this.repo.apurar(ctx, p);
      const num = (v: any) => Number(v || 0);

      const receitaBruta = num(base.receitas.receita_bruta_total);
      const tributosDestacados = num(base.receitas.total_tributos);
      const qtdNotas = Number(base.receitas.qtd_notas || 0);
      const qtdComImposto = Number(base.receitas.qtd_notas_com_imposto || 0);

      // A deducao so existe se houver imposto destacado. Nada de aliquota
      // presumida vendida como apuracao.
      const temBaseTributaria = tributosDestacados > 0;
      const deducoes = temBaseTributaria ? tributosDestacados : 0;
      const receitaLiquida = receitaBruta - deducoes;

      const cmv = num(base.cmv.cmv_insumos);
      const lucroBruto = receitaLiquida - cmv;

      const despesasPj = num(base.servicosTomados.despesas_servicos_pj);
      const despesasBancarias = num(base.tarifas.despesas_bancarias);

      const mapaDespesas: Record<string, number> = {};
      for (const d of base.despesasPorCategoria) {
        mapaDespesas[d.categoria_financeira] = num(d.total);
      }
      const tributosPagos = mapaDespesas['IMPOSTOS_E_TRIBUTOS'] || 0;
      const outrasDespesas = mapaDespesas['OUTRAS_DESPESAS_OPERACIONAIS'] || 0;
      const repassesSocios = mapaDespesas['REPASSES_SOCIOS_DIRETORIA'] || 0;

      // Repasses a socios (pro-labore/dividendos) nao entram no EBITDA
      // operacional -- sao distribuicao de resultado, nao custo de operar.
      const despesasOperacionais = despesasPj + despesasBancarias + outrasDespesas;
      const ebitda = lucroBruto - despesasOperacionais;

      /**
       * Lucro liquido = EBITDA - tributos sobre o resultado - despesas
       * financeiras. Depreciacao e amortizacao ainda nao sao registradas pelo
       * sistema (nao ha modulo de ativo imobilizado), entao o valor e marcado
       * como parcial em vez de apresentado como definitivo.
       */
      const lucroLiquido = ebitda - tributosPagos;

      const pct = (parte: number, base_: number): number | null =>
        base_ > 0 ? Number(((parte / base_) * 100).toFixed(1)) : null;

      const payload = {
        success: true,
        data: {
          periodo: { inicio: p.inicio, fim: p.fim, dias: p.dias, rotulo: p.rotulo },
          sem_dados: qtdNotas === 0,
          dre: {
            receita_bruta: {
              total: receitaBruta,
              vendas_produtos: num(base.receitas.vendas_produtos),
              servicos_prestados: num(base.receitas.servicos_prestados),
              qtd_notas: qtdNotas
            },
            deducoes: {
              total: deducoes,
              base_tributaria_disponivel: temBaseTributaria,
              notas_com_imposto_destacado: qtdComImposto,
              notas_sem_imposto_destacado: qtdNotas - qtdComImposto,
              descricao: temBaseTributaria
                ? 'ICMS / PIS / COFINS / ISS destacados nas notas emitidas'
                : 'Nenhuma nota do periodo traz imposto destacado. A deducao nao foi estimada.'
            },
            receita_liquida: receitaLiquida,
            custos_operacionais: {
              cmv_total: cmv,
              qtd_notas_compra: Number(base.cmv.qtd_notas || 0),
              descricao: 'Insumos industriais, celulas de litio e embalagens (NF-e recebidas)'
            },
            lucro_bruto: lucroBruto,
            margem_bruta_pct: pct(lucroBruto, receitaLiquida),
            despesas_operacionais: {
              total: despesasOperacionais,
              servicos_terceiros_pj: despesasPj,
              despesas_bancarias_tarifas: despesasBancarias,
              outras_despesas: outrasDespesas
            },
            ebitda,
            margem_ebitda_pct: pct(ebitda, receitaLiquida),
            resultado_financeiro: {
              tributos_pagos_periodo: tributosPagos,
              repasses_socios: repassesSocios,
              observacao: 'Repasses a socios sao distribuicao de resultado e nao compoem o EBITDA.'
            },
            lucro_liquido: lucroLiquido,
            margem_liquida_pct: pct(lucroLiquido, receitaLiquida),
            // Aviso explicito de que a apuracao ainda nao e completa.
            lucro_liquido_parcial: true,
            lucro_liquido_observacao:
              'Nao inclui depreciacao nem amortizacao: o sistema ainda nao possui modulo de ativo imobilizado.'
          }
        }
      };

      memoryCache.set(chave, payload, 60);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[DRE]', err.message);
      const stale = memoryCache.getStale<any>(chave);
      if (stale) {
        res.status(200).json({ ...stale, origem: 'CACHE_EXPIRADO', aviso: 'Dados podem estar desatualizados.' });
        return;
      }
      res.status(503).json({
        success: false,
        error: 'Nao foi possivel apurar a DRE.',
        code: 'SERVICO_INDISPONIVEL'
      });
    }
  };
}
