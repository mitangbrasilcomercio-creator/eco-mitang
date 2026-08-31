import { Router } from 'express';
import { ClientesController } from './clientes.controller';
import { exigirPapel, PAPEIS } from '../../core/middlewares/tenant.middleware';

export const clientesRouter = Router();
const controller = new ClientesController();
const comercial = () => exigirPapel(...PAPEIS.COMERCIAL);

clientesRouter.get('/consulta-cnpj/:cnpj', comercial(), controller.consultarPreviaCnpj);
clientesRouter.get('/', comercial(), controller.listar);
clientesRouter.post('/', comercial(), controller.criar);
clientesRouter.get('/:id', comercial(), controller.buscarPorId);
clientesRouter.get('/:id/dossie', comercial(), controller.obterDossieCompleto);
clientesRouter.put('/:id', comercial(), controller.atualizar);
clientesRouter.get('/:id/historico', comercial(), controller.obterHistorico);

/**
 * A varredura de CNPJ consome cota de API externa e reescreve cadastro em
 * massa. Restrita a quem responde pela base, nao a todo perfil comercial.
 */
clientesRouter.post(
  '/sincronizacao-background',
  exigirPapel(...PAPEIS.FINANCEIRO),
  controller.dispararSincronizacao
);
