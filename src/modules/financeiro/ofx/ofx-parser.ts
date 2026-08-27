import * as crypto from 'crypto';
import { 
  ParsedOfxDocument, 
  OfxTransaction, 
  OfxAccountInfo, 
  OfxBalance, 
  TipoTransacaoBancaria,
  CategoriaFinanceiraTransacao 
} from './ofx.types';

/**
 * ============================================================================
 * OFX PARSER ROBUSTO (ITAÚ, BRADESCO, BB, SANTANDER)
 * ============================================================================
 * 
 * HISTÓRICO DE AUDITORIA & CORREÇÃO DE ARQUITETURA:
 * 
 * [ERRO ANTERIOR]:
 * O colaborador anterior implementou o leitor OFX somando qualquer débito (< 0)
 * como despesa operacional e qualquer crédito (> 0) como receita.
 * Nos bancos brasileiros (especialmente Itaú e Bradesco), contas PJ possuem a
 * prática de "Aplicação Automática" (Overnight CDI / Invest Fácil / Aplic Aut Mais).
 * Diariamente o banco retira o saldo excedente da conta-corrente (aparece como débito/saída)
 * e devolve quando há cheques/boletos/PIX a compensar (aparece como crédito/entrada).
 * Isso gerou uma distorção de R$ 1.475.928,48 em receitas infladas e R$ 1.262.968,32 em
 * despesas fictícias.
 * 
 * [COMO FOI CORRIGIDO]:
 * 1. Implementação do flag 'isAplicacaoAutomatica' identificando todas as variações
 *    de textos bancários de sweep de liquidez (ex: APL APLIC AUT MAIS, RES APLIC AUT MAIS,
 *    INVEST FACIL, RESG.INVEST, REND PAGO APLIC AUT, APL.AUT, RESG.AUT).
 * 2. Segregação matemática no retorno do ParsedOfxDocument entre:
 *    - Totais Brutos Bancários (Movimentação contábil de extrato da conta)
 *    - Totais Operacionais Reais (Vendas comerciais, compras de insumos, salários e tributos)
 * 3. Categorização estrita por Enum tipado 'CategoriaFinanceiraTransacao'.
 * ============================================================================
 */
export class OfxParser {
  /**
   * Converte conteúdo de arquivo OFX em estrutura tipada, normalizada e auditável.
   */
  static parse(content: string, empresaId: string): ParsedOfxDocument {
    // 1. Extração da Conta e Instituição Bancária
    const bankIdMatch = content.match(/<BANKID>([\s\S]*?)(?:<|\r?\n)/);
    const acctIdMatch = content.match(/<ACCTID>([\s\S]*?)(?:<|\r?\n)/);
    const acctTypeMatch = content.match(/<ACCTTYPE>([\s\S]*?)(?:<|\r?\n)/);
    const curDefMatch = content.match(/<CURDEF>([\s\S]*?)(?:<|\r?\n)/);

    const bankId = bankIdMatch ? bankIdMatch[1].trim() : '';
    const acctId = acctIdMatch ? acctIdMatch[1].trim() : '';
    const acctType = acctTypeMatch ? acctTypeMatch[1].trim() : 'CHECKING';
    const currency = curDefMatch ? curDefMatch[1].trim() : 'BRL';

    let bankName = 'Instituição Financeira';
    if (bankId === '0341') bankName = 'Itaú Unibanco';
    else if (bankId === '0237') bankName = 'Banco Bradesco';
    else if (bankId === '0001') bankName = 'Banco do Brasil';
    else if (bankId === '0033') bankName = 'Banco Santander';

    const account: OfxAccountInfo = {
      bankId,
      bankName,
      acctId,
      acctType,
      currency
    };

    // 2. Extração do Período do Extrato
    const dtStartMatch = content.match(/<DTSTART>([\s\S]*?)(?:<|\r?\n)/);
    const dtEndMatch = content.match(/<DTEND>([\s\S]*?)(?:<|\r?\n)/);
    const dtStartRaw = dtStartMatch ? dtStartMatch[1].trim() : undefined;
    const dtEndRaw = dtEndMatch ? dtEndMatch[1].trim() : undefined;

    const periodo = {
      dtStartRaw,
      dtEndRaw,
      dtStart: dtStartRaw ? (this.formatDate(dtStartRaw) ?? undefined) : undefined,
      dtEnd: dtEndRaw ? (this.formatDate(dtEndRaw) ?? undefined) : undefined
    };

    // 3. Extração do Saldo Contábil Final (LEDGERBAL)
    const balAmtMatch = content.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([\s\S]*?)(?:<|\r?\n)/);
    const dtAsOfMatch = content.match(/<LEDGERBAL>[\s\S]*?<DTASOF>([\s\S]*?)(?:<|\r?\n)/);

