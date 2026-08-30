const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const MITANG_ID = '29ea0857-7cf7-44e1-ba36-a3f323c4670c';
const ARANDU_ID = '0754c882-d528-4d34-8c96-6d9af7e8d322';

async function main() {
  const client = await pool.connect();
  try {
    console.log('======================================================================');
    console.log(' CLASSIFICAÇÃO RIGOROSA DE PARCEIROS: CLIENTE, FORNECEDOR E COLABORADOR');
    console.log('======================================================================');

    // 1. Criar coluna tipo_entidade na tabela clientes
    await client.query(`
      ALTER TABLE clientes 
      ADD COLUMN IF NOT EXISTS tipo_entidade VARCHAR(50) NOT NULL DEFAULT 'CLIENTE';
    `);
    console.log('[OK] Coluna tipo_entidade garantida na tabela clientes.');

    // 2. Todos os clientes originais de cnpj_data.json permanecem como CLIENTE
    await client.query(`
      UPDATE clientes SET tipo_entidade = 'CLIENTE' WHERE tipo_entidade IS NULL;
    `);

    // 3. Identificar FORNECEDORES a partir das NF-e Recebidas (Insumos/Produtos)
    const fornecedoresRes = await client.query(`
      SELECT DISTINCT ON (emitente_cnpj_cpf)
        emitente_cnpj_cpf, emitente_nome, emitente_uf, emitente_municipio, empresa_id
      FROM notas_fiscais
      WHERE direcao = 'RECEBIDA' AND tipo_documento = 'NFE_PRODUTO'
      ORDER BY emitente_cnpj_cpf;
    `);
    console.log(`Encontrados ${fornecedoresRes.rows.length} fornecedores industriais em NF-e.`);

    for (const f of fornecedoresRes.rows) {
      for (const empId of [MITANG_ID, ARANDU_ID]) {
        await client.query(`
          INSERT INTO clientes (
            empresa_id, cnpj_cpf, razao_social_nome, nome_fantasia,
            municipio, uf, tipo_entidade, ativo
          ) VALUES ($1, $2, $3, $3, $4, $5, 'FORNECEDOR', TRUE)
          ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET
            tipo_entidade = 'FORNECEDOR',
            razao_social_nome = EXCLUDED.razao_social_nome;
        `, [empId, f.emitente_cnpj_cpf, f.emitente_nome, f.emitente_municipio, f.emitente_uf]);
      }
    }
    console.log('[OK] Fornecedores industriais cadastrados com tipo_entidade = FORNECEDOR.');

    // 4. Identificar PRESTADORES DE SERVIÇO / COLABORADORES PJ a partir das NFS-e Recebidas
    const colabRes = await client.query(`
      SELECT DISTINCT ON (emitente_cnpj_cpf)
        emitente_cnpj_cpf, emitente_nome, emitente_uf, emitente_municipio, empresa_id
      FROM notas_fiscais
      WHERE direcao = 'RECEBIDA' AND tipo_documento = 'NFSE_SERVICO'
      ORDER BY emitente_cnpj_cpf;
    `);
    console.log(`Encontrados ${colabRes.rows.length} colaboradores PJ / prestadores em NFS-e.`);

    for (const c of colabRes.rows) {
      for (const empId of [MITANG_ID, ARANDU_ID]) {
        await client.query(`
          INSERT INTO clientes (
            empresa_id, cnpj_cpf, razao_social_nome, nome_fantasia,
            municipio, uf, tipo_entidade, ativo
          ) VALUES ($1, $2, $3, $3, $4, $5, 'COLABORADOR_PJ', TRUE)
          ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET
            tipo_entidade = 'COLABORADOR_PJ',
            razao_social_nome = EXCLUDED.razao_social_nome;
        `, [empId, c.emitente_cnpj_cpf, c.emitente_nome, c.emitente_municipio, c.emitente_uf]);
      }
    }
    console.log('[OK] Colaboradores PJ / Prestadores cadastrados com tipo_entidade = COLABORADOR_PJ.');

    // 5. Totalizador
    const resumo = await client.query(`
      SELECT tipo_entidade, COUNT(*) as total
      FROM clientes
      GROUP BY tipo_entidade;
    `);
    console.log('\n--- RESUMO DE PARCEIROS POR CATEGORIA ---');
    console.table(resumo.rows);

  } finally {
    client.release();
    pool.end();
  }
}

main();
