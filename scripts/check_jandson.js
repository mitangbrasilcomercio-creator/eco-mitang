const { pgPool } = require('../dist/core/database/supabase-pool');

async function checkJandson() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT id, data_lancamento, valor, memo, categoria_financeira
      FROM transacoes_bancarias
      WHERE memo ILIKE '%Jandson%'
      ORDER BY data_lancamento DESC;
    `);
    console.log('TRANSAÇÕES JANDSON:', res.rows);
  } finally {
    client.release();
    await pgPool.end();
  }
}
checkJandson().catch(console.error);
