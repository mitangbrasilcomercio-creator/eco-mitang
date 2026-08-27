import { DomainEvent } from './domain-event';
import { TipoItemCatalogo } from '../../modules/catalogo/catalogo.types';

export interface TicketQualificadoPayload {
  ticket_id: string;
  empresa_alvo_id: string;
  dados_contato_bruto: string;
  descricao_pedido: string;
  qualificado_por: string;
  qualificado_em: string;
}

export interface CotacaoAprovacaoSolicitadaPayload {
  cotacaoId: string;
  empresaId: string;
  descontoPercentual: number;
  valorTotalLiquido: number;
}

export interface CotacaoGanhaPayload {
  cotacao_id: string;
  empresa_id: string;
  cliente_id: string;
  valor_total_liquido: number;
  itens: Array<{
    cotacao_item_id: string;
    item_catalogo_id: string;
    tipo_item: TipoItemCatalogo;
    quantidade: number;
    valor_unitario_congelado: number;
  }>;
}

export interface ParcelaQuitadaPayload {
  parcela_id: string;
  plano_id: string;
  cotacao_origem_id: string;
  empresa_id: string;
  data_pagamento: string;
}

export interface OrdemServicoConcluidaPayload {
  os_id: string;
  empresa_id: string;
  numero_os: number;
  tipo_os: string;
  cotacao_origem_id: string;
  concluida_em: string;
  concluida_por: string;
}

export interface QsmsAuditoriaAprovadaPayload {
  auditoria_id: string;
  os_id: string;
  empresa_id: string;
  cotacao_origem_id: string;
  aprovado_em: string;
  assinatura_hash: string;
}

export interface QsmsAuditoriaReprovadaPayload {
  auditoria_id: string;
  rnc_id: string;
  os_id: string;
  empresa_id: string;
  descricao_rnc: string;
}

export interface OrdemServicoStatusAtualizadoPayload {
  os_id: string;
  empresa_id: string;
  numero_os?: number;
  status: string;
  bloqueio_financeiro: boolean;
  bloqueio_qsms: boolean;
  atualizado_em: string;
  origem: string;
}

export interface ClienteCriadoPayload {
  cliente_id: string;
  empresa_id: string;
  cnpj_cpf: string;
  razao_social_nome: string;
  situacao_cadastral: string;
  bloqueio_fiscal: boolean;
  criado_em: string;
}

export interface ClienteAlteracaoDetectada {
  campo: string;
  valor_anterior: any;
  valor_novo: any;
}

export interface ClienteDadosAtualizadosPayload {
  cliente_id: string;
  empresa_id: string;
  cnpj_cpf: string;
  razao_social: string;
  origem: string;
  alteracoes: ClienteAlteracaoDetectada[];
  data_vigencia: string;
  atualizado_em: string;
}

export interface ClienteSituacaoFiscalAlteradaPayload {
  cliente_id: string;
  empresa_id: string;
  cnpj_cpf: string;
  situacao_anterior: string;
  nova_situacao: string;
  bloqueio_fiscal_ativo: boolean;
  motivo?: string;
  alertar_compliance: boolean;
}

export interface FinanceiroExtratoOfxImportadoPayload {
  importacao_id: string;
  empresa_id: string;
  conta_bancaria_id: string;
  nome_arquivo: string;
  transacoes_inseridas: number;
  transacoes_duplicadas_ignoradas: number;
  saldo_final_extrato?: number;
}

