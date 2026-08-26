import { InMemoryDB } from '../../core/database/db-client';
import { CatalogoUniversalItem } from './catalogo.types';
import * as crypto from 'crypto';

export class CatalogoService {
  constructor(private readonly db: InMemoryDB) {}

  async criarItem(item: Omit<CatalogoUniversalItem, 'id' | 'created_at' | 'updated_at' | 'ativo'>): Promise<CatalogoUniversalItem> {
    const novo: CatalogoUniversalItem = {
      ...item,
      id: crypto.randomUUID(),
      ativo: true,
      quantidade_estoque_atual: item.quantidade_estoque_atual || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as any;
    this.db.data.catalogo_universal.push(novo);
    return novo;
  }

  async inativarItem(id: string, empresaId: string): Promise<void> {
    const item = this.db.data.catalogo_universal.find(i => i.id === id && i.empresa_id === empresaId);
    if (!item) throw new Error('Item nao encontrado.');
    item.ativo = false;
    item.updated_at = new Date().toISOString();
  }
}
