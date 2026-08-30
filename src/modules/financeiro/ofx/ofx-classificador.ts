import { CategoriaFinanceiraTransacao } from './ofx.types';

/**
 * ============================================================================
 * CLASSIFICADOR DE LANCAMENTOS BANCARIOS
 * ============================================================================
 *
 * [ERRO ANTERIOR - CUSTOU R$ 40,8 MILHOES DE RUIDO CONTABIL]:
 *
 * A deteccao de linha informativa de saldo comparava substrings literais:
 *
 *     memoUpper.includes('SALDO APLIC. AUT.')   // com pontos
 *     memoUpper.includes('SALDO APLIC AUTOM')   // abreviado
 *
 * O memo que o Itau realmente emite e 'SALDO APLICACAO AUTOMATICA' (acentuado,
 * por extenso). Nenhum dos dois padroes casa: depois de 'APLIC' vem 'ACAO',
 * nao ' AUT'. As 284 linhas de saldo diario -- que sao FOTOGRAFIAS do saldo, e
 * nao movimentacao -- escaparam do filtro e foram classificadas como varredura
 * de liquidez, somando R$ 40.874.212,36 em movimentacao que nunca existiu.
 *
 * Consequencia direta: o "Teorema Delta" do README, que deveria provar
 * saldo_interno - saldo_extrato = 0,00, fechava com -R$ 18,7 mi numa conta e
 * -R$ 22,1 mi na outra.
 *
 * [COMO FOI CORRIGIDO]:
 * 1. O memo passa por normalizacao (maiusculas, sem acento, sem pontuacao,
 *    espacos colapsados) ANTES de qualquer comparacao. 'APLICACAO AUTOMATICA' e
 *    'APLIC. AUT.' viram a mesma coisa.
 * 2. As regras viram expressoes regulares sobre o texto normalizado, em vez de
 *    listas de variantes escritas a mao -- que so cresciam quando alguem
 *    descobria mais um formato.
 * 3. Precedencia explicita e testada: SALDO sempre ganha de tudo.
 * ============================================================================
 */

/**
 * Normaliza o memo para comparacao: sem acento, sem pontuacao, espacos unicos.
 *   'SALDO APLICACAO AUTOMATICA' -> 'SALDO APLICACAO AUTOMATICA'
 *   'RESG.INVEST FACILCRED*'     -> 'RESG INVEST FACILCRED'
 *   'APL. AUT.'                  -> 'APL AUT'
 */
