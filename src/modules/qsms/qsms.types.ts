export type ResultadoAuditoriaQSMS = 'PENDENTE' | 'APROVADO' | 'REPROVADO_RNC';
export type StatusRNC = 'ABERTA' | 'CORRIGIDA';

export interface AuditoriaQSMS {
  id: string;
  empresa_id: string;
  os_id: string;
  auditor_id: string;
  resultado_final: ResultadoAuditoriaQSMS;
  assinatura_digital_hash?: string | null;
  aprovado_em?: string | null;
  dados_snapshot_auditoria?: Record<string, any> | null;
}

export interface RegistroNaoConformidade {
  id: string;
  empresa_id: string;
  auditoria_id: string;
  descricao: string;
  status: StatusRNC;
}
