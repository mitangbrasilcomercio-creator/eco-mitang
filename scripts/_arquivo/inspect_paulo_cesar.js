const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectPauloCesar() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT id, fitid, data_lancamento, valor, memo, created_at, conta_bancaria_id
      FROM transacoes_bancarias
      WHERE memo ILIKE '%PAULO CESAR%';
    `);
    console.log(`Paulo Cesar rows: ${res.rows.length}`);
    res.rows.forEach(r => console.log(r));
  } finally {
    client.release();
    pgPool.end();
  }
}
inspectPauloCesar();
