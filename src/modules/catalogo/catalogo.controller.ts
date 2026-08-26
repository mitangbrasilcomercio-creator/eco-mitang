import { Response } from 'express';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { CatalogoService } from './catalogo.service';
import {
  CreateCatalogoItemSchema,
  UpdateCatalogoItemSchema,
  FilterCatalogoQuerySchema
} from './catalogo.schema';

export class CatalogoController {
  constructor(private readonly service: CatalogoService = new CatalogoService()) {}

  list = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const queryValidation = FilterCatalogoQuerySchema.safeParse(req.query);

      if (!queryValidation.success) {
        res.status(400).json({
          success: false,
          error: 'Parametros de consulta invalidos.',
          details: queryValidation.error.format()
        });
        return;
      }

      const result = await this.service.listItems(empresaId, queryValidation.data);
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit)
        }
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  getById = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const id = String(req.params.id);
      const item = await this.service.getItemById(empresaId, id);
      res.status(200).json({ success: true, data: item });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  create = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const validation = CreateCatalogoItemSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(422).json({
          success: false,
          error: 'REGRA 2 (VALIDACAO POLIMORFICA): Dados especificos do item invalidos para o tipo informado.',
          code: 'UNPROCESSABLE_ENTITY_POLYMORPHIC',
          details: validation.error.issues.map((e: any) => ({
            campo: e.path.join('.'),
            mensagem: e.message
          }))
        });
        return;
      }

      const newItem = await this.service.createItem(empresaId, validation.data);
      res.status(201).json({
        success: true,
        message: 'Item criado com sucesso no catalogo.',
        data: newItem
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  update = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const id = String(req.params.id);
      const validation = UpdateCatalogoItemSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Dados de atualizacao invalidos.',
          details: validation.error.format()
        });
        return;
      }

      const updated = await this.service.updateItem(empresaId, id, validation.data);
      res.status(200).json({
        success: true,
        message: 'Item atualizado com sucesso.',
        data: updated
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  inactivate = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const id = String(req.params.id);
      const itemInativo = await this.service.inactivateItem(empresaId, id);
      res.status(200).json({
        success: true,
        message: 'Status do item alterado para inativo com sucesso.',
        data: itemInativo
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  delete = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const id = String(req.params.id);
      const result = await this.service.deleteItem(empresaId, id);
      res.status(200).json(result);
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  private handleError(res: Response, err: any): void {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Erro interno no servidor.',
      code: err.code || 'INTERNAL_SERVER_ERROR',
      usage: err.usage
    });
  }
}
