const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectCatalogo() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`SELECT id, empresa_id, codigo_sku, nome, categoria, preco_base, status_ativo FROM itens_catalogo;`);
    console.log(`itens_catalogo in DB: ${res.rows.length} rows`);
    res.rows.forEach(r => console.log(r));
  } finally {
    client.release();
    pgPool.end();
  }
}
inspectCatalogo();
