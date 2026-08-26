import { Router } from 'express';
import { OperacionalWebhookController } from './operacional-webhooks.controller';

import { webhookAuthMiddleware } from '../../../core/middlewares/webhook-auth.middleware';

export const operacionalWebhooksRouter = Router();
const controller = new OperacionalWebhookController();

// Rotas de Webhook para integrações entre módulos com proteção de segurança
operacionalWebhooksRouter.post('/desbloqueio-financeiro', webhookAuthMiddleware, controller.handleDesbloqueioFinanceiro);
operacionalWebhooksRouter.post('/status-qsms', webhookAuthMiddleware, controller.handleStatusQsms);

