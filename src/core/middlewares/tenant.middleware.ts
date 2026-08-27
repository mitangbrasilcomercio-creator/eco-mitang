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

  // Se ausente, adota Mitang Brasil como tenant padrão
  const effectiveEmpresaId = empresaId || '29ea0857-7cf7-44e1-ba36-a3f323c4670c';

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (effectiveEmpresaId !== 'all' && !UUID_REGEX.test(effectiveEmpresaId)) {
    res.status(400).json({
      success: false,
      error: 'Tenant ID informado no cabecalho x-empresa-id deve ser um UUID valido ou "all".',
      code: 'INVALID_TENANT_UUID'
    });
    return;
  }

  req.empresaId = effectiveEmpresaId;
  req.userRole = userRole;
  req.userId = userId;
  next();
}
