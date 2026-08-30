import { Router } from 'express';
import { DreController } from './dre.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

export const dreRouter = Router();
const controller = new DreController();

// Resultado consolidado da holding: so quem responde pelo financeiro.
dreRouter.get('/dre', exigirPapel(...PAPEIS.FINANCEIRO), controller.getDreConsolidada);
