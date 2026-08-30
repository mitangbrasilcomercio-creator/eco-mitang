const { Client } = require('pg');
require('dotenv').config();

async function seed() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const empresas = [
    { cnpj: '11111111000101', razao_social: 'Mitang Baterias Industriais SA', nome_fantasia: 'Mitang Power', ramo_atividade: 'Manufatura Baterias' },
    { cnpj: '22222222000102', razao_social: 'Mitang Offshore Locacoes Ltda', nome_fantasia: 'Mitang Rental', ramo_atividade: 'Locacao Offshore' },
    { cnpj: '33333333000103', razao_social: 'Mitang Subsea & Servicos Ltda', nome_fantasia: 'Mitang Services', ramo_atividade: 'Servicos Offshore' },
    { cnpj: '44444444000104', razao_social: 'Mitang Treinamentos Maritimos SA', nome_fantasia: 'Mitang Academy', ramo_atividade: 'Cursos' }
  ];

  console.log('Populando os 4 CNPJs da Holding Eco-Mitang no Supabase...');
  for (const emp of empresas) {
    await client.query(`
      INSERT INTO empresas (cnpj, razao_social, nome_fantasia, ramo_atividade)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cnpj) DO UPDATE SET
        razao_social = EXCLUDED.razao_social,
        nome_fantasia = EXCLUDED.nome_fantasia,
        ramo_atividade = EXCLUDED.ramo_atividade,
        updated_at = NOW();
    `, [emp.cnpj, emp.razao_social, emp.nome_fantasia, emp.ramo_atividade]);
  }

  const res = await client.query('SELECT id, cnpj, nome_fantasia, ramo_atividade FROM empresas ORDER BY cnpj;');
  console.log('\nEmpresas cadastradas no Supabase:');
  console.table(res.rows);

  await client.end();
}

seed().catch(console.error);
