export type CanalOrigemTicket = 'EMAIL' | 'WHATSAPP' | 'TELEFONE' | 'SITE';
export type StatusTicket = 'NOVO' | 'EM_ANALISE' | 'QUALIFICADO' | 'DESCARTADO';

export interface TicketTriagem {
  id: string;
  empresa_alvo_id: string;
  canal_origem: CanalOrigemTicket;
  dados_contato_bruto: string;
  descricao_pedido: string;
  status: StatusTicket;
  qualificado_em?: string | null;
  qualificado_por?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTicketTriagemDTO {
  empresa_alvo_id: string;
  canal_origem: CanalOrigemTicket;
  dados_contato_bruto: string;
  descricao_pedido: string;
}

export interface QualificarTicketDTO {
  ticket_id: string;
  usuario_id: string;
}
