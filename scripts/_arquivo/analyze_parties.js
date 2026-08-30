const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    const emitidas = await client.query(`
      SELECT COUNT(DISTINCT destinatario_cnpj_cpf) as total_clientes_compradores,
             COUNT(*) as total_notas_emitidas,
             SUM(valor_total) as total_faturado
      FROM notas_fiscais WHERE direcao = 'EMITIDA';
    `);
    console.log('Notas Emitidas (Clientes que compram da gente):', emitidas.rows[0]);

    const fornecedores = await client.query(`
      SELECT COUNT(DISTINCT emitente_cnpj_cpf) as total_fornecedores,
             COUNT(*) as total_notas_compras,
             SUM(valor_total) as total_comprado
      FROM notas_fiscais WHERE direcao = 'RECEBIDA' AND tipo_documento = 'NFE_PRODUTO';
    `);
    console.log('Notas Recebidas NFe (Fornecedores de Produtos/Insumos):', fornecedores.rows[0]);

    const servicos = await client.query(`
      SELECT COUNT(DISTINCT emitente_cnpj_cpf) as total_prestadores_colab,
             COUNT(*) as total_nfse_recebidas,
             SUM(valor_total) as total_servicos_tomados
      FROM notas_fiscais WHERE direcao = 'RECEBIDA' AND tipo_documento = 'NFSE_SERVICO';
    `);
    console.log('Notas Recebidas NFSe (Prestadores de Serviço / Colaboradores PJ):', servicos.rows[0]);

    // Principais Fornecedores
    const topFornec = await client.query(`
      SELECT emitente_nome, emitente_cnpj_cpf, COUNT(*) as qtd_notas, SUM(valor_total) as total_gasto
      FROM notas_fiscais
      WHERE direcao = 'RECEBIDA'
      GROUP BY emitente_nome, emitente_cnpj_cpf
      ORDER BY total_gasto DESC
      LIMIT 10;
    `);
    console.log('\nTop 10 Fornecedores & Prestadores de Serviço:');
    console.table(topFornec.rows);

  } finally {
    client.release();
    pool.end();
  }
}

main();
