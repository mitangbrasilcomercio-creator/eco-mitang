import { pgPool } from '../../core/database/supabase-pool';
import { Usuario } from './auth.types';

/**
 * Acesso a 'usuarios'. Estas tabelas nao sao multi-tenant (um usuario atravessa
 * varios CNPJs) e sao consultadas ANTES de existir qualquer contexto de tenant,
 * entao usam o pool direto. A protecao delas vem do GRANT: so o papel eco_app
 * enxerga, e 'anon'/'authenticated' da Supabase foram revogados na migration 21.
 */
export class AuthRepository {
  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const res = await pgPool.query(
      `SELECT id, email, senha_hash, nome, papel, pode_visao_consolidada,
              ativo, ultimo_login_em, tentativas_falhas, bloqueado_ate
         FROM usuarios
        WHERE lower(email) = lower($1)
        LIMIT 1;`,
      [email]
    );
    return res.rows[0] || null;
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const res = await pgPool.query(
      `SELECT id, email, senha_hash, nome, papel, pode_visao_consolidada,
              ativo, ultimo_login_em, tentativas_falhas, bloqueado_ate
         FROM usuarios
        WHERE id = $1
        LIMIT 1;`,
      [id]
    );
    return res.rows[0] || null;
  }

  /** CNPJs aos quais o usuario tem acesso. E a base do tenant no JWT. */
  async listarEmpresasDoUsuario(
    usuarioId: string
  ): Promise<{ id: string; nome_fantasia: string; cnpj: string }[]> {
    const res = await pgPool.query(
      `SELECT e.id, e.nome_fantasia, e.cnpj
         FROM usuarios_empresas ue
         JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = $1 AND e.ativo = TRUE
        ORDER BY e.nome_fantasia;`,
      [usuarioId]
    );
    return res.rows;
  }

  async registrarLoginBemSucedido(usuarioId: string): Promise<void> {
    await pgPool.query(
      `UPDATE usuarios
          SET ultimo_login_em = NOW(), tentativas_falhas = 0, bloqueado_ate = NULL, updated_at = NOW()
        WHERE id = $1;`,
      [usuarioId]
    );
  }

  /**
   * Incrementa o contador de falhas e bloqueia por 15 minutos ao atingir 5.
   * Trava simples contra forca bruta, no proprio banco.
   */
  async registrarTentativaFalha(usuarioId: string): Promise<void> {
    await pgPool.query(
      `UPDATE usuarios
          SET tentativas_falhas = tentativas_falhas + 1,
              bloqueado_ate = CASE WHEN tentativas_falhas + 1 >= 5
                                   THEN NOW() + INTERVAL '15 minutes'
                                   ELSE bloqueado_ate END,
              updated_at = NOW()
        WHERE id = $1;`,
      [usuarioId]
    );
  }

  async registrarAcesso(dados: {
    usuarioId?: string | null;
    emailTentado?: string;
    sucesso: boolean;
    motivo?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await pgPool.query(
        `INSERT INTO usuarios_log_acesso (usuario_id, email_tentado, sucesso, motivo, ip_origem, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          dados.usuarioId || null,
          dados.emailTentado || null,
          dados.sucesso,
          dados.motivo || null,
          dados.ip || null,
          dados.userAgent || null
        ]
      );
    } catch (err: any) {
      // Auditoria nunca deve derrubar um login legitimo.
      console.warn('[AUTH] Falha ao gravar log de acesso:', err.message);
    }
  }

  async criarUsuario(dados: {
    email: string;
    nome: string;
    senhaHash: string;
    papel: string;
    podeVisaoConsolidada: boolean;
    empresas: string[];
  }): Promise<Usuario> {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO usuarios (email, nome, senha_hash, papel, pode_visao_consolidada)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, senha_hash, nome, papel, pode_visao_consolidada,
                   ativo, ultimo_login_em, tentativas_falhas, bloqueado_ate;`,
        [dados.email, dados.nome, dados.senhaHash, dados.papel, dados.podeVisaoConsolidada]
      );
      const usuario = res.rows[0];

      for (const empresaId of dados.empresas) {
        await client.query(
          `INSERT INTO usuarios_empresas (usuario_id, empresa_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [usuario.id, empresaId]
        );
      }

      await client.query('COMMIT');
      return usuario;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
