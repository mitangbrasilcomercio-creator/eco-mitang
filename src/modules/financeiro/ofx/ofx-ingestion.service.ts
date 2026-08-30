import * as crypto from 'crypto';
import { PoolClient } from 'pg';
import { withTenantTransaction, withTenantQuery, contextoTodosTenants } from '../../../core/database/supabase-pool';
import { globalEventBus } from '../../../core/events/event-bus';
import { OfxParser } from './ofx-parser';
import { OfxImportResult, ParsedOfxDocument } from './ofx.types';

/**
 * ============================================================================
 * INGESTAO DE EXTRATOS OFX
 * ============================================================================
 *
 * [ERROS ANTERIORES]:
 *
 * 1. CORRUPCAO MULTI-TENANT (110 linhas afetadas em producao).
 *    O servico resolvia corretamente o dono da conta:
 *        resolvedEmpresaId = existingAccountRes.rows[0].empresa_id;
 *    ...e depois gravava as transacoes com a OUTRA variavel:
 *        const insTxRes = await client.query(insTxQuery, [ empresaId, ... ])
 *    Resultado: 110 lancamentos ficaram com o empresa_id da Mitang Services
 *    dentro de contas da Mitang Brasil (48) e da Arandu (62).
 *
 * 2. SEM TRAVA DE REIMPORTACAO.
 *    'arquivo_hash_sha256' era gravado mas nunca conferido, e a coluna nao
 *    tinha UNIQUE. O mesmo extrato do Bradesco foi importado 13 vezes; o de
 *    abril do Itau, 3 vezes. Cada repeticao reexecutava o laco inteiro e
 *    reescrevia o saldo da conta.
 *
 * 3. N+1 DE CONSULTAS.
 *    Duas consultas por transacao (busca de cliente e de parcela). Num extrato
 *    de 400 linhas, 800 idas ao banco dentro de uma transacao aberta.
 *
 * 4. SALDO SOBRESCRITO SEM CRITERIO.
 *    Importar um extrato antigo rebaixava 'saldo_atual' para o saldo daquele
 *    mes.
 *
 * [COMO FOI CORRIGIDO]:
 * A conta bancaria e a autoridade sobre o CNPJ do lancamento (e o trigger da
 * migration 23 recusa qualquer coisa diferente). O hash do arquivo e conferido
 * antes de processar. Os vinculos sao resolvidos em lote. O saldo so avanca.
 * ============================================================================
 */

export interface ResultadoImportacao extends OfxImportResult {
  jaImportado: boolean;
  deltaConciliacao: { fecha: boolean; delta: number } | null;
}

