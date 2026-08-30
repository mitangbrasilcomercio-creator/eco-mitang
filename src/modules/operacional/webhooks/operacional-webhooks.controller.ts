import { Request, Response } from 'express';
import { withTenantTransaction } from '../../../core/database/supabase-pool';
import { globalEventBus } from '../../../core/events/event-bus';
import { OrdemServicoStatusAtualizadoPayload } from '../../../core/events/events.types';
import * as crypto from 'crypto';

/**
 * ============================================================================
 * WEBHOOKS OPERACIONAIS
 * ============================================================================
 *
 * [ERROS ANTERIORES]:
 * 1. 'const client = await pgPool.connect()' era a PRIMEIRA linha do handler,
 *    antes de qualquer validacao. Um payload invalido tomava uma conexao do
 *    pool sem necessidade.
 * 2. 'empresa_id' vinha do corpo da requisicao sem validacao de formato.
 * 3. Sem contexto de tenant, as consultas nao passavam pela RLS.
 * 4. O handler de QSMS devolvia 'error: err.message' ao chamador, vazando
 *    mensagens internas do PostgreSQL para fora.
 *
 * [CORRECOES]:
 * Valida primeiro, so entao abre a transacao -- e sempre com contexto de
 * tenant, para a RLS valer tambem aqui.
 * ============================================================================
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OperacionalWebhookController {
  /**
   * WEBHOOK RECEIVER: Destravamento Financeiro de Ordem de Servico
   * Rota: POST /api/v1/webhooks/operacional/desbloqueio-financeiro
   *
   * Disparado quando o Financeiro recebe a quitacao da parcela que exige
   * liberacao da OS.
   */
  handleDesbloqueioFinanceiro = async (req: Request, res: Response): Promise<void> => {
    const { cotacao_origem_id, empresa_id, data_pagamento } = req.body;

    if (!cotacao_origem_id || !empresa_id) {
      res.status(400).json({
        success: false,
        error: 'Payload invalido: cotacao_origem_id e empresa_id sao obrigatorios.',
        code: 'PAYLOAD_INVALIDO'
      });
      return;
    }
    if (!UUID_RE.test(String(empresa_id)) || !UUID_RE.test(String(cotacao_origem_id))) {
      res.status(400).json({
        success: false,
        error: 'cotacao_origem_id e empresa_id devem ser UUIDs validos.',
        code: 'UUID_INVALIDO'
      });
      return;
    }

    try {
      // Se bloqueio_qsms ja for false e a OS estiver em AGUARDANDO_LIBERACAO,
      // promove para NA_FILA.
      const updateQuery = `
        UPDATE ordens_servico
        SET
          bloqueio_financeiro = FALSE,
          liberacao_financeiro_em = COALESCE($3, NOW()),
          status = CASE
            WHEN bloqueio_qsms = FALSE AND status = 'AGUARDANDO_LIBERACAO' THEN 'NA_FILA'::status_ordem_servico
            ELSE status
          END,
          updated_at = NOW()
        WHERE cotacao_origem_id = $1 AND empresa_id = $2
        RETURNING id, numero_os, tipo_os, status, bloqueio_financeiro, bloqueio_qsms, liberacao_financeiro_em;
      `;

      const linhas = await withTenantTransaction(String(empresa_id), async (client) => {
        const r = await client.query(updateQuery, [cotacao_origem_id, empresa_id, data_pagamento || null]);
        return r.rows;
      });

      if (linhas.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Nenhuma Ordem de Servico encontrada para esta cotacao no CNPJ informado.',
          code: 'OS_NAO_ENCONTRADA'
        });
        return;
      }

      console.log(
        `[WEBHOOK FINANCEIRO -> OPERACIONAL] ${linhas.length} OS(s) destravada(s) financeiramente.`
      );

      // Publica eventos de dominio para cada OS afetada, mantendo o read model
      // do CQRS coerente.
      for (const os of linhas) {
        await globalEventBus.publish<OrdemServicoStatusAtualizadoPayload>({
          eventId: crypto.randomUUID(),
          eventType: 'ORDEM_SERVICO.STATUS_ATUALIZADO',
          timestamp: new Date().toISOString(),
          empresaId: empresa_id,
          payload: {
            os_id: os.id,
            empresa_id: empresa_id,
            numero_os: Number(os.numero_os),
            status: os.status,
            bloqueio_financeiro: os.bloqueio_financeiro,
            bloqueio_qsms: os.bloqueio_qsms,
            atualizado_em: new Date().toISOString(),
            origem: 'WEBHOOK_DESBLOQUEIO_FINANCEIRO'
          }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Desbloqueio financeiro aplicado nas Ordens de Servico vinculadas.',
        ordens_servico_afetadas: linhas
      });
    } catch (err: any) {
      console.error('[ERRO WEBHOOK DESBLOQUEIO]:', err.message);
      // Mensagem interna do banco nao volta para quem chama o webhook.
      res.status(500).json({
        success: false,
        error: 'Erro interno ao processar o webhook de desbloqueio financeiro.',
        code: 'ERRO_WEBHOOK_DESBLOQUEIO'
      });
    }
  };

  /**
   * WEBHOOK RECEIVER: Destravamento / Bloqueio por QSMS
   * Rota: POST /api/v1/webhooks/operacional/status-qsms
   */
  handleStatusQsms = async (req: Request, res: Response): Promise<void> => {
    const { os_id, empresa_id, acao, motivo } = req.body; // 'LIBERAR' | 'BLOQUEAR_RETRABALHO'

    if (!os_id || !empresa_id || !acao) {
      res.status(400).json({
        success: false,
        error: 'os_id, empresa_id e acao sao obrigatorios.',
        code: 'PAYLOAD_INVALIDO'
      });
      return;
    }
    if (!UUID_RE.test(String(empresa_id)) || !UUID_RE.test(String(os_id))) {
      res.status(400).json({
        success: false,
        error: 'os_id e empresa_id devem ser UUIDs validos.',
        code: 'UUID_INVALIDO'
      });
      return;
    }
    if (acao !== 'LIBERAR' && acao !== 'BLOQUEAR_RETRABALHO') {
      res.status(422).json({
        success: false,
        error: "Acao invalida. Valores permitidos: 'LIBERAR' ou 'BLOQUEAR_RETRABALHO'.",
        code: 'INVALID_QSMS_ACTION'
      });
      return;
    }

    try {
      const liberar = acao === 'LIBERAR';

      const updateQuery = liberar
        ? `UPDATE ordens_servico
              SET bloqueio_qsms = FALSE,
                  liberacao_qsms_em = NOW(),
                  status = CASE
                    WHEN bloqueio_financeiro = FALSE AND status = 'AGUARDANDO_LIBERACAO'
                    THEN 'NA_FILA'::status_ordem_servico
                    ELSE status
                  END,
                  updated_at = NOW()
            WHERE id = $1 AND empresa_id = $2
            RETURNING *;`
        : `UPDATE ordens_servico
              SET bloqueio_qsms = TRUE,
                  status = 'BLOQUEADA_EM_RETRABALHO'::status_ordem_servico,
                  motivo_impedimento = $3,
                  updated_at = NOW()
            WHERE id = $1 AND empresa_id = $2
            RETURNING *;`;

      const params = liberar
        ? [os_id, empresa_id]
        : [os_id, empresa_id, motivo || 'Reprovado em Auditoria QSMS'];

      const linhas = await withTenantTransaction(String(empresa_id), async (client) => {
        const r = await client.query(updateQuery, params);
        return r.rows;
      });

      if (linhas.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Ordem de servico nao encontrada no CNPJ informado.',
          code: 'OS_NAO_ENCONTRADA'
        });
        return;
      }

      const osAtualizada = linhas[0];

      await globalEventBus.publish<OrdemServicoStatusAtualizadoPayload>({
        eventId: crypto.randomUUID(),
        eventType: 'ORDEM_SERVICO.STATUS_ATUALIZADO',
        timestamp: new Date().toISOString(),
        empresaId: empresa_id,
        payload: {
          os_id: osAtualizada.id,
          empresa_id: empresa_id,
          numero_os: Number(osAtualizada.numero_os),
          status: osAtualizada.status,
          bloqueio_financeiro: osAtualizada.bloqueio_financeiro,
          bloqueio_qsms: osAtualizada.bloqueio_qsms,
          atualizado_em: new Date().toISOString(),
          origem: `WEBHOOK_QSMS_${acao}`
        }
      });

      res.status(200).json({
        success: true,
        message: `Status de QSMS atualizado para a acao '${acao}'.`,
        os: osAtualizada
      });
    } catch (err: any) {
      console.error('[ERRO WEBHOOK QSMS]:', err.message);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao processar o webhook de QSMS.',
        code: 'ERRO_WEBHOOK_QSMS'
      });
    }
  };
}
