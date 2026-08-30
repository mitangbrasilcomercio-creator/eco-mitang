import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { AuthError, JwtPayloadEco, ResultadoLogin, PapelUsuario } from './auth.types';
import { CriarUsuarioInput, LoginInput } from './auth.schema';

const EXPIRACAO_SEGUNDOS = Number(process.env.JWT_EXPIRES_SECONDS || 8 * 60 * 60); // 8h
const CUSTO_BCRYPT = 12;

/**
 * O segredo do JWT nao tem default. Um default no codigo seria o mesmo problema
 * do webhook antigo ('eco-mitang-webhook-secure-token-2026' commitado): qualquer
 * pessoa com acesso ao repositorio poderia assinar um token valido.
 */
function obterSegredo(): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error(
      '[AUTH] JWT_SECRET ausente ou curto demais (minimo 32 caracteres). ' +
      'Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"'
    );
  }
  return segredo;
}

export class AuthService {
  constructor(private readonly repo: AuthRepository = new AuthRepository()) {}

  async login(
    dados: LoginInput,
    contexto: { ip?: string; userAgent?: string } = {}
  ): Promise<ResultadoLogin> {
    const usuario = await this.repo.buscarPorEmail(dados.email);

    // Mensagem unica para usuario inexistente e senha errada: nao entregamos a
    // um atacante a informacao de quais e-mails existem.
    const credenciaisInvalidas = new AuthError('E-mail ou senha invalidos.', 401, 'CREDENCIAIS_INVALIDAS');

    if (!usuario) {
      await this.repo.registrarAcesso({
        emailTentado: dados.email, sucesso: false, motivo: 'USUARIO_INEXISTENTE', ...contexto
      });
      // Gasta tempo comparando contra um hash descartavel para que o tempo de
      // resposta nao revele se o e-mail existe.
      await bcrypt.compare(dados.senha, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw credenciaisInvalidas;
    }

    if (!usuario.ativo) {
      await this.repo.registrarAcesso({
        usuarioId: usuario.id, emailTentado: dados.email, sucesso: false, motivo: 'USUARIO_INATIVO', ...contexto
      });
      throw new AuthError('Usuario desativado. Procure o administrador.', 403, 'USUARIO_INATIVO');
    }

    if (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date()) {
      await this.repo.registrarAcesso({
        usuarioId: usuario.id, emailTentado: dados.email, sucesso: false, motivo: 'BLOQUEADO', ...contexto
      });
      throw new AuthError(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.',
        429,
        'CONTA_BLOQUEADA'
      );
    }

    const senhaConfere = await bcrypt.compare(dados.senha, usuario.senha_hash);
    if (!senhaConfere) {
      await this.repo.registrarTentativaFalha(usuario.id);
      await this.repo.registrarAcesso({
        usuarioId: usuario.id, emailTentado: dados.email, sucesso: false, motivo: 'SENHA_INCORRETA', ...contexto
      });
      throw credenciaisInvalidas;
    }

    const empresas = await this.repo.listarEmpresasDoUsuario(usuario.id);
    if (empresas.length === 0) {
      await this.repo.registrarAcesso({
        usuarioId: usuario.id, emailTentado: dados.email, sucesso: false, motivo: 'SEM_EMPRESA_VINCULADA', ...contexto
      });
      throw new AuthError(
        'Usuario sem nenhum CNPJ vinculado. Procure o administrador.',
        403,
        'SEM_EMPRESA_VINCULADA'
      );
    }

    await this.repo.registrarLoginBemSucedido(usuario.id);
    await this.repo.registrarAcesso({ usuarioId: usuario.id, emailTentado: dados.email, sucesso: true, ...contexto });

    const payload: JwtPayloadEco = {
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      empresas: empresas.map((e) => e.id),
      consolidado: usuario.pode_visao_consolidada
    };

    const token = jwt.sign(payload, obterSegredo(), {
      expiresIn: EXPIRACAO_SEGUNDOS,
      issuer: 'eco-mitang-erp'
    });

    return {
      token,
      expira_em: EXPIRACAO_SEGUNDOS,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel,
        pode_visao_consolidada: usuario.pode_visao_consolidada,
        empresas
      }
    };
  }

  /** Valida a assinatura e a validade do token. Usado pelo authMiddleware. */
  verificarToken(token: string): JwtPayloadEco {
    try {
      return jwt.verify(token, obterSegredo(), { issuer: 'eco-mitang-erp' }) as JwtPayloadEco;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthError('Sessao expirada. Faca login novamente.', 401, 'TOKEN_EXPIRADO');
      }
      throw new AuthError('Token invalido.', 401, 'TOKEN_INVALIDO');
    }
  }

  /** Reemite o token a partir de um ainda valido, relendo os vinculos no banco. */
  async renovarToken(tokenAtual: string): Promise<ResultadoLogin> {
    const payload = this.verificarToken(tokenAtual);
    const usuario = await this.repo.buscarPorId(payload.sub);
    if (!usuario || !usuario.ativo) {
      throw new AuthError('Usuario nao encontrado ou desativado.', 401, 'USUARIO_INVALIDO');
    }

    const empresas = await this.repo.listarEmpresasDoUsuario(usuario.id);
    const novoPayload: JwtPayloadEco = {
      sub: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      empresas: empresas.map((e) => e.id),
      consolidado: usuario.pode_visao_consolidada
    };

    return {
      token: jwt.sign(novoPayload, obterSegredo(), { expiresIn: EXPIRACAO_SEGUNDOS, issuer: 'eco-mitang-erp' }),
      expira_em: EXPIRACAO_SEGUNDOS,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel,
        pode_visao_consolidada: usuario.pode_visao_consolidada,
        empresas
      }
    };
  }

  async criarUsuario(dados: CriarUsuarioInput) {
    const existente = await this.repo.buscarPorEmail(dados.email);
    if (existente) {
      throw new AuthError('Ja existe um usuario com este e-mail.', 409, 'EMAIL_DUPLICADO');
    }
    const senhaHash = await bcrypt.hash(dados.senha, CUSTO_BCRYPT);
    const usuario = await this.repo.criarUsuario({
      email: dados.email,
      nome: dados.nome,
      senhaHash,
      papel: dados.papel,
      podeVisaoConsolidada: dados.pode_visao_consolidada,
      empresas: dados.empresas
    });
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel as PapelUsuario
    };
  }
}
