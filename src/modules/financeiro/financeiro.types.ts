export type StatusCreditoPlano = 'ANALISE' | 'APROVADO' | 'BLOQUEADO';
export type StatusPagamentoParcela = 'A_VENCER' | 'PAGO' | 'RENEGOCIADA';

export interface ParcelaRecebimento {
  id: string;
  plano_id: string;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  data_pagamento?: string | null;
  status_pagamento: StatusPagamentoParcela;
  exige_quitacao_para_liberar_os: boolean;
  renegociada_em?: string | null;
  motivo_renegociacao?: string | null;
}

export interface PlanoFaturamento {
  id: string;
  empresa_id: string;
  cotacao_origem_id: string;
  valor_total_devido: number;
  status_credito: StatusCreditoPlano;
  parcelas?: ParcelaRecebimento[];
}
