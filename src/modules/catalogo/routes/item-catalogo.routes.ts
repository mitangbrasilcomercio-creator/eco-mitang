import { Router } from 'express';
import { ItemCatalogoController } from '../controllers/item-catalogo.controller';

export const itemCatalogoRouter = Router();
const controller = new ItemCatalogoController();

itemCatalogoRouter.get('/', controller.list);
itemCatalogoRouter.get('/:id', controller.getById);
itemCatalogoRouter.post('/', controller.create);
itemCatalogoRouter.put('/:id', controller.update);
itemCatalogoRouter.delete('/:id', controller.delete); // Soft Delete
