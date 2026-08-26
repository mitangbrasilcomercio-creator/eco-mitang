export type SituacaoCadastral = 'ATIVA' | 'SUSPENSA' | 'INAPTA' | 'BAIXADA' | 'NULA';

export interface SocioQSA {
  nome: string;
  qualificacao: string;
  pais_origem?: string;
  nome_representante_legal?: string;
}

export interface CnpjDadosOficiais {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  cnae_principal: string;
  cnae_descricao: string;
  situacao_cadastral: SituacaoCadastral;
  motivo_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  email?: string;
  telefone?: string;
  qsa?: SocioQSA[];
  data_abertura?: string;
  natureza_juridica?: string;
}

export interface Cliente {
  id: string;
  empresa_id: string;
  razao_social_nome: string;
  nome_fantasia?: string;
  cnpj_cpf: string;
  cnae_principal?: string;
  cnae_descricao?: string;
  situacao_cadastral: SituacaoCadastral;
  motivo_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  email?: string;
  telefone?: string;
  qsa?: SocioQSA[];
  bloqueio_fiscal: boolean;
  ultima_sincronizacao_rfb?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClienteHistoricoAlteracao {
  id: string;
  empresa_id: string;
  cliente_id: string;
  campo_alterado: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  origem_alteracao: 'AUTO_SYNC_RFB' | 'MANUAL' | 'WEBHOOK_RECEITA';
  data_vigencia: string;
  registrado_em: string;
  notificado: boolean;
}
