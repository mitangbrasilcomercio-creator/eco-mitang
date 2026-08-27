const { pgPool } = require('../dist/core/database/supabase-pool');

async function inspect() {
  const client = await pgPool.connect();
  try {
    const orc = await client.query(`
      SELECT 
        vendido_por,
        COUNT(*) as total_orcs,
        SUM(valor_total) as soma_total,
        MIN(data_emissao) as min_data,
        MAX(data_emissao) as max_data
      FROM orcamentos_historico
      GROUP BY vendido_por;
    `);
    console.log('ORÇAMENTOS POR EMPRESA:', orc.rows);

    const orcMes = await client.query(`
      SELECT 
        TO_CHAR(data_emissao, 'YYYY-MM') as mes,
        COUNT(*) as total_orcs,
        SUM(valor_total) as soma_total,
        SUM(CASE WHEN status_aprovacao = 'Compra Aprovada' THEN valor_total ELSE 0 END) as soma_aprovados
      FROM orcamentos_historico
      GROUP BY TO_CHAR(data_emissao, 'YYYY-MM')
      ORDER BY mes ASC;
    `);
    console.log('\nORÇAMENTOS POR MÊS:', orcMes.rows);

    const tx = await client.query(`
      SELECT 
        TO_CHAR(data_lancamento, 'YYYY-MM') as mes,
        COUNT(*) as total_tx,
        SUM(CASE WHEN valor > 0 AND is_saldo_informativo = false AND categoria_financeira != 'APLICACAO_RESGATE_AUTOMATICO' THEN valor ELSE 0 END) as entradas_reais,
        SUM(CASE WHEN valor < 0 AND is_saldo_informativo = false AND categoria_financeira != 'APLICACAO_RESGATE_AUTOMATICO' THEN ABS(valor) ELSE 0 END) as saidas_reais
      FROM transacoes_bancarias
      GROUP BY TO_CHAR(data_lancamento, 'YYYY-MM')
      ORDER BY mes ASC;
    `);
    console.log('\nTRANSAÇÕES POR MÊS:', tx.rows);

    const nf = await client.query(`
      SELECT 
        direcao,
        TO_CHAR(data_emissao, 'YYYY-MM') as mes,
        COUNT(*) as total_nf,
        SUM(valor_total) as soma_nf
      FROM notas_fiscais
      GROUP BY direcao, TO_CHAR(data_emissao, 'YYYY-MM')
      ORDER BY mes ASC, direcao ASC;
    `);
    console.log('\nNOTAS FISCAIS POR MÊS:', nf.rows);

  } finally {
    client.release();
    await pgPool.end();
  }
}
inspect().catch(console.error);
