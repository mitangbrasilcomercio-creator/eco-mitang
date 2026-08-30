import { Router } from 'express';
import { CatalogoController } from './catalogo.controller';

export const catalogoRouter = Router();
const controller = new CatalogoController();

catalogoRouter.get('/', controller.list);
catalogoRouter.get('/:id', controller.getById);
catalogoRouter.post('/', controller.create);
catalogoRouter.put('/:id', controller.update);
catalogoRouter.patch('/:id/inativar', controller.inactivate);
catalogoRouter.delete('/:id', controller.delete);
