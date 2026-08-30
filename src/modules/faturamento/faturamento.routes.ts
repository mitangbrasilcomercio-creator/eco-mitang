import { Router } from 'express';
import { FaturamentoController } from './faturamento.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

export const faturamentoRouter = Router();
const controller = new FaturamentoController();
const comercial = () => exigirPapel(...PAPEIS.COMERCIAL);

// Nota fiscal e documento comercial: vendedor precisa consultar.
faturamentoRouter.get('/notas', comercial(), controller.listarNotas);
faturamentoRouter.get('/notas/:id', comercial(), controller.obterPorId);
