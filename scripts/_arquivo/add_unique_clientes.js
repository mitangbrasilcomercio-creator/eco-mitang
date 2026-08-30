const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Achar duplicatas
    const dupRes = await client.query(`
      SELECT empresa_id, cnpj_cpf
      FROM clientes
      GROUP BY empresa_id, cnpj_cpf
      HAVING COUNT(*) > 1;
    `);

    for (const d of dupRes.rows) {
      const allRows = await client.query(`
        SELECT id FROM clientes 
        WHERE empresa_id = $1 AND cnpj_cpf = $2 
        ORDER BY created_at DESC;
      `, [d.empresa_id, d.cnpj_cpf]);

      const keepId = allRows.rows[0].id;
      const removeIds = allRows.rows.slice(1).map(r => r.id);

      // Reatribui cotações
      await client.query(`
        UPDATE cotacoes SET cliente_id = $1 WHERE cliente_id = ANY($2::uuid[]);
      `, [keepId, removeIds]);

      // Reatribui histórico
      await client.query(`
        UPDATE clientes_historico_alteracoes SET cliente_id = $1 WHERE cliente_id = ANY($2::uuid[]);
      `, [keepId, removeIds]);

      // Deleta duplicados
      await client.query(`
        DELETE FROM clientes WHERE id = ANY($1::uuid[]);
      `, [removeIds]);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unq_clientes_empresa_cnpj ON clientes (empresa_id, cnpj_cpf);
    `);

    await client.query('COMMIT');
    console.log('[OK] Índice UNIQUE unq_clientes_empresa_cnpj criado com sucesso!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro:', err);
  } finally {
    await client.end();
  }
}

run();
