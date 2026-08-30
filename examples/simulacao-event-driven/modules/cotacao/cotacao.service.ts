import { InMemoryDB } from '../../core/db-client';
import { EventBus } from '../../../../src/core/events/event-bus';
import { Cotacao, CotacaoItem, CreateCotacaoDTO, StatusCotacao } from './cotacao.types';
import { SecurityRole } from '../../core/abac.types';
import { DomainEvent } from '../../../../src/core/events/domain-event';
import { CotacaoAprovacaoSolicitadaPayload, CotacaoGanhaPayload } from '../../../../src/core/events/events.types';
import * as crypto from 'crypto';

export class CotacaoService {
  constructor(
    private readonly db: InMemoryDB,
    private readonly eventBus: EventBus
  ) {}

  async criarCotacaoComSnapshot(dto: CreateCotacaoDTO): Promise<Cotacao> {
    const cotacaoId = crypto.randomUUID();
    let subtotalItens = 0;
    const itensSalvos: CotacaoItem[] = [];

    // REGRA 1 (SNAPSHOT): Congela preco no momento da criacao
    for (const itemDto of dto.itens) {
      const itemCat = this.db.data.catalogo_universal.find(c => c.id === itemDto.item_catalogo_id);
      if (!itemCat || !itemCat.ativo) throw new Error('Item do catalogo inexistente ou inativo.');

      const precoBase = Number(itemCat.detalhes?.preco_base || 0);
      const subtotal = precoBase * itemDto.quantidade;
      subtotalItens += subtotal;

      const cotItem: CotacaoItem = {
        id: crypto.randomUUID(),
        cotacao_id: cotacaoId,
        item_catalogo_id: itemCat.id,
        tipo_item: itemCat.tipo_item,
        valor_unitario_congelado: precoBase, // SNAPSHOT CONGELADO
        quantidade: itemDto.quantidade,
        subtotal_item: subtotal,
        created_at: new Date().toISOString()
      };
      this.db.data.cotacoes_itens.push(cotItem);
      itensSalvos.push(cotItem);
    }

    const descontoPercentual = dto.desconto_global_percentual || 0;
    const valorDesconto = (subtotalItens * descontoPercentual) / 100;
    const totalLiquido = subtotalItens - valorDesconto;

    const novaCotacao: Cotacao = {
      id: cotacaoId,
      empresa_id: dto.empresa_id,
      cliente_id: dto.cliente_id,
      ticket_origem_id: dto.ticket_origem_id || null,
      numero_sequencial: this.db.data.cotacoes.length + 1,
      status: 'RASCUNHO',
      subtotal_itens: subtotalItens,
      desconto_global_percentual: descontoPercentual,
      desconto_global_valor: valorDesconto,
      valor_total_liquido: totalLiquido,
      condicao_pagamento: dto.condicao_pagamento,
      itens: itensSalvos,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.db.data.cotacoes.push(novaCotacao);
    return novaCotacao;
  }

  async submeterCotacao(cotacaoId: string): Promise<Cotacao> {
    const cotacao = this.db.data.cotacoes.find(c => c.id === cotacaoId);
    if (!cotacao) throw new Error('Cotacao nao encontrada.');

    // REGRA 2 (ALCADA): Se desconto > 10%, exige aprovacao e notifica Gestao
    if (cotacao.desconto_global_percentual > 10.0) {
      cotacao.status = 'AGUARDANDO_APROVACAO';
      await this.eventBus.publish<CotacaoAprovacaoSolicitadaPayload>({
        eventId: crypto.randomUUID(),
        eventType: 'COTACAO.APROVACAO_SOLICITADA',
        timestamp: new Date().toISOString(),
        empresaId: cotacao.empresa_id,
        payload: {
          cotacaoId: cotacao.id,
          empresaId: cotacao.empresa_id,
          descontoPercentual: cotacao.desconto_global_percentual,
          valorTotalLiquido: cotacao.valor_total_liquido
        }
      });
    } else {
      cotacao.status = 'APROVADA_INTERNAMENTE';
    }
    cotacao.updated_at = new Date().toISOString();
    return cotacao;
  }

  async marcarComoGanha(cotacaoId: string): Promise<Cotacao> {
    const cotacao = this.db.data.cotacoes.find(c => c.id === cotacaoId);
    if (!cotacao) throw new Error('Cotacao nao encontrada.');

    cotacao.status = 'GANHA';
    cotacao.updated_at = new Date().toISOString();
    const itens = this.db.data.cotacoes_itens.filter(i => i.cotacao_id === cotacao.id);

    await this.eventBus.publish<CotacaoGanhaPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'COTACAO.GANHA',
      timestamp: new Date().toISOString(),
      empresaId: cotacao.empresa_id,
      payload: {
        cotacao_id: cotacao.id,
        empresa_id: cotacao.empresa_id,
        cliente_id: cotacao.cliente_id,
        valor_total_liquido: cotacao.valor_total_liquido,
        itens: itens.map(i => ({
          cotacao_item_id: i.id,
          item_catalogo_id: i.item_catalogo_id,
          tipo_item: i.tipo_item,
          quantidade: i.quantidade,
          valor_unitario_congelado: i.valor_unitario_congelado
        }))
      }
    });
    return cotacao;
  }

  assertPermissaoEdicao(cotacaoId: string, role: SecurityRole): void {
    const cotacao = this.db.data.cotacoes.find(c => c.id === cotacaoId);
    if (!cotacao) throw new Error('Cotacao nao encontrada.');
    const travadas: StatusCotacao[] = ['GANHA', 'ENVIADA_CLIENTE'];
    if (travadas.includes(cotacao.status) && role !== 'Admin_Sistema') {
      throw new Error(`REGRA 3: Cotacao com status '${cotacao.status}' travada para edicao.`);
    }
  }
}
