export type TipoTransacaoBancaria = 'CREDIT' | 'DEBIT' | 'OTHER';
export type StatusConciliacao = 'PENDENTE' | 'CONCILIADO_AUTOMATICO' | 'CONCILIADO_MANUAL' | 'IGNORADO';

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
  categoriaSugerida: string;
  isSaldoInformativo: boolean;
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
  totalCreditos: number;
  totalDebitos: number;
  fluxoLiquido: number;
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
  saldoFinalExtrato?: number;
  conciliadoComSucesso: boolean;
}