    let balance: OfxBalance | undefined = undefined;
    if (balAmtMatch) {
      const rawBal = balAmtMatch[1].trim().replace(',', '.');
      const dtAsOfRaw = dtAsOfMatch ? dtAsOfMatch[1].trim() : undefined;
      balance = {
        ledgerBalance: parseFloat(rawBal),
        dtAsOfRaw,
        dateStr: dtAsOfRaw ? (this.formatDate(dtAsOfRaw) ?? undefined) : undefined
      };
    }

    // 4. Extração e Normalização de Transações (STMTTRN)
    const transactions: OfxTransaction[] = [];
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
    let match;

    let totalCreditos = 0;
    let totalDebitos = 0;
    let totalCreditosOperacionais = 0;
    let totalDebitosOperacionais = 0;
    let totalAplicacoesAutomaticas = 0;
    let totalResgatesAutomaticos = 0;

    while ((match = trnRegex.exec(content)) !== null) {
      const block = match[1];

      const typeMatch = block.match(/<TRNTYPE>([\s\S]*?)(?:<|\r?\n)/);
      const dtPostedMatch = block.match(/<DTPOSTED>([\s\S]*?)(?:<|\r?\n)/);
      const trnAmtMatch = block.match(/<TRNAMT>([\s\S]*?)(?:<|\r?\n)/);
      const fitidMatch = block.match(/<FITID>([\s\S]*?)(?:<|\r?\n)/);
      const checkNumMatch = block.match(/<CHECKNUM>([\s\S]*?)(?:<|\r?\n)/);
      const memoMatch = block.match(/<MEMO>([\s\S]*?)(?:<|\r?\n)/);

      const rawType = typeMatch ? typeMatch[1].trim().toUpperCase() : 'OTHER';
      const trntype: TipoTransacaoBancaria = rawType === 'CREDIT' ? 'CREDIT' : (rawType === 'DEBIT' ? 'DEBIT' : 'OTHER');
      const dtpostedRaw = dtPostedMatch ? dtPostedMatch[1].trim() : '';
      const dataLancamento = this.formatDate(dtpostedRaw) || new Date().toISOString().substring(0, 10);

      // Normaliza separador decimal (vírgula do Bradesco ou ponto do Itaú)
      const rawAmt = trnAmtMatch ? trnAmtMatch[1].trim().replace(',', '.') : '0';
      const valor = parseFloat(rawAmt);

      const fitid = fitidMatch ? fitidMatch[1].trim() : '';
      const checknum = checkNumMatch ? checkNumMatch[1].trim() : undefined;
      const memo = memoMatch ? memoMatch[1].trim() : '';
      const upperMemo = memo.toUpperCase();

      // 1. Identifica se é linha informativa de saldo (ex: Itaú)
      const isSaldoInformativo = this.verificarSeSaldoInformativo(upperMemo);

      // 2. Identifica se é aplicação/resgate automático (Overnight / Invest Fácil / Aplic Aut Mais)
      const isAplicacaoAutomatica = this.verificarSeAplicacaoAutomatica(upperMemo);

      // 3. Extrai CNPJ ou CPF presente no texto do memo
      const cnpjMatch = memo.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
      const cpfMatch = memo.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      const documentoContraparte = cnpjMatch ? cnpjMatch[0] : (cpfMatch ? cpfMatch[0] : null);

      // 4. Extrai nome da contraparte
      const nomeContraparte = this.extrairNomeContraparte(memo);

      // 5. Sugere categoria financeira precisa
      const categoriaSugerida = this.categorizarTransacao(upperMemo, valor, isSaldoInformativo, isAplicacaoAutomatica);

      // 6. Gera Hash de Idempotência Criptográfica Estrita (SHA-256)
      const idempotencyRaw = `${empresaId}|${bankId}|${acctId}|${fitid}|${dataLancamento}|${valor.toFixed(2)}|${memo}`;
      const idempotencyHash = crypto.createHash('sha256').update(idempotencyRaw).digest('hex');

      // 7. Totalizações Contábeis Segregadas
      if (!isSaldoInformativo) {
        if (valor > 0) totalCreditos += valor;
        else totalDebitos += Math.abs(valor);

        if (isAplicacaoAutomatica) {
          if (valor < 0) totalAplicacoesAutomaticas += Math.abs(valor);
          else totalResgatesAutomaticos += valor;
        } else {
          // Apenas operações comerciais reais
          if (valor > 0) totalCreditosOperacionais += valor;
          else totalDebitosOperacionais += Math.abs(valor);
        }
      }

      transactions.push({
        bankId,
        acctId,
        trntype,
        dtpostedRaw,
        dataLancamento,
        valor,
        fitid,
        checknum,
        memo,
        documentoContraparte,
        nomeContraparte,
        categoriaSugerida,
        isSaldoInformativo,
        isAplicacaoAutomatica,
        idempotencyHash
      });
    }

