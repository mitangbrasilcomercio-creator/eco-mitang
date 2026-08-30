import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { AuthError, JwtPayloadEco } from '../../modules/auth/auth.types';
import { TenantContext } from '../database/supabase-pool';

/**
 * ============================================================================
 * AUTENTICACAO E RESOLUCAO DE TENANT
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * 1. Nao havia autenticacao. O middleware lia 'x-empresa-id' do header -- valor
 *    que o proprio navegador escolhia, guardado em localStorage -- e, se
 *    ausente, assumia em silencio o UUID da Mitang Brasil.
 * 2. A unica validacao era um regex de UUID, e apenas nas rotas de clientes e
 *    catalogo. Dashboard, financeiro, faturamento, DRE e orcamentos nao
 *    passavam por middleware nenhum e interpolavam o header direto no SQL.
 *
 * [COMO FOI CORRIGIDO]:
 * O tenant sai do JWT. 'x-empresa-id' vira apenas uma *selecao*, que precisa
 * estar na lista de CNPJs do token -- caso contrario a requisicao e recusada
 * com 403. Nao existe mais fallback silencioso para um CNPJ padrao.
 * ============================================================================
 */

export interface TenantRequest extends Request {
  auth?: JwtPayloadEco;
  tenant?: TenantContext;

  /** @deprecated Use req.tenant. Mantido para os modulos ainda nao migrados. */
  empresaId?: string;
  userRole?: string;
  userId?: string;
}

const authService = new AuthService();

function extrairToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  return match ? match[1].trim() : null;
}

/**
 * Exige um JWT valido. Popula req.auth.
 */
export function authMiddleware(req: TenantRequest, res: Response, next: NextFunction): void {
  try {
    const token = extrairToken(req);
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Autenticacao obrigatoria. Envie o cabecalho Authorization: Bearer <token>.',
        code: 'TOKEN_AUSENTE'
      });
      return;
    }
    req.auth = authService.verificarToken(token);
    next();
  } catch (err: any) {
    const status = err instanceof AuthError ? err.statusCode : 401;
    const code = err instanceof AuthError ? err.code : 'NAO_AUTORIZADO';
    res.status(status).json({ success: false, error: err.message, code });
  }
}

/**
 * Resolve o tenant da requisicao a partir do token e da selecao do cliente.
 * Precisa rodar depois de authMiddleware.
 */
export function tenantMiddleware(req: TenantRequest, res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({
      success: false,
      error: 'Contexto de autenticacao ausente.',
      code: 'TOKEN_AUSENTE'
    });
    return;
  }

  const selecionado =
    (req.headers['x-empresa-id'] as string) || (req.query.empresa_id as string) || '';

  const permitidas = auth.empresas || [];
  if (permitidas.length === 0) {
    res.status(403).json({
      success: false,
      error: 'Usuario sem CNPJ vinculado.',
      code: 'SEM_EMPRESA_VINCULADA'
    });
    return;
  }

  let empresaId: string;
  let empresaIds: string[];

  if (!selecionado || selecionado === 'all') {
    // Visao consolidada: so para quem tem a permissao. Sem ela, cai no primeiro
    // CNPJ do usuario em vez de um UUID fixo escondido no codigo.
    if (selecionado === 'all' && !auth.consolidado) {
      res.status(403).json({
        success: false,
        error: 'Seu perfil nao tem permissao para a visao consolidada da holding.',
        code: 'CONSOLIDADO_NAO_PERMITIDO'
      });
      return;
    }
    empresaIds = auth.consolidado && selecionado === 'all' ? permitidas : [permitidas[0]];
    empresaId = empresaIds[0];
  } else {
    // Selecao explicita: precisa estar entre as permitidas. E aqui que morre a
    // possibilidade de escolher o tenant pelo header.
    if (!permitidas.includes(selecionado)) {
      res.status(403).json({
        success: false,
        error: 'Voce nao tem acesso ao CNPJ selecionado.',
        code: 'EMPRESA_NAO_AUTORIZADA'
      });
      return;
    }
    empresaId = selecionado;
    empresaIds = [selecionado];
  }

  req.tenant = {
    empresaId,
    empresaIds,
    userRole: auth.papel,
    userId: auth.sub
  };

  // Compatibilidade com os modulos ainda nao migrados
  req.empresaId = empresaId;
  req.userRole = auth.papel;
  req.userId = auth.sub;

  next();
}

/** Restringe uma rota a papeis especificos. */
export function exigirPapel(...papeis: string[]) {
  return (req: TenantRequest, res: Response, next: NextFunction): void => {
    if (!req.auth || !papeis.includes(req.auth.papel)) {
      res.status(403).json({
        success: false,
        error: `Acao restrita aos perfis: ${papeis.join(', ')}.`,
        code: 'PAPEL_INSUFICIENTE'
      });
      return;
    }
    next();
  };
}

/** Atalho: autenticacao + tenant, na ordem correta. */
export const protegido = [authMiddleware, tenantMiddleware];
