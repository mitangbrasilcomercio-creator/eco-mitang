import { Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

export const dashboardRouter = Router();
const controller = new DashboardController();

// O painel executivo expoe saldo bancario, runway e inadimplencia.
dashboardRouter.get('/metrics', exigirPapel(...PAPEIS.FINANCEIRO), controller.getMetrics);
