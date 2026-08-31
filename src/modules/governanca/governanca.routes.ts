import { Router } from 'express';
import { GovernancaController } from './governanca.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

/**
 * Obrigacoes, pendencias e auditoria.
 *
 * Papel: tudo aqui e dado financeiro ou de governanca -- restrito a
 * Gestor_CLevel e Financeiro, como o resto do modulo financeiro.
 *
 * Resolver pendencia societaria e decisao de socio, nao de funcionario. O
 * papel nao consegue expressar isso hoje (sao quatro papeis fixos); o que o
 * sistema garante e que a decisao fica assinada e auditada. A alcada de
 * verdade entra na Fase 2, com RBAC granular.
 */
export const governancaRouter = Router();
const controller = new GovernancaController();
const financeiro = () => exigirPapel(...PAPEIS.FINANCEIRO);

governancaRouter.get('/obrigacoes', financeiro(), controller.listarObrigacoes);
governancaRouter.get('/pendencias', financeiro(), controller.listarPendencias);
governancaRouter.post('/pendencias/:id/resolver', financeiro(), controller.resolverPendencia);
governancaRouter.get('/auditoria/:tabela/:id', financeiro(), controller.trilhaDoRegistro);
