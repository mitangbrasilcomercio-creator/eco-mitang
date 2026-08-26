import { Router } from 'express';
import { OperacionalWebhookController } from './operacional-webhooks.controller';

export const operacionalWebhooksRouter = Router();
const controller = new OperacionalWebhookController();

// Rotas de Webhook para integrações entre módulos
operacionalWebhooksRouter.post('/desbloqueio-financeiro', controller.handleDesbloqueioFinanceiro);
operacionalWebhooksRouter.post('/status-qsms', controller.handleStatusQsms);
