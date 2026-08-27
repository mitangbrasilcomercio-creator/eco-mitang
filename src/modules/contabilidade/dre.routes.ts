import { Router } from 'express';
import { DreController } from './dre.controller';

export const dreRouter = Router();
const controller = new DreController();

dreRouter.get('/dre', controller.getDreConsolidada);
