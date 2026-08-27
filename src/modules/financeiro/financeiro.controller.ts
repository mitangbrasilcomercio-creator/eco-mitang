import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pgPool } from '../../core/database/supabase-pool';
import { memoryCache } from '../../core/cache/memory-cache';

export class FinanceiroController {
  listarTransacoes = async (req: Request, res: Response): Promise<void> => {
    const empresaId = req.headers['x-empresa-id'] as string;
    const { tipo, banco, busca, data_inicio, data_fim, limit = 50, offset = 0 } = req.query;
    const cacheKey = `ofx_transacoes_${empresaId || 'all'}_${tipo || 'todos'}_${banco || 'todos'}_${busca || ''}_${data_inicio || ''}_${data_fim || ''}_${limit}_${offset}`;
    
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();
      let query = `
        SELECT 
          t.id, t.data_lancamento, t.tipo_operacao, t.valor, t.memo,
          t.documento_contraparte, t.nome_contraparte, t.status_conciliacao,
          c.banco_nome, c.conta_numero, c.agencia
        FROM transacoes_bancarias t
        JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
        WHERE t.is_saldo_informativo = FALSE
      `;
      const params: any[] = [];

      if (empresaId && empresaId !== 'all') {
        params.push(empresaId);
        query += ` AND t.empresa_id = $${params.length}`;
      }

      if (tipo === 'ENTRADAS') {
        query += ` AND t.valor > 0`;
      } else if (tipo === 'SAIDAS') {
        query += ` AND t.valor < 0`;
      }

      if (banco) {
        params.push(`%${banco}%`);
        query += ` AND c.banco_nome ILIKE $${params.length}`;
      }

      if (busca) {
        params.push(`%${busca}%`);
        query += ` AND (t.memo ILIKE $${params.length} OR t.nome_contraparte ILIKE $${params.length} OR t.documento_contraparte ILIKE $${params.length})`;
      }

      if (data_inicio) {
        params.push(data_inicio);
        query += ` AND t.data_lancamento >= $${params.length}`;
      }

      if (data_fim) {
        params.push(data_fim);
        query += ` AND t.data_lancamento <= $${params.length}`;
      }

      query += ` ORDER BY t.data_lancamento DESC, t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      
      let countQuery = `SELECT count(*) as total FROM transacoes_bancarias WHERE is_saldo_informativo = FALSE`;
      if (empresaId && empresaId !== 'all') {
        countQuery += ` AND empresa_id = '${empresaId}'`;
      }
      const countRes = await client.query(countQuery);

      const payload = {
        success: true,
        data: result.rows,
        total: parseInt(countRes.rows[0].total)
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO LISTAR TRANSAÇÕES]:', err.message);
      const stale = memoryCache.getStale(cacheKey);
      if (stale) {
        res.status(200).json(stale);
        return;
      }
      res.status(500).json({ success: false, error: 'Erro ao consultar transações bancárias' });
    } finally {
      if (client) client.release();
    }
  };

  getResumoCaixa = async (req: Request, res: Response): Promise<void> => {
    const empresaId = req.headers['x-empresa-id'] as string;
    const cacheKey = `resumo_caixa_${empresaId || 'all'}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();
      const filterTenant = (empresaId && empresaId !== 'all') ? `AND empresa_id = '${empresaId}'` : '';

      // 1. Saldo Real Consolidado nos Bancos (OFX)
      const ofxSaldos = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END), 0) as total_entradas,
          COALESCE(SUM(CASE WHEN valor < 0 THEN ABS(valor) ELSE 0 END), 0) as total_saidas,
          COALESCE(SUM(valor), 0) as saldo_bancario_liquido
        FROM transacoes_bancarias
        WHERE is_saldo_informativo = FALSE ${filterTenant};
      `);
      const bData = ofxSaldos.rows[0];

      // 2. Contas a Receber (Vendas Emitidas - NF-e e NFS-e)
      const receberRes = await client.query(`
        SELECT 
          COALESCE(SUM(valor_total), 0) as total_a_receber,
          COUNT(*) as qtd_titulos_receber
        FROM notas_fiscais
        WHERE direcao = 'EMITIDA' ${filterTenant};
      `);
      const rData = receberRes.rows[0];

      // 3. Contas a Pagar (Compras de Insumos e Fornecedores - NF-e Recebidas)
      const pagarRes = await client.query(`
        SELECT 
          COALESCE(SUM(valor_total), 0) as total_a_pagar,
          COUNT(*) as qtd_titulos_pagar
        FROM notas_fiscais
        WHERE direcao = 'RECEBIDA' ${filterTenant};
      `);
      const pData = pagarRes.rows[0];

      const saldoBancario = parseFloat(bData.saldo_bancario_liquido);
      const aReceber = parseFloat(rData.total_a_receber);
      const aPagar = parseFloat(pData.total_a_pagar);
      const saldoProjetado = saldoBancario + aReceber - aPagar;

      // 4. Saldo por Instituição Financeira
      const bancosRes = await client.query(`
        SELECT 
          c.banco_nome,
          c.agencia,
          c.conta_numero,
          COALESCE(SUM(t.valor), 0) as saldo_conta,
          COUNT(t.id) as total_movimentacoes
        FROM contas_bancarias c
        LEFT JOIN transacoes_bancarias t ON t.conta_bancaria_id = c.id AND t.is_saldo_informativo = FALSE
        WHERE 1=1 ${filterTenant.replace(/empresa_id/g, 'c.empresa_id')}
        GROUP BY c.id, c.banco_nome, c.agencia, c.conta_numero;
      `);

      const payload = {
        success: true,
        data: {
          saldo_bancario_atual: saldoBancario,
          total_entradas: parseFloat(bData.total_entradas),
          total_saidas: parseFloat(bData.total_saidas),
          a_receber: aReceber,
          a_pagar: aPagar,
          saldo_projetado: saldoProjetado,
          qtd_a_receber: parseInt(rData.qtd_titulos_receber),
          qtd_a_pagar: parseInt(pData.qtd_titulos_pagar),
          saldos_por_banco: bancosRes.rows
        }
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO RESUMO CAIXA]:', err.message);
      const stale = memoryCache.getStale(cacheKey);
      if (stale) {
        res.status(200).json(stale);
        return;
      }
      res.status(500).json({ success: false, error: 'Erro ao calcular resumo do fluxo de caixa' });
    } finally {
      if (client) client.release();
    }
  };
}
