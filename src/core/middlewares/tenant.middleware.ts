import { Request, Response, NextFunction } from 'express';

export interface TenantRequest extends Request {
  empresaId?: string;
  userRole?: string;
  userId?: string;
}

export function tenantMiddleware(req: TenantRequest, res: Response, next: NextFunction): void {
  const empresaId = (req.headers['x-empresa-id'] as string) || (req.query.empresa_id as string);
  const userRole = (req.headers['x-user-role'] as string) || 'Vendedor';
  const userId = (req.headers['x-user-id'] as string) || 'anonymous-user';

  if (!empresaId) {
    res.status(400).json({
      success: false,
      error: 'Cabecalho obrigatorio x-empresa-id ausente na requisicao.',
      code: 'MISSING_TENANT_ID'
    });
    return;
  }

  req.empresaId = empresaId;
  req.userRole = userRole;
  req.userId = userId;
  next();
}
