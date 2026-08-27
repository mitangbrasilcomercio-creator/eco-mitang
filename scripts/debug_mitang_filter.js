const { pgPool } = require('../dist/core/database/supabase-pool');

async function checkMitang() {
  const client = await pgPool.connect();
  try {
    const empresaId = '29ea0857-7cf7-44e1-ba36-a3f323c4670c'; // Mitang Brasil

    const orcRes = await client.query(`
      SELECT COUNT(*), SUM(valor_total)
      FROM orcamentos_historico
      WHERE vendido_por != 'Arandu';
    `);
    console.log('ORCS MITANG:', orcRes.rows);

    const txRes = await client.query(`
      SELECT COUNT(*), SUM(valor)
      FROM transacoes_bancarias t
      JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
      WHERE t.empresa_id = $1;
    `, [empresaId]);
    console.log('TXS MITANG BY EMPRESA_ID:', txRes.rows);

    // Let's check empresa_id in transacoes_bancarias vs contas_bancarias
    const checkTxEmpresa = await client.query(`
      SELECT t.empresa_id, c.empresa_id as c_empresa_id, COUNT(*)
      FROM transacoes_bancarias t
      JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
      GROUP BY t.empresa_id, c.empresa_id;
    `);
    console.log('EMPRESA_ID COMPARISON IN TXS:', checkTxEmpresa.rows);

    // Let's check date strings in orcamentos_historico
    const orcSample = await client.query(`
      SELECT id, data_emissao, pg_typeof(data_emissao) as dtype
      FROM orcamentos_historico
      LIMIT 3;
    `);
    console.log('ORC DATA_EMISSAO DTYPE:', orcSample.rows);

  } finally {
    client.release();
    await pgPool.end();
  }
}
checkMitang().catch(console.error);
