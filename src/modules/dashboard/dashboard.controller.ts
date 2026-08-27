import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pgPool } from '../../core/database/supabase-pool';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { memoryCache } from '../../core/cache/memory-cache';

export class DashboardController {
  getMetrics = async (req: TenantRequest, res: Response): Promise<void> => {
    const empresaId = req.empresaId || 'all';
    const cacheKey = `dashboard_metrics_${empresaId}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();

      const isAll = !empresaId || empresaId === 'all';
      const isArandu = empresaId === '0754c882-d528-4d34-8c96-6d9af7e8d322';
      const empresaFiltroOrc = isAll ? '' : (isArandu ? "AND vendido_por = 'Arandu'" : "AND vendido_por != 'Arandu'");
      const empresaFiltroDb = isAll ? '' : `AND empresa_id = '${empresaId}'`;

      // 1. Métricas de Cotações & Faturamento
      const cotacoesRes = await client.query(`
        SELECT 
          COUNT(*) as total_cotacoes,
          COUNT(CASE WHEN status_aprovacao = 'Compra Aprovada' THEN 1 END) as aprovadas,
          COUNT(CASE WHEN status_aprovacao != 'Compra Aprovada' THEN 1 END) as em_negociacao,
          COALESCE(SUM(CASE WHEN status_aprovacao = 'Compra Aprovada' THEN valor_total ELSE 0 END), 0) as faturamento_aprovado,
          COALESCE(SUM(CASE WHEN status_aprovacao != 'Compra Aprovada' THEN valor_total ELSE 0 END), 0) as volume_em_aberto
        FROM orcamentos_historico
        WHERE 1=1 ${empresaFiltroOrc};
      `);
      const cotMetrics = cotacoesRes.rows[0];

      // 2. Métricas de Clientes
      const clientesRes = await client.query(`
        SELECT 
          COUNT(*) as total_clientes,
          COUNT(CASE WHEN bloqueio_fiscal = true THEN 1 END) as bloqueados,
          COUNT(CASE WHEN capital_social > 10000000 THEN 1 END) as clientes_porto_pesado,
          COALESCE(ROUND(AVG(capital_social), 2), 0) as media_capital_social
        FROM clientes
        WHERE 1=1 ${empresaFiltroDb};
      `);
      const cliMetrics = clientesRes.rows[0];

      // 3. Métricas de Baterias no Catálogo (Modelos Únicos de Engenharia)
      const catalogoRes = await client.query(`
        SELECT 
          COUNT(DISTINCT COALESCE(detalhes->>'codigo_sku', nome)) as total_baterias,
          COUNT(DISTINCT CASE WHEN UPPER(detalhes->>'setor') LIKE '%NÁUT%' THEN COALESCE(detalhes->>'codigo_sku', nome) END) as subsea,
          COUNT(DISTINCT CASE WHEN UPPER(detalhes->>'setor') LIKE '%HOSP%' THEN COALESCE(detalhes->>'codigo_sku', nome) END) as hospitalar
        FROM catalogo_universal
        WHERE tipo_item = 'PRODUTO' ${empresaFiltroDb};
      `);
      const catMetrics = catalogoRes.rows[0];

      // 4. Métricas Financeiras & Bancárias (OFX)
      const ofxRes = await client.query(`
        SELECT 
          COUNT(*) as total_transacoes,
          COALESCE(SUM(CASE WHEN valor > 0 AND is_saldo_informativo = false THEN valor ELSE 0 END), 0) as entradas_reais,
          COALESCE(SUM(CASE WHEN valor < 0 AND is_saldo_informativo = false THEN ABS(valor) ELSE 0 END), 0) as saidas_reais
        FROM transacoes_bancarias
        WHERE 1=1 ${empresaFiltroDb};
      `);
      const ofxMetrics = ofxRes.rows[0];

      // 5. Histórico Mensal Cronológico de Vendas
      const mensalRes = await client.query(`
        SELECT 
          ano_emissao as ano,
          mes_emissao as mes,
          COUNT(*) as qtd,
          ROUND(SUM(valor_total), 2) as total
        FROM orcamentos_historico
        WHERE status_aprovacao = 'Compra Aprovada' ${empresaFiltroOrc}
        GROUP BY ano_emissao, mes_emissao
        ORDER BY 
          ano_emissao ASC,
          CASE LOWER(mes_emissao)
            WHEN 'jan' THEN 1 WHEN 'janeiro' THEN 1
            WHEN 'fev' THEN 2 WHEN 'fevereiro' THEN 2
            WHEN 'mar' THEN 3 WHEN 'março' THEN 3 WHEN 'marco' THEN 3
            WHEN 'abr' THEN 4 WHEN 'abril' THEN 4
            WHEN 'mai' THEN 5 WHEN 'maio' THEN 5
            WHEN 'jun' THEN 6 WHEN 'junho' THEN 6
            WHEN 'jul' THEN 7 WHEN 'julho' THEN 7
            WHEN 'ago' THEN 8 WHEN 'agosto' THEN 8
            WHEN 'set' THEN 9 WHEN 'setembro' THEN 9
            WHEN 'out' THEN 10 WHEN 'outubro' THEN 10
            WHEN 'nov' THEN 11 WHEN 'novembro' THEN 11
            WHEN 'dez' THEN 12 WHEN 'dezembro' THEN 12
            ELSE 99
          END ASC;
      `);

      // 6. Últimas Atividades / Orçamentos Recentes
      const recentesRes = await client.query(`
        SELECT numero_orcamento, vendido_por, cliente_nome, valor_total, status_aprovacao, data_emissao
        FROM orcamentos_historico
        WHERE 1=1 ${empresaFiltroOrc}
        ORDER BY created_at DESC
        LIMIT 6;
      `);

      const payload = {
        success: true,
        data: {
          kpis: {
            faturamento_total: parseFloat(cotMetrics.faturamento_aprovado),
            volume_negociacao: parseFloat(cotMetrics.volume_em_aberto),
            total_propostas: parseInt(cotMetrics.total_cotacoes),
            taxa_conversao: cotMetrics.total_cotacoes > 0 
              ? ((parseInt(cotMetrics.aprovadas) / parseInt(cotMetrics.total_cotacoes)) * 100).toFixed(1) + '%' 
              : '0%',
            total_clientes: parseInt(cliMetrics.total_clientes),
            clientes_porto_pesado: parseInt(cliMetrics.clientes_porto_pesado),
            total_baterias: parseInt(catMetrics.total_baterias),
            baterias_subsea: parseInt(catMetrics.subsea),
            entradas_bancarias: parseFloat(ofxMetrics.entradas_reais),
            saidas_bancarias: parseFloat(ofxMetrics.saidas_reais),
            saldo_operacional: parseFloat(ofxMetrics.entradas_reais) - parseFloat(ofxMetrics.saidas_reais)
          },
          grafico_vendas_mensal: mensalRes.rows,
          atividades_recentes: recentesRes.rows
        }
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO DASHBOARD METRICS]:', err.message);
      const stale = memoryCache.getStale(cacheKey);
      if (stale) {
        res.status(200).json(stale);
        return;
      }
      res.status(500).json({ success: false, error: 'Erro ao consolidar métricas do dashboard' });
    } finally {
      if (client) client.release();
    }
  };
}
