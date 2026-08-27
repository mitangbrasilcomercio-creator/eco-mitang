import { Router } from 'express';
import { FinanceiroController } from './financeiro.controller';

export const financeiroRouter = Router();
const controller = new FinanceiroController();

financeiroRouter.get('/transacoes', controller.listarTransacoes);
financeiroRouter.get('/resumo-caixa', controller.getResumoCaixa);
