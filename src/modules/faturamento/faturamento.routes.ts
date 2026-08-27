import { Router } from 'express';
import { FaturamentoController } from './faturamento.controller';

export const faturamentoRouter = Router();
const controller = new FaturamentoController();

faturamentoRouter.get('/notas', controller.listarNotas);
