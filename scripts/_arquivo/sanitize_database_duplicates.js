const { pgPool } = require('../dist/core/database/supabase-pool');

const MITANG_ID = '29ea0857-7cf7-44e1-ba36-a3f323c4670c';
const ARANDU_ID = '0754c882-d528-4d34-8c96-6d9af7e8d322';

async function sanitizeDatabase() {
  const client = await pgPool.connect();
  try {
    console.log('========================================================================');
    console.log('       SANEAMENTO E DESDUPLICAÇÃO DE DADOS NO BANCO SUPABASE            ');
    console.log('========================================================================');

    await client.query('BEGIN');

    // 1. SANEAMENTO DE CONTAS BANCÁRIAS E VÍNCULO MULTI-TENANT CORRETO
    console.log('\n--- 1. Corrigindo Titularidade de Contas Bancárias ---');
    // Deleta transações duplicadas vinculadas à conta fantasma de 1155995077 sob a Mitang
    const ghostAccountId = 'acba5dee-e580-4da0-afd3-bed57b9ceb50';
    const delGhostTx = await client.query(`DELETE FROM transacoes_bancarias WHERE conta_bancaria_id = $1;`, [ghostAccountId]);
    console.log(`[OK] Removidas ${delGhostTx.rowCount} transações duplicadas da conta fantasma.`);

    await client.query(`DELETE FROM extratos_ofx_importacoes WHERE conta_bancaria_id = $1;`, [ghostAccountId]);
    await client.query(`DELETE FROM contas_bancarias WHERE id = $1;`, [ghostAccountId]);
    console.log('[OK] Conta fantasma 1155995077 sob Mitang removida com sucesso. Titularidade preservada na Arandu.');

    // 2. SANEAMENTO DE DUPLICATAS EM TRANSAÇÕES BANCÁRIAS (OFX)
    console.log('\n--- 2. Removendo Transações OFX Duplicadas por Sobreposição ---');
    
    // Contagem antes da desduplicação
    const countBeforeTx = await client.query('SELECT count(*) FROM transacoes_bancarias;');
    console.log('Transações antes do saneamento:', countBeforeTx.rows[0].count);

    // Identifica e deleta transações repetidas na mesma conta, mesma data, mesmo valor e mesmo memo
    // Mantendo a primeira inserida (MIN id)
    const delTx = await client.query(`
      DELETE FROM transacoes_bancarias
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY conta_bancaria_id, data_lancamento, valor, memo 
            ORDER BY created_at ASC, id ASC
          ) as rnum
          FROM transacoes_bancarias
        ) dup
        WHERE dup.rnum > 1
      );
    `);
    console.log(`[OK] Removidas ${delTx.rowCount} transações bancárias duplicadas!`);

    const countAfterTx = await client.query('SELECT count(*) FROM transacoes_bancarias;');
    console.log('Transações legítimas e limpas no DB:', countAfterTx.rows[0].count);

    // 3. CORREÇÃO DE MOJIBAKE / ENCODING EM TRANSAÇÕES BANCÁRIAS
    console.log('\n--- 3. Corrigindo Mojibake / Caracteres Corrompidos em Memos ---');
    const fixMemos = [
      { from: 'SALDO MOVIMENTAÃ‡ÃƒO CONTA', to: 'SALDO MOVIMENTAÇÃO CONTA' },
      { from: 'SALDO TOTAL DISPONÃ VEL DIA', to: 'SALDO TOTAL DISPONÍVEL DIA' },
      { from: 'TARIFA BANCARIA TRANSF PGTO', to: 'TARIFA BANCÁRIA TRANSF PGTO' },
      { from: 'Ã‡', to: 'Ç' },
      { from: 'Ãƒ', to: 'Ã' },
      { from: 'Ã‰', to: 'É' },
      { from: 'Ã', to: 'Í' },
      { from: 'Ã“', to: 'Ó' },
      { from: 'Ãš', to: 'Ú' }
    ];

    for (const m of fixMemos) {
      await client.query(`
        UPDATE transacoes_bancarias 
        SET memo = replace(memo, $1, $2)
        WHERE memo LIKE '%' || $1 || '%';
      `, [m.from, m.to]);
    }
    console.log('[OK] Textos de transações bancárias normalizados em UTF-8 puro.');

    // 4. SANEAMENTO DE DUPLICATAS NO CATÁLOGO UNIVERSAL
    console.log('\n--- 4. Desduplicando Catálogo Universal de Produtos/Baterias ---');
    const countBeforeCat = await client.query('SELECT count(*) FROM catalogo_universal;');
    console.log('Itens de catálogo antes do saneamento:', countBeforeCat.rows[0].count);

    // Re-aponta cotacoes_itens para o item canônico
    await client.query(`
      WITH canonical AS (
        SELECT id, 
               FIRST_VALUE(id) OVER (
                 PARTITION BY COALESCE(detalhes->>'codigo_sku', nome)
                 ORDER BY created_at ASC, id ASC
               ) as canonical_id
        FROM catalogo_universal
      )
      UPDATE cotacoes_itens ci
      SET item_catalogo_id = c.canonical_id
      FROM canonical c
      WHERE ci.item_catalogo_id = c.id AND ci.item_catalogo_id != c.canonical_id;
    `);

    // Deleta itens redundantes mantendo um registro canônico por SKU ou Nome
    const delCat = await client.query(`
      DELETE FROM catalogo_universal
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY COALESCE(detalhes->>'codigo_sku', nome)
            ORDER BY created_at ASC, id ASC
          ) as rnum
          FROM catalogo_universal
        ) dup
        WHERE dup.rnum > 1
      );
    `);
    console.log(`[OK] Removidos ${delCat.rowCount} itens duplicados no catálogo!`);

    const countAfterCat = await client.query('SELECT count(*) FROM catalogo_universal;');
    console.log('Modelos únicos e limpos no catálogo:', countAfterCat.rows[0].count);

    // 5. SANEAMENTO E CONSOLIDAÇÃO DE CLIENTES E PARCEIROS
    console.log('\n--- 5. Desduplicando Carteira de Clientes e Parceiros ---');
    const countBeforeCli = await client.query('SELECT count(*) FROM clientes;');
    console.log('Clientes antes do saneamento:', countBeforeCli.rows[0].count);

    // Re-aponta foreign keys em cotacoes e transacoes_bancarias para o cliente canônico
    await client.query(`
      WITH canonical_cli AS (
        SELECT id, 
               FIRST_VALUE(id) OVER (
                 PARTITION BY regexp_replace(cnpj_cpf, '[^0-9]', '', 'g')
                 ORDER BY 
                   (CASE WHEN capital_social IS NOT NULL AND capital_social > 0 THEN 1 ELSE 0 END) DESC,
                   (CASE WHEN qsa IS NOT NULL AND qsa::text != '[]' THEN 1 ELSE 0 END) DESC,
                   created_at ASC
               ) as canonical_id
        FROM clientes
        WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      )
      UPDATE cotacoes c
      SET cliente_id = cc.canonical_id
      FROM canonical_cli cc
      WHERE c.cliente_id = cc.id AND c.cliente_id != cc.canonical_id;
    `);

    await client.query(`
      WITH canonical_cli AS (
        SELECT id, 
               FIRST_VALUE(id) OVER (
                 PARTITION BY regexp_replace(cnpj_cpf, '[^0-9]', '', 'g')
                 ORDER BY 
                   (CASE WHEN capital_social IS NOT NULL AND capital_social > 0 THEN 1 ELSE 0 END) DESC,
                   (CASE WHEN qsa IS NOT NULL AND qsa::text != '[]' THEN 1 ELSE 0 END) DESC,
                   created_at ASC
               ) as canonical_id
        FROM clientes
        WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      )
      UPDATE transacoes_bancarias tb
      SET cliente_id = cc.canonical_id
      FROM canonical_cli cc
      WHERE tb.cliente_id = cc.id AND tb.cliente_id != cc.canonical_id;
    `);

    // Deleta registros repetidos com o mesmo CNPJ, mantendo o registro mais completo
    const delCli = await client.query(`
      DELETE FROM clientes
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY regexp_replace(cnpj_cpf, '[^0-9]', '', 'g')
            ORDER BY 
              (CASE WHEN capital_social IS NOT NULL AND capital_social > 0 THEN 1 ELSE 0 END) DESC,
              (CASE WHEN qsa IS NOT NULL AND qsa::text != '[]' THEN 1 ELSE 0 END) DESC,
              created_at ASC
          ) as rnum
          FROM clientes
          WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
        ) dup
        WHERE dup.rnum > 1
      );
    `);
    console.log(`[OK] Removidos ${delCli.rowCount} registros duplicados na tabela de clientes!`);

    const countAfterCli = await client.query('SELECT count(*) FROM clientes;');
    console.log('Parceiros únicos no banco de dados:', countAfterCli.rows[0].count);

    await client.query('COMMIT');
    console.log('\n========================================================================');
    console.log('              SANEAMENTO CONCLUÍDO COM SUCESSO ABSOLUTO!                ');
    console.log('========================================================================');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO NO SANEAMENTO:', err);
  } finally {
    client.release();
    pgPool.end();
  }
}

sanitizeDatabase();
