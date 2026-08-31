import { Router } from 'express';
import { OrcamentosController } from './orcamentos.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

export const orcamentosRouter = Router();
const controller = new OrcamentosController();
const comercial = () => exigirPapel(...PAPEIS.COMERCIAL);

orcamentosRouter.get('/', comercial(), controller.listar);
orcamentosRouter.get('/:numero', comercial(), controller.obterPorNumero);
