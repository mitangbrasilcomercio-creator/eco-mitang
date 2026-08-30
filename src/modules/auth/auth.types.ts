export type PapelUsuario = 'Gestor_CLevel' | 'Financeiro' | 'Vendedor' | 'Operacional';

export interface Usuario {
  id: string;
  email: string;
  senha_hash: string;
  nome: string;
  papel: PapelUsuario;
  pode_visao_consolidada: boolean;
  ativo: boolean;
  ultimo_login_em: Date | null;
  tentativas_falhas: number;
  bloqueado_ate: Date | null;
}

/** Conteudo do JWT. E daqui que sai o tenant -- nunca do header do cliente. */
export interface JwtPayloadEco {
  sub: string;              // usuario_id
  nome: string;
  email: string;
  papel: PapelUsuario;
  empresas: string[];       // CNPJs que o usuario pode acessar
  consolidado: boolean;     // pode usar a visao 'all'
}

export interface ResultadoLogin {
  token: string;
  expira_em: number;
  usuario: {
    id: string;
    nome: string;
    email: string;
    papel: PapelUsuario;
    pode_visao_consolidada: boolean;
    empresas: { id: string; nome_fantasia: string; cnpj: string }[];
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 401,
    public readonly code: string = 'UNAUTHORIZED'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
