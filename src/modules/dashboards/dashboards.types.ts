import { SecurityRole, UserAuthContext } from '../../core/security/abac.types';

export interface AnalyticsVendasMensal {
  empresa_id: string;
  ano_mes: string;
  total_cotacoes_ganhas: number;
  valor_total_convertido: number;
  ultima_atualizacao: string;
}

export interface AnalyticsOperacaoQualidade {
  empresa_id: string;
  total_os_concluidas: number;
  total_rncs_geradas: number;
  ultima_atualizacao: string;
}

export interface MetricasConsolidadasDashboard {
  visao: 'HOLDING_CONSOLIDADA' | 'EMPRESA_INDIVIDUAL';
  empresa_alvo_id?: string | null;
  periodo_referencia: string;
  comercial: {
    total_cotacoes_ganhas: number;
    valor_total_convertido: number;
    ticket_medio: number;
  };
  operacional_qualidade: {
    total_os_concluidas: number;
    total_rncs_geradas: number;
    indice_conformidade_percentual: number;
  };
}
