import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * ============================================================================
 * AUTENTICACAO DE WEBHOOKS ENTRE MODULOS
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * 1. O segredo tinha um default escrito no codigo
 *    ('eco-mitang-webhook-secure-token-2026') -- ou seja, publicado junto com o
 *    repositorio.
 * 2. A validacao so acontecia se o header 'x-webhook-secret' fosse enviado:
 *       shouldEnforce = ... || req.headers['x-webhook-secret'] !== undefined
 *    Bastava OMITIR o header para pular a autenticacao inteira.
 * 3. A comparacao era com '!==', vulneravel a ataque de tempo.
 *
 * [COMO FOI CORRIGIDO]:
 * Segredo obrigatorio vindo do ambiente, validacao sempre, e comparacao em
 * tempo constante com timingSafeEqual.
 * ============================================================================
 */

function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual exige buffers do mesmo tamanho; o hash normaliza isso sem
  // vazar o comprimento do segredo pela diferenca de tempo.
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function webhookAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const segredoConfigurado = process.env.ECO_WEBHOOK_SECRET;

  if (!segredoConfigurado || segredoConfigurado.length < 24) {
    console.error(
      '[WEBHOOK] ECO_WEBHOOK_SECRET ausente ou curto demais (minimo 24 caracteres). ' +
      'Nenhum webhook sera aceito ate que a variavel seja configurada.'
    );
    res.status(503).json({
      success: false,
      error: 'Servico de webhooks nao configurado.',
      code: 'WEBHOOK_SECRET_NAO_CONFIGURADO'
    });
    return;
  }

  const fornecido =
    (req.headers['x-webhook-secret'] as string) ||
    (req.headers['x-api-key'] as string) ||
    String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');

  // Validacao SEMPRE. Nao ha mais como pular omitindo o header.
  if (!fornecido || !compararSeguro(fornecido, segredoConfigurado)) {
    res.status(401).json({
      success: false,
      error: 'Acesso negado: cabecalho x-webhook-secret invalido ou ausente.',
      code: 'UNAUTHORIZED_WEBHOOK_CALL'
    });
    return;
  }

  next();
}
