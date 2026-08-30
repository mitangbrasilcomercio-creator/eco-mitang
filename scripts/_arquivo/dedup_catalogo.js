const { Client } = require('pg');
require('dotenv').config();

async function dedup() {
  const client = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    const dupRes = await client.query(`
      SELECT empresa_id, nome
      FROM catalogo_universal
      GROUP BY empresa_id, nome
      HAVING COUNT(*) > 1;
    `);

    for (const d of dupRes.rows) {
      const allRows = await client.query(`
        SELECT id FROM catalogo_universal
        WHERE empresa_id = $1 AND nome = $2
        ORDER BY created_at DESC;
      `, [d.empresa_id, d.nome]);

      const keepId = allRows.rows[0].id;
      const removeIds = allRows.rows.slice(1).map(r => r.id);

      // Reatribuir cotacoes_itens
      await client.query(`
        UPDATE cotacoes_itens SET item_catalogo_id = $1 WHERE item_catalogo_id = ANY($2::uuid[]);
      `, [keepId, removeIds]);

      // Deletar duplicatas
      await client.query(`
        DELETE FROM catalogo_universal WHERE id = ANY($1::uuid[]);
      `, [removeIds]);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unq_catalogo_empresa_nome ON catalogo_universal (empresa_id, nome);
    `);

    await client.query('COMMIT');
    console.log('[OK] catalogo_universal deduplicado e índice UNIQUE unq_catalogo_empresa_nome criado com sucesso!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro:', err);
  } finally {
    await client.end();
  }
}

dedup();
