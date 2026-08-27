const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectNfLink() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT numero_nota, serie, tipo_documento, valor_total, data_emissao, emitente_nome, destinatario_nome, destinatario_cnpj_cpf
      FROM notas_fiscais
      ORDER BY data_emissao DESC
      LIMIT 10;
    `);
    console.log('Sample notas_fiscais:');
    res.rows.forEach(r => {
      console.log(` -> NF #${r.numero_nota} (${r.serie}) | ${r.tipo_documento} | R$ ${r.valor_total} | ${r.data_emissao} | Emit: ${r.emitente_nome} | Dest: ${r.destinatario_nome} (${r.destinatario_cnpj_cpf})`);
    });

    const countNf = await client.query(`SELECT count(*) as total, count(DISTINCT numero_nota) as unicas FROM notas_fiscais;`);
    console.log('Total notas_fiscais in DB:', countNf.rows[0]);
  } finally {
    client.release();
    pgPool.end();
  }
}
inspectNfLink();
