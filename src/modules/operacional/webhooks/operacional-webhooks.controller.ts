import { Request, Response } from 'express';
import { pgPool } from '../../../core/database/supabase-pool';
import { globalEventBus } from '../../../core/events/event-bus';
import { OrdemServicoStatusAtualizadoPayload } from '../../../core/events/events.types';
import * as crypto from 'crypto';

export class OperacionalWebhookController {
  /**
   * WEBHOOK RECEIVER: Destravamento Financeiro de Ordem de Serviço
   * Rota: POST /api/v1/webhooks/operacional/desbloqueio-financeiro
   * 
   * Disparado quando o Financeiro recebe a quitação da parcela que exige liberação da OS.
   */
  handleDesbloqueioFinanceiro = async (req: Request, res: Response): Promise<void> => {
    const client = await pgPool.connect();
    try {
      const { cotacao_origem_id, empresa_id, parcela_id, data_pagamento } = req.body;

      if (!cotacao_origem_id || !empresa_id) {
        res.status(400).json({
          success: false,
          error: 'Payload invalido: cotacao_origem_id e empresa_id sao obrigatorios.'
        });
        return;
      }

      await client.query('BEGIN');

      // 1. Executa o destravamento atômico direto no banco PostgreSQL (Supabase)
      // Se bloqueio_qsms ja for false e a OS estiver em AGUARDANDO_LIBERACAO, promove para NA_FILA
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

      const result = await client.query(updateQuery, [cotacao_origem_id, empresa_id, data_pagamento]);
      await client.query('COMMIT');

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: `Nenhuma Ordem de Servico encontrada para a cotacao '${cotacao_origem_id}' no tenant '${empresa_id}'.`
        });
        return;
      }

      console.log(`[WEBHOOK FINANCEIRO -> OPERACIONAL] ${result.rows.length} OS(s) destravada(s) financeiramente com sucesso!`);
      
      // Publica eventos de domínio para cada OS afetada garantindo consistência CQRS
      for (const os of result.rows) {
        console.log(`  -> OS #${os.numero_os} (${os.tipo_os}) | Bloqueio Financeiro: ${os.bloqueio_financeiro} | Bloqueio QSMS: ${os.bloqueio_qsms} | Status: ${os.status}`);
        
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
        message: 'Desbloqueio financeiro aplicado com sucesso nas Ordens de Servico vinculadas.',
        ordens_servico_afetadas: result.rows
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[ERRO WEBHOOK OPERACIONAL]:', err.message);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao processar webhook de desbloqueio financeiro.',
        details: err.message
      });
    } finally {
      client.release();
    }
  };

  /**
   * WEBHOOK RECEIVER: Destravamento / Bloqueio por QSMS
   * Rota: POST /api/v1/webhooks/operacional/status-qsms
   */
  handleStatusQsms = async (req: Request, res: Response): Promise<void> => {
    const client = await pgPool.connect();
    try {
      const { os_id, empresa_id, acao, motivo } = req.body; // acao: 'LIBERAR' | 'BLOQUEAR_RETRABALHO'

      if (!os_id || !empresa_id || !acao) {
        res.status(400).json({ success: false, error: 'os_id, empresa_id e acao sao obrigatorios.' });
        return;
      }

      if (acao !== 'LIBERAR' && acao !== 'BLOQUEAR_RETRABALHO') {
        res.status(422).json({
          success: false,
          error: `Acao '${acao}' invalida. Valores permitidos: 'LIBERAR' ou 'BLOQUEAR_RETRABALHO'.`,
          code: 'INVALID_QSMS_ACTION'
        });
        return;
      }

      await client.query('BEGIN');

      let updateQuery = '';
      if (acao === 'LIBERAR') {
        updateQuery = `
          UPDATE ordens_servico
          SET 
            bloqueio_qsms = FALSE,
            liberacao_qsms_em = NOW(),
            status = CASE 
              WHEN bloqueio_financeiro = FALSE AND status = 'AGUARDANDO_LIBERACAO' THEN 'NA_FILA'::status_ordem_servico
              ELSE status 
            END,
            updated_at = NOW()
          WHERE id = $1 AND empresa_id = $2
          RETURNING *;
        `;
      } else if (acao === 'BLOQUEAR_RETRABALHO') {
        updateQuery = `
          UPDATE ordens_servico
          SET 
            bloqueio_qsms = TRUE,
            status = 'BLOQUEADA_EM_RETRABALHO'::status_ordem_servico,
            motivo_impedimento = $3,
            updated_at = NOW()
          WHERE id = $1 AND empresa_id = $2
          RETURNING *;
        `;
      }

      const result = await client.query(
        updateQuery,
        acao === 'LIBERAR' ? [os_id, empresa_id] : [os_id, empresa_id, motivo || 'Reprovado em Auditoria QSMS']
      );
      await client.query('COMMIT');

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: `Ordem de servico '${os_id}' nao encontrada para o tenant '${empresa_id}'.`
        });
        return;
      }

      const osAtualizada = result.rows[0];

      // Dispara evento de domínio de transição de estado da OS
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
        message: `Status de QSMS atualizado para acao '${acao}'.`,
        os: osAtualizada
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  };
}
