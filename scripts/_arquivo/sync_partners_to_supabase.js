const { pgPool } = require('../dist/core/database/supabase-pool');
const fs = require('fs');

async function sync() {
  const client = await pgPool.connect();
  try {
    const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'clientes';");
    const cols = colRes.rows.map(r => r.column_name);
    console.log('Colunas em clientes:', cols);

    // Read extracted partners
    const obrigacoes = JSON.parse(fs.readFileSync('database/local_mirror/obrigacoes_recorrentes.json', 'utf-8'));
    const uniquePartners = new Map();

    obrigacoes.forEach(o => {
      const nome = o.favorecido_nome;
      if (!nome) return;
      const key = nome.toLowerCase().trim();
      if (!uniquePartners.has(key)) {
        uniquePartners.set(key, {
          razao_social_nome: nome,
          tipo_entidade: o.tipo_entidade,
          empresa_id: o.empresa_id,
          categoria: o.categoria_detalhada
        });
      }
    });

    console.log(`Encontrados ${uniquePartners.size} parceiros únicos das obrigações.`);

    // Check which exist in Supabase
    const dbRes = await client.query('SELECT id, razao_social_nome, cnpj_cpf, tipo_entidade FROM clientes;');
    console.log(`Total em clientes Supabase: ${dbRes.rows.length}`);

    const existingNames = new Set(dbRes.rows.map(r => (r.razao_social_nome || '').toLowerCase().trim()));

    let inserted = 0;
    let updated = 0;

    for (const [key, p] of uniquePartners.entries()) {
      if (existingNames.has(key)) {
        // Update tipo_entidade if needed
        await client.query(
          'UPDATE clientes SET tipo_entidade = $1 WHERE LOWER(TRIM(razao_social_nome)) = $2 AND (tipo_entidade IS NULL OR tipo_entidade != $1)',
          [p.tipo_entidade, key]
        );
        updated++;
      } else {
        // Insert new partner
        const cleanDoc = '00' + Math.floor(100000000000 + Math.random() * 899999999999);
        await client.query(`
          INSERT INTO clientes (
            empresa_id,
            cnpj_cpf,
            razao_social_nome,
            nome_fantasia,
            tipo_entidade,
            situacao_cadastral,
            ativo,
            dados_receita_brutos
          ) VALUES ($1, $2, $3, $4, $5, 'ATIVA', true, $6);
        `, [
          p.empresa_id,
          cleanDoc,
          p.razao_social_nome,
          p.razao_social_nome,
          p.tipo_entidade,
          JSON.stringify({
            origem: 'PLANILHA_DESPESAS_RECORRENTES',
            categoria: p.categoria,
            vertical: {
              vertical: p.tipo_entidade === 'COLABORADOR_PJ' ? 'Equipe Técnica' : (p.tipo_entidade === 'SOCIO_DIRETORIA' ? 'Diretoria' : 'Operacional'),
              badgeClass: p.tipo_entidade === 'COLABORADOR_PJ' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-purple-500/20 text-purple-300 border-purple-500/30',
              icone: p.tipo_entidade === 'COLABORADOR_PJ' ? 'ph-user' : 'ph-crown'
            }
          })
        ]);
        inserted++;
      }
    }

    console.log(`Sucesso: ${inserted} inseridos, ${updated} atualizados no Supabase.`);

    // Re-fetch all and save local mirror
    const finalRes = await client.query('SELECT * FROM clientes ORDER BY created_at DESC;');
    fs.writeFileSync('database/local_mirror/clientes.json', JSON.stringify(finalRes.rows, null, 2), 'utf-8');
    console.log(`Mirror database/local_mirror/clientes.json atualizado com ${finalRes.rows.length} registros definitivos!`);

  } finally {
    client.release();
    pgPool.end();
  }
}

sync().catch(err => {
  console.error('Erro no sync:', err);
  process.exit(1);
});
