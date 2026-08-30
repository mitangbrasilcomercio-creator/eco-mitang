import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

/**
 * ============================================================================
 * POOL DE CONEXAO POSTGRES (SUPABASE) COM TLS VERIFICADO
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * O hostname do pooler era substituido por um IP fixo ('15.229.150.166') e a
 * verificacao de certificado era desligada com 'rejectUnauthorized: false'.
 * As duas coisas estavam ligadas: o certificado da Supabase e emitido para
 * '*.pooler.supabase.com', entao ele NUNCA casa com um IP -- desligar a
 * verificacao era a unica forma de o IP funcionar. O resultado era uma conexao
 * TLS sem autenticacao do servidor (vulneravel a MITM) que ainda por cima
 * quebraria sozinha no dia em que a Supabase trocasse de IP.
 *
 * [COMO FOI CORRIGIDO]:
 * 1. Volta a usar o hostname oficial do pooler.
 * 2. A CA raiz da Supabase ('Supabase Root 2021 CA') fica fixada em
 *    database/certs/supabase-ca.crt e a verificacao do certificado e ligada.
 * 3. Escape hatch explicito e barulhento via DB_SSL_INSECURE=true, para
 *    diagnostico -- nunca como configuracao permanente.
 * ============================================================================
 */

const CA_PATH = path.join(__dirname, '..', '..', '..', 'database', 'certs', 'supabase-ca.crt');

function construirConfigSsl(): { ca?: string; rejectUnauthorized: boolean } {
  if (process.env.DB_SSL_INSECURE === 'true') {
    console.warn(
      '[DB SSL] ATENCAO: DB_SSL_INSECURE=true. O certificado do servidor NAO esta sendo verificado. ' +
      'Use apenas para diagnostico temporario, jamais em uso normal.'
    );
    return { rejectUnauthorized: false };
  }

  try {
    const ca = fs.readFileSync(CA_PATH, 'utf8');
    return { ca, rejectUnauthorized: true };
  } catch {
    // Sem a CA fixada, cai para as CAs publicas do sistema. A conexao com a
    // Supabase vai falhar (a CA deles e auto-assinada), o que e o comportamento
    // correto: falhar alto em vez de aceitar qualquer certificado em silencio.
    console.warn(
      `[DB SSL] CA da Supabase nao encontrada em ${CA_PATH}. ` +
      'Restaure o arquivo ou baixe a CA no painel da Supabase (Settings > Database > SSL Configuration).'
    );
    return { rejectUnauthorized: true };
  }
}

/**
 * APP_DATABASE_URL usa o papel 'eco_app', sem BYPASSRLS -- e o que faz a
 * Row-Level Security valer de fato. DIRECT_URL/DATABASE_URL ficam como
 * compatibilidade ate a Fase 3 estar aplicada.
 */
const connectionString =
  process.env.APP_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    '[DB] Nenhuma string de conexao definida. Configure APP_DATABASE_URL no .env.'
  );
}

export const pgPool = new Pool({
  connectionString,
  ssl: construirConfigSsl(),
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
});

// Impede que desconexoes de clientes ociosos derrubem o processo Node.js
pgPool.on('error', (err: Error) => {
  console.warn('[SUPABASE PG POOL WARNING]: Conexao ociosa reciclada:', err.message);
});

/**
 * Contexto de tenant de uma requisicao.
 *
 * - `empresaId`  : tenant SELECIONADO. E o destino de toda escrita.
 * - `empresaIds` : tenants VISIVEIS na leitura. Numa visao consolidada ('all')
 *                  traz todos os CNPJs que o usuario pode enxergar.
 * - `userRole`   : papel do usuario, lido pelas policies ABAC.
 */
export interface TenantContext {
  empresaId: string;
  empresaIds?: string[];
  userRole?: string;
  userId?: string;
}

function normalizarContexto(ctx: TenantContext | string): Required<Omit<TenantContext, 'userId'>> & { userId: string } {
  const base: TenantContext = typeof ctx === 'string' ? { empresaId: ctx } : ctx;
  const empresaIds = base.empresaIds && base.empresaIds.length > 0 ? base.empresaIds : [base.empresaId];
  return {
    empresaId: base.empresaId,
    empresaIds,
    userRole: base.userRole || 'Vendedor',
    userId: base.userId || 'sistema',
  };
}

/**
 * Aplica o contexto de tenant na sessao. Sempre parametrizado -- os valores
 * nunca sao concatenados no SQL.
 */
async function aplicarContexto(client: PoolClient, ctx: TenantContext | string): Promise<void> {
  const c = normalizarContexto(ctx);
  await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [c.empresaId]);
  await client.query("SELECT set_config('app.empresa_ids', $1, true)", [c.empresaIds.join(',')]);
  await client.query("SELECT set_config('app.user_role', $1, true)", [c.userRole]);
  await client.query("SELECT set_config('app.user_id', $1, true)", [c.userId]);
}

/**
 * Escrita: transacao explicita com o contexto de tenant aplicado.
 */
export async function withTenantTransaction<T>(
  ctx: TenantContext | string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await aplicarContexto(client, ctx);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr: any) {
      console.warn('[DB] Falha no ROLLBACK:', rollbackErr.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Leitura: mesmo contexto de tenant, sem o custo de uma transacao de escrita.
 *
 * set_config(..., true) e local a transacao, entao a leitura tambem abre uma
 * transacao -- mas somente-leitura, o que deixa explicito que nada aqui grava.
 */
export async function withTenantQuery<T>(
  ctx: TenantContext | string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await aplicarContexto(client, ctx);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* a conexao ja pode ter sido perdida; o release abaixo cuida do resto */
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Encerra o pool. Usado pelos scripts e testes para nao deixar o processo preso
 * (regra 5 de .agents/rules/eco-mitang-rules.md).
 */
export async function encerrarPool(): Promise<void> {
  await pgPool.end();
}

/**
 * Contexto abrangendo todos os CNPJs ativos da holding.
 *
 * Usado apenas por rotinas de manutencao que existem justamente para atravessar
 * tenants: sincronizacao do espelho local, varredura de CNPJs e scripts de
 * carga. Nunca por uma rota da API -- ali o escopo vem sempre do token.
 */
export async function contextoTodosTenants(userRole = 'Gestor_CLevel'): Promise<TenantContext> {
  const res = await pgPool.query('SELECT id FROM empresas WHERE ativo = TRUE ORDER BY created_at;');
  const ids: string[] = res.rows.map((r: any) => r.id);
  if (ids.length === 0) {
    throw new Error('[DB] Nenhuma empresa ativa cadastrada.');
  }
  return { empresaId: ids[0], empresaIds: ids, userRole, userId: 'rotina-sistema' };
}
