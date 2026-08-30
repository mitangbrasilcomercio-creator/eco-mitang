const { pgPool } = require('../dist/core/database/supabase-pool');

async function markInformative() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      UPDATE transacoes_bancarias 
      SET is_saldo_informativo = TRUE 
      WHERE memo ILIKE '%SALDO MOVIMENTA%' 
         OR memo ILIKE '%SALDO TOTAL DISPON%' 
         OR memo ILIKE '%SALDO APLIC. AUT.%' 
         OR memo ILIKE '%SDO ANTERIOR%' 
         OR memo ILIKE '%SALDO ANTERIOR%';
    `);
    console.log('Informative balance transactions marked:', res.rowCount);

    const activeTx = await client.query('SELECT count(*) FROM transacoes_bancarias WHERE is_saldo_informativo = FALSE');
    console.log('Real operational cash flow transactions:', activeTx.rows[0].count);

    // Also fix any strange characters (mojibake)
    await client.query(`
      UPDATE transacoes_bancarias 
      SET memo = replace(memo, 'SAÍ\x8DDA', 'SAÍDA')
      WHERE memo LIKE '%SAÍ%DA%';
    `);
    console.log('Fixed SAÍDA memo character in transacoes_bancarias.');

  } finally {
    client.release();
    pgPool.end();
  }
}

markInformative();
