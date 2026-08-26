import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function withTenantTransaction<T>(
  empresaId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    // Seta a variavel de sessao para Row Level Security (RLS) no PostgreSQL
    await client.query(`SET LOCAL app.current_empresa_id = '${empresaId}'`);
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
