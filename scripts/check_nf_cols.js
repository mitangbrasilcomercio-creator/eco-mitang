const { pgPool } = require('../dist/core/database/supabase-pool');

async function checkCols() {
  const client = await pgPool.connect();
  try {
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notas_fiscais';
    `);
    console.log('COLUNAS NOTAS_FISCAIS:', cols.rows);
  } finally {
    client.release();
    await pgPool.end();
  }
}
checkCols().catch(console.error);
