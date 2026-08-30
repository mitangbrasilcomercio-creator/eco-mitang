const { pgPool } = require('../dist/core/database/supabase-pool');

async function linkTransactions() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      UPDATE transacoes_bancarias tb
      SET cliente_id = c.id
      FROM clientes c
      WHERE regexp_replace(tb.documento_contraparte, '[^0-9]', '', 'g') = regexp_replace(c.cnpj_cpf, '[^0-9]', '', 'g')
        AND (tb.cliente_id IS NULL OR tb.cliente_id != c.id);
    `);
    console.log(`[SUCESSO] ${res.rowCount} transações bancárias foram vinculadas aos parceiros de negócio.`);

    const check = await client.query(`
      SELECT count(*) as total_com_parceiro 
      FROM transacoes_bancarias 
      WHERE cliente_id IS NOT NULL;
    `);
    console.log(`Total de transações com parceiro vinculado: ${check.rows[0].total_com_parceiro}`);

  } finally {
    client.release();
    pgPool.end();
  }
}

linkTransactions();
