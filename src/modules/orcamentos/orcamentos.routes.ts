import { Router } from 'express';
import { OrcamentosController } from './orcamentos.controller';

export const orcamentosRouter = Router();
const controller = new OrcamentosController();

orcamentosRouter.get('/', controller.listar);
orcamentosRouter.get('/:numero', controller.obterPorNumero);
