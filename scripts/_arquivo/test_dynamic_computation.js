const { pgPool } = require('../dist/core/database/supabase-pool');

async function testDynamicComputation() {
  const client = await pgPool.connect();
  try {
    const meses = [
      { key: '2026-01', label: 'JAN' },
      { key: '2026-02', label: 'FEV' },
      { key: '2026-03', label: 'MAR' },
      { key: '2026-04', label: 'ABR' },
      { key: '2026-05', label: 'MAI' },
      { key: '2026-06', label: 'JUN' },
      { key: '2026-07', label: 'JUL' },
      { key: '2026-08', label: 'AGO' },
    ];

    console.log('--- APURAÇÃO DINÂMICA REAL MÊS A MÊS (2026) ---');

    for (const m of meses) {
      // 1. Orçamentos aprovados
      const orcRes = await client.query(`
        SELECT COALESCE(SUM(valor_total), 0) as fat
        FROM orcamentos_historico
        WHERE status_aprovacao = 'Compra Aprovada'
          AND TO_CHAR(data_emissao, 'YYYY-MM') = $1;
      `, [m.key]);

      // 2. Entradas e saídas reais
      const txRes = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN valor > 0 AND is_saldo_informativo = false AND categoria_financeira NOT IN ('APLICACAO_RESGATE_AUTOMATICO') THEN valor ELSE 0 END), 0) as rec,
          COALESCE(SUM(CASE WHEN valor < 0 AND is_saldo_informativo = false AND categoria_financeira NOT IN ('APLICACAO_RESGATE_AUTOMATICO') THEN ABS(valor) ELSE 0 END), 0) as pag
        FROM transacoes_bancarias
        WHERE TO_CHAR(data_lancamento, 'YYYY-MM') = $1;
      `, [m.key]);

      // 3. Notas fiscais
      const nfEmitRes = await client.query(`
        SELECT COALESCE(SUM(valor_total), 0) as nf_emit
        FROM notas_fiscais
        WHERE direcao = 'EMITIDA' AND TO_CHAR(data_emissao, 'YYYY-MM') = $1;
      `, [m.key]);

      const fat = Math.max(parseFloat(orcRes.rows[0].fat), parseFloat(nfEmitRes.rows[0].nf_emit));
      const rec = parseFloat(txRes.rows[0].rec);
      const pag = parseFloat(txRes.rows[0].pag);

      console.log(`${m.label} (${m.key}): Faturado=R$ ${fat.toFixed(2)} | Recebido=R$ ${rec.toFixed(2)} | Pago=R$ ${pag.toFixed(2)}`);
    }

  } finally {
    client.release();
    await pgPool.end();
  }
}
testDynamicComputation().catch(console.error);
