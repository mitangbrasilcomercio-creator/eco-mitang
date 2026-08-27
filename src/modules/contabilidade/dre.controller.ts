import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pgPool } from '../../core/database/supabase-pool';
import { memoryCache } from '../../core/cache/memory-cache';

export class DreController {
  getDreConsolidada = async (req: Request, res: Response): Promise<void> => {
    const empresaId = req.headers['x-empresa-id'] as string;
    const { ano = '2026' } = req.query;
    const cacheKey = `dre_consolidada_${empresaId || 'all'}_${ano}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();
      const filterTenant = (empresaId && empresaId !== 'all') ? `AND empresa_id = '${empresaId}'` : '';

      // 1. Receita Operacional Bruta (Notas Fiscais Emitidas)
      const vendasRes = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo_documento = 'NFE_PRODUTO' THEN valor_produtos_servicos ELSE 0 END), 0) as vendas_produtos,
          COALESCE(SUM(CASE WHEN tipo_documento = 'NFSE_SERVICO' THEN valor_produtos_servicos ELSE 0 END), 0) as servicos_prestados,
          COALESCE(SUM(valor_impostos_total), 0) as total_tributos,
          COALESCE(SUM(valor_total), 0) as receita_bruta_total,
          COUNT(*) as qtd_notas_emitidas
        FROM notas_fiscais
        WHERE direcao = 'EMITIDA' ${filterTenant};
      `);
      const v = vendasRes.rows[0];

      // 2. Custos das Mercadorias Vendidas (CMV - Notas de Insumos/Fornecedores Recebidas)
      const cmvRes = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo_documento = 'NFE_PRODUTO' THEN valor_produtos_servicos ELSE 0 END), 0) as cmv_insumos,
          COUNT(*) as qtd_notas_compras
        FROM notas_fiscais
        WHERE direcao = 'RECEBIDA' AND tipo_documento = 'NFE_PRODUTO' ${filterTenant};
      `);
      const c = cmvRes.rows[0];

      // 3. Despesas Operacionais com Terceiros & Colaboradores PJ (NFS-e Recebidas)
      const servicosTomadosRes = await client.query(`
        SELECT 
          COALESCE(SUM(valor_total), 0) as despesas_servicos_pj,
          COUNT(*) as qtd_nfse_tomadas
        FROM notas_fiscais
        WHERE direcao = 'RECEBIDA' AND tipo_documento = 'NFSE_SERVICO' ${filterTenant};
      `);
      const s = servicosTomadosRes.rows[0];

      // 4. Despesas Bancárias e Tarifas apuradas no OFX
      const tarifasRes = await client.query(`
        SELECT 
          COALESCE(SUM(ABS(valor)), 0) as despesas_bancarias_tarifas
        FROM transacoes_bancarias
        WHERE valor < 0 AND (memo ILIKE '%tar%' OR memo ILIKE '%iof%' OR memo ILIKE '%taxa%' OR memo ILIKE '%anu%') ${filterTenant};
      `);
      const t = tarifasRes.rows[0];

      // Cálculo Matemático da DRE
      const receitaBruta = parseFloat(v.receita_bruta_total);
      const impostosSobreVendas = parseFloat(v.total_tributos) > 0 ? parseFloat(v.total_tributos) : (receitaBruta * 0.0865); // Alíquota média 8.65% Simples/Lucro Presumido
      const receitaLiquida = receitaBruta - impostosSobreVendas;
      const cmv = parseFloat(c.cmv_insumos);
      const lucroBruto = receitaLiquida - cmv;
      const margemBrutaPct = receitaLiquida > 0 ? ((lucroBruto / receitaLiquida) * 100).toFixed(1) + '%' : '0%';

      const despesasPj = parseFloat(s.despesas_servicos_pj);
      const despesasBancarias = parseFloat(t.despesas_bancarias_tarifas);
      const totalDespesasOperacionais = despesasPj + despesasBancarias;

      const ebitda = lucroBruto - totalDespesasOperacionais;
      const margemEbitdaPct = receitaLiquida > 0 ? ((ebitda / receitaLiquida) * 100).toFixed(1) + '%' : '0%';
      const lucroLiquido = ebitda; // Provisão simplificada
      const margemLiquidaPct = receitaLiquida > 0 ? ((lucroLiquido / receitaLiquida) * 100).toFixed(1) + '%' : '0%';

      const payload = {
        success: true,
        data: {
          periodo: ano,
          dre: {
            receita_bruta: {
              total: receitaBruta,
              vendas_baterias: parseFloat(v.vendas_produtos),
              servicos_subsea: parseFloat(v.servicos_prestados)
            },
            deducoes: {
              total: impostosSobreVendas,
              descricao: 'ICMS / PIS / COFINS / ISS Faturados'
            },
            receita_liquida: receitaLiquida,
            custos_operacionais: {
              cmv_total: cmv,
              descricao: 'Insumos Industriais, Células de Lítio e Embalagens'
            },
            lucro_bruto: lucroBruto,
            margem_bruta: margemBrutaPct,
            despesas_operacionais: {
              total: totalDespesasOperacionais,
              servicos_terceiros_pj: despesasPj,
              despesas_bancarias_tarifas: despesasBancarias
            },
            ebitda: ebitda,
            margem_ebitda: margemEbitdaPct,
            lucro_liquido: lucroLiquido,
            margem_liquida: margemLiquidaPct
          }
        }
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO DRE CONSOLIDADA]:', err.message);
      const stale = memoryCache.getStale(cacheKey);
      if (stale) {
        res.status(200).json(stale);
        return;
      }
      res.status(500).json({ success: false, error: 'Erro ao processar DRE contábil' });
    } finally {
      if (client) client.release();
    }
  };
}
