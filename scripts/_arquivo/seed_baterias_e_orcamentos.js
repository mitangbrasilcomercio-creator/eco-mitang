const fs = require('fs');
const path = require('path');
const { pgPool } = require('../dist/core/database/supabase-pool');

async function seedBateriasEOrcamentos() {
  console.log('======================================================================');
  console.log('   POVOAMENTO DO BANCO DE DADOS: PRODUTOS BATERIAS E ORÇAMENTOS REAIS ');
  console.log('======================================================================\n');

  const client = await pgPool.connect();

  try {
    // 1. Identificar Tenants da Holding
    const empRes = await client.query(`
      SELECT id, razao_social, nome_fantasia, cnpj FROM empresas;
    `);
    const empresas = empRes.rows;
    console.log(`Tenants Disponíveis:`);
    empresas.forEach(e => console.log(`  * ${e.nome_fantasia} (${e.id}) [CNPJ: ${e.cnpj}]`));

    const mitangEmp = empresas.find(e => e.nome_fantasia.toLowerCase().includes('mitang')) || empresas[0];
    const aranduEmp = empresas.find(e => e.nome_fantasia.toLowerCase().includes('arandu')) || empresas[1] || empresas[0];

    console.log(`\nTenant Mitang Brasil: ${mitangEmp.nome_fantasia} (${mitangEmp.id})`);
    console.log(`Tenant Arandu:        ${aranduEmp.nome_fantasia} (${aranduEmp.id})\n`);

    await client.query('BEGIN');

    // ------------------------------------------------------------------------
    // ETAPA 1: POPULAR OS 117 PRODUTOS DE BATERIAS NO CATÁLOGO UNIVERSAL
    // ------------------------------------------------------------------------
    const prodJsonPath = path.join(__dirname, '..', 'database', 'seeds', 'catalogo_baterias_produtos.json');
    const produtosBaterias = JSON.parse(fs.readFileSync(prodJsonPath, 'utf8'));

    console.log(`[1/2] Inserindo ${produtosBaterias.length} produtos de baterias no Catálogo Universal...`);

    let produtosInseridos = 0;
    for (const p of produtosBaterias) {
      // Inserir para Mitang Brasil e Arandu
      for (const emp of [mitangEmp, aranduEmp]) {
        await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [emp.id]);

        const existing = await client.query(
          "SELECT id FROM catalogo_universal WHERE empresa_id = $1 AND nome = $2 LIMIT 1;",
          [emp.id, p.nome]
        );

        if (existing.rows.length > 0) {
          await client.query(
            "UPDATE catalogo_universal SET descricao_tecnica = $1, detalhes = $2, updated_at = NOW() WHERE id = $3;",
            [`Bateria Especializada para Setor ${p.setor} - Fabricante: ${p.fabricante} (${p.quimica})`, JSON.stringify(detalhes), existing.rows[0].id]
          );
        } else {
          await client.query(
            `INSERT INTO catalogo_universal (
              empresa_id, tipo_item, nome, descricao_tecnica, ativo, quantidade_estoque_atual, detalhes
            ) VALUES ($1, 'PRODUTO', $2, $3, true, 10.000, $4);`,
            [emp.id, p.nome, `Bateria Especializada para Setor ${p.setor} - Fabricante: ${p.fabricante} (${p.quimica})`, JSON.stringify(detalhes)]
          );
          produtosInseridos++;
        }

        const detalhes = {
          codigo_sku: p.codigo_sku,
          fabricante: p.fabricante,
          setor: p.setor,
          quimica: p.quimica,
          preco_base: 0.00, // Preço customizado por cotação
          unidade_medida: 'UN',
          estoque_atual: 10,
          especificacoes_tecnicas: p.especificacoes_tecnicas
        };

        const res = await client.query(upsertCatalogo, [
          emp.id,
          p.nome,
          `Bateria Especializada para Setor ${p.setor} - Fabricante: ${p.fabricante} (${p.quimica})`,
          JSON.stringify(detalhes)
        ]);

        if (res.rows[0].inserido) produtosInseridos++;
      }
    }
    console.log(`   -> Total de registros inseridos/atualizados no Catálogo: ${produtosInseridos}`);

    // ------------------------------------------------------------------------
    // ETAPA 2: POPULAR AS 218 COTAÇÕES/ORÇAMENTOS HISTÓRICOS
    // ------------------------------------------------------------------------
    const orcJsonPath = path.join(__dirname, '..', 'database', 'seeds', 'orcamentos_historico.json');
    const orcamentos = JSON.parse(fs.readFileSync(orcJsonPath, 'utf8'));

    console.log(`\n[2/2] Inserindo ${orcamentos.length} cotações históricas no banco...`);

    let orcamentosInseridos = 0;
    let orcamentosAtualizados = 0;

    for (const o of orcamentos) {
      const tenant = (o.vendido_por.toLowerCase() === 'arandu') ? aranduEmp : mitangEmp;
      await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [tenant.id]);

      // Converter data_emissao DD/MM/YYYY para YYYY-MM-DD
      let isoDate = null;
      if (o.data_emissao && o.data_emissao.includes('/')) {
        const parts = o.data_emissao.split('/');
        if (parts.length === 3) isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      const upsertOrcamento = `
        INSERT INTO orcamentos_historico (
          empresa_id, numero_orcamento, vendido_por,
          data_emissao, mes_emissao, ano_emissao,
          cliente_nome, cliente_cnpj_cpf, cliente_contato,
          status_aprovacao, orcamento_enviado, situacao_geral,
          valor_total, itens_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (empresa_id, numero_orcamento) DO UPDATE SET
          cliente_nome = EXCLUDED.cliente_nome,
          cliente_cnpj_cpf = EXCLUDED.cliente_cnpj_cpf,
          cliente_contato = EXCLUDED.cliente_contato,
          status_aprovacao = EXCLUDED.status_aprovacao,
          valor_total = EXCLUDED.valor_total,
          itens_json = EXCLUDED.itens_json,
          updated_at = NOW()
        RETURNING (xmax = 0) as inserido;
      `;

      const res = await client.query(upsertOrcamento, [
        tenant.id,
        o.numero_orcamento,
        o.vendido_por,
        isoDate,
        o.mes_emissao,
        o.ano_emissao,
        o.cliente.nome,
        o.cliente.cnpj_cpf || null,
        o.cliente.contato || null,
        o.status_aprovacao,
        o.orcamento_enviado,
        o.situacao_geral,
        o.valor_total_orcamento,
        JSON.stringify(o.itens)
      ]);

      if (res.rows[0].inserido) orcamentosInseridos++;
      else orcamentosAtualizados++;
    }

    await client.query('COMMIT');

    console.log(`   -> Cotações Inseridas:   ${orcamentosInseridos}`);
    console.log(`   -> Cotações Atualizadas: ${orcamentosAtualizados}`);

    // Relatório consolidado
    const metricsRes = await client.query(`
      SELECT 
        vendido_por,
        COUNT(*) as total_orcamentos,
        COUNT(CASE WHEN status_aprovacao = 'Compra Aprovada' THEN 1 END) as aprovados,
        COUNT(CASE WHEN status_aprovacao != 'Compra Aprovada' THEN 1 END) as nao_aprovados,
        ROUND(SUM(CASE WHEN status_aprovacao = 'Compra Aprovada' THEN valor_total ELSE 0 END), 2) as faturamento_aprovado,
        ROUND(SUM(CASE WHEN status_aprovacao != 'Compra Aprovada' THEN valor_total ELSE 0 END), 2) as total_perdido
      FROM orcamentos_historico
      GROUP BY vendido_por;
    `);

    console.log('\n======================================================================');
    console.log('                 RELATÓRIO CONSOLIDADO DE COTAÇÕES                    ');
    console.log('======================================================================');
    metricsRes.rows.forEach(r => {
      const taxa = ((Number(r.aprovados) / Number(r.total_orcamentos)) * 100).toFixed(1);
      console.log(`Empresa: ${r.vendido_por.toUpperCase()}`);
      console.log(`  * Total de Orçamentos:     ${r.total_orcamentos}`);
      console.log(`  * Compras Aprovadas:        ${r.aprovados} (${taxa}% de conversão)`);
      console.log(`  * Propostas Não Aprovadas:  ${r.nao_aprovados}`);
      console.log(`  * Faturamento Aprovado:     R$ ${Number(r.faturamento_aprovado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      console.log(`  * Volume em Negociações:    R$ ${Number(r.total_perdido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`);
    });

    console.log('======================================================================');
    console.log('>>> BANCO ALIMENTADO COM SUCESSO COM PRODUTOS E ORÇAMENTOS! <<<');
    console.log('======================================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERRO SEED BATERIAS & ORCAMENTOS]:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
    process.exit(0);
  }
}

seedBateriasEOrcamentos();
