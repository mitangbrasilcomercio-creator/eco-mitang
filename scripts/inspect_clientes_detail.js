const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectClientes() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT count(*) as total, count(DISTINCT cnpj_cpf) as cnpjs_unicos
      FROM clientes;
    `);
    console.log('Clientes in DB:', res.rows[0]);

    // Check duplicate CNPJs
    const dupCnpj = await client.query(`
      SELECT cnpj_cpf, count(*) as qtd, array_agg(empresa_id) as empresas
      FROM clientes
      WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      GROUP BY cnpj_cpf
      HAVING count(*) > 1
      LIMIT 10;
    `);
    console.log(`Duplicate CNPJs in clientes table: ${dupCnpj.rows.length}`);
    dupCnpj.rows.forEach(r => console.log(` -> CNPJ: ${r.cnpj_cpf} (${r.qtd}x) - Empresas: ${r.empresas}`));

    // Check fields richness: QSA, CNAEs, dados_receita_brutos
    const sample = await client.query(`
      SELECT razao_social_nome, cnpj_cpf, capital_social, cnae_principal, cnae_descricao,
             jsonb_array_length(CASE WHEN jsonb_typeof(qsa) = 'array' THEN qsa ELSE '[]'::jsonb END) as qsa_len,
             jsonb_array_length(CASE WHEN jsonb_typeof(cnaes_secundarios) = 'array' THEN cnaes_secundarios ELSE '[]'::jsonb END) as cnaes_len,
             dados_receita_brutos IS NOT NULL as has_brutos
      FROM clientes
      WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      LIMIT 5;
    `);
    console.log('\nSample clients data richness:');
    sample.rows.forEach(r => console.log(r));

  } finally {
    client.release();
    pgPool.end();
  }
}
inspectClientes();
