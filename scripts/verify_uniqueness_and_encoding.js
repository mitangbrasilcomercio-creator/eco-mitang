const { pgPool } = require('../dist/core/database/supabase-pool');

async function verifyAll() {
  const client = await pgPool.connect();
  try {
    console.log('========================================================================');
    console.log('       AUDITORIA DE UNICIDADE E PUREZA DE ENCODING (ZERO DUPLICATAS)    ');
    console.log('========================================================================');

    // 1. Transações Bancárias Duplicadas
    const dupTx = await client.query(`
      SELECT conta_bancaria_id, data_lancamento, valor, memo, count(*) as qtd
      FROM transacoes_bancarias
      WHERE is_saldo_informativo = FALSE
      GROUP BY conta_bancaria_id, data_lancamento, valor, memo
      HAVING count(*) > 1;
    `);
    console.log(`1. Transações bancárias operacionais duplicadas: ${dupTx.rows.length}`);
    dupTx.rows.forEach(r => console.log(`   -> [${r.qtd}x] Data: ${r.data_lancamento.toISOString().split('T')[0]} | R$ ${r.valor} | Memo: ${r.memo}`));

    // 2. Duplicatas em Catálogo Universal
    const dupCat = await client.query(`
      SELECT COALESCE(detalhes->>'codigo_sku', nome) as chave, count(*) as qtd
      FROM catalogo_universal
      GROUP BY COALESCE(detalhes->>'codigo_sku', nome)
      HAVING count(*) > 1;
    `);
    console.log(`2. Itens duplicados em catalogo_universal: ${dupCat.rows.length}`);
    dupCat.rows.forEach(r => console.log(`   -> [${r.qtd}x] ${r.chave}`));

    // 3. Duplicatas em Clientes
    const dupCli = await client.query(`
      SELECT regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') as cnpj, count(*) as qtd
      FROM clientes
      WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      GROUP BY regexp_replace(cnpj_cpf, '[^0-9]', '', 'g')
      HAVING count(*) > 1;
    `);
    console.log(`3. CNPJs duplicados em clientes: ${dupCli.rows.length}`);
    dupCli.rows.forEach(r => console.log(`   -> [${r.qtd}x] CNPJ: ${r.cnpj}`));

    // 4. Verificação de Mojibake em Memos
    const mojiTx = await client.query(`
      SELECT id, memo FROM transacoes_bancarias
      WHERE memo ~ 'Ã[¡-ÿ]' OR memo ~ '[\\x80-\\x9F]'
      LIMIT 10;
    `);
    console.log(`4. Transações bancárias com mojibake / caracteres estranhos: ${mojiTx.rows.length}`);
    mojiTx.rows.forEach(r => console.log(`   -> #${r.id}: ${r.memo}`));

    // 5. Verificação de Mojibake em Orçamentos
    const mojiOrc = await client.query(`
      SELECT numero_orcamento, cliente_nome, status_aprovacao FROM orcamentos_historico
      WHERE cliente_nome LIKE '%Ã%' OR status_aprovacao LIKE '%Ã%' OR itens_json::text LIKE '%Ã%'
      LIMIT 10;
    `);
    console.log(`5. Orçamentos com mojibake / caracteres estranhos: ${mojiOrc.rows.length}`);
    mojiOrc.rows.forEach(r => console.log(`   -> #${r.numero_orcamento}: ${r.cliente_nome}`));

    // 6. Contagem consolidada de cada tabela
    const totals = await client.query(`
      SELECT 
        (SELECT count(*) FROM clientes) as total_clientes,
        (SELECT count(*) FROM catalogo_universal) as total_catalogo,
        (SELECT count(*) FROM orcamentos_historico) as total_orcamentos,
        (SELECT count(*) FROM transacoes_bancarias) as total_transacoes,
        (SELECT count(*) FROM transacoes_bancarias WHERE is_saldo_informativo = FALSE) as transacoes_operacionais,
        (SELECT count(*) FROM transacoes_bancarias WHERE is_saldo_informativo = TRUE) as saldos_informativos_segregados,
        (SELECT count(*) FROM contas_bancarias) as total_contas,
        (SELECT count(*) FROM notas_fiscais) as total_notas_fiscais;
    `);
    console.log('\n--- RESUMO DE TOTAIS LIMPOS NO BANCO ---');
    console.log(totals.rows[0]);

  } finally {
    client.release();
    pgPool.end();
  }
}

verifyAll();
