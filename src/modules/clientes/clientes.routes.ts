import { Router } from 'express';
import { ClientesController } from './clientes.controller';

export const clientesRouter = Router();
const controller = new ClientesController();

clientesRouter.get('/consulta-cnpj/:cnpj', controller.consultarPreviaCnpj);
clientesRouter.post('/sincronizacao-background', controller.dispararSincronizacao);

clientesRouter.get('/', controller.listar);
clientesRouter.post('/', controller.criar);
clientesRouter.get('/:id', controller.buscarPorId);
clientesRouter.get('/:id/dossie', controller.obterDossieCompleto);
clientesRouter.put('/:id', controller.atualizar);
clientesRouter.get('/:id/historico', controller.obterHistorico);
