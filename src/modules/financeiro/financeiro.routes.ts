import { Router } from 'express';
import { FinanceiroController } from './financeiro.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

/**
 * [ERRO ANTERIOR]: apenas 'categorizar-transacao' declarava papel. Um usuario
 * autenticado como 'Vendedor' lia o extrato bancario completo, o resumo de
 * caixa e a projecao da holding inteira. O tenant estava isolado; a funcao nao.
 *
 * [CORRECAO]: papel declarado em TODA rota. Dado financeiro e restrito a
 * Gestor_CLevel e Financeiro.
 */
export const financeiroRouter = Router();
const controller = new FinanceiroController();
const financeiro = () => exigirPapel(...PAPEIS.FINANCEIRO);

financeiroRouter.get('/transacoes', financeiro(), controller.listarTransacoes);
financeiroRouter.get('/resumo-caixa', financeiro(), controller.getResumoCaixa);
financeiroRouter.get('/contas-a-pagar', financeiro(), controller.listarContasAPagar);
financeiroRouter.get('/projecao-futura', financeiro(), controller.getProjecaoFutura);
financeiroRouter.get('/categorias', financeiro(), controller.listarCategorias);

// Escrita contabil: mesma restricao, explicitada.
financeiroRouter.post('/categorizar-transacao', financeiro(), controller.categorizarTransacao);
