import * as crypto from 'crypto';
import {
  ParsedOfxDocument,
  OfxTransaction,
  OfxAccountInfo,
  OfxBalance,
  TipoTransacaoBancaria,
  CategoriaFinanceiraTransacao
} from './ofx.types';
import {
  classificarLancamento,
  extrairDocumento,
  extrairNomeContraparte,
  normalizarMemo
} from './ofx-classificador';

/**
 * ============================================================================
 * OFX PARSER (ITAU, BRADESCO, BB, SANTANDER)
 * ============================================================================
 *
 * [ERROS ANTERIORES]:
 * 1. A deteccao de linha de saldo nao casava com o memo real do Itau
 *    ('SALDO APLICACAO AUTOMATICA'), classificando 284 fotografias de saldo
 *    como movimentacao -- R$ 40,8 milhoes de ruido. Corrigido em
 *    ofx-classificador.ts.
 * 2. A categoria de rendimento era gravada como 'RECEITA_FINANCEIRA_JUROS'
 *    enquanto os consumidores consultavam 'RECEITA_FINANCEIRA_RENDIMENTOS'.
 *    Nenhuma linha batia e os rendimentos de CDI apareciam como R$ 0,00 em
 *    todo o sistema. O nome canonico agora e um so, vindo do enum tipado.
 * 3. As regras de classificacao viviam aqui dentro, misturadas ao parsing, em
 *    listas de 'includes' que cresciam a cada formato novo descoberto.
 *
 * [COMO FOI CORRIGIDO]:
 * Este arquivo faz apenas o parsing do formato OFX. A classificacao contabil
 * mora em ofx-classificador.ts, isolada e testavel sem precisar de um arquivo
 * OFX inteiro.
 * ============================================================================
 */
