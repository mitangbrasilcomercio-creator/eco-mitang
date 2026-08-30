import { DomainEvent } from '../../../../src/core/events/domain-event';
import { TicketQualificadoPayload } from '../../../../src/core/events/events.types';
import { CotacaoService } from './cotacao.service';
import { InMemoryDB } from '../../core/db-client';
import * as crypto from 'crypto';

export class CotacaoTriagemListener {
  constructor(
    private readonly cotacaoService: CotacaoService,
    private readonly db: InMemoryDB
  ) {}

  async handle(event: DomainEvent<TicketQualificadoPayload>): Promise<void> {
    const { ticket_id, empresa_alvo_id, dados_contato_bruto } = event.payload;
    let cliente = this.db.data.clientes.find(c => c.empresa_id === empresa_alvo_id);
    if (!cliente) {
      cliente = {
        id: crypto.randomUUID(),
        empresa_id: empresa_alvo_id,
        razao_social_nome: `Lead Triagem (${dados_contato_bruto})`,
        cnpj_cpf: '00000000000',
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.db.data.clientes.push(cliente);
    }

    const itemCat = this.db.data.catalogo_universal.find(i => i.empresa_id === empresa_alvo_id && i.ativo);
    if (itemCat) {
      await this.cotacaoService.criarCotacaoComSnapshot({
        empresa_id: empresa_alvo_id,
        cliente_id: cliente.id,
        ticket_origem_id: ticket_id,
        condicao_pagamento: '30 DDL',
        desconto_global_percentual: 5.0,
        itens: [{ item_catalogo_id: itemCat.id, quantidade: 1 }]
      });
    }
  }
}
