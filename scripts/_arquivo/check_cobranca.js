const { pgPool } = require('../dist/core/database/supabase-pool');

async function checkJson() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT 
        numero_nota, emitente_nome, destinatario_nome, valor_total, data_emissao,
        dados_completos_json->'cobranca' as cobranca,
        dados_completos_json->'duplicatas' as duplicatas,
        dados_completos_json->'fatura' as fatura
      FROM notas_fiscais
      WHERE dados_completos_json IS NOT NULL
      LIMIT 5;
    `);
    console.log('AMOSTRA COBRANÇA JSON:', JSON.stringify(res.rows, null, 2));

    const contas = await client.query(`
      SELECT id, empresa_id, banco_nome, agencia, conta_numero, saldo_atual
      FROM contas_bancarias;
    `);
    console.log('\nCONTAS BANCÁRIAS:', contas.rows);
  } finally {
    client.release();
    await pgPool.end();
  }
}
checkJson().catch(console.error);
