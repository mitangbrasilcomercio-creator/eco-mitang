import { pgPool, withTenantTransaction } from '../../core/database/supabase-pool';
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
  async verifyUsage(empresaId: string, itemId: string): Promise<UsageVerificationResult> {
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

    const client = await pgPool.connect();
    try {
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
    } finally {
      client.release();
    }
  }

  async findById(empresaId: string, id: string): Promise<CatalogoUniversalItem | null> {
    const query = `
      SELECT id, empresa_id, tipo_item, nome, descricao_tecnica, detalhes, quantidade_estoque_atual, ativo, created_at, updated_at
      FROM catalogo_universal
      WHERE id = $1 AND empresa_id = $2;
    `;
    const res = await pgPool.query(query, [id, empresaId]);
    return res.rows[0] || null;
  }

  async list(empresaId: string, filters: FilterCatalogoQuery): Promise<{ items: CatalogoUniversalItem[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (empresaId && empresaId !== 'all') {
      conditions.push(`empresa_id = $${paramIndex++}`);
      params.push(empresaId);
    }

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

    const whereClause = conditions.join(' AND ');
    const countQuery = `SELECT COUNT(*)::int as total FROM catalogo_universal WHERE ${whereClause};`;
    const countParams = [...params];
    
    const offset = (filters.page - 1) * filters.limit;
    const dataQuery = `
      SELECT id, empresa_id, tipo_item, nome, descricao_tecnica, detalhes, quantidade_estoque_atual, ativo, created_at, updated_at
      FROM catalogo_universal
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    params.push(filters.limit, offset);

    const client = await pgPool.connect();
    try {
      const [countRes, dataRes] = await Promise.all([
        client.query(countQuery, countParams),
        client.query(dataQuery, params)
      ]);
      return {
        items: dataRes.rows,
        total: countRes.rows[0]?.total || 0
      };
    } finally {
      client.release();
    }
  }

  async create(empresaId: string, input: CreateCatalogoItemInput): Promise<CatalogoUniversalItem> {
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

    const res = await pgPool.query(query, params);
    return res.rows[0];
  }

  async update(empresaId: string, id: string, input: UpdateCatalogoItemInput): Promise<CatalogoUniversalItem | null> {
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

    const res = await pgPool.query(query, params);
    return res.rows[0] || null;
  }

  async inactivate(empresaId: string, id: string): Promise<CatalogoUniversalItem | null> {
    const query = `
      UPDATE catalogo_universal
      SET ativo = FALSE, updated_at = NOW()
      WHERE id = $1 AND empresa_id = $2
      RETURNING *;
    `;
    const res = await pgPool.query(query, [id, empresaId]);
    return res.rows[0] || null;
  }

  async hardDelete(empresaId: string, id: string): Promise<boolean> {
    const query = `DELETE FROM catalogo_universal WHERE id = $1 AND empresa_id = $2;`;
    const res = await pgPool.query(query, [id, empresaId]);
    return (res.rowCount ?? 0) > 0;
  }
}
