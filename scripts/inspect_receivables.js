const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectReceivables() {
  const client = await pgPool.connect();
  try {
    const nfEmit = await client.query(`
      SELECT 
        id, numero, emitente_nome, destinatario_nome, valor_total, data_emissao, status_pagamento
      FROM notas_fiscais
      WHERE direcao = 'EMITIDA'
      ORDER BY data_emissao DESC
      LIMIT 10;
    `);
    console.log('NOTAS EMITIDAS AMOSTRA:', nfEmit.rows);

    const nfRec = await client.query(`
      SELECT 
        id, numero, emitente_nome, destinatario_nome, valor_total, data_emissao, status_pagamento
      FROM notas_fiscais
      WHERE direcao = 'RECEBIDA'
      ORDER BY data_emissao DESC
      LIMIT 10;
    `);
    console.log('\nNOTAS RECEBIDAS AMOSTRA:', nfRec.rows);

    const contas = await client.query(`
      SELECT id, empresa_id, banco_nome, agencia, conta_numero, saldo_atual
      FROM contas_bancarias;
    `);
    console.log('\nCONTAS BANCÁRIAS SALDOS:', contas.rows);

  } finally {
    client.release();
    await pgPool.end();
  }
}
inspectReceivables().catch(console.error);