export function normalizarMemo(memo: string): string {
  return (memo || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacriticos combinantes
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')    // pontuacao vira espaco
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Linha informativa de saldo: fotografia do saldo, nao movimentacao.
 * Precisa ser detectada ANTES de qualquer outra regra -- foi exatamente a
 * inversao dessa precedencia que gerou o erro dos R$ 40,8 milhoes.
 */
const RE_SALDO_INFORMATIVO = [
  /^SALDO\b/,                       // SALDO APLICACAO AUTOMATICA, SALDO ANTERIOR, SALDO TOTAL DISPONIVEL...
  /^SDO\b/,                         // SDO APLIC AUT MAIS AP, SDO ANTERIOR
  /\bSALDO (ANTERIOR|DO DIA|TOTAL|DISPONIVEL|EM CONTA|BLOQUEADO)\b/,
  /\bSALDO (APLIC|APLICACAO|INVEST)/,
  /\bSALDO MOVIMENTACAO CONTA\b/
];

/**
 * Rendimento financeiro: juros de CDI / rentabilidade de aplicacao.
 * Receita de fato, mas financeira -- nao pode entrar no faturamento comercial.
 */
const RE_RENDIMENTO = [
  /\bREND(IMENTO|IMENTOS)?\b/,
  /\bREND PAGO\b/,
  /\bRENTAB(ILIDADE)?\b/,
  /\bREMUNERACAO APLIC/,
  /\bJUROS (APLIC|SOBRE APLIC|REMUNERAT)/,
  /\bCREDITO DE RENDIMENTO\b/
];

/**
 * Varredura automatica de liquidez (sweep overnight). Movimento entre a conta
 * corrente e a aplicacao do mesmo titular: neutro para a DRE.
 */
const RE_SWEEP = [
  /\bAPL(IC)?\b.*\bAUT/,           // APL APLIC AUT MAIS, APLIC AUTOMATICA
  /\bRES(G|GATE)?\b.*\bAPLIC/,     // RES APLIC AUT MAIS, RESGATE APLICACAO
  /\bAPLICACAO AUTOMATICA\b/,
  /\bRESGATE AUTOMATICO\b/,
  /\bINVEST FACIL\b/,
  /\bAPL(IC)? INVEST\b/,
  /\bRESG INVEST\b/,
  /\bAPL AUT\b/,
  /\bRESG AUT\b/
];

const RE_TRIBUTO = [
  /\bDAS\b/, /\bDARF\b/, /\bGPS\b/, /\bFGTS\b/, /\bGRF\b/,
  /\bSIMPLES NACIONAL\b/, /\bRECEITA FEDERAL\b/, /\bTRIBUTO/, /\bIMPOSTO/,
  /\bINSS\b/, /\bISS\b/, /\bIPTU\b/, /\bIPVA\b/, /\bGARE\b/
];

const RE_TARIFA = [
  /\bTAR\b/, /\bTARIFA/, /\bCESTA\b/, /\bPACOTE (DE )?SERVICOS\b/,
  /\bIOF\b/, /\bMANUTENCAO DE CONTA\b/, /\bCUSTAS? (DE )?COBRANCA\b/,
  /\bANUIDADE\b/, /\bTAXA (BANCARIA|DE SERVICO)\b/
];

const RE_SOCIO = [
  /\bPRO ?LABORE\b/, /\bDISTRIBUICAO DE LUCROS\b/, /\bDIVIDENDO/,
  /\bAPORTE\b/, /\bMUTUO\b/, /\bRETIRADA DE SOCIO\b/
];

const RE_INTERCOMPANY = [/\bMITANG\b/, /\bARANDU\b/, /\bSEA HOUSE\b/];

const RE_FORNECEDOR = [
  /\bFORNECEDOR/, /\bPAG(TO|AMENTO)? (ELETRON|BOLETO|FORNECEDOR)/,
  /\bSTREMA\b/, /\bSBT\b/, /\bHAYAMAX\b/, /\bRYNDACK\b/, /\bINSETISAN\b/,
  /\bLIGHT\b/, /\bCLARO\b/, /\bVIVO\b/, /\bENEL\b/, /\bCEDAE\b/
];

const casaAlguma = (texto: string, regras: RegExp[]) => regras.some((r) => r.test(texto));

export interface ClassificacaoLancamento {
  memoNormalizado: string;
  isSaldoInformativo: boolean;
  isRendimentoFinanceiro: boolean;
  isAplicacaoAutomatica: boolean;
  categoria: CategoriaFinanceiraTransacao;
}

/**
 * Classifica um lancamento com precedencia explicita:
 *
 *   1. SALDO       -- fotografia, nao movimentacao. Sempre ganha.
 *   2. RENDIMENTO  -- 'REND PAGO APLIC AUT MAIS' e rendimento, nao sweep,
 *                     apesar de conter 'APLIC AUT'.
 *   3. SWEEP       -- varredura de liquidez, neutra.
 *   4. Natureza da despesa/receita operacional.
 *
 * A ordem importa: 2 antes de 3 impede que os 88 lancamentos de
 * 'RENDIMENTOS REND PAGO APLIC AUT MAIS' virem custodia, como estao hoje no
 * banco.
 */
export function classificarLancamento(memo: string, valor: number): ClassificacaoLancamento {
  const m = normalizarMemo(memo);

  if (casaAlguma(m, RE_SALDO_INFORMATIVO)) {
    return {
      memoNormalizado: m,
      isSaldoInformativo: true,
      isRendimentoFinanceiro: false,
      isAplicacaoAutomatica: false,
      categoria: 'INFORMATIVO_SALDO'
    };
  }

  if (casaAlguma(m, RE_RENDIMENTO)) {
    return {
      memoNormalizado: m,
      isSaldoInformativo: false,
      isRendimentoFinanceiro: true,
      isAplicacaoAutomatica: false,
      categoria: 'RECEITA_FINANCEIRA_JUROS'
    };
  }

  if (casaAlguma(m, RE_SWEEP)) {
    return {
      memoNormalizado: m,
      isSaldoInformativo: false,
      isRendimentoFinanceiro: false,
      isAplicacaoAutomatica: true,
      categoria: 'APLICACAO_RESGATE_AUTOMATICO'
    };
  }

  let categoria: CategoriaFinanceiraTransacao;
  if (casaAlguma(m, RE_TRIBUTO)) categoria = 'IMPOSTOS_E_TRIBUTOS';
  else if (casaAlguma(m, RE_SOCIO)) categoria = 'REPASSES_SOCIOS_DIRETORIA';
  else if (casaAlguma(m, RE_INTERCOMPANY)) categoria = 'INTERCOMPANY_HOLDING';
  else if (casaAlguma(m, RE_TARIFA)) categoria = 'TARIFAS_E_DESPESAS_BANCARIAS';
  else if (casaAlguma(m, RE_FORNECEDOR)) categoria = 'FORNECEDORES_OPERACIONAIS';
  else categoria = valor > 0 ? 'RECEBIMENTO_CLIENTES' : 'OUTRAS_DESPESAS_OPERACIONAIS';

  return {
    memoNormalizado: m,
    isSaldoInformativo: false,
    isRendimentoFinanceiro: false,
    isAplicacaoAutomatica: false,
    categoria
  };
}

/**
 * Extrai CNPJ ou CPF do memo.
 *
 * [ERRO ANTERIOR]: exigia a mascara pontuada
 *     memo.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)
 * e perdia todo documento vindo sem formatacao, o que e comum no Bradesco.
 */
export function extrairDocumento(memo: string): string | null {
  const comMascaraCnpj = memo.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (comMascaraCnpj) return comMascaraCnpj[0].replace(/\D/g, '');

  const comMascaraCpf = memo.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  if (comMascaraCpf) return comMascaraCpf[0].replace(/\D/g, '');

  // Sem mascara: sequencia isolada de 14 (CNPJ) ou 11 (CPF) digitos.
  const cru = memo.match(/(?<!\d)(\d{14}|\d{11})(?!\d)/);
  return cru ? cru[1] : null;
}

/**
 * Extrai o nome da contraparte a partir dos formatos de memo dos bancos.
 */
export function extrairNomeContraparte(memo: string): string | null {
  const m = normalizarMemo(memo);

  const padroes = [
    /(?:RECEBIMENTOS SISPAG|RECEBIMENTOS|PAGAMENTOS A FORNECEDORES|PAGAMENTO FORNECEDOR)\s+(.+?)(?:\s+\d{11,14}|$)/,
    /(?:PIX (?:TRANSF|RECEBIDO|ENVIADO)|TRANSF PGTO|TED|DOC)\s*(?:REM|DES|PARA|DE)?\s*[: ]?\s*(.+?)(?:\s+\d{11,14}|$)/,
    /(?:REM|DES)\s*[: ]\s*(.+?)(?:\s+\d{11,14}|$)/
  ];

  for (const p of padroes) {
    const r = m.match(p);
    if (r && r[1]) {
      const nome = r[1].replace(/\b\d{5,}\b/g, '').trim();
      if (nome.length > 3) return nome;
    }
  }
  return null;
}
