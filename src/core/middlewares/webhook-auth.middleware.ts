import { Request, Response, NextFunction } from 'express';

export function webhookAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const configuredSecret = process.env.ECO_WEBHOOK_SECRET || 'eco-mitang-webhook-secure-token-2026';
  const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-api-key'] || (req.headers['authorization']?.replace(/^Bearer\s+/i, ''));

  // Em produção ou quando ENFORCE_WEBHOOK_AUTH=true ou quando o header é fornecido, validação estrita
  const shouldEnforce = process.env.NODE_ENV === 'production' || process.env.ENFORCE_WEBHOOK_AUTH === 'true' || req.headers['x-webhook-secret'] !== undefined;

  if (shouldEnforce && (!providedSecret || providedSecret !== configuredSecret)) {
    res.status(401).json({
      success: false,
      error: 'Acesso negado: Cabecalho x-webhook-secret invalido ou ausente.',
      code: 'UNAUTHORIZED_WEBHOOK_CALL'
    });
    return;
  }

  next();
}
