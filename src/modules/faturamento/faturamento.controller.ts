import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pgPool } from '../../core/database/supabase-pool';
import { memoryCache } from '../../core/cache/memory-cache';
import { localMirror } from '../../core/database/local-mirror.service';

export class FaturamentoController {
  listarNotas = async (req: Request, res: Response): Promise<void> => {
    const { tipo, direcao, busca, limit = 50, offset = 0 } = req.query;
    const cacheKey = `notas_fiscais_${tipo || 'todos'}_${direcao || 'todas'}_${busca || ''}_${limit}_${offset}`;

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
          id, chave_acesso, numero_nota, serie, tipo_documento, direcao,
          emitente_nome, emitente_cnpj_cpf, destinatario_nome, destinatario_cnpj_cpf,
          data_emissao, valor_total, status_processamento, created_at
        FROM notas_fiscais
        WHERE 1=1
      `;
      const params: any[] = [];

      if (tipo) {
        params.push(tipo);
        query += ` AND tipo_documento = $${params.length}`;
      }

      if (direcao) {
        params.push(direcao);
        query += ` AND direcao = $${params.length}`;
      }

      if (busca) {
        params.push(`%${busca}%`);
        query += ` AND (emitente_nome ILIKE $${params.length} OR destinatario_nome ILIKE $${params.length} OR numero_nota ILIKE $${params.length} OR chave_acesso ILIKE $${params.length})`;
      }

      query += ` ORDER BY data_emissao DESC NULLS LAST, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      const countRes = await client.query(`SELECT count(*) as total FROM notas_fiscais;`);

      const payload = {
        success: true,
        data: result.rows,
        total: parseInt(countRes.rows[0].total)
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO LISTAR NOTAS]:', err.message);
      const stale = memoryCache.getStale(cacheKey);
      if (stale) {
        res.status(200).json(stale);
        return;
      }
      const all = localMirror.getMirror<any[]>('notas_fiscais') || [];
      const numLimit = Number(limit);
      const numOffset = Number(offset);
      const items = all.slice(numOffset, numOffset + numLimit);
      res.status(200).json({
        success: true,
        data: items,
        total: all.length
      });
    } finally {
      if (client) client.release();
    }
  };
}
