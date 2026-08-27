const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const migrationFiles = [
  '01_schema_multi_tenant.sql',
  '02_catalogo_universal.sql',
  '03_tickets_triagem.sql',
  '04_cotacoes.sql',
  '05_ordens_servico.sql',
  '06_execucao_operacional.sql',
  '07_financeiro_receber.sql',
  '08_qsms_auditoria.sql',
  '09_analytics_cqrs.sql',
  '10_clientes_historico.sql',
  '11_extratos_ofx_conciliacao.sql',
  '12_nfe_nfse_xml_armazenamento.sql',
  '13_baterias_e_orcamentos_historico.sql'
];

async function runMigrations() {
  console.log('======================================================================');
  console.log('       APLICANDO MIGRATIONS DDL NO BANCO DE DADOS SUPABASE            ');
  console.log('======================================================================\n');

  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  for (const file of migrationFiles) {
    const filePath = path.join(__dirname, '..', 'database', file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Aplicando ${file}...`);
    try {
      await client.query(sql);
      console.log(`  -> [OK] ${file} aplicado com sucesso.`);
    } catch (err) {
      console.error(`  -> [ERRO] Falha ao aplicar ${file}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  // Verifica tabelas criadas no schema public
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log('\n======================================================================');
  console.log(`   TABELAS CRIADAS NO SUPABASE (${res.rows.length} tabelas encontradas) `);
  console.log('======================================================================');
  res.rows.forEach(r => console.log(`  * ${r.table_name}`));
  console.log('======================================================================\n');

  await client.end();
}

runMigrations().catch(console.error);
