const { pgPool } = require('../dist/core/database/supabase-pool');

async function auditDB() {
  const client = await pgPool.connect();
  try {
    console.log('===============================================================');
    console.log('          AUDITORIA DE TABELAS SUPABASE VS DOCUMENTOS          ');
    console.log('===============================================================');
    const tables = ['clientes', 'itens_catalogo', 'orcamentos_historico', 'transacoes_bancarias', 'contas_bancarias', 'notas_fiscais', 'notas_fiscais_itens'];
    for (const t of tables) {
      try {
        const res = await client.query('SELECT count(*) FROM ' + t);
        console.log(t.padEnd(25) + ': ' + res.rows[0].count);
      } catch (e) {
        console.log(t.padEnd(25) + ': ERRO -> ' + e.message);
      }
    }

    // 1. Verificar duplicatas em transacoes_bancarias
    console.log('\n--- 1. AUDITORIA: TRANSACOES BANCARIAS ---');
    const dupTx = await client.query(`
      SELECT data_lancamento, valor, memo, count(*) as qtd 
      FROM transacoes_bancarias 
      GROUP BY data_lancamento, valor, memo 
      HAVING count(*) > 1 
      ORDER BY count(*) DESC 
      LIMIT 15
    `);
    console.log('Transacoes repetidas (mesma data, valor e memo):', dupTx.rows.length);
    dupTx.rows.forEach(r => console.log(` -> [${r.qtd}x] Data: ${r.data_lancamento ? r.data_lancamento.toISOString().split('T')[0] : 'N/A'} | Valor: R$ ${r.valor} | Memo: ${r.memo}`));

    // Verificar transacoes com idempotency_hash repetido
    const dupHash = await client.query(`
      SELECT idempotency_hash, count(*) as qtd 
      FROM transacoes_bancarias 
      GROUP BY idempotency_hash 
      HAVING count(*) > 1 
      LIMIT 5
    `);
    console.log('Transacoes com idempotency_hash duplicado no DB:', dupHash.rows.length);

    // 2. Verificar duplicatas em catalogo_universal
    console.log('\n--- 2. AUDITORIA: ITENS DO CATALOGO DE BATERIAS ---');
    const dupCat = await client.query(`
      SELECT nome, count(*) as qtd 
      FROM catalogo_universal 
      GROUP BY nome 
      HAVING count(*) > 1 
      ORDER BY count(*) DESC 
      LIMIT 15
    `);
    console.log('Baterias com mesmo nome repetido:', dupCat.rows.length);
    dupCat.rows.forEach(r => console.log(` -> [${r.qtd}x] Nome: ${r.nome}`));

    // Verificar catalogo_universal por empresa_id
    const catEmp = await client.query(`
      SELECT empresa_id, count(*) as qtd 
      FROM catalogo_universal 
      GROUP BY empresa_id
    `);
    console.log('Baterias distribuidas por empresa_id:');
    catEmp.rows.forEach(r => console.log(` -> Empresa ${r.empresa_id}: ${r.qtd} itens`));

    // 3. Verificar duplicatas e encoding em orcamentos_historico
    console.log('\n--- 3. AUDITORIA: ORCAMENTOS HISTORICOS ---');
    const dupOrc = await client.query(`
      SELECT numero_orcamento, count(*) as qtd 
      FROM orcamentos_historico 
      GROUP BY numero_orcamento 
      HAVING count(*) > 1 
      ORDER BY count(*) DESC 
      LIMIT 10
    `);
    console.log('Orcamentos com mesmo numero repetido:', dupOrc.rows.length);
    dupOrc.rows.forEach(r => console.log(` -> [${r.qtd}x] Num: ${r.numero_orcamento}`));

    // Verificar caracteres estranhos / corrompidos em orcamentos
    const badEnc = await client.query(`
      SELECT id, numero_orcamento, cliente_nome, status_aprovacao 
      FROM orcamentos_historico 
      WHERE cliente_nome ~ '[\uFFFD\u00C3\u00A7\u00C3\u00A3\u00C3\u00A9]' 
         OR status_aprovacao ~ '[\uFFFD\u00C3\u00A7\u00C3\u00A3\u00C3\u00A9]'
         OR condicoes_comerciais::text ~ '[\uFFFD\u00C3]'
      LIMIT 10
    `);
    console.log('Orcamentos com encoding corrompido (mojibake / caracteres invalidos):', badEnc.rows.length);
    badEnc.rows.forEach(r => console.log(` -> #${r.numero_orcamento} | Cliente: ${r.cliente_nome} | Status: ${r.status_aprovacao}`));

    // 4. Verificar clientes duplicados e estrutura de CNPJs
    console.log('\n--- 4. AUDITORIA: CLIENTES & PARCEIROS (CNPJ) ---');
    const dupCli = await client.query(`
      SELECT cnpj_cpf, count(*) as qtd 
      FROM clientes 
      WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      GROUP BY cnpj_cpf 
      HAVING count(*) > 1 
      ORDER BY count(*) DESC 
      LIMIT 15
    `);
    console.log('Clientes com mesmo CNPJ repetido:', dupCli.rows.length);
    dupCli.rows.forEach(r => console.log(` -> [${r.qtd}x] CNPJ: ${r.cnpj_cpf}`));

    // Clientes por empresa_id
    const cliEmp = await client.query(`
      SELECT empresa_id, tipo_entidade, count(*) as qtd 
      FROM clientes 
      GROUP BY empresa_id, tipo_entidade 
      ORDER BY empresa_id, tipo_entidade
    `);
    console.log('Clientes por empresa_id e tipo_entidade:');
    cliEmp.rows.forEach(r => console.log(` -> Empresa: ${r.empresa_id} | Tipo: ${r.tipo_entidade} | Qtd: ${r.qtd}`));

    // 5. Verificar Notas Fiscais duplicadas
    console.log('\n--- 5. AUDITORIA: NOTAS FISCAIS ---');
    const dupNfe = await client.query(`
      SELECT numero_nota, serie, direcao, count(*) as qtd 
      FROM notas_fiscais 
      GROUP BY numero_nota, serie, direcao 
      HAVING count(*) > 1 
      LIMIT 10
    `);
    console.log('Notas fiscais repetidas (mesmo numero, serie e direcao):', dupNfe.rows.length);
    dupNfe.rows.forEach(r => console.log(` -> [${r.qtd}x] NF: ${r.numero_nota} | Serie: ${r.serie} | Direcao: ${r.direcao}`));

  } catch (err) {
    console.error('ERRO NA AUDITORIA:', err);
  } finally {
    client.release();
    pgPool.end();
  }
}

auditDB();
