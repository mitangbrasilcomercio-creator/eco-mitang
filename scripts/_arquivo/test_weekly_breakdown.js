const { pgPool } = require('../dist/core/database/supabase-pool');

async function testWeeklyBreakdown() {
  const client = await pgPool.connect();
  try {
    const weeks = [
      { label: 'Sem 1 (01-07/08)', start: '2026-08-01', end: '2026-08-07' },
      { label: 'Sem 2 (08-14/08)', start: '2026-08-08', end: '2026-08-14' },
      { label: 'Sem 3 (15-21/08)', start: '2026-08-15', end: '2026-08-21' },
      { label: 'Sem 4 (22-28/08)', start: '2026-08-22', end: '2026-08-28' },
      { label: 'Sem 5 (29-31/08)', start: '2026-08-29', end: '2026-08-31' }
    ];

    console.log('--- DETALHAMENTO SEMANAL AGOSTO/2026 ---');
    for (const w of weeks) {
      const orcRes = await client.query(`
        SELECT COALESCE(SUM(valor_total), 0) as fat
        FROM orcamentos_historico
        WHERE status_aprovacao = 'Compra Aprovada'
          AND data_emissao >= $1 AND data_emissao <= $2;
      `, [w.start, w.end]);

      const nfRes = await client.query(`
        SELECT COALESCE(SUM(valor_total), 0) as nf_fat
        FROM notas_fiscais
        WHERE direcao = 'EMITIDA'
          AND data_emissao >= $1 AND data_emissao <= $2;
      `, [w.start, w.end]);

      const txRes = await client.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN valor > 0 AND is_saldo_informativo = false AND categoria_financeira NOT IN ('APLICACAO_RESGATE_AUTOMATICO') THEN valor ELSE 0 END), 0) as rec,
          COALESCE(SUM(CASE WHEN valor < 0 AND is_saldo_informativo = false AND categoria_financeira NOT IN ('APLICACAO_RESGATE_AUTOMATICO') THEN ABS(valor) ELSE 0 END), 0) as pag
        FROM transacoes_bancarias
        WHERE data_lancamento >= $1 AND data_lancamento <= $2;
      `, [w.start, w.end]);

      const fat = Math.max(parseFloat(orcRes.rows[0].fat), parseFloat(nfRes.rows[0].nf_fat));
      const rec = parseFloat(txRes.rows[0].rec);
      const pag = parseFloat(txRes.rows[0].pag);

      console.log(`${w.label}: Faturado=R$ ${fat.toFixed(2)} | Recebido=R$ ${rec.toFixed(2)} | Pago=R$ ${pag.toFixed(2)}`);
    }

  } finally {
    client.release();
    await pgPool.end();
  }
}
testWeeklyBreakdown().catch(console.error);
