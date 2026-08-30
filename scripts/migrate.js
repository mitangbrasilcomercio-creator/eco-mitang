#!/usr/bin/env node
/**
 * ============================================================================
 * EXECUTOR DE MIGRATIONS COM LEDGER (schema_migrations)
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * 1. A lista de arquivos era escrita a mao e tinha uma colisao de numeracao:
 *    existiam dois arquivos '10_', e so '10_clientes_historico.sql' estava na
 *    lista. '10_item_catalogo_eav.sql' NUNCA era aplicado por este script --
 *    dependia de um script avulso (apply_migration_10.js).
 * 2. Nao havia registro do que ja tinha sido aplicado: toda execucao rodava
 *    tudo de novo, na esperanca de que cada DDL fosse idempotente.
 * 3. Cada arquivo rodava fora de transacao: uma falha no meio deixava o schema
 *    pela metade.
 *
 * [COMO FOI CORRIGIDO]:
 * 1. Descoberta automatica por glob ordenado -- nenhum arquivo fica de fora.
 * 2. Tabela 'schema_migrations' com o hash SHA-256 de cada arquivo aplicado.
 *    Um arquivo ja aplicado e pulado; um arquivo alterado depois de aplicado e
 *    denunciado em vez de rodar em silencio.
 * 3. Cada migration roda dentro da sua propria transacao (BEGIN/COMMIT).
 * 4. Usa MIGRATION_DATABASE_URL (papel privilegiado). A aplicacao usa
 *    APP_DATABASE_URL (papel 'eco_app', sem BYPASSRLS).
 *
 * Uso:
 *   node scripts/migrate.js              aplica as pendentes
 *   node scripts/migrate.js --status     so mostra o estado
 *   node scripts/migrate.js --baseline   marca as existentes como aplicadas
 *                                        sem executar (adocao de banco legado)
 * ============================================================================
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const DIR = path.join(__dirname, '..', 'database');
const CA_PATH = path.join(DIR, 'certs', 'supabase-ca.crt');

function sslConfig() {
  if (process.env.DB_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
  try {
    return { ca: fs.readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

function listarMigrations() {
  return fs
    .readdirSync(DIR)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      return na !== nb ? na - nb : a.localeCompare(b);
    })
    .map((nome) => {
      let sql = fs.readFileSync(path.join(DIR, nome), 'utf8');
      if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1); // remove BOM UTF-8
      return {
        nome,
        versao: parseInt(nome, 10),
        sql: sql.trim(),
        hash: crypto.createHash('sha256').update(sql.trim()).digest('hex'),
      };
    });
}

async function main() {
  const args = process.argv.slice(2);
  const somenteStatus = args.includes('--status');
  const baseline = args.includes('--baseline');

  const connectionString =
    process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ERRO] Defina MIGRATION_DATABASE_URL no .env.');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: sslConfig(), connectionTimeoutMillis: 30000 });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        versao      INT          NOT NULL,
        nome        VARCHAR(255) NOT NULL PRIMARY KEY,
        hash        VARCHAR(64)  NOT NULL,
        aplicada_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        duracao_ms  INT
      );
    `);

    const aplicadasRes = await client.query('SELECT nome, hash FROM schema_migrations;');
    const aplicadas = new Map(aplicadasRes.rows.map((r) => [r.nome, r.hash]));
    const migrations = listarMigrations();

    console.log('======================================================================');
    console.log('              MIGRATIONS - ECO-MITANG ERP                             ');
    console.log('======================================================================\n');

    let pendentes = 0;
    let alteradas = 0;

    for (const m of migrations) {
      const hashAplicado = aplicadas.get(m.nome);
      if (!hashAplicado) {
        console.log(`  [ PENDENTE ] ${m.nome}`);
        pendentes++;
      } else if (hashAplicado !== m.hash) {
        console.log(`  [ ALTERADA ] ${m.nome}  <-- ja aplicada, mas o conteudo mudou`);
        alteradas++;
      } else {
        console.log(`  [ aplicada ] ${m.nome}`);
      }
    }

    console.log(`\n  ${migrations.length} arquivos | ${pendentes} pendentes | ${alteradas} alteradas apos aplicacao\n`);

    if (alteradas > 0 && !baseline) {
      console.error(
        '[ERRO] Ha migrations alteradas depois de aplicadas. Migration aplicada e imutavel:\n' +
        '       crie um arquivo novo com a correcao em vez de editar o antigo.\n' +
        '       (Se este banco e legado e voce sabe que o schema ja bate, use --baseline.)'
      );
      process.exit(1);
    }

    if (somenteStatus) {
      await client.end();
      return;
    }

    if (baseline) {
      for (const m of migrations) {
        await client.query(
          `INSERT INTO schema_migrations (versao, nome, hash, duracao_ms) VALUES ($1, $2, $3, 0)
           ON CONFLICT (nome) DO UPDATE SET hash = EXCLUDED.hash, aplicada_em = NOW();`,
          [m.versao, m.nome, m.hash]
        );
      }
      console.log(`[BASELINE] ${migrations.length} migrations marcadas como aplicadas sem execucao.\n`);
      await client.end();
      return;
    }

    for (const m of migrations) {
      if (aplicadas.has(m.nome)) continue;

      process.stdout.write(`Aplicando ${m.nome} ... `);
      const t0 = Date.now();
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (versao, nome, hash, duracao_ms) VALUES ($1, $2, $3, $4);',
          [m.versao, m.nome, m.hash, Date.now() - t0]
        );
        await client.query('COMMIT');
        console.log(`OK (${Date.now() - t0}ms)`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FALHOU');
        console.error(`\n[ERRO] ${m.nome}: ${err.message}`);
        console.error('       Nada desta migration foi gravado (rollback aplicado).');
        await client.end();
        process.exit(1);
      }
    }

    const tabelas = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log(`\n[OK] Schema em dia. ${tabelas.rows.length} tabelas em 'public'.\n`);
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERRO FATAL]', err.message);
    process.exit(1);
  });
