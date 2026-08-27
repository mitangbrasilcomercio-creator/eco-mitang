const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectOrcamentos() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT count(*) as total, count(DISTINCT numero_orcamento) as unicos 
      FROM orcamentos_historico;
    `);
    console.log('orcamentos_historico summary:', res.rows[0]);

    // Check duplicate numbers
    const dups = await client.query(`
      SELECT numero_orcamento, count(*) as qtd, array_agg(vendido_por) as vendedores 
      FROM orcamentos_historico 
      GROUP BY numero_orcamento 
      HAVING count(*) > 1 
      LIMIT 10;
    `);
    console.log(`Duplicate quote numbers: ${dups.rows.length}`);
    dups.rows.forEach(r => console.log(` -> #${r.numero_orcamento} (${r.qtd}x) - Vendedores: ${r.vendedores}`));

    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'orcamentos_historico';
    `);
    console.log('Columns in orcamentos_historico:', cols.rows.map(r => r.column_name));

    // Inspect encoding issues (mojibake)
    const badEnc = await client.query(`
      SELECT numero_orcamento, cliente_nome, status_aprovacao, orcamento_enviado, situacao_geral, itens_json::text as itens
      FROM orcamentos_historico
      WHERE cliente_nome LIKE '%Ã%' 
         OR status_aprovacao LIKE '%Ã%'
         OR orcamento_enviado LIKE '%Ã%'
         OR situacao_geral LIKE '%Ã%'
         OR itens_json::text LIKE '%Ã%'
      LIMIT 15;
    `);
    console.log(`\nQuotes with mojibake / bad encoding: ${badEnc.rows.length}`);
    badEnc.rows.forEach(r => {
      console.log(` -> #${r.numero_orcamento} | Cliente: ${r.cliente_nome} | Status: ${r.status_aprovacao} | Enviado: ${r.orcamento_enviado}`);
      console.log(`    Itens:`, r.itens.substring(0, 100));
    });

  } finally {
    client.release();
    pgPool.end();
  }
}
inspectOrcamentos();
