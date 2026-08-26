import { Request, Response } from 'express';
import { ItemCatalogoService } from '../services/item-catalogo.service';
import { BaseItemCatalogoSchema, TipoItemEnum } from '../dtos/item-catalogo.dto';

export class ItemCatalogoController {
  constructor(private readonly service: ItemCatalogoService = new ItemCatalogoService()) {}

  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const empresaId = String(req.query.empresa_id || req.headers['x-empresa-id'] || '');
      const apenasAtivos = req.query.apenas_ativos !== 'false';

      if (!empresaId) {
        res.status(400).json({
          success: false,
          error: "Parametro obrigatorio 'empresa_id' ausente (forneca via query param ?empresa_id=... ou header x-empresa-id)."
        });
        return;
      }

      const items = await this.service.list(empresaId, apenasAtivos);
      res.status(200).json({
        success: true,
        empresa_id: empresaId,
        total: items.length,
        data: items
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const empresaId = String(req.query.empresa_id || req.headers['x-empresa-id'] || '');
      const id = String(req.params.id);

      if (!empresaId) {
        res.status(400).json({ success: false, error: "Parametro 'empresa_id' obrigatorio." });
        return;
      }

      const item = await this.service.getById(empresaId, id);
      res.status(200).json({ success: true, data: item });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body || {};
      const empresaId = String(body.empresa_id || req.headers['x-empresa-id'] || '');

      if (!empresaId) {
        res.status(400).json({ success: false, error: "Campo 'empresa_id' obrigatorio." });
        return;
      }

      const tipoItemValidation = TipoItemEnum.safeParse(body.tipo_item);
      if (!tipoItemValidation.success) {
        res.status(422).json({
          success: false,
          error: "tipo_item invalido. Valores permitidos: 'Produto', 'Locacao', 'Servico', 'Curso'.",
          details: tipoItemValidation.error.format()
        });
        return;
      }

      const knownKeys = ['empresa_id', 'tipo_item', 'codigo_sku', 'nome_comercial', 'preco_base', 'quantidade_estoque', 'atributos_extras'];
      
      const atributosExtras: Record<string, any> = {
        ...(typeof body.atributos_extras === 'object' ? body.atributos_extras : {})
      };

      for (const [key, value] of Object.entries(body)) {
        if (!knownKeys.includes(key)) {
          atributosExtras[key] = value;
        }
      }

      const rawPayload = {
        empresa_id: empresaId,
        tipo_item: body.tipo_item,
        codigo_sku: body.codigo_sku || null,
        nome_comercial: body.nome_comercial,
        preco_base: typeof body.preco_base === 'string' ? parseFloat(body.preco_base) : body.preco_base,
        quantidade_estoque: typeof body.quantidade_estoque === 'string' ? parseFloat(body.quantidade_estoque) : (body.quantidade_estoque || 0),
        atributos_extras: atributosExtras
      };

      const validation = BaseItemCatalogoSchema.safeParse(rawPayload);
      if (!validation.success) {
        res.status(422).json({
          success: false,
          error: 'Dados invalidos para criacao do item de catalogo.',
          details: validation.error.issues.map((i: any) => ({ campo: i.path.join('.'), mensagem: i.message }))
        });
        return;
      }

      const createdItem = await this.service.create(validation.data as any);
      res.status(201).json({
        success: true,
        message: 'Item criado com sucesso no catalogo com atributos_extras mapeados.',
        data: createdItem
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const empresaId = String(req.body.empresa_id || req.headers['x-empresa-id'] || '');
      const id = String(req.params.id);

      if (!empresaId) {
        res.status(400).json({ success: false, error: "Campo 'empresa_id' obrigatorio." });
        return;
      }

      const body = req.body || {};
      const knownKeys = ['empresa_id', 'tipo_item', 'codigo_sku', 'nome_comercial', 'preco_base', 'quantidade_estoque', 'atributos_extras', 'status_ativo'];
      
      let atributosExtras = body.atributos_extras;
      for (const [key, value] of Object.entries(body)) {
        if (!knownKeys.includes(key)) {
          if (!atributosExtras) atributosExtras = {};
          atributosExtras[key] = value;
        }
      }

      const updateData = {
        ...body,
        ...(atributosExtras ? { atributos_extras: atributosExtras } : {})
      };

      const updated = await this.service.update(empresaId, id, updateData);
      res.status(200).json({
        success: true,
        message: 'Item atualizado com sucesso.',
        data: updated
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const empresaId = String(req.query.empresa_id || req.headers['x-empresa-id'] || req.body?.empresa_id || '');
      const id = String(req.params.id);

      if (!empresaId) {
        res.status(400).json({ success: false, error: "Parametro 'empresa_id' obrigatorio para soft delete." });
        return;
      }

      const itemInativado = await this.service.softDelete(empresaId, id);
      res.status(200).json({
        success: true,
        message: 'Soft Delete realizado com sucesso. O item agora possui status_ativo = false.',
        data: itemInativado
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  private handleError(res: Response, err: any): void {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Erro interno no servidor.',
      code: err.code || 'INTERNAL_ERROR'
    });
  }
}
