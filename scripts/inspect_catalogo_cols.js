const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectCatalogoCols() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'itens_catalogo';
    `);
    console.log('Columns in itens_catalogo:');
    res.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));

    const all = await client.query(`SELECT * FROM itens_catalogo;`);
    console.log(`Total rows in itens_catalogo: ${all.rows.length}`);
    console.log(all.rows);
  } finally {
    client.release();
    pgPool.end();
  }
}
inspectCatalogoCols();
