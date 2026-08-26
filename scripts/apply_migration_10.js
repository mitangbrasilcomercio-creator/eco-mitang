const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function run() {
  console.log('Conectando ao Supabase para aplicar migration 10...');
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  await client.connect();
  let sql = fs.readFileSync('database/10_item_catalogo_eav.sql', 'utf8');
  sql = sql.replace(/^\uFEFF/, '').trim(); // Remove UTF-8 BOM
  await client.query(sql);
  console.log('MIGRATION 10 APLICADA COM SUCESSO NO SUPABASE!');

  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'itens_catalogo'
    ORDER BY ordinal_position;
  `);
  console.log('\nEstrutura da tabela itens_catalogo:');
  console.table(res.rows);

  await client.end();
}

run().catch(err => {
  console.error('Erro na migration:', err.message);
  process.exit(1);
});
