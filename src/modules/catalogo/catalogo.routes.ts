import { Router } from 'express';
import { CatalogoController } from './catalogo.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

export const catalogoRouter = Router();
const controller = new CatalogoController();

// Leitura do catalogo: todo perfil precisa consultar produto.
const leitura = () => exigirPapel(...PAPEIS.TODOS);
// Escrita: engenharia de produto e diretoria.
const escrita = () => exigirPapel(...PAPEIS.OPERACAO);

catalogoRouter.get('/', leitura(), controller.list);
catalogoRouter.get('/:id', leitura(), controller.getById);
catalogoRouter.post('/', escrita(), controller.create);
catalogoRouter.put('/:id', escrita(), controller.update);
catalogoRouter.patch('/:id/inativar', escrita(), controller.inactivate);
catalogoRouter.delete('/:id', escrita(), controller.delete);
