import { ItemCatalogoRepository } from '../repositories/item-catalogo.repository';
import { ItemCatalogo } from '../models/item-catalogo.model';
import { CreateItemCatalogoInput, UpdateItemCatalogoInput } from '../dtos/item-catalogo.dto';
import { globalEventBus } from '../../../core/events/event-bus';
import * as crypto from 'crypto';

export class ItemCatalogoService {
  constructor(private readonly repository: ItemCatalogoRepository = new ItemCatalogoRepository()) {}

  async list(empresaId: string, apenasAtivos: boolean = true): Promise<ItemCatalogo[]> {
    if (!empresaId) {
      throw new Error('Filtro por empresa_id e obrigatorio.');
    }
    return await this.repository.listByEmpresa(empresaId, apenasAtivos);
  }

  async getById(empresaId: string, id: string): Promise<ItemCatalogo> {
    const item = await this.repository.findById(empresaId, id);
    if (!item) {
      const err: any = new Error(`Item do catalogo #${id} nao encontrado para a empresa informada.`);
      err.statusCode = 404;
      throw err;
    }
    return item;
  }

  async create(data: CreateItemCatalogoInput): Promise<ItemCatalogo> {
    // Validacao de SKU unico se fornecido
    if (data.codigo_sku) {
      const existingSku = await this.repository.findBySku(data.codigo_sku);
      if (existingSku) {
        const err: any = new Error(`Codigo SKU '${data.codigo_sku}' ja esta em uso.`);
        err.statusCode = 409;
        throw err;
      }
    }

    // Regra: estoque valido apenas para Produto
    if (data.tipo_item !== 'Produto') {
      data.quantidade_estoque = 0;
    }

    const created = await this.repository.create(data);

    // Emissao de Evento de Dominio
    await globalEventBus.publish({
      eventId: crypto.randomUUID(),
      eventType: 'CATALOGO.ITEM_CRIADO',
      timestamp: created.created_at,
      empresaId: created.empresa_id,
      payload: created
    });

    return created;
  }

  async update(empresaId: string, id: string, data: UpdateItemCatalogoInput): Promise<ItemCatalogo> {
    await this.getById(empresaId, id);

    if (data.codigo_sku) {
      const existingSku = await this.repository.findBySku(data.codigo_sku);
      if (existingSku && existingSku.id !== id) {
        const err: any = new Error(`Codigo SKU '${data.codigo_sku}' ja esta cadastrado em outro item.`);
        err.statusCode = 409;
        throw err;
      }
    }

    const updated = await this.repository.update(empresaId, id, data);
    if (!updated) {
      const err: any = new Error(`Erro ao atualizar item #${id}.`);
      err.statusCode = 400;
      throw err;
    }

    await globalEventBus.publish({
      eventId: crypto.randomUUID(),
      eventType: 'CATALOGO.ITEM_ATUALIZADO',
      timestamp: updated.updated_at,
      empresaId: updated.empresa_id,
      payload: updated
    });

    return updated;
  }

  /**
   * SOFT DELETE: Altera status_ativo para false
   */
  async softDelete(empresaId: string, id: string): Promise<ItemCatalogo> {
    await this.getById(empresaId, id);
    const itemInativado = await this.repository.softDelete(empresaId, id);

    if (!itemInativado) {
      const err: any = new Error(`Nao foi possivel inativar o item #${id}.`);
      err.statusCode = 400;
      throw err;
    }

    await globalEventBus.publish({
      eventId: crypto.randomUUID(),
      eventType: 'CATALOGO.ITEM_INATIVADO',
      timestamp: itemInativado.updated_at,
      empresaId: itemInativado.empresa_id,
      payload: { id: itemInativado.id, status_ativo: false }
    });

    return itemInativado;
  }
}
