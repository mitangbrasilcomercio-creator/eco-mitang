import { withTenantQuery, withTenantTransaction, TenantContext } from '../../core/database/supabase-pool';
import { localMirror } from '../../core/database/local-mirror.service';
import { CatalogoUniversalItem, TipoItemCatalogo } from './catalogo.types';
import { CreateCatalogoItemInput, UpdateCatalogoItemInput, FilterCatalogoQuery } from './catalogo.schema';

export interface UsageVerificationResult {
  isLinked: boolean;
  cotacoesCount: number;
  ordensServicoCount: number;
}

export class CatalogoRepository {
  /**
   * REGRA 1: Verifica se o item possui vinculos com Cotacoes ou Ordens de Servico
   */
  async verifyUsage(ctx: TenantContext, itemId: string): Promise<UsageVerificationResult> {
    const empresaId = ctx.empresaId;
    const cotacoesQuery = `
      SELECT COUNT(*)::int as total 
      FROM cotacoes_itens ci
      JOIN cotacoes c ON c.id = ci.cotacao_id
      WHERE ci.item_catalogo_id = $1 AND c.empresa_id = $2;
    `;
    const osQuery = `
      SELECT COUNT(*)::int as total 
      FROM ordens_servico os
      JOIN cotacoes_itens ci ON ci.id = os.cotacao_item_origem_id
      WHERE ci.item_catalogo_id = $1 AND os.empresa_id = $2;
    `;

    return withTenantQuery(ctx, async (client) => {
      const [cotacoesRes, osRes] = await Promise.all([
        client.query(cotacoesQuery, [itemId, empresaId]),
        client.query(osQuery, [itemId, empresaId])
      ]);

      const cotacoesCount = cotacoesRes.rows[0]?.total || 0;
      const ordensServicoCount = osRes.rows[0]?.total || 0;

      return {
        isLinked: cotacoesCount > 0 || ordensServicoCount > 0,
        cotacoesCount,
        ordensServicoCount
      };
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<CatalogoUniversalItem | null> {
    const empresaId = ctx.empresaId;
    const query = `
      SELECT id, empresa_id, tipo_item, nome, descricao_tecnica, detalhes, quantidade_estoque_atual, ativo, created_at, updated_at
      FROM catalogo_universal
      WHERE id = $1 AND empresa_id = $2;
    `;
    const res = await withTenantQuery(ctx, (c) => c.query(query, [id, empresaId]));
    return res.rows[0] || null;
  }

  async list(ctx: TenantContext, filters: FilterCatalogoQuery): Promise<{ items: CatalogoUniversalItem[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Sem filtro manual de empresa_id: a Row-Level Security ja restringe as
    // linhas aos CNPJs do contexto. Numa visao consolidada isso traz todos os
    // CNPJs permitidos ao usuario; numa visao unica, apenas um.

    if (filters.tipo_item) {
      conditions.push(`tipo_item = $${paramIndex++}`);
      params.push(filters.tipo_item);
    }

    if (filters.ativo !== undefined) {
      conditions.push(`ativo = $${paramIndex++}`);
      params.push(filters.ativo);
    }

    if (filters.busca) {
      conditions.push(`(nome ILIKE $${paramIndex} OR descricao_tecnica ILIKE $${paramIndex})`);
      params.push(`%${filters.busca}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*)::int as total FROM catalogo_universal ${whereClause};`;
    const countParams = [...params];
    
    const offset = (filters.page - 1) * filters.limit;
    const dataQuery = `
      SELECT id, empresa_id, tipo_item, nome, descricao_tecnica, detalhes, quantidade_estoque_atual, ativo, created_at, updated_at
      FROM catalogo_universal
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    params.push(filters.limit, offset);

    try {
      return await withTenantQuery(ctx, async (client) => {
        const [countRes, dataRes] = await Promise.all([
          client.query(countQuery, countParams),
          client.query(dataQuery, params)
        ]);
        return {
          items: dataRes.rows,
          total: countRes.rows[0]?.total || 0
        };
      });
    } catch (err: any) {
      console.warn(`[CATALOGO REPOSITORY]: Falha na nuvem Supabase (${err.message}). Servindo com contingência do Local Mirror em <2ms...`);
      const all = localMirror.getMirror<CatalogoUniversalItem[]>('catalogo_universal') || [];
      let filtered = all;
      const escopo = ctx.empresaIds && ctx.empresaIds.length > 0 ? ctx.empresaIds : [ctx.empresaId];
      filtered = filtered.filter(item => escopo.includes(item.empresa_id));
      if (filters.tipo_item) {
        filtered = filtered.filter(item => item.tipo_item === filters.tipo_item);
      }
      if (filters.busca) {
        const b = filters.busca.toLowerCase();
        filtered = filtered.filter(item => 
          (item.nome || '').toLowerCase().includes(b) ||
          (item.descricao_tecnica || '').toLowerCase().includes(b)
        );
      }
      const total = filtered.length;
      const offset = (filters.page - 1) * filters.limit;
      const items = filtered.slice(offset, offset + filters.limit);
      return { items, total };
    }
  }

  async create(ctx: TenantContext, input: CreateCatalogoItemInput): Promise<CatalogoUniversalItem> {
    const empresaId = ctx.empresaId;
    const query = `
      INSERT INTO catalogo_universal (
        empresa_id, tipo_item, nome, descricao_tecnica, detalhes, quantidade_estoque_atual, ativo
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      RETURNING *;
    `;
    const params = [
      empresaId,
      input.tipo_item,
      input.nome,
      input.descricao_tecnica || null,
      JSON.stringify(input.detalhes),
      input.quantidade_estoque_atual || 0
    ];

    const res = await withTenantQuery(ctx, (c) => c.query(query, params));
    return res.rows[0];
  }

  async update(ctx: TenantContext, id: string, input: UpdateCatalogoItemInput): Promise<CatalogoUniversalItem | null> {
    const empresaId = ctx.empresaId;
    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [id, empresaId];
    let paramIndex = 3;

    if (input.nome !== undefined) {
      fields.push(`nome = $${paramIndex++}`);
      params.push(input.nome);
    }
    if (input.descricao_tecnica !== undefined) {
      fields.push(`descricao_tecnica = $${paramIndex++}`);
      params.push(input.descricao_tecnica);
    }
    if (input.quantidade_estoque_atual !== undefined) {
      fields.push(`quantidade_estoque_atual = $${paramIndex++}`);
      params.push(input.quantidade_estoque_atual);
    }
    if (input.detalhes !== undefined) {
      fields.push(`detalhes = $${paramIndex++}`);
      params.push(JSON.stringify(input.detalhes));
    }
    if (input.ativo !== undefined) {
      fields.push(`ativo = $${paramIndex++}`);
      params.push(input.ativo);
    }

    const query = `
      UPDATE catalogo_universal
      SET ${fields.join(', ')}
      WHERE id = $1 AND empresa_id = $2
      RETURNING *;
    `;

    const res = await withTenantQuery(ctx, (c) => c.query(query, params));
    return res.rows[0] || null;
  }

  async inactivate(ctx: TenantContext, id: string): Promise<CatalogoUniversalItem | null> {
    const empresaId = ctx.empresaId;
    const query = `
      UPDATE catalogo_universal
      SET ativo = FALSE, updated_at = NOW()
      WHERE id = $1 AND empresa_id = $2
      RETURNING *;
    `;
    const res = await withTenantQuery(ctx, (c) => c.query(query, [id, empresaId]));
    return res.rows[0] || null;
  }

  async hardDelete(ctx: TenantContext, id: string): Promise<boolean> {
    const empresaId = ctx.empresaId;
    const query = `DELETE FROM catalogo_universal WHERE id = $1 AND empresa_id = $2;`;
    const res = await withTenantQuery(ctx, (c) => c.query(query, [id, empresaId]));
    return (res.rowCount ?? 0) > 0;
  }
}
