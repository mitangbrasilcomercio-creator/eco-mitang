import { Router } from 'express';
import { DashboardController } from './dashboard.controller';

export const dashboardRouter = Router();
const controller = new DashboardController();

dashboardRouter.get('/metrics', controller.getMetrics);
