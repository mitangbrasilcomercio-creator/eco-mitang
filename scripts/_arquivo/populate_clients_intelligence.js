const fs = require('fs');
const path = require('path');
const { pgPool } = require('../dist/core/database/supabase-pool');

async function populateClientsIntelligence() {
  console.log('======================================================================');
  console.log('    POPULAÇÃO DE CLIENTES COM INTELIGÊNCIA COMPLETA (CNPJ_DATA.JSON)  ');
  console.log('======================================================================\n');

  const jsonPath = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Alguns de Nossos Clientes', 'cnpj_data.json');
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const client = await pgPool.connect();

  try {
    // 1. Obter tenant Mitang Power / Mitang Brasil
    const empRes = await client.query(`
      SELECT id, razao_social, nome_fantasia FROM empresas LIMIT 1;
    `);
    const empresa = empRes.rows[0];
    console.log(`Tenant Selecionado: ${empresa.nome_fantasia} (${empresa.id})\n`);

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [empresa.id]);

    let inseridos = 0;
    let atualizados = 0;
    let inaptosBloqueados = 0;

    for (const [cnpjKey, d] of Object.entries(rawData)) {
      if (d.error) continue;

      const cleanCnpj = (d.cnpj || cnpjKey).replace(/\D/g, '');
      const razaoSocial = d.razao_social || 'Cliente Sem Razão Social';
      const situacao = d.descricao_situacao_cadastral || 'ATIVA';
      const isBloqueado = situacao === 'BAIXADA' || situacao === 'INAPTA' || situacao === 'SUSPENSA';

      if (isBloqueado) inaptosBloqueados++;

      // Formata CNAEs secundários
      const cnaesSecundarios = Array.isArray(d.cnaes_secundarios) ? d.cnaes_secundarios : [];

      // Upsert na tabela clientes
      const upsertQuery = `
        INSERT INTO clientes (
          empresa_id, cnpj_cpf, razao_social_nome, nome_fantasia,
          cnae_principal, cnae_descricao, cnaes_secundarios,
          situacao_cadastral, motivo_situacao_cadastral, data_situacao_cadastral,
          capital_social, porte, natureza_juridica,
          opcao_pelo_simples, opcao_pelo_mei,
          cep, logradouro, numero, complemento, bairro, municipio, uf,
          email_fiscal, telefone_fiscal, qsa, bloqueio_fiscal,
          dados_receita_brutos, ultima_sincronizacao_rfb
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW()
        )
        ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET
          razao_social_nome = EXCLUDED.razao_social_nome,
          nome_fantasia = EXCLUDED.nome_fantasia,
          cnae_principal = EXCLUDED.cnae_principal,
          cnae_descricao = EXCLUDED.cnae_descricao,
          cnaes_secundarios = EXCLUDED.cnaes_secundarios,
          situacao_cadastral = EXCLUDED.situacao_cadastral,
          capital_social = EXCLUDED.capital_social,
          porte = EXCLUDED.porte,
          natureza_juridica = EXCLUDED.natureza_juridica,
          opcao_pelo_simples = EXCLUDED.opcao_pelo_simples,
          opcao_pelo_mei = EXCLUDED.opcao_pelo_mei,
          cep = EXCLUDED.cep,
          logradouro = EXCLUDED.logradouro,
          numero = EXCLUDED.numero,
          complemento = EXCLUDED.complemento,
          bairro = EXCLUDED.bairro,
          municipio = EXCLUDED.municipio,
          uf = EXCLUDED.uf,
          email_fiscal = EXCLUDED.email_fiscal,
          telefone_fiscal = EXCLUDED.telefone_fiscal,
          qsa = EXCLUDED.qsa,
          bloqueio_fiscal = EXCLUDED.bloqueio_fiscal,
          dados_receita_brutos = EXCLUDED.dados_receita_brutos,
          ultima_sincronizacao_rfb = NOW()
        RETURNING (xmax = 0) AS inserido, id;
      `;

      const res = await client.query(upsertQuery, [
        empresa.id,
        cleanCnpj,
        razaoSocial,
        d.nome_fantasia || null,
        d.cnae_fiscal ? String(d.cnae_fiscal) : null,
        d.cnae_fiscal_descricao || null,
        JSON.stringify(cnaesSecundarios),
        situacao,
        d.motivo_situacao_cadastral || null,
        d.data_situacao_cadastral || null,
        d.capital_social || 0.00,
        d.porte || null,
        d.natureza_juridica || null,
        Boolean(d.opcao_pelo_simples),
        Boolean(d.opcao_pelo_mei),
        d.cep || null,
        d.logradouro || null,
        d.numero || null,
        d.complemento || null,
        d.bairro || null,
        d.municipio || null,
        d.uf || null,
        d.email || null,
        d.ddd_telefone_1 || null,
        JSON.stringify(d.qsa || []),
        isBloqueado,
        JSON.stringify(d)
      ]);

      if (res.rows[0].inserido) inseridos++;
      else atualizados++;
    }

    await client.query('COMMIT');

    console.log(`Resultados da Carga de Inteligência Cadastral:`);
    console.log(`  * Novos Clientes Inseridos:     ${inseridos}`);
    console.log(`  * Clientes Atualizados:         ${atualizados}`);
    console.log(`  * Empresas Inaptas Bloqueadas:  ${inaptosBloqueados} (com bloqueio_fiscal = true)`);

    // Consulta analítica para provar retenção total
    const queryReport = `
      SELECT 
        COUNT(*) as total_clientes,
        COUNT(CASE WHEN capital_social > 10000000 THEN 1 END) as clientes_capital_acima_10mi,
        COUNT(CASE WHEN bloqueio_fiscal = true THEN 1 END) as total_bloqueados,
        ROUND(AVG(capital_social), 2) as media_capital_social
      FROM clientes
      WHERE empresa_id = $1;
    `;
    const repRes = await client.query(queryReport, [empresa.id]);
    const r = repRes.rows[0];

    console.log(`\nMétricas de Inteligência no DB:`);
    console.log(`  * Total de Clientes Cadastrados: ${r.total_clientes}`);
    console.log(`  * Clientes com Capital Social > R$ 10 Milhões: ${r.clientes_capital_acima_10mi}`);
    console.log(`  * Média de Capital Social da Carteira: R$ ${Number(r.media_capital_social).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`  * Clientes com Bloqueio Fiscal Ativo: ${r.total_bloqueados}`);

    console.log('\n>>> POPULAÇÃO DE INTELIGÊNCIA CONCLUÍDA COM 100% DE SUCESSO! <<<');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERRO POPULAR CLIENTES]:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
    process.exit(0);
  }
}

populateClientsIntelligence();
