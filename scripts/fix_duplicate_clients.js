const { pgPool } = require('../dist/core/database/supabase-pool');

async function fixDuplicateClients() {
  const client = await pgPool.connect();
  try {
    const delCli = await client.query(`
      DELETE FROM clientes
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY regexp_replace(cnpj_cpf, '[^0-9]', '', 'g')
            ORDER BY 
              (CASE WHEN capital_social IS NOT NULL AND capital_social > 0 THEN 1 ELSE 0 END) DESC,
              (CASE WHEN qsa IS NOT NULL AND qsa::text != '[]' THEN 1 ELSE 0 END) DESC,
              created_at ASC
          ) as rnum
          FROM clientes
          WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
        ) dup
        WHERE dup.rnum > 1
      );
    `);
    console.log(`[OK] Deletados ${delCli.rowCount} registros duplicados de clientes!`);

    // Verificar se sobrou qualquer CNPJ duplicado
    const check = await client.query(`
      SELECT regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') as cnpj, count(*) as qtd
      FROM clientes
      WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      GROUP BY regexp_replace(cnpj_cpf, '[^0-9]', '', 'g')
      HAVING count(*) > 1;
    `);
    console.log(`CNPJs duplicados restantes: ${check.rows.length}`);

  } finally {
    client.release();
    pgPool.end();
  }
}

fixDuplicateClients();
