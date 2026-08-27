const { pgPool } = require('../dist/core/database/supabase-pool');
const fs = require('fs');

async function fix() {
  const client = await pgPool.connect();
  try {
    const mitangId = '29ea0857-7cf7-44e1-ba36-a3f323c4670c';
    const aranduId = '0754c882-d528-4d34-8c96-6d9af7e8d322';

    // Delete existing loose socios to avoid confusion
    await client.query("DELETE FROM clientes WHERE tipo_entidade = 'SOCIO_DIRETORIA' OR LOWER(razao_social_nome) IN ('diego ribeiro', 'paulo cesar', 'paulo cesar do rego', 'regina f.');");

    // Insert Sócios para Mitang Brasil
    await client.query(`
      INSERT INTO clientes (empresa_id, cnpj_cpf, razao_social_nome, nome_fantasia, tipo_entidade, situacao_cadastral, ativo, dados_receita_brutos) VALUES
      ($1, '00612357966694', 'Diego Ribeiro', 'Diego Ribeiro (Sócio Diretor 50%)', 'SOCIO_DIRETORIA', 'ATIVA', true, $2),
      ($1, '54768950787', 'Paulo Cesar do Rego', 'Paulo Cesar (Sócio Diretor 50%)', 'SOCIO_DIRETORIA', 'ATIVA', true, $3),
      ($1, '00728810446854', 'Regina F.', 'Regina F. (Conselho)', 'SOCIO_DIRETORIA', 'ATIVA', true, $4);
    `, [
      mitangId,
      JSON.stringify({ origem: 'SOCIOS_HOLDING', participacao: '50%', vertical: { vertical: 'Diretoria Executiva', badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icone: 'ph-crown' } }),
      JSON.stringify({ origem: 'SOCIOS_HOLDING', participacao: '50%', vertical: { vertical: 'Diretoria Executiva', badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icone: 'ph-crown' } }),
      JSON.stringify({ origem: 'CONSELHO', vertical: { vertical: 'Conselho / Governança', badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icone: 'ph-crown' } })
    ]);

    // Insert Sócios para Arandu
    await client.query(`
      INSERT INTO clientes (empresa_id, cnpj_cpf, razao_social_nome, nome_fantasia, tipo_entidade, situacao_cadastral, ativo, dados_receita_brutos) VALUES
      ($1, '00612357966694', 'Diego Ribeiro', 'Diego Ribeiro (Sócio Diretor 50%)', 'SOCIO_DIRETORIA', 'ATIVA', true, $2),
      ($1, '54768950787', 'Paulo Cesar do Rego', 'Paulo Cesar (Sócio Diretor 50%)', 'SOCIO_DIRETORIA', 'ATIVA', true, $3);
    `, [
      aranduId,
      JSON.stringify({ origem: 'SOCIOS_HOLDING', participacao: '50%', vertical: { vertical: 'Diretoria Executiva', badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icone: 'ph-crown' } }),
      JSON.stringify({ origem: 'SOCIOS_HOLDING', participacao: '50%', vertical: { vertical: 'Diretoria Executiva', badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icone: 'ph-crown' } })
    ]);

    console.log('Sócios inseridos com sucesso para ambas as empresas!');

    const allRes = await client.query('SELECT * FROM clientes ORDER BY created_at DESC;');
    fs.writeFileSync('database/local_mirror/clientes.json', JSON.stringify(allRes.rows, null, 2), 'utf-8');
    console.log('Mirror atualizado com', allRes.rows.length, 'registros.');
  } finally {
    client.release();
    pgPool.end();
  }
}

fix().catch(err => console.error('Erro:', err));
