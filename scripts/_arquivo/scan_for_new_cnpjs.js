const { pgPool } = require('../dist/core/database/supabase-pool');

async function scanForNewCnpjs() {
  const client = await pgPool.connect();
  try {
    // 1. Obter todos os CNPJs já cadastrados
    const cliRes = await client.query("SELECT DISTINCT regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') as cnpj FROM clientes WHERE cnpj_cpf IS NOT NULL;");
    const knownCnpjs = new Set(cliRes.rows.map(r => r.cnpj));
    console.log(`CNPJs conhecidos no banco: ${knownCnpjs.size}`);

    // 2. Extrair CNPJs de orçamentos
    const orcRes = await client.query("SELECT DISTINCT regexp_replace(cliente_cnpj_cpf, '[^0-9]', '', 'g') as cnpj, cliente_nome FROM orcamentos_historico WHERE cliente_cnpj_cpf IS NOT NULL;");
    const missingFromOrc = [];
    for (const r of orcRes.rows) {
      if (r.cnpj && r.cnpj.length === 14 && !knownCnpjs.has(r.cnpj)) {
        missingFromOrc.push(r);
      }
    }
    console.log(`CNPJs em orçamentos não cadastrados em clientes: ${missingFromOrc.length}`);
    missingFromOrc.forEach(m => console.log(`   -> ${m.cnpj} (${m.cliente_nome})`));

    // 3. Extrair CNPJs de transações bancárias (campo documento_contraparte e memo)
    const txDocRes = await client.query("SELECT DISTINCT regexp_replace(documento_contraparte, '[^0-9]', '', 'g') as cnpj, nome_contraparte FROM transacoes_bancarias WHERE documento_contraparte IS NOT NULL;");
    const missingFromTx = [];
    for (const r of txDocRes.rows) {
      if (r.cnpj && r.cnpj.length === 14 && !knownCnpjs.has(r.cnpj)) {
        missingFromTx.push(r);
      }
    }

    // Extrair regex de CNPJ de dentro do memo (ex: "PIX TRANSF ... 12345678000199")
    const memoRes = await client.query("SELECT memo FROM transacoes_bancarias WHERE memo ~ '[0-9]{14}';");
    const foundInMemo = new Set();
    for (const r of memoRes.rows) {
      const matches = r.memo.match(/\b\d{14}\b/g) || [];
      for (const m of matches) {
        if (!knownCnpjs.has(m)) {
          foundInMemo.add(m);
        }
      }
    }
    console.log(`CNPJs em transações não cadastrados em clientes: ${missingFromTx.length} (documento) + ${foundInMemo.size} (nos memos)`);
    missingFromTx.forEach(m => console.log(`   -> Doc: ${m.cnpj} (${m.nome_contraparte})`));
    foundInMemo.forEach(m => console.log(`   -> Memo: ${m}`));

  } finally {
    client.release();
    pgPool.end();
  }
}

scanForNewCnpjs();
