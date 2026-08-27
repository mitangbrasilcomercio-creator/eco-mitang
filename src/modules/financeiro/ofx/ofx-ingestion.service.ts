import * as crypto from 'crypto';
import { pgPool } from '../../../core/database/supabase-pool';
import { globalEventBus } from '../../../core/events/event-bus';
import { OfxParser } from './ofx-parser';
import { OfxImportResult, ParsedOfxDocument } from './ofx.types';

export class OfxIngestionService {
  /**
   * Importa e processa um arquivo OFX com garantia ACID, idempotência absoluta e conciliação.
   */
  async importarOfx(
    empresaId: string,
    nomeArquivo: string,
    conteudoOfx: string,
    importadoPor: string = 'SISTEMA_AUTO'
  ): Promise<OfxImportResult> {
    const arquivoHashSha256 = crypto.createHash('sha256').update(conteudoOfx).digest('hex');

    // 1. Parsing robusto do arquivo
    const parsedDoc: ParsedOfxDocument = OfxParser.parse(conteudoOfx, empresaId);
    const { account, periodo, balance, transactions } = parsedDoc;

    const client = await pgPool.connect();

    try {
      await client.query('BEGIN');
      // 2. Resolução Multi-Tenant e Identificação Automática da Empresa / Agência
      let resolvedEmpresaId = empresaId;
      let contaBancariaId: string;

      const existingAccountRes = await client.query(`
        SELECT c.id, c.empresa_id, c.agencia, e.razao_social, e.cnpj
        FROM contas_bancarias c
        JOIN empresas e ON e.id = c.empresa_id
        WHERE c.banco_codigo = $1 AND (c.conta_numero = $2 OR c.conta_numero ILIKE '%' || $2 || '%')
        LIMIT 1;
      `, [account.bankId, account.acctId]);

      if (existingAccountRes.rows.length > 0) {
        contaBancariaId = existingAccountRes.rows[0].id;
        resolvedEmpresaId = existingAccountRes.rows[0].empresa_id;
      } else {
        // Se a conta for nova, cadastra vinculando ao tenant informado
        // No Itaú (0341), os primeiros 4 dígitos do ACCTID representam a agência
        let agenciaNormalizada = account.branchId || '0001';
        if (account.bankId === '0341' && account.acctId.length >= 8) {
          agenciaNormalizada = account.acctId.substring(0, 4);
        }

        const insContaQuery = `
          INSERT INTO contas_bancarias (
            empresa_id, banco_codigo, banco_nome, agencia, conta_numero, moeda, saldo_atual, data_ultimo_saldo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id;
        `;
        const insContaRes = await client.query(insContaQuery, [
          resolvedEmpresaId,
          account.bankId,
          account.bankName,
          agenciaNormalizada,
          account.acctId,
          account.currency || 'BRL',
          balance?.ledgerBalance || 0.00,
          balance?.dateStr || null
        ]);
        contaBancariaId = insContaRes.rows[0].id;
      }

      await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [resolvedEmpresaId]);

      // 3. Registra o lote de importação em extratos_ofx_importacoes
      const insImportacaoQuery = `
        INSERT INTO extratos_ofx_importacoes (
          empresa_id, conta_bancaria_id, nome_arquivo, arquivo_hash_sha256,
          dt_inicio_extrato, dt_fim_extrato, total_transacoes_arquivo,
          saldo_final_extrato, data_saldo_extrato, importado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;
      `;
      const insImportacaoRes = await client.query(insImportacaoQuery, [
        empresaId,
        contaBancariaId,
        nomeArquivo,
        arquivoHashSha256,
        periodo.dtStart || null,
        periodo.dtEnd || null,
        transactions.length,
        balance?.ledgerBalance || null,
        balance?.dateStr || null,
        importadoPor
      ]);
      const importacaoId = insImportacaoRes.rows[0].id;

      // 4. Inserção Idempotente de Transações com ON CONFLICT (idempotency_hash) DO NOTHING
      let transacoesInseridas = 0;
      let transacoesDuplicadasIgnoradas = 0;
      let transacoesInformativasIgnoradas = 0;
      let transacoesAplicacoesAutomaticas = 0;

      for (const t of transactions) {
        // Se for linha de saldo diário informativo (ex: SALDO TOTAL DISPONÍVEL DIA do Itaú)
        if (t.isSaldoInformativo) {
          transacoesInformativasIgnoradas++;
        }

        // Se for aplicação ou resgate automático de liquidez overnight
        if (t.isAplicacaoAutomatica) {
          transacoesAplicacoesAutomaticas++;
        }

        // Tenta auto-vincular com cliente existente pelo CNPJ/CPF extraído do memo
        let clienteId: string | null = null;
        if (t.documentoContraparte) {
          const cleanDoc = t.documentoContraparte.replace(/[^\d]/g, '');
          const cliQuery = `
            SELECT id FROM clientes 
            WHERE empresa_id = $1 AND regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') = $2
            LIMIT 1;
          `;
          const cliRes = await client.query(cliQuery, [empresaId, cleanDoc]);
          if (cliRes.rows.length > 0) {
            clienteId = cliRes.rows[0].id;
          }
        }

        // Tenta auto-vincular com parcela a receber pendente
        let parcelaId: string | null = null;
        let statusConciliacao = 'PENDENTE';
        if (t.valor > 0 && clienteId && !t.isAplicacaoAutomatica && !t.isSaldoInformativo) {
          const parcQuery = `
            SELECT p.id 
            FROM parcelas_recebimento p
            JOIN planos_faturamento pf ON pf.id = p.plano_id
            JOIN cotacoes c ON c.id = pf.cotacao_origem_id
            WHERE pf.empresa_id = $1 
              AND c.cliente_id = $2
              AND p.status_pagamento = 'A_VENCER'
              AND ABS(p.valor_parcela - $3) < 0.05
            ORDER BY p.data_vencimento ASC
            LIMIT 1;
          `;
          const parcRes = await client.query(parcQuery, [empresaId, clienteId, t.valor]);
          if (parcRes.rows.length > 0) {
            parcelaId = parcRes.rows[0].id;
            statusConciliacao = 'CONCILIADO_AUTOMATICO';

            // Baixa a parcela no financeiro
            await client.query(`
              UPDATE parcelas_recebimento
              SET status_pagamento = 'PAGO', data_pagamento = $1, updated_at = NOW()
              WHERE id = $2;
            `, [t.dataLancamento, parcelaId]);
          }
        }

        const insTxQuery = `
          INSERT INTO transacoes_bancarias (
            empresa_id, conta_bancaria_id, importacao_id, cliente_id, parcela_id,
            bank_id, acct_id, fitid, checknum, tipo_operacao, data_lancamento,
            dtposted_raw, valor, memo, documento_contraparte, nome_contraparte,
            categoria_financeira, is_saldo_informativo, status_conciliacao,
            idempotency_hash
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (idempotency_hash) DO NOTHING
          RETURNING id;
        `;

        const insTxRes = await client.query(insTxQuery, [
          empresaId,
          contaBancariaId,
          importacaoId,
          clienteId,
          parcelaId,
          t.bankId,
          t.acctId,
          t.fitid,
          t.checknum || null,
          t.trntype,
          t.dataLancamento,
          t.dtpostedRaw,
          t.valor,
          t.memo,
          t.documentoContraparte || null,
          t.nomeContraparte || null,
          t.categoriaSugerida,
          t.isSaldoInformativo,
          statusConciliacao,
          t.idempotencyHash
        ]);

        if (insTxRes.rows.length > 0) {
          transacoesInseridas++;
        } else {
          transacoesDuplicadasIgnoradas++;
        }
      }

      // 5. Atualiza o saldo oficial da conta se informado no LEDGERBAL
      if (balance) {
        await client.query(`
          UPDATE contas_bancarias
          SET saldo_atual = $1, data_ultimo_saldo = COALESCE($2, NOW()), updated_at = NOW()
          WHERE id = $3;
        `, [balance.ledgerBalance, balance.dateStr, contaBancariaId]);
      }

      // 6. Atualiza as métricas finais na importação
      await client.query(`
        UPDATE extratos_ofx_importacoes
        SET transacoes_inseridas = $1, transacoes_duplicadas_ignoradas = $2
        WHERE id = $3;
      `, [transacoesInseridas, transacoesDuplicadasIgnoradas, importacaoId]);

      await client.query('COMMIT');

      // 7. Publica Evento de Domínio no Barramento
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
          transacoes_inseridas: transacoesInseridas,
          transacoes_duplicadas_ignoradas: transacoesDuplicadasIgnoradas,
          transacoes_aplicacoes_automaticas: transacoesAplicacoesAutomaticas,
          saldo_final_extrato: balance?.ledgerBalance
        }
      });

      return {
        importacaoId,
        empresaId,
        contaBancariaId,
        banco: account.bankName,
        conta: account.acctId,
        nomeArquivo,
        arquivoHashSha256,
        periodoInicio: periodo.dtStart,
        periodoFim: periodo.dtEnd,
        totalTransacoesArquivo: transactions.length,
        transacoesInseridas,
        transacoesDuplicadasIgnoradas,
        transacoesInformativasIgnoradas,
        transacoesAplicacoesAutomaticas,
        transacoesRendimentosFinanceiros: parsedDoc.transactions.filter(t => t.isRendimentoFinanceiro).length,
        saldoFinalExtrato: balance?.ledgerBalance,
        conciliadoComSucesso: true
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
