import { DomainEvent } from '../../core/events/domain-event';
import { CatalogoUniversalItem, TipoItemCatalogo } from './catalogo.types';

export interface CatalogoItemCriadoPayload {
  item_id: string;
  empresa_id: string;
  tipo_item: TipoItemCatalogo;
  nome: string;
  preco_base: number;
  quantidade_estoque_atual: number;
  criado_em: string;
}

export interface CatalogoItemAtualizadoPayload {
  item_id: string;
  empresa_id: string;
  alteracoes: Record<string, any>;
  atualizado_em: string;
}

export interface CatalogoItemInativadoPayload {
  item_id: string;
  empresa_id: string;
  inativado_em: string;
}

export type CatalogoItemCriadoEvent = DomainEvent<CatalogoItemCriadoPayload>;
export type CatalogoItemAtualizadoEvent = DomainEvent<CatalogoItemAtualizadoPayload>;
export type CatalogoItemInativadoEvent = DomainEvent<CatalogoItemInativadoPayload>;