export class OfxParser {
  static parse(content: string, empresaId: string): ParsedOfxDocument {
    const account = this.extrairConta(content);
    const periodo = this.extrairPeriodo(content);
    const balance = this.extrairSaldo(content);

    const transactions: OfxTransaction[] = [];
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;

    let saldoAnteriorExtrato: number | undefined;
    let totalCreditos = 0;
    let totalDebitos = 0;
    let totalCreditosOperacionais = 0;
    let totalDebitosOperacionais = 0;
    let totalRendimentosFinanceiros = 0;
    let totalAplicacoesAutomaticas = 0;
    let totalResgatesAutomaticos = 0;

    let match: RegExpExecArray | null;
    while ((match = trnRegex.exec(content)) !== null) {
      const bloco = match[1];

      const rawType = this.tag(bloco, 'TRNTYPE')?.toUpperCase() || 'OTHER';
      const trntype: TipoTransacaoBancaria =
        rawType === 'CREDIT' ? 'CREDIT' : rawType === 'DEBIT' ? 'DEBIT' : 'OTHER';

      const dtpostedRaw = this.tag(bloco, 'DTPOSTED') || '';
      const dataLancamento = this.formatarData(dtpostedRaw);
      if (!dataLancamento) {
        // Sem data valida nao ha lancamento contabil possivel. O codigo antigo
        // caia em 'new Date()' -- a data da IMPORTACAO -- silenciosamente
        // colocando o lancamento no dia errado.
        console.warn(`[OFX PARSER] Lancamento ignorado: DTPOSTED invalido ('${dtpostedRaw}').`);
        continue;
      }

      const valor = this.paraNumero(this.tag(bloco, 'TRNAMT'));
      const fitid = this.tag(bloco, 'FITID') || '';
      const checknum = this.tag(bloco, 'CHECKNUM') || undefined;
      const memo = this.tag(bloco, 'MEMO') || '';

      const c = classificarLancamento(memo, valor);

      if (/\bSALDO ANTERIOR\b|\bSDO ANTERIOR\b/.test(normalizarMemo(memo))) {
        saldoAnteriorExtrato = valor;
      }

      /**
       * Idempotencia.
       *
       * O FITID sozinho nao serve: o Bradesco reaproveita o mesmo FITID em
       * lancamentos diferentes (ha 'N1010F' repetido 9 vezes na mesma conta).
       * A assinatura combina tenant, banco, conta, FITID, data, valor e memo --
       * duas linhas so colidem se forem de fato a mesma linha.
       */
      const assinatura = [
        empresaId,
        account.bankId,
        account.acctId,
        fitid,
        dataLancamento,
        valor.toFixed(2),
        c.memoNormalizado
      ].join('|');
      const idempotencyHash = crypto.createHash('sha256').update(assinatura).digest('hex');

      // Totalizacao: linhas de saldo NAO entram em nenhum total.
      if (!c.isSaldoInformativo) {
        if (valor > 0) totalCreditos += valor;
        else totalDebitos += Math.abs(valor);

        if (c.isRendimentoFinanceiro) {
          totalRendimentosFinanceiros += valor;
        } else if (c.isAplicacaoAutomatica) {
          if (valor < 0) totalAplicacoesAutomaticas += Math.abs(valor);
          else totalResgatesAutomaticos += valor;
        } else {
          if (valor > 0) totalCreditosOperacionais += valor;
          else totalDebitosOperacionais += Math.abs(valor);
        }
      }

      transactions.push({
        bankId: account.bankId,
        acctId: account.acctId,
        trntype,
        dtpostedRaw,
        dataLancamento,
        valor,
        fitid,
        checknum,
        memo,
        documentoContraparte: extrairDocumento(memo),
        nomeContraparte: extrairNomeContraparte(memo),
        categoriaSugerida: c.categoria as CategoriaFinanceiraTransacao,
        isSaldoInformativo: c.isSaldoInformativo,
        isAplicacaoAutomatica: c.isAplicacaoAutomatica,
        isRendimentoFinanceiro: c.isRendimentoFinanceiro,
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
      saldoAnteriorExtrato,
      totalCreditosOperacionais,
      totalDebitosOperacionais,
      totalRendimentosFinanceiros,
      fluxoOperacionalLiquido: totalCreditosOperacionais - totalDebitosOperacionais,
      totalAplicacoesAutomaticas,
      totalResgatesAutomaticos
    };
  }

  /**
   * Prova de conciliacao (Teorema Delta):
   *   saldo_anterior + movimentacao_real == saldo_final do extrato
   *
   * Como as linhas de saldo agora ficam de fora da movimentacao, este delta
   * fecha em 0,00. Antes fechava com milhoes de diferenca.
   */
  static conferirDelta(doc: ParsedOfxDocument): {
    fecha: boolean;
    delta: number;
    saldoCalculado: number | null;
    saldoExtrato: number | null;
  } {
    const saldoExtrato = doc.balance?.ledgerBalance ?? null;
    if (saldoExtrato === null || doc.saldoAnteriorExtrato === undefined) {
      return { fecha: false, delta: 0, saldoCalculado: null, saldoExtrato };
    }
    const saldoCalculado = doc.saldoAnteriorExtrato + doc.fluxoLiquido;
    const delta = Math.round((saldoCalculado - saldoExtrato) * 100) / 100;
    return { fecha: Math.abs(delta) < 0.01, delta, saldoCalculado, saldoExtrato };
  }

  // -------------------------------------------------------------------------
  private static tag(bloco: string, nome: string): string | null {
    const m = bloco.match(new RegExp(`<${nome}>([\\s\\S]*?)(?:<|\\r?\\n)`));
    return m ? m[1].trim() : null;
  }

  private static extrairConta(content: string): OfxAccountInfo {
    const bankId = this.tag(content, 'BANKID') || '';
    const acctId = this.tag(content, 'ACCTID') || '';
    const branchId = this.tag(content, 'BRANCHID') || undefined;

    const bancos: Record<string, string> = {
      '0341': 'Itau Unibanco',
      '341': 'Itau Unibanco',
      '0237': 'Banco Bradesco',
      '237': 'Banco Bradesco',
      '0001': 'Banco do Brasil',
      '001': 'Banco do Brasil',
      '0033': 'Banco Santander',
      '033': 'Banco Santander',
      '0104': 'Caixa Economica Federal',
      '0260': 'Nu Pagamentos',
      '0077': 'Banco Inter'
    };

    return {
      bankId,
      bankName: bancos[bankId] || 'Instituicao Financeira',
      acctId,
      branchId,
      acctType: this.tag(content, 'ACCTTYPE') || 'CHECKING',
      currency: this.tag(content, 'CURDEF') || 'BRL'
    };
  }

  private static extrairPeriodo(content: string) {
    const dtStartRaw = this.tag(content, 'DTSTART') || undefined;
    const dtEndRaw = this.tag(content, 'DTEND') || undefined;
    return {
      dtStartRaw,
      dtEndRaw,
      dtStart: dtStartRaw ? this.formatarData(dtStartRaw) ?? undefined : undefined,
      dtEnd: dtEndRaw ? this.formatarData(dtEndRaw) ?? undefined : undefined
    };
  }

  private static extrairSaldo(content: string): OfxBalance | undefined {
    const balAmt = content.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([\s\S]*?)(?:<|\r?\n)/);
    if (!balAmt) return undefined;
    const dtAsOf = content.match(/<LEDGERBAL>[\s\S]*?<DTASOF>([\s\S]*?)(?:<|\r?\n)/);
    const dtAsOfRaw = dtAsOf ? dtAsOf[1].trim() : undefined;
    return {
      ledgerBalance: this.paraNumero(balAmt[1]),
      dtAsOfRaw,
      dateStr: dtAsOfRaw ? this.formatarData(dtAsOfRaw) ?? undefined : undefined
    };
  }

  /**
   * Normaliza o separador decimal. O Itau emite '1234.56' e o Bradesco
   * '1234,56'; alguns arquivos trazem separador de milhar.
   */
  private static paraNumero(raw: string | null | undefined): number {
    if (!raw) return 0;
    let s = String(raw).trim();
    if (s.includes(',') && s.includes('.')) {
      // '1.234,56' -> ponto e separador de milhar
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  /** YYYYMMDD[HHMMSS] -> YYYY-MM-DD. Devolve null quando a data nao e valida. */
  private static formatarData(raw: string): string | null {
    if (!raw || raw.length < 8) return null;
    const yyyy = raw.substring(0, 4);
    const mm = raw.substring(4, 6);
    const dd = raw.substring(6, 8);
    if (yyyy === '0000' || mm === '00' || dd === '00') return null;

    const ano = Number(yyyy);
    const mes = Number(mm);
    const dia = Number(dd);
    if (!ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

    // Rejeita datas como 31/02 em vez de deixar o Date "corrigir" para 03/03.
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;

    return `${yyyy}-${mm}-${dd}`;
  }
}
