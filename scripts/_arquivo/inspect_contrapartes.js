const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectContrapartes() {
  const client = await pgPool.connect();
  try {
    const txSample = await client.query(`
      SELECT 
        id, data_lancamento, valor, memo, documento_contraparte, nome_contraparte
      FROM transacoes_bancarias
      WHERE memo ILIKE '%JANDILSON%' 
         OR memo ILIKE '%PIX%' 
         OR memo ILIKE '%TRANSF%'
      LIMIT 15;
    `);
    console.log('AMOSTRA TRANSAÇÕES PIX/TRANSF:', txSample.rows);

    const checkJandilson = await client.query(`
      SELECT id, data_lancamento, valor, memo, nome_contraparte
      FROM transacoes_bancarias
      WHERE memo ILIKE '%JANDILSON%'
      ORDER BY data_lancamento DESC;
    `);
    console.log('\nTRANSAÇÕES DE JANDILSON:', checkJandilson.rows);

  } finally {
    client.release();
    await pgPool.end();
  }
}
inspectContrapartes().catch(console.error);
