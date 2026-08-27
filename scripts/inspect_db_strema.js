const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectTxStrema() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT t.id, t.empresa_id, t.fitid, t.data_lancamento, t.valor, t.memo, e.nome_fantasia as empresa_nome, cb.banco_nome, cb.conta_numero
      FROM transacoes_bancarias t
      JOIN empresas e ON e.id = t.empresa_id
      JOIN contas_bancarias cb ON cb.id = t.conta_bancaria_id
      WHERE t.valor = -2919.35;
    `);
    console.log(`Found ${res.rows.length} rows for Strema 2919.35:`);
    res.rows.forEach(r => {
      console.log(`ID: ${r.id} | Empresa: ${r.empresa_nome} | Conta: ${r.banco_nome} ${r.conta_numero} | FITID: ${r.fitid} | Data: ${r.data_lancamento}`);
    });
  } finally {
    client.release();
    pgPool.end();
  }
}
inspectTxStrema();