export class OfxIngestionService {
  async importarOfx(
    empresaIdSugerida: string,
    nomeArquivo: string,
    conteudoOfx: string,
    importadoPor: string = 'SISTEMA_AUTO'
  ): Promise<ResultadoImportacao> {
    const arquivoHashSha256 = crypto.createHash('sha256').update(conteudoOfx).digest('hex');
    const parsed: ParsedOfxDocument = OfxParser.parse(conteudoOfx, empresaIdSugerida);
    const { account, periodo, balance, transactions } = parsed;

    if (!account.bankId || !account.acctId) {
      throw new Error(`Arquivo '${nomeArquivo}' nao traz BANKID/ACCTID. Nao e um OFX de extrato valido.`);
    }

    // ---------------------------------------------------------------------
    // 1. Resolucao do titular da conta.
    //
    // Esta consulta precisa enxergar as contas de TODOS os CNPJs: e ela que
    // descobre a qual empresa o extrato pertence. Feita com o contexto amplo de
    // manutencao -- e nao sem contexto nenhum, o que a RLS bloquearia,
    // fazendo o servico criar uma conta duplicada a cada importacao.
    // ---------------------------------------------------------------------
    const ctxDescoberta = await contextoTodosTenants();
    const contaRes = await withTenantQuery(ctxDescoberta, (client) =>
      client.query(
        `SELECT c.id, c.empresa_id, c.saldo_atual, c.data_ultimo_saldo, e.nome_fantasia
           FROM contas_bancarias c
           JOIN empresas e ON e.id = c.empresa_id
          WHERE c.banco_codigo = $1
            AND regexp_replace(c.conta_numero, '[^0-9]', '', 'g') = regexp_replace($2, '[^0-9]', '', 'g')
          LIMIT 1;`,
        [account.bankId, account.acctId]
      )
    );

    let contaBancariaId: string;
    let empresaId: string;
    let saldoAnteriorConta: Date | null = null;

    if (contaRes.rows.length > 0) {
      contaBancariaId = contaRes.rows[0].id;
      // A CONTA manda. Nao a empresa sugerida por quem chamou.
      empresaId = contaRes.rows[0].empresa_id;
      saldoAnteriorConta = contaRes.rows[0].data_ultimo_saldo;
    } else {
      empresaId = empresaIdSugerida;
      let agencia = account.branchId || '0001';
      // No Itau os 4 primeiros digitos do ACCTID sao a agencia.
      if ((account.bankId === '0341' || account.bankId === '341') && account.acctId.length >= 8) {
        agencia = account.acctId.substring(0, 4);
      }

      const novaConta = await withTenantTransaction(empresaId, (client) =>
        client.query(
          `INSERT INTO contas_bancarias
             (empresa_id, banco_codigo, banco_nome, agencia, conta_numero, moeda, saldo_atual, data_ultimo_saldo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id;`,
          [
            empresaId, account.bankId, account.bankName, agencia, account.acctId,
            account.currency || 'BRL', balance?.ledgerBalance ?? 0, balance?.dateStr || null
          ]
        )
      );
      contaBancariaId = novaConta.rows[0].id;
    }

    const ctx = { empresaId, empresaIds: [empresaId], userId: importadoPor };

    // ---------------------------------------------------------------------
    // 2. Trava de reimportacao: confere o hash ANTES de mexer em qualquer coisa.
    // ---------------------------------------------------------------------
    const jaImportado = await withTenantTransaction(ctx, (client) =>
      client.query(
        `SELECT id, transacoes_inseridas, created_at
           FROM extratos_ofx_importacoes
          WHERE conta_bancaria_id = $1 AND arquivo_hash_sha256 = $2
          LIMIT 1;`,
        [contaBancariaId, arquivoHashSha256]
      )
    );

    if (jaImportado.rows.length > 0) {
      const anterior = jaImportado.rows[0];
      console.log(
        `[OFX] '${nomeArquivo}' ja foi importado nesta conta em ` +
        `${new Date(anterior.created_at).toLocaleString('pt-BR')} ` +
        `(${anterior.transacoes_inseridas} lancamentos). Nada foi reprocessado.`
      );
      return this.montarResultado({
        importacaoId: anterior.id, empresaId, contaBancariaId, account, nomeArquivo,
        arquivoHashSha256, periodo, balance, parsed,
        inseridas: 0, duplicadas: transactions.length, jaImportado: true
      });
    }

    // ---------------------------------------------------------------------
    // 3. Ingestao propriamente dita, numa unica transacao.
    // ---------------------------------------------------------------------
    return withTenantTransaction(ctx, async (client: PoolClient) => {
      const importacao = await client.query(
        `INSERT INTO extratos_ofx_importacoes
           (empresa_id, conta_bancaria_id, nome_arquivo, arquivo_hash_sha256,
            dt_inicio_extrato, dt_fim_extrato, total_transacoes_arquivo,
            saldo_final_extrato, data_saldo_extrato, importado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id;`,
        [
          empresaId, contaBancariaId, nomeArquivo, arquivoHashSha256,
          periodo.dtStart || null, periodo.dtEnd || null, transactions.length,
          balance?.ledgerBalance ?? null, balance?.dateStr || null, importadoPor
        ]
      );
      const importacaoId = importacao.rows[0].id;

      // Mapa CNPJ -> cliente_id carregado UMA vez, em vez de uma consulta por
      // transacao (era metade do N+1).
      const documentos = [...new Set(transactions.map((t) => t.documentoContraparte).filter(Boolean))] as string[];
      const mapaClientes = new Map<string, string>();
      if (documentos.length > 0) {
        const clientes = await client.query(
          `SELECT id, regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') AS doc
             FROM clientes
            WHERE regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') = ANY($1::text[]);`,
          [documentos]
        );
        for (const c of clientes.rows) mapaClientes.set(c.doc, c.id);
      }

      let inseridas = 0;
      let duplicadas = 0;
      const LOTE = 200;

      for (let i = 0; i < transactions.length; i += LOTE) {
        const lote = transactions.slice(i, i + LOTE);

        // Insercao em lote via UNNEST: uma ida ao banco por lote, em vez de
        // uma por transacao.
        const res = await client.query(
          `INSERT INTO transacoes_bancarias (
             empresa_id, conta_bancaria_id, importacao_id, cliente_id,
             bank_id, acct_id, fitid, checknum, tipo_operacao, data_lancamento,
             dtposted_raw, valor, memo, documento_contraparte, nome_contraparte,
             categoria_financeira, is_saldo_informativo, status_conciliacao, idempotency_hash
           )
           SELECT $1, $2, $3, d.cliente_id,
                  d.bank_id, d.acct_id, d.fitid, d.checknum,
                  d.tipo_operacao::tipo_transacao_bancaria, d.data_lancamento::date,
                  d.dtposted_raw, d.valor::numeric, d.memo,
                  d.documento_contraparte, d.nome_contraparte,
                  d.categoria_financeira, d.is_saldo_informativo::boolean,
                  'PENDENTE'::status_conciliacao, d.idempotency_hash
             FROM unnest(
               $4::uuid[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
               $10::text[], $11::text[], $12::text[], $13::text[], $14::text[],
               $15::text[], $16::text[], $17::text[], $18::text[]
             ) AS d(cliente_id, bank_id, acct_id, fitid, checknum, tipo_operacao,
                    data_lancamento, dtposted_raw, valor, memo, documento_contraparte,
                    nome_contraparte, categoria_financeira, is_saldo_informativo,
                    idempotency_hash)
           ON CONFLICT (idempotency_hash) DO NOTHING
           RETURNING id;`,
          [
            empresaId,
            contaBancariaId,
            importacaoId,
            lote.map((t) => (t.documentoContraparte ? mapaClientes.get(t.documentoContraparte) ?? null : null)),
            lote.map((t) => t.bankId),
            lote.map((t) => t.acctId),
            lote.map((t) => t.fitid),
            lote.map((t) => t.checknum ?? null),
            lote.map((t) => t.trntype),
            lote.map((t) => t.dataLancamento),
            lote.map((t) => t.dtpostedRaw),
            lote.map((t) => String(t.valor)),
            lote.map((t) => t.memo),
            lote.map((t) => t.documentoContraparte ?? null),
            lote.map((t) => t.nomeContraparte ?? null),
            lote.map((t) => t.categoriaSugerida),
            lote.map((t) => String(t.isSaldoInformativo)),
            lote.map((t) => t.idempotencyHash)
          ]
        );

        inseridas += res.rowCount ?? 0;
        duplicadas += lote.length - (res.rowCount ?? 0);
      }

      /**
       * Saldo so avanca. Importar um extrato antigo nao pode rebaixar o saldo
       * atual da conta para o saldo daquele mes.
       */
      if (balance && balance.dateStr) {
        await client.query(
          `UPDATE contas_bancarias
              SET saldo_atual = $1, data_ultimo_saldo = $2, updated_at = NOW()
            WHERE id = $3
              AND (data_ultimo_saldo IS NULL OR data_ultimo_saldo <= $2::timestamptz);`,
          [balance.ledgerBalance, balance.dateStr, contaBancariaId]
        );
      }

      await client.query(
        `UPDATE extratos_ofx_importacoes
            SET transacoes_inseridas = $1, transacoes_duplicadas_ignoradas = $2
          WHERE id = $3;`,
        [inseridas, duplicadas, importacaoId]
      );

      const resultado = this.montarResultado({
        importacaoId, empresaId, contaBancariaId, account, nomeArquivo,
        arquivoHashSha256, periodo, balance, parsed,
        inseridas, duplicadas, jaImportado: false
      });

      await globalEventBus.publish({
        eventId: crypto.randomUUID(),
        eventType: 'FINANCEIRO.EXTRATO_OFX_IMPORTADO',
        timestamp: new Date().toISOString(),
        empresaId,
        payload: {
          importacao_id: importacaoId,
          empresa_id: empresaId,
          conta_bancaria_id: contaBancariaId,
          nome_arquivo: nomeArquivo,
          transacoes_inseridas: inseridas,
          transacoes_duplicadas_ignoradas: duplicadas,
          saldo_final_extrato: balance?.ledgerBalance
        }
      });

      return resultado;
    });
  }

