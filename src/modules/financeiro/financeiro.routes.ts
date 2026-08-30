import { Router } from 'express';
import { FinanceiroController } from './financeiro.controller';
import { exigirPapel } from '../../core/middlewares/tenant.middleware';

export const financeiroRouter = Router();
const controller = new FinanceiroController();

financeiroRouter.get('/transacoes', controller.listarTransacoes);
financeiroRouter.get('/resumo-caixa', controller.getResumoCaixa);
financeiroRouter.get('/contas-a-pagar', controller.listarContasAPagar);
financeiroRouter.get('/projecao-futura', controller.getProjecaoFutura);
financeiroRouter.get('/categorias', controller.listarCategorias);

// Escrita contabil: restrita a quem responde pelo financeiro.
financeiroRouter.post(
  '/categorizar-transacao',
  exigirPapel('Gestor_CLevel', 'Financeiro'),
  controller.categorizarTransacao
);
