import { InMemoryDB } from '../../core/database/db-client';
import { EventBus } from '../../core/events/event-bus';
import { TicketTriagem, CreateTicketTriagemDTO, QualificarTicketDTO } from './triagem.types';
import { DomainEvent } from '../../core/events/domain-event';
import { TicketQualificadoPayload } from '../../core/events/events.types';
import * as crypto from 'crypto';

export class TicketTriagemService {
  constructor(
    private readonly db: InMemoryDB,
    private readonly eventBus: EventBus
  ) {}

  async criarTicket(dto: CreateTicketTriagemDTO): Promise<TicketTriagem> {
    const ticket: TicketTriagem = {
      id: crypto.randomUUID(),
      empresa_alvo_id: dto.empresa_alvo_id,
      canal_origem: dto.canal_origem,
      dados_contato_bruto: dto.dados_contato_bruto,
      descricao_pedido: dto.descricao_pedido,
      status: 'NOVO',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.db.data.tickets_triagem.push(ticket);
    return ticket;
  }

  async qualificarTicket(dto: QualificarTicketDTO): Promise<TicketTriagem> {
    const ticket = this.db.data.tickets_triagem.find(t => t.id === dto.ticket_id);
    if (!ticket) throw new Error('Ticket nao encontrado.');

    ticket.status = 'QUALIFICADO';
    ticket.qualificado_em = new Date().toISOString();
    ticket.qualificado_por = dto.usuario_id;
    ticket.updated_at = new Date().toISOString();

    const event: DomainEvent<TicketQualificadoPayload> = {
      eventId: crypto.randomUUID(),
      eventType: 'TICKET.QUALIFICADO',
      timestamp: ticket.qualificado_em,
      empresaId: ticket.empresa_alvo_id,
      payload: {
        ticket_id: ticket.id,
        empresa_alvo_id: ticket.empresa_alvo_id,
        dados_contato_bruto: ticket.dados_contato_bruto,
        descricao_pedido: ticket.descricao_pedido,
        qualificado_por: dto.usuario_id,
        qualificado_em: ticket.qualificado_em
      }
    };
    await this.eventBus.publish(event);
    return ticket;
  }
}
