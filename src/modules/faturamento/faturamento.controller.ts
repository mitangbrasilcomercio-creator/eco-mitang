import { Response } from 'express';
import { z } from 'zod';
import { withTenantQuery } from '../../core/database/supabase-pool';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { memoryCache } from '../../core/cache/memory-cache';
import { localMirror } from '../../core/database/local-mirror.service';

/**
 * ============================================================================
 * NOTAS FISCAIS (NF-e e NFS-e)
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * 1. Sem filtro por tenant: as 172 notas das duas empresas para qualquer um.
 * 2. A chave de cache tambem ignorava o tenant, entao a resposta de um CNPJ
 *    podia ser servida a outro.
 * 3. 'SELECT count(*) FROM notas_fiscais;' sem os filtros da listagem.
 * ============================================================================
 */

const QueryNotas = z.object({
  tipo: z.enum(['NFE_PRODUTO', 'NFSE_SERVICO']).optional(),
  direcao: z.enum(['EMITIDA', 'RECEBIDA']).optional(),
  busca: z.string().max(200).optional(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export class FaturamentoController {
  listarNotas = async (req: TenantRequest, res: Response): Promise<void> => {
    const v = QueryNotas.safeParse(req.query);
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
    const chave = `nf:lista:${ctx.empresaIds!.join('+')}:${JSON.stringify(q)}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const payload = await withTenantQuery(ctx, async (client) => {
        const where: string[] = ['1 = 1'];
        const params: any[] = [];

        if (q.tipo) {
          params.push(q.tipo);
          where.push(`tipo_documento = $${params.length}`);
        }
        if (q.direcao) {
          params.push(q.direcao);
          where.push(`direcao = $${params.length}`);
        }
        if (q.busca) {
          params.push(`%${q.busca}%`);
          const i = params.length;
          where.push(
            `(emitente_nome ILIKE $${i} OR destinatario_nome ILIKE $${i} ` +
            `OR numero_nota ILIKE $${i} OR chave_acesso ILIKE $${i})`
          );
        }
        if (q.data_inicio) {
          params.push(q.data_inicio);
          where.push(`data_emissao::date >= $${params.length}`);
        }
        if (q.data_fim) {
          params.push(q.data_fim);
          where.push(`data_emissao::date <= $${params.length}`);
        }

        params.push(q.limit, q.offset);
        // Nao seleciona conteudo_xml nem dados_completos_json: sao campos de
        // varios KB por nota, inuteis numa listagem.
        const r = await client.query(
          `SELECT id, empresa_id, chave_acesso, numero_nota, serie, tipo_documento, direcao,
                  emitente_nome, emitente_cnpj_cpf, destinatario_nome, destinatario_cnpj_cpf,
                  data_emissao, valor_total, valor_impostos_total, status_processamento, created_at,
                  COUNT(*) OVER ()                                  AS total_geral,
                  SUM(valor_total) OVER ()                          AS soma_valor
             FROM notas_fiscais
            WHERE ${where.join(' AND ')}
            ORDER BY data_emissao DESC NULLS LAST, created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length};`,
          params
        );

        const total = r.rows.length > 0 ? Number(r.rows[0].total_geral) : 0;
        const somaValor = r.rows.length > 0 ? Number(r.rows[0].soma_valor) : 0;
        const data = r.rows.map(({ total_geral, soma_valor, ...linha }) => linha);
        return { success: true, data, total, soma_valor_filtrado: somaValor };
      });

      memoryCache.set(chave, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.warn('[NOTAS FISCAIS]', err.message);
      const stale = memoryCache.getStale<any>(chave);
      if (stale) {
        res.status(200).json({ ...stale, origem: 'CACHE_EXPIRADO' });
        return;
      }

      const todas = (localMirror.getMirror<any[]>('notas_fiscais') || []).filter((n) =>
        ctx.empresaIds!.includes(n.empresa_id)
      );
      res.status(200).json({
        success: true,
        data: todas.slice(q.offset, q.offset + q.limit),
        total: todas.length,
        origem: 'LOCAL_MIRROR',
        aviso: 'Dados servidos do espelho local.'
      });
    }
  };

  /** Detalhe da nota, incluindo itens e duplicatas. */
  obterPorId = async (req: TenantRequest, res: Response): Promise<void> => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ success: false, error: 'Id invalido.' });
      return;
    }

    try {
      const data = await withTenantQuery(req.tenant!, async (client) => {
        const nota = await client.query(
          `SELECT id, empresa_id, chave_acesso, numero_nota, serie, tipo_documento, direcao,
                  modelo, natureza_operacao, emitente_nome, emitente_cnpj_cpf, emitente_uf,
                  destinatario_nome, destinatario_cnpj_cpf, destinatario_uf, data_emissao,
                  valor_total, valor_produtos_servicos, valor_descontos, valor_frete,
                  valor_impostos_total, valor_liquido, status_processamento
             FROM notas_fiscais WHERE id = $1;`,
          [id]
        );
        if (nota.rows.length === 0) return null;

        const itens = await client.query(
          `SELECT numero_item, codigo_produto, descricao_produto, ncm, cfop,
                  unidade_comercial, quantidade, valor_unitario, valor_total, valor_desconto
             FROM notas_fiscais_itens WHERE nota_fiscal_id = $1 ORDER BY numero_item;`,
          [id]
        );

        const duplicatas = await client.query(
          `SELECT numero_duplicata, data_vencimento, valor_duplicata, status_cobranca, data_pagamento
             FROM notas_fiscais_duplicatas WHERE nota_fiscal_id = $1 ORDER BY data_vencimento;`,
          [id]
        );

        return { ...nota.rows[0], itens: itens.rows, duplicatas: duplicatas.rows };
      });

      if (!data) {
        res.status(404).json({
          success: false,
          error: 'Nota nao encontrada no CNPJ selecionado.',
          code: 'NOTA_NAO_ENCONTRADA'
        });
        return;
      }
      res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.error('[NOTA DETALHE]', err.message);
      res.status(503).json({ success: false, error: 'Erro ao buscar a nota fiscal.' });
    }
  };
}