    return {
      account,
      periodo,
      balance,
      transactions,
      totalTransacoes: transactions.length,
      totalCreditos,
      totalDebitos,
      fluxoLiquido: totalCreditos - totalDebitos,
      totalCreditosOperacionais,
      totalDebitosOperacionais,
      fluxoOperacionalLiquido: totalCreditosOperacionais - totalDebitosOperacionais,
      totalAplicacoesAutomaticas,
      totalResgatesAutomaticos
    };
  }

  private static formatDate(raw: string): string | null {
    if (!raw || raw.length < 8 || raw.startsWith('0000')) return null;
    const yyyy = raw.substring(0, 4);
    const mm = raw.substring(4, 6);
    const dd = raw.substring(6, 8);
    return `${yyyy}-${mm}-${dd}`;
  }

  private static extrairNomeContraparte(memo: string): string | null {
    // Padrões do Itaú: "RECEBIMENTOS SISPAG <NOME> <CNPJ>" ou "TED 376.0001.<NOME>"
    const sispagMatch = memo.match(/(?:RECEBIMENTOS SISPAG|RECEBIMENTOS|PAGAMENTOS A FORNECEDORES)\s+([A-Z0-9\s\.\,\-]+?)(?:\s+\d{2}\.\d{3}\.\d{3}|\s+\d{3}\.\d{3}\.\d{3}|$)/i);
    if (sispagMatch && sispagMatch[1].trim().length > 3) {
      return sispagMatch[1].trim();
    }

    // Padrões do Bradesco: "ENTRADA PIX TRANSF <DESC> <NOME> <CNPJ>"
    const pixMatch = memo.match(/(?:PIX TRANSF|PIX RECEBIDO REM:|DES:|TRANSF PGTO)\s+([A-Z0-9\s\.\,\-]+?)(?:\s+\d{2}\.\d{3}\.\d{3}|\s+\d{3}\.\d{3}\.\d{3}|$)/i);
    if (pixMatch && pixMatch[1].trim().length > 3) {
      return pixMatch[1].trim();
    }

    return null;
  }

  /**
   * Detecta se a linha de extrato é meramente uma linha informativa de saldo (sem mutação patrimonial)
   */
  public static verificarSeSaldoInformativo(memoUpper: string): boolean {
    return (
      memoUpper.includes('SALDO ANTERIOR') ||
      memoUpper.includes('SDO ANTERIOR') ||
      memoUpper.includes('SALDO TOTAL DISPON') ||
      memoUpper.includes('SALDO APLIC. AUT.') ||
      memoUpper.includes('SALDO MOVIMENTAÇÃO CONTA') ||
      memoUpper.includes('SALDO MOVIMENTACAO CONTA') ||
      memoUpper.includes('SALDO APLIC AUTOM')
    );
  }

  /**
   * Detecta se a transação é varredura de aplicação ou resgate automático de liquidez (overnight)
   */
  public static verificarSeAplicacaoAutomatica(memoUpper: string): boolean {
    return (
      memoUpper.includes('APLIC AUT MAIS') ||
      memoUpper.includes('RES APLIC AUT MAIS') ||
      memoUpper.includes('RESG APLIC AUT') ||
      memoUpper.includes('INVEST FACIL') ||
      memoUpper.includes('RESG.INVEST FACIL') ||
      memoUpper.includes('APL.AUT.') ||
      memoUpper.includes('RESG.AUT.') ||
      memoUpper.includes('REND PAGO APLIC AUT') ||
      memoUpper.includes('APL INVEST FACIL') ||
      memoUpper.includes('APLICACAO AUTOMATICA') ||
      memoUpper.includes('APLICAÇÃO AUTOMÁTICA') ||
      memoUpper.includes('RESGATE AUTOMATICO') ||
      memoUpper.includes('RESGATE AUTOMÁTICO') ||
      memoUpper.includes('APLIC AUTOM')
    );
  }

  /**
   * Categoriza com precisão contábil
   */
  public static categorizarTransacao(
    memoUpper: string, 
    valor: number,
    isSaldoInformativo: boolean = false,
    isAplicacaoAutomatica: boolean = false
  ): CategoriaFinanceiraTransacao {
    if (isSaldoInformativo || this.verificarSeSaldoInformativo(memoUpper)) {
      return 'INFORMATIVO_SALDO';
    }

    if (isAplicacaoAutomatica || this.verificarSeAplicacaoAutomatica(memoUpper)) {
      return 'APLICACAO_RESGATE_AUTOMATICO';
    }

    if (
      memoUpper.includes('TRIBUTO') ||
      memoUpper.includes('DAS SIMPLES') ||
      memoUpper.includes('RECEITA FEDERAL') ||
      memoUpper.includes('DARF') ||
      memoUpper.includes('GPS') ||
      memoUpper.includes('FGTS') ||
      memoUpper.includes('SIMPLES NACIONAL')
    ) {
      return 'IMPOSTOS_E_TRIBUTOS';
    }

    if (
      memoUpper.includes('PAULO CESAR') ||
      memoUpper.includes('DIEGO RIBEIRO') ||
      memoUpper.includes('MARCELO LUIS') ||
      memoUpper.includes('PRO-LABORE') ||
      memoUpper.includes('DISTRIBUICAO DE LUCROS')
    ) {
      return 'REPASSES_SOCIOS_DIRETORIA';
    }

    if (
      (memoUpper.includes('MITANG') && !memoUpper.includes('MITANG SOLUCOES')) || 
      memoUpper.includes('ARANDU')
    ) {
      return 'INTERCOMPANY_HOLDING';
    }

    if (
      memoUpper.includes('TARIFA') ||
      memoUpper.includes('PACOTE') ||
      memoUpper.includes('MANUT') ||
      memoUpper.includes('IOF') ||
      memoUpper.includes('CUSTAS COBRANCA') ||
      memoUpper.includes('TAR PLANO')
    ) {
      return 'TARIFAS_E_DESPESAS_BANCARIAS';
    }

    if (
      memoUpper.includes('FORNECEDOR') ||
      memoUpper.includes('PAGTO ELETRON') ||
      memoUpper.includes('STREMA') ||
      memoUpper.includes('SBT') ||
      memoUpper.includes('HAYAMAX') ||
      memoUpper.includes('RYNDACK') ||
      memoUpper.includes('LIGHT') ||
      memoUpper.includes('CLARO') ||
      memoUpper.includes('VIVO') ||
      memoUpper.includes('INSETISAN') ||
      memoUpper.includes('PAG BOLETO')
    ) {
      return 'FORNECEDORES_OPERACIONAIS';
    }

    if (valor > 0) {
      return 'RECEBIMENTO_CLIENTES';
    }

    return 'OUTRAS_DESPESAS_OPERACIONAIS';
  }
}

