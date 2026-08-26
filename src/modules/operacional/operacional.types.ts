export type TipoOrdemServico = 'PRODUCAO' | 'MOBILIZACAO' | 'SERVICO' | 'CURSO';

export type StatusOrdemServico =
  | 'AGUARDANDO_LIBERACAO'
  | 'NA_FILA'
  | 'EM_EXECUCAO'
  | 'IMPEDIMENTO'
  | 'BLOQUEADA_EM_RETRABALHO'
  | 'CONCLUIDA';

export interface OrdemServico {
  id: string;
  empresa_id: string;
  cotacao_origem_id: string;
  cotacao_item_origem_id: string;
  numero_os: number;
  tipo_os: TipoOrdemServico;
  status: StatusOrdemServico;
  bloqueio_financeiro: boolean;
  bloqueio_qsms: boolean;
  created_at: string;
  updated_at: string;
}

export function podeExecutarOS(os: Pick<OrdemServico, 'bloqueio_financeiro' | 'bloqueio_qsms'>): boolean {
  return !os.bloqueio_financeiro && !os.bloqueio_qsms;
}
