const { pgPool } = require('../dist/core/database/supabase-pool');

async function fixMojibake() {
  const client = await pgPool.connect();
  try {
    console.log('Sanitizando todos os memos em transacoes_bancarias...');

    const res = await client.query('SELECT id, memo FROM transacoes_bancarias;');
    let fixedCount = 0;

    for (const row of res.rows) {
      let memo = row.memo;
      if (!memo) continue;

      let clean = memo
        // Remove non-printable / control bytes like \x8d, \x9d, etc.
        .replace(/[\x80-\x9F]/g, '')
        // Clean double-encoded / Latin1 mojibake patterns
        .replace(/MOVIMENTA[ÍI][‡\?\s]*[ÍI][ƒ\?\s]*O/gi, 'MOVIMENTAÇÃO')
        .replace(/MOVIMENTAÇÃO/gi, 'MOVIMENTAÇÃO')
        .replace(/MOVIMENTAÃ‡ÃƒO/gi, 'MOVIMENTAÇÃO')
        .replace(/DISPON[ÍI]\s*VEL/gi, 'DISPONÍVEL')
        .replace(/DISPONÃVEL/gi, 'DISPONÍVEL')
        .replace(/DISPON[ÍI]VEL/gi, 'DISPONÍVEL')
        .replace(/TRANSFERÃŠNCIA/gi, 'TRANSFERÊNCIA')
        .replace(/TRANSFERENCIA/gi, 'TRANSFERÊNCIA')
        .replace(/CRÃ‰DITO/gi, 'CRÉDITO')
        .replace(/DÃ‰BITO/gi, 'DÉBITO')
        .replace(/LIQUIDAÃ‡ÃƒO/gi, 'LIQUIDAÇÃO')
        .replace(/PAGAMENTO ELETRÃ”NICO/gi, 'PAGAMENTO ELETRÔNICO')
        .replace(/ELETRONICO/gi, 'ELETRÔNICO')
        .replace(/SA[ÍI]DA/gi, 'SAÍDA')
        .replace(/SAÃDA/gi, 'SAÍDA')
        .replace(/EMISSÃƒO/gi, 'EMISSÃO')
        .replace(/APLIC\.\s*AUT\./gi, 'APLICAÇÃO AUTOMÁTICA')
        .replace(/\s+/g, ' ')
        .trim();

      if (clean !== memo) {
        await client.query('UPDATE transacoes_bancarias SET memo = $1 WHERE id = $2', [clean, row.id]);
        fixedCount++;
      }
    }

    console.log(`[SUCESSO] ${fixedCount} memos de transações foram higienizados para UTF-8 perfeito!`);

    // Limpar também em orcamentos_historico se houver
    const orcRes = await client.query('SELECT id, cliente_nome, status_aprovacao FROM orcamentos_historico;');
    let orcFixed = 0;
    for (const row of orcRes.rows) {
      let nome = row.cliente_nome || '';
      let status = row.status_aprovacao || '';
      let cleanNome = nome.replace(/[\x80-\x9F]/g, '').trim();
      let cleanStatus = status.replace(/[\x80-\x9F]/g, '').trim();
      if (cleanNome !== nome || cleanStatus !== status) {
        await client.query(
          'UPDATE orcamentos_historico SET cliente_nome = $1, status_aprovacao = $2 WHERE id = $3',
          [cleanNome, cleanStatus, row.id]
        );
        orcFixed++;
      }
    }
    console.log(`[SUCESSO] ${orcFixed} orçamentos foram higienizados.`);

  } finally {
    client.release();
    pgPool.end();
  }
}

fixMojibake();
