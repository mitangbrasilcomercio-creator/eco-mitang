const { pgPool } = require('../dist/core/database/supabase-pool');

async function testRunwayReal() {
  const client = await pgPool.connect();
  try {
    // 1. Saldo Bancário Atual
    const saldoRes = await client.query(`
      SELECT 
        c.banco_nome, c.agencia, c.conta_numero, c.saldo_atual, e.nome_fantasia, c.empresa_id
      FROM contas_bancarias c
      JOIN empresas e ON e.id = c.empresa_id;
    `);
    console.log('SALDOS BANCÁRIOS REAIS:', saldoRes.rows);

    // 2. Faturas Emitidas (A Receber)
    const recRes = await client.query(`
      SELECT 
        id, numero_nota, destinatario_nome as cliente, valor_total, data_emissao
      FROM notas_fiscais
      WHERE direcao = 'EMITIDA'
      ORDER BY data_emissao DESC
      LIMIT 8;
    `);
    console.log('\nTÍTULOS A RECEBER:', recRes.rows);

    // 3. Faturas Recebidas (A Pagar)
    const pagRes = await client.query(`
      SELECT 
        id, numero_nota, emitente_nome as fornecedor, valor_total, data_emissao
      FROM notas_fiscais
      WHERE direcao = 'RECEBIDA'
      ORDER BY data_emissao DESC
      LIMIT 8;
    `);
    console.log('\nTÍTULOS A PAGAR:', pagRes.rows);

  } finally {
    client.release();
    await pgPool.end();
  }
}
testRunwayReal().catch(console.error);
