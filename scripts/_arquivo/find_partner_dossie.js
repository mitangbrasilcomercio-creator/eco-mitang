const { pgPool } = require('../dist/core/database/supabase-pool');

async function checkPartners() {
  const client = await pgPool.connect();
  try {
    const res = await client.query(`
      SELECT id, razao_social_nome, cnpj_cpf 
      FROM clientes 
      WHERE razao_social_nome ILIKE '%PETROBRAS%' 
         OR razao_social_nome ILIKE '%HIDROTOPO%' 
         OR razao_social_nome ILIKE '%STREMA%'
         OR razao_social_nome ILIKE '%OCEANPACT%'
         OR razao_social_nome ILIKE '%FUGRO%';
    `);
    console.log('Found partners:', res.rows);

    for (const p of res.rows) {
      const dossieRes = await fetch(`http://localhost:3000/api/v1/clientes/${p.id}/dossie`, {
        headers: { 'x-empresa-id': 'all' }
      });
      const d = await dossieRes.json();
      console.log(`\n================== DOSSIÊ: ${p.razao_social_nome} ==================`);
      console.log('Vertical:', d.data?.vertical);
      console.log('KPIs:', d.data?.kpis);
      console.log('Notas:', d.data?.notas_fiscais.length);
      console.log('Orçamentos:', d.data?.orcamentos.length);
      console.log('Baterias Negociadas:', d.data?.produtos_mais_movimentados.length);
      console.log('Transações Bancárias:', d.data?.transacoes_bancarias.length);
    }

  } finally {
    client.release();
    pgPool.end();
  }
}

checkPartners();
