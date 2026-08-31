/**
 * ============================================================================
 * PAPEIS DA SIMULACAO EVENT-DRIVEN (nao sao os papeis do sistema)
 * ============================================================================
 *
 * [ERRO ANTERIOR]: este arquivo vivia em src/core/security/ -- camada de
 * seguranca do sistema em producao -- declarando SEIS papeis
 * (Gerente_Comercial, Gerente_Operacional, Auditor_QSMS, Admin_Sistema) que
 * NAO existem no enum 'papel_usuario' do banco, que tem quatro:
 * Gestor_CLevel, Financeiro, Vendedor, Operacional.
 *
 * Eram dois vocabularios de papel convivendo, e o daqui nao era usado por
 * nenhuma rota. Codigo morto em camada de seguranca e armadilha: quem for
 * mexer depois nao sabe qual dos dois vale.
 *
 * [CORRECAO]: movido para junto de seu unico consumidor, a simulacao em
 * memoria. Nao e mais confundivel com o controle de acesso real, que vive em
 * src/core/middlewares/tenant.middleware.ts (exigirPapel + PAPEIS).
 * ============================================================================
 */
export type SecurityRole =
  | 'Gestor_CLevel'
  | 'Gerente_Comercial'
  | 'Gerente_Operacional'
  | 'Vendedor'
  | 'Auditor_QSMS'
  | 'Admin_Sistema';

export interface UserAuthContext {
  usuario_id: string;
  empresa_id: string;
  role: SecurityRole;
}
