import { TipoItemCatalogo } from '../catalogo/catalogo.types';
import { SecurityRole } from '../../../../src/core/security/abac.types';

export type StatusCotacao =
  | 'RASCUNHO'
  | 'AGUARDANDO_APROVACAO'
  | 'APROVADA_INTERNAMENTE'
  | 'ENVIADA_CLIENTE'
  | 'GANHA'
  | 'PERDIDA'
  | 'CANCELADA';

export interface CotacaoItem {
  id: string;
  cotacao_id: string;
  item_catalogo_id: string;
  tipo_item: TipoItemCatalogo;
  valor_unitario_congelado: number; // Snapshot
  quantidade: number;
  subtotal_item: number;
  created_at: string;
}

export interface Cotacao {
  id: string;
  empresa_id: string;
  cliente_id: string;
  ticket_origem_id?: string | null;
  numero_sequencial: number;
  status: StatusCotacao;
  subtotal_itens: number;
  desconto_global_percentual: number;
  desconto_global_valor: number;
  valor_total_liquido: number;
  condicao_pagamento: string;
  observacoes?: string | null;
  itens?: CotacaoItem[];
  created_at: string;
  updated_at: string;
}

export interface CreateCotacaoDTO {
  empresa_id: string;
  cliente_id: string;
  ticket_origem_id?: string;
  condicao_pagamento: string;
  desconto_global_percentual?: number;
  itens: {
    item_catalogo_id: string;
    quantidade: number;
  }[];
}
