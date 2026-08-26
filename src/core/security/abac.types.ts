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
