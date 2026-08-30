import { Response } from 'express';
import { z } from 'zod';
import { withTenantQuery } from '../../core/database/supabase-pool';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { memoryCache } from '../../core/cache/memory-cache';
import { localMirror } from '../../core/database/local-mirror.service';

/**
 * ============================================================================
 * ORCAMENTOS HISTORICOS
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * 1. Nenhum filtro por tenant: 'FROM orcamentos_historico WHERE 1=1' devolvia
 *    os 220 orcamentos das duas empresas para qualquer chamador.
 * 2. O contador total ignorava os filtros aplicados
 *    ('SELECT COUNT(*) FROM orcamentos_historico;' seco), entao a paginacao
 *    mostrava "220 resultados" mesmo com uma busca que retornava 3.
 * 3. Efeito colateral escondido numa leitura: um GET com limit >= 200
 *    sobrescrevia o mirror local em disco.
 *
 * [CORRECOES]:
 * Isolamento pela RLS, contagem sobre o mesmo recorte filtrado, e leitura sem
 * efeito colateral -- a sincronizacao do mirror pertence ao worker.
 * ============================================================================
 */

const QueryListar = z.object({
  status: z.string().max(50).optional(),
  busca: z.string().max(200).optional(),
  vendido_por: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export class OrcamentosController {
  listar = async (req: TenantRequest, res: Response): Promise<void> => {
    const v = QueryListar.safeParse(req.query);
    if (!v.success) {
      res.status(422).json({
        success: false,
        error: 'Parametros invalidos.',
        code: 'VALIDATION_ERROR',
        details: v.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }))
      });
      return;
    }

    const ctx = req.tenant!;
    const q = v.data;
    const chave = `orc:lista:${ctx.empresaIds!.join('+')}:${JSON.stringify(q)}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const payload = await withTenantQuery(ctx, async (client) => {
        const where: string[] = ['1 = 1'];
        const params: any[] = [];

        if (q.status) {
          params.push(q.status);
          where.push(`status_aprovacao = $${params.length}`);
        }
        if (q.vendido_por) {
          params.push(q.vendido_por);
          where.push(`vendido_por ILIKE $${params.length}`);
        }
        if (q.busca) {
          params.push(`%${q.busca}%`);
          const i = params.length;
          where.push(`(cliente_nome ILIKE $${i} OR numero_orcamento ILIKE $${i} OR cliente_cnpj_cpf ILIKE $${i})`);
        }

        params.push(q.limit, q.offset);
        const res_ = await client.query(
          `SELECT id, empresa_id, numero_orcamento, vendido_por, data_emissao,
                  mes_emissao, ano_emissao, cliente_nome, cliente_cnpj_cpf, cliente_contato,
                  status_aprovacao, situacao_geral, valor_total, itens_json,
                  jsonb_array_length(itens_json) AS total_itens, created_at,
                  COUNT(*) OVER () AS total_geral
             FROM orcamentos_historico
            WHERE ${where.join(' AND ')}
            ORDER BY data_emissao DESC NULLS LAST, created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length};`,
          params
        );

        // Contagem vinda da MESMA consulta -- impossivel divergir da lista.
        const total = res_.rows.length > 0 ? Number(res_.rows[0].total_geral) : 0;
        const data = res_.rows.map(({ total_geral, ...linha }) => linha);
        return { success: true, data, total };
      });

      memoryCache.set(chave, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.warn('[ORCAMENTOS]', err.message);
      const stale = memoryCache.getStale<any>(chave);
      if (stale) {
        res.status(200).json({ ...stale, origem: 'CACHE_EXPIRADO' });
        return;
      }

      const todos = (localMirror.getMirror<any[]>('orcamentos_historico') || []).filter((o) =>
        ctx.empresaIds!.includes(o.empresa_id)
      );
      const filtrados = q.busca
        ? todos.filter((o) => {
            const b = q.busca!.toLowerCase();
            return (
              (o.cliente_nome || '').toLowerCase().includes(b) ||
              (o.numero_orcamento || '').toLowerCase().includes(b)
            );
          })
        : todos;

      res.status(200).json({
        success: true,
        data: filtrados.slice(q.offset, q.offset + q.limit),
        total: filtrados.length,
        origem: 'LOCAL_MIRROR',
        aviso: 'Dados servidos do espelho local.'
      });
    }
  };

  obterPorNumero = async (req: TenantRequest, res: Response): Promise<void> => {
    const numero = String(req.params.numero || '').trim();
    if (!numero || numero.length > 30) {
      res.status(400).json({ success: false, error: 'Numero de orcamento invalido.' });
      return;
    }

    try {
      const linha = await withTenantQuery(req.tenant!, async (client) => {
        const r = await client.query(
          `SELECT * FROM orcamentos_historico WHERE numero_orcamento = $1 LIMIT 1;`,
          [numero]
        );
        return r.rows[0] || null;
      });

      if (!linha) {
        res.status(404).json({
          success: false,
          error: 'Orcamento nao encontrado no CNPJ selecionado.',
          code: 'ORCAMENTO_NAO_ENCONTRADO'
        });
        return;
      }
      res.status(200).json({ success: true, data: linha });
    } catch (err: any) {
      console.error('[ORCAMENTO DETALHE]', err.message);
      res.status(503).json({ success: false, error: 'Erro ao buscar o orcamento.' });
    }
  };
}
