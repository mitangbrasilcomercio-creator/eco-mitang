const { pgPool } = require('../dist/core/database/supabase-pool');

async function checkInstallments() {
  const client = await pgPool.connect();
  try {
    const dupCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notas_fiscais_duplicatas';");
    console.log('notas_fiscais_duplicatas cols:', dupCols.rows.map(r => `${r.column_name} (${r.data_type})`));
    const dupSample = await client.query('SELECT * FROM notas_fiscais_duplicatas LIMIT 5;');
    console.log('Duplicatas sample:', dupSample.rows);

    const parcCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'parcelas_recebimento';");
    console.log('\nparcelas_recebimento cols:', parcCols.rows.map(r => `${r.column_name} (${r.data_type})`));
    const parcSample = await client.query('SELECT * FROM parcelas_recebimento LIMIT 5;');
    console.log('parcelas_recebimento sample:', parcSample.rows);

  } finally {
    client.release();
    pgPool.end();
  }
}

checkInstallments();
