export type TipoTransacaoBancaria = 'CREDIT' | 'DEBIT' | 'OTHER';
export type StatusConciliacao = 'PENDENTE' | 'CONCILIADO_AUTOMATICO' | 'CONCILIADO_MANUAL' | 'IGNORADO';

/**
 * Categorias financeiras estruturadas para segregação contábil estrita:
 * 
 * ERRO ANTERIOR: O sistema somava aplicações e resgates automáticos diários (overnight CDI)
 * como se fossem receitas e despesas operacionais, inflando o fluxo em mais de R$ 1,47 Milhão.
 * 
 * CORREÇÃO: Segregação estrita entre movimentação de liquidez bancária interna vs operação comercial real.
 */
export type CategoriaFinanceiraTransacao = 
  | 'RECEBIMENTO_CLIENTES'
  | 'FORNECEDORES_OPERACIONAIS'
  | 'IMPOSTOS_E_TRIBUTOS'
  | 'REPASSES_SOCIOS_DIRETORIA'
  | 'INTERCOMPANY_HOLDING'
  | 'TARIFAS_E_DESPESAS_BANCARIAS'
  | 'OUTRAS_DESPESAS_OPERACIONAIS'
  | 'APLICACAO_RESGATE_AUTOMATICO'
  | 'INFORMATIVO_SALDO';

export interface OfxTransaction {
  bankId: string;
  acctId: string;
  trntype: TipoTransacaoBancaria;
  dtpostedRaw: string;
  dataLancamento: string; // YYYY-MM-DD
  valor: number;
  fitid: string;
  checknum?: string;
  memo: string;
  documentoContraparte?: string | null; // CNPJ ou CPF extraído do memo
  nomeContraparte?: string | null;
  categoriaSugerida: CategoriaFinanceiraTransacao;
  isSaldoInformativo: boolean;
  isAplicacaoAutomatica: boolean; // Flag indicando se é varredura de liquidez overnight
  idempotencyHash: string;
}

export interface OfxAccountInfo {
  bankId: string;
  bankName: string;
  acctId: string;
  branchId?: string;
  acctType: string;
  currency: string;
}

export interface OfxBalance {
  ledgerBalance: number;
  dtAsOfRaw?: string;
  dateStr?: string;
}

export interface ParsedOfxDocument {
  account: OfxAccountInfo;
  periodo: {
    dtStartRaw?: string;
    dtEndRaw?: string;
    dtStart?: string;
    dtEnd?: string;
  };
  balance?: OfxBalance;
  transactions: OfxTransaction[];
  totalTransacoes: number;
  // Totais Brutos Bancários
  totalCreditos: number;
  totalDebitos: number;
  fluxoLiquido: number;
  // Totais Operacionais Reais (Excluindo Aplicações Automáticas e Saldos Informativos)
  totalCreditosOperacionais: number;
  totalDebitosOperacionais: number;
  fluxoOperacionalLiquido: number;
  totalAplicacoesAutomaticas: number;
  totalResgatesAutomaticos: number;
}

export interface OfxImportResult {
  importacaoId: string;
  empresaId: string;
  contaBancariaId: string;
  banco: string;
  conta: string;
  nomeArquivo: string;
  arquivoHashSha256: string;
  periodoInicio?: string;
  periodoFim?: string;
  totalTransacoesArquivo: number;
  transacoesInseridas: number;
  transacoesDuplicadasIgnoradas: number;
  transacoesInformativasIgnoradas: number;
  transacoesAplicacoesAutomaticas: number;
  saldoFinalExtrato?: number;
  conciliadoComSucesso: boolean;
}

