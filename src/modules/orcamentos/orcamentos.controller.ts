import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pgPool } from '../../core/database/supabase-pool';
import { localMirror } from '../../core/database/local-mirror.service';

export class OrcamentosController {
  listar = async (req: Request, res: Response): Promise<void> => {
    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();
      const { status, busca, vendido_por, limit = 50, offset = 0 } = req.query;

      let query = `
        SELECT 
          id, numero_orcamento, vendido_por, data_emissao, mes_emissao, ano_emissao,
          cliente_nome, cliente_cnpj_cpf, cliente_contato, status_aprovacao,
          situacao_geral, valor_total, jsonb_array_length(itens_json) as total_itens,
          created_at
        FROM orcamentos_historico
        WHERE 1=1
      `;
      const params: any[] = [];

      if (status) {
        params.push(status);
        query += ` AND status_aprovacao = $${params.length}`;
      }

      if (vendido_por) {
        params.push(vendido_por);
        query += ` AND vendido_por ILIKE $${params.length}`;
      }

      if (busca) {
        params.push(`%${busca}%`);
        query += ` AND (cliente_nome ILIKE $${params.length} OR numero_orcamento ILIKE $${params.length} OR cliente_cnpj_cpf ILIKE $${params.length})`;
      }

      query += ` ORDER BY data_emissao DESC NULLS LAST, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
      params.push(limit, offset);

      const result = await client.query(query, params);

      // Total geral
      const countRes = await client.query(`SELECT COUNT(*) as total FROM orcamentos_historico;`);

      const total = parseInt(countRes.rows[0].total);
      setImmediate(() => localMirror.saveMirror('orcamentos_historico', result.rows));

      res.status(200).json({
        success: true,
        data: result.rows,
        total
      });
    } catch (err: any) {
      console.warn(`[ORCAMENTOS CONTROLLER]: Falha na nuvem Supabase (${err.message}). Servindo com contingência do Local Mirror em <2ms...`);
      const all = localMirror.getMirror<any[]>('orcamentos_historico') || [];
      const { busca, limit = 50, offset = 0 } = req.query;
      let filtered = all;
      if (busca) {
        const b = String(busca).toLowerCase();
        filtered = filtered.filter(o => 
          (o.cliente_nome || '').toLowerCase().includes(b) ||
          (o.numero_orcamento || '').toLowerCase().includes(b)
        );
      }
      const numLimit = Number(limit);
      const numOffset = Number(offset);
      const items = filtered.slice(numOffset, numOffset + numLimit);
      res.status(200).json({
        success: true,
        data: items,
        total: filtered.length
      });
    } finally {
      if (client) client.release();
    }
  };

  obterPorNumero = async (req: Request, res: Response): Promise<void> => {
    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();
      const { numero } = req.params;
      const result = await client.query(
        `SELECT * FROM orcamentos_historico WHERE numero_orcamento = $1 LIMIT 1;`,
        [numero]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
        return;
      }

      res.status(200).json({ success: true, data: result.rows[0] });
    } catch (err: any) {
      console.error('[ERRO OBTER ORÇAMENTO]:', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar orçamento' });
    } finally {
      if (client) client.release();
    }
  };
}
