const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspectSchema() {
  const client = await pgPool.connect();
  try {
    // 1. Tabelas existentes
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('Tabelas no banco:', tables.rows.map(r => r.table_name));

    // 2. Colunas de notas_fiscais
    const nfCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'notas_fiscais';
    `);
    console.log('\nColunas de notas_fiscais:', nfCols.rows.map(r => `${r.column_name} (${r.data_type})`));

    // 3. Verificar duplicatas / parcelas
    const dupRes = await client.query(`
      SELECT count(*) as total, sum(valor_total) as soma 
      FROM notas_fiscais 
      WHERE direcao = 'EMITIDA';
    `);
    console.log('\nNotas Emitidas (Vendas):', dupRes.rows[0]);

    const dupRec = await client.query(`
      SELECT count(*) as total, sum(valor_total) as soma 
      FROM notas_fiscais 
      WHERE direcao = 'RECEBIDA';
    `);
    console.log('Notas Recebidas (Compras/Insumos):', dupRec.rows[0]);

    // 4. Analisar termos de aplicação no OFX
    const aplicRes = await client.query(`
      SELECT id, memo, valor, tipo_operacao 
      FROM transacoes_bancarias 
      WHERE memo ILIKE '%APLICA%' OR memo ILIKE '%RESGATE%' OR memo ILIKE '%RENDIMENTO%' OR memo ILIKE '%INVEST%'
      LIMIT 10;
    `);
    console.log(`\nTransações de aplicação encontradas: ${aplicRes.rows.length}`);
    aplicRes.rows.forEach(r => console.log(`   -> [R$ ${r.valor}] ${r.memo}`));

  } finally {
    client.release();
    pgPool.end();
  }
}

inspectSchema();
