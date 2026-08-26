import { pgPool } from '../../../core/database/supabase-pool';
import { ItemCatalogo } from '../models/item-catalogo.model';
import { CreateItemCatalogoInput, UpdateItemCatalogoInput } from '../dtos/item-catalogo.dto';

export class ItemCatalogoRepository {
  async listByEmpresa(empresaId: string, apenasAtivos: boolean = true): Promise<ItemCatalogo[]> {
    const query = `
      SELECT id, empresa_id, tipo_item, codigo_sku, nome_comercial, preco_base,
             quantidade_estoque, atributos_extras, status_ativo, created_at, updated_at
      FROM itens_catalogo
      WHERE empresa_id = $1
        ${apenasAtivos ? 'AND status_ativo = TRUE' : ''}
      ORDER BY nome_comercial ASC;
    `;
    const res = await pgPool.query(query, [empresaId]);
    return res.rows.map(this.mapRow);
  }

  async findById(empresaId: string, id: string): Promise<ItemCatalogo | null> {
    const query = `
      SELECT id, empresa_id, tipo_item, codigo_sku, nome_comercial, preco_base,
             quantidade_estoque, atributos_extras, status_ativo, created_at, updated_at
      FROM itens_catalogo
      WHERE id = $1 AND empresa_id = $2;
    `;
    const res = await pgPool.query(query, [id, empresaId]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async findBySku(codigoSku: string): Promise<ItemCatalogo | null> {
    const query = `
      SELECT id, empresa_id, tipo_item, codigo_sku, nome_comercial, preco_base,
             quantidade_estoque, atributos_extras, status_ativo, created_at, updated_at
      FROM itens_catalogo
      WHERE codigo_sku = $1;
    `;
    const res = await pgPool.query(query, [codigoSku]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async create(data: CreateItemCatalogoInput): Promise<ItemCatalogo> {
    const query = `
      INSERT INTO itens_catalogo (
        empresa_id, tipo_item, codigo_sku, nome_comercial, preco_base,
        quantidade_estoque, atributos_extras, status_ativo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *;
    `;
    const params = [
      data.empresa_id,
      data.tipo_item,
      data.codigo_sku || null,
      data.nome_comercial,
      data.preco_base,
      data.tipo_item === 'Produto' ? data.quantidade_estoque : 0,
      JSON.stringify(data.atributos_extras || {})
    ];
    const res = await pgPool.query(query, params);
    return this.mapRow(res.rows[0]);
  }

  async update(empresaId: string, id: string, data: UpdateItemCatalogoInput): Promise<ItemCatalogo | null> {
    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [id, empresaId];
    let idx = 3;

    if (data.tipo_item !== undefined) { fields.push(`tipo_item = $${idx++}`); params.push(data.tipo_item); }
    if (data.codigo_sku !== undefined) { fields.push(`codigo_sku = $${idx++}`); params.push(data.codigo_sku); }
    if (data.nome_comercial !== undefined) { fields.push(`nome_comercial = $${idx++}`); params.push(data.nome_comercial); }
    if (data.preco_base !== undefined) { fields.push(`preco_base = $${idx++}`); params.push(data.preco_base); }
    if (data.quantidade_estoque !== undefined) { fields.push(`quantidade_estoque = $${idx++}`); params.push(data.quantidade_estoque); }
    if (data.atributos_extras !== undefined) { fields.push(`atributos_extras = $${idx++}`); params.push(JSON.stringify(data.atributos_extras)); }
    if (data.status_ativo !== undefined) { fields.push(`status_ativo = $${idx++}`); params.push(data.status_ativo); }

    const query = `
      UPDATE itens_catalogo
      SET ${fields.join(', ')}
      WHERE id = $1 AND empresa_id = $2
      RETURNING *;
    `;
    const res = await pgPool.query(query, params);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async softDelete(empresaId: string, id: string): Promise<ItemCatalogo | null> {
    const query = `
      UPDATE itens_catalogo
      SET status_ativo = FALSE, updated_at = NOW()
      WHERE id = $1 AND empresa_id = $2
      RETURNING *;
    `;
    const res = await pgPool.query(query, [id, empresaId]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  private mapRow(row: any): ItemCatalogo {
    return {
      ...row,
      preco_base: parseFloat(row.preco_base),
      quantidade_estoque: parseFloat(row.quantidade_estoque),
      atributos_extras: typeof row.atributos_extras === 'string' ? JSON.parse(row.atributos_extras) : row.atributos_extras
    };
  }
}
