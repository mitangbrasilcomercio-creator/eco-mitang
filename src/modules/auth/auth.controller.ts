import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthError } from './auth.types';
import { LoginSchema, CriarUsuarioSchema } from './auth.schema';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';

export class AuthController {
  constructor(private readonly service: AuthService = new AuthService()) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const validacao = LoginSchema.safeParse(req.body);
    if (!validacao.success) {
      res.status(422).json({
        success: false,
        error: 'Dados de login invalidos.',
        code: 'VALIDATION_ERROR',
        details: validacao.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }))
      });
      return;
    }

    try {
      const resultado = await this.service.login(validacao.data, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.status(200).json({ success: true, data: resultado });
    } catch (err: any) {
      this.tratarErro(res, err);
    }
  };

  renovar = async (req: Request, res: Response): Promise<void> => {
    const header = req.headers['authorization'];
    const match = header ? /^Bearer\s+(.+)$/i.exec(String(header)) : null;
    if (!match) {
      res.status(401).json({ success: false, error: 'Token ausente.', code: 'TOKEN_AUSENTE' });
      return;
    }
    try {
      res.status(200).json({ success: true, data: await this.service.renovarToken(match[1].trim()) });
    } catch (err: any) {
      this.tratarErro(res, err);
    }
  };

  /** Perfil do usuario logado e os CNPJs que ele pode selecionar no seletor. */
  eu = async (req: TenantRequest, res: Response): Promise<void> => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: 'Nao autenticado.', code: 'TOKEN_AUSENTE' });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        id: req.auth.sub,
        nome: req.auth.nome,
        email: req.auth.email,
        papel: req.auth.papel,
        pode_visao_consolidada: req.auth.consolidado,
        empresas_permitidas: req.auth.empresas,
        tenant_ativo: req.tenant?.empresaId ?? null
      }
    });
  };

  criarUsuario = async (req: TenantRequest, res: Response): Promise<void> => {
    const validacao = CriarUsuarioSchema.safeParse(req.body);
    if (!validacao.success) {
      res.status(422).json({
        success: false,
        error: 'Dados invalidos para criacao do usuario.',
        code: 'VALIDATION_ERROR',
        details: validacao.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }))
      });
      return;
    }
    try {
      const usuario = await this.service.criarUsuario(validacao.data);
      res.status(201).json({ success: true, message: 'Usuario criado com sucesso.', data: usuario });
    } catch (err: any) {
      this.tratarErro(res, err);
    }
  };

  private tratarErro(res: Response, err: any): void {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
      return;
    }
    console.error('[AUTH ERRO]', err.message);
    res.status(500).json({ success: false, error: 'Erro interno na autenticacao.', code: 'INTERNAL_ERROR' });
  }
}
