const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectCatalogoUniversal() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT count(*) as total, count(DISTINCT nome) as unicos, count(DISTINCT detalhes->>'codigo_sku') as skus_unicos 
      FROM catalogo_universal;
    `);
    console.log('catalogo_universal summary:', res.rows[0]);

    // Check duplicate names
    const dups = await client.query(`
      SELECT nome, count(*) as qtd, array_agg(empresa_id) as empresas 
      FROM catalogo_universal 
      GROUP BY nome 
      HAVING count(*) > 1 
      LIMIT 10;
    `);
    console.log(`Duplicate names in catalogo_universal: ${dups.rows.length}`);
    dups.rows.forEach(r => console.log(` -> [${r.qtd}x] ${r.nome} (empresas: ${r.empresas})`));

  } finally {
    client.release();
    pgPool.end();
  }
}
inspectCatalogoUniversal();