  private montarResultado(d: any): ResultadoImportacao {
    const delta = OfxParser.conferirDelta(d.parsed);
    return {
      importacaoId: d.importacaoId,
      empresaId: d.empresaId,
      contaBancariaId: d.contaBancariaId,
      banco: d.account.bankName,
      conta: d.account.acctId,
      nomeArquivo: d.nomeArquivo,
      arquivoHashSha256: d.arquivoHashSha256,
      periodoInicio: d.periodo.dtStart,
      periodoFim: d.periodo.dtEnd,
      totalTransacoesArquivo: d.parsed.transactions.length,
      transacoesInseridas: d.inseridas,
      transacoesDuplicadasIgnoradas: d.duplicadas,
      transacoesInformativasIgnoradas: d.parsed.transactions.filter((t: any) => t.isSaldoInformativo).length,
      transacoesAplicacoesAutomaticas: d.parsed.transactions.filter((t: any) => t.isAplicacaoAutomatica).length,
      transacoesRendimentosFinanceiros: d.parsed.transactions.filter((t: any) => t.isRendimentoFinanceiro).length,
      saldoFinalExtrato: d.balance?.ledgerBalance,
      conciliadoComSucesso: delta.fecha,
      jaImportado: d.jaImportado,
      deltaConciliacao: delta.saldoExtrato !== null ? { fecha: delta.fecha, delta: delta.delta } : null
    };
  }
}
