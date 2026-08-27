import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const directConnectionString = rawUrl ? rawUrl.replace('aws-0-sa-east-1.pooler.supabase.com', '15.229.150.166') : rawUrl;

export const pgPool = new Pool({
  connectionString: directConnectionString,
  ssl: { rejectUnauthorized: false },
  max: 15,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
});

// Impede que desconexões de clientes ociosos derrubem o processo Node.js
pgPool.on('error', (err: Error) => {
  console.warn('[SUPABASE PG POOL WARNING]: Conexão ociosa reciclada:', err.message);
});

export async function withTenantTransaction<T>(
  empresaId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    // Seta a variavel de sessao para Row Level Security (RLS) de forma parametrizada (previne SQL Injection)
    await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [empresaId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
