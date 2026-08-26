import { Router } from 'express';
import { CatalogoController } from './catalogo.controller';
import { tenantMiddleware } from '../../core/middlewares/tenant.middleware';

export const catalogoRouter = Router();
const controller = new CatalogoController();

// Aplica isolamento Multi-Tenant em todas as rotas do catálogo
catalogoRouter.use(tenantMiddleware);

catalogoRouter.get('/', controller.list);
catalogoRouter.get('/:id', controller.getById);
catalogoRouter.post('/', controller.create);
catalogoRouter.put('/:id', controller.update);
catalogoRouter.patch('/:id/inativar', controller.inactivate);
catalogoRouter.delete('/:id', controller.delete);
