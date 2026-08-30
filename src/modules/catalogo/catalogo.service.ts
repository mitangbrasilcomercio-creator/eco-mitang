import { CatalogoRepository } from './catalogo.repository';
import { TenantContext } from '../../core/database/supabase-pool';
import { EventBus, globalEventBus } from '../../core/events/event-bus';
import { CatalogoUniversalItem } from './catalogo.types';
import { CreateCatalogoItemInput, UpdateCatalogoItemInput, FilterCatalogoQuery, validatePolymorphicDetailsUpdate } from './catalogo.schema';
import { CatalogoItemCriadoPayload, CatalogoItemAtualizadoPayload, CatalogoItemInativadoPayload } from './catalogo.events';
import * as crypto from 'crypto';

export class CatalogoService {
  constructor(
    private readonly repository: CatalogoRepository = new CatalogoRepository(),
    private readonly eventBus: EventBus = globalEventBus
  ) {}

  async listItems(ctx: TenantContext, filters: FilterCatalogoQuery): Promise<{ items: CatalogoUniversalItem[]; total: number; page: number; limit: number }> {
    const result = await this.repository.list(ctx, filters);
    return {
      items: result.items,
      total: result.total,
      page: filters.page,
      limit: filters.limit
    };
  }

  async getItemById(ctx: TenantContext, id: string): Promise<CatalogoUniversalItem> {
    const empresaId = ctx.empresaId;
    const item = await this.repository.findById(ctx, id);
    if (!item) {
      const error: any = new Error(`Item de catalogo com ID '${id}' nao encontrado.`);
      error.statusCode = 404;
      error.code = 'ITEM_NOT_FOUND';
      throw error;
    }
    return item;
  }

  async createItem(ctx: TenantContext, input: CreateCatalogoItemInput): Promise<CatalogoUniversalItem> {
    const empresaId = ctx.empresaId;
    const createdItem = await this.repository.create(ctx, input);

    // Disparo de Evento de Dominio: CATALOGO.ITEM_CRIADO
    await this.eventBus.publish<CatalogoItemCriadoPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'CATALOGO.ITEM_CRIADO',
      timestamp: createdItem.created_at,
      empresaId: empresaId,
      payload: {
        item_id: createdItem.id,
        empresa_id: empresaId,
        tipo_item: createdItem.tipo_item,
        nome: createdItem.nome,
        preco_base: Number((createdItem.detalhes as any)?.preco_base || 0),
        quantidade_estoque_atual: Number(createdItem.quantidade_estoque_atual || 0),
        criado_em: createdItem.created_at
      }
    });

    return createdItem;
  }

  async updateItem(ctx: TenantContext, id: string, input: UpdateCatalogoItemInput): Promise<CatalogoUniversalItem> {
    const empresaId = ctx.empresaId;
    const existing = await this.getItemById(ctx, id);

    if (input.detalhes) {
      try {
        input.detalhes = validatePolymorphicDetailsUpdate(existing.tipo_item, input.detalhes);
      } catch (validationErr: any) {
        const err: any = new Error(`REGRA 2 (VALIDACAO POLIMORFICA NO UPDATE): Detalhes invalidos para o tipo ${existing.tipo_item}.`);
        err.statusCode = 422;
        err.code = 'UNPROCESSABLE_ENTITY_POLYMORPHIC_UPDATE';
        err.details = validationErr.issues;
        throw err;
      }
    }

    const updatedItem = await this.repository.update(ctx, id, input);
    if (!updatedItem) {
      const error: any = new Error(`Falha ao atualizar item '${id}'.`);
      error.statusCode = 400;
      throw error;
    }

    // Disparo de Evento de Dominio: CATALOGO.ITEM_ATUALIZADO
    await this.eventBus.publish<CatalogoItemAtualizadoPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'CATALOGO.ITEM_ATUALIZADO',
      timestamp: updatedItem.updated_at,
      empresaId: empresaId,
      payload: {
        item_id: updatedItem.id,
        empresa_id: empresaId,
        alteracoes: input,
        atualizado_em: updatedItem.updated_at
      }
    });

    return updatedItem;
  }

  async inactivateItem(ctx: TenantContext, id: string): Promise<CatalogoUniversalItem> {
    const empresaId = ctx.empresaId;
    await this.getItemById(ctx, id);
    const itemInativado = await this.repository.inactivate(ctx, id);

    if (!itemInativado) {
      const error: any = new Error(`Falha ao inativar item '${id}'.`);
      error.statusCode = 400;
      throw error;
    }

    // Disparo de Evento de Dominio: CATALOGO.ITEM_INATIVADO
    await this.eventBus.publish<CatalogoItemInativadoPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'CATALOGO.ITEM_INATIVADO',
      timestamp: itemInativado.updated_at,
      empresaId: empresaId,
      payload: {
        item_id: itemInativado.id,
        empresa_id: empresaId,
        inativado_em: itemInativado.updated_at
      }
    });

    return itemInativado;
  }

  /**
   * REGRA 1: Bloqueia delecao se o item estiver atrelado a Cotacao ou Ordem de Servico
   */
  async deleteItem(ctx: TenantContext, id: string): Promise<{ success: boolean; message: string }> {
    await this.getItemById(ctx, id);

    // Verifica vinculos ativos em Cotacoes e Ordens de Servico
    const usage = await this.repository.verifyUsage(ctx, id);

    if (usage.isLinked) {
      const error: any = new Error(
        `REGRA 1 (BLOQUEIO DE DELECAO): O item '${id}' nao pode ser excluido pois possui vinculos comerciais/operacionais ativos ` +
        `(${usage.cotacoesCount} Cotacao(oes), ${usage.ordensServicoCount} Ordem(ns) de Servico). ` +
        `Apenas a inativacao do status e permitida.`
      );
      error.statusCode = 409; // 409 Conflict
      error.code = 'FOREIGN_KEY_RESTRICTION';
      error.usage = usage;
      throw error;
    }

    const deleted = await this.repository.hardDelete(ctx, id);
    return {
      success: deleted,
      message: 'Item removido do catalogo com sucesso.'
    };
  }
}
