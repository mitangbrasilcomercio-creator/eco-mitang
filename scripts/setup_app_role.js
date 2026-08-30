#!/usr/bin/env node
/**
 * ============================================================================
 * CRIACAO DO PAPEL DE APLICACAO 'eco_app' (SEM BYPASSRLS)
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * A aplicacao conectava com o papel 'postgres', que tem BYPASSRLS. Toda a
 * Row-Level Security escrita nas migrations era simplesmente ignorada. Nao
 * adianta corrigir as policies (migration 21) se a aplicacao continua entrando
 * pelo papel que as ignora.
 *
 * [COMO FOI CORRIGIDO]:
 * Este script cria 'eco_app' -- sem SUPERUSER, sem BYPASSRLS, sem CREATEDB --
 * gera uma senha forte aleatoria e imprime a connection string para o .env.
 * A senha e mostrada UMA vez e nunca e gravada em disco pelo script.
 *
 * Uso:
 *   node scripts/setup_app_role.js              cria (ou rotaciona a senha)
 *   node scripts/setup_app_role.js --verificar  so audita o papel existente
 * ============================================================================
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const CA_PATH = path.join(__dirname, '..', 'database', 'certs', 'supabase-ca.crt');

function sslConfig() {
  if (process.env.DB_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
  try {
    return { ca: fs.readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

function gerarSenha() {
  // 32 bytes em base64url: forte e sem caracteres que quebrem uma URL de conexao
  return crypto.randomBytes(32).toString('base64url');
}

async function main() {
  const apenasVerificar = process.argv.includes('--verificar');

  const connectionString =
    process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[ERRO] Defina MIGRATION_DATABASE_URL (papel privilegiado) no .env.');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: sslConfig(), connectionTimeoutMillis: 30000 });
  await client.connect();

  try {
    const existente = await client.query(
      'SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = $1;',
      ['eco_app']
    );

    if (apenasVerificar) {
      if (existente.rows.length === 0) {
        console.log("[AVISO] O papel 'eco_app' ainda nao existe.");
        process.exit(1);
      }
      const r = existente.rows[0];
      console.log('Papel eco_app:');
      console.table([r]);
      if (r.rolsuper || r.rolbypassrls) {
        console.error('[ERRO] eco_app tem SUPERUSER ou BYPASSRLS. A RLS nao vai valer para ele.');
        process.exit(1);
      }
      console.log('[OK] eco_app esta sem SUPERUSER e sem BYPASSRLS -- a RLS se aplica a ele.');
      return;
    }

    const senha = gerarSenha();

    if (existente.rows.length === 0) {
      await client.query(
        `CREATE ROLE eco_app WITH LOGIN PASSWORD ${quoteLiteral(senha)}` +
        ` NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;`
      );
      console.log("[OK] Papel 'eco_app' criado.");
    } else {
      // Somente a senha. Reafirmar atributos como NOBYPASSRLS exige superuser,
      // e o papel 'postgres' da Supabase nao e superuser de verdade -- ele so
      // tem BYPASSRLS. Os atributos ja foram fixados no CREATE ROLE e sao
      // conferidos logo abaixo.
      await client.query(`ALTER ROLE eco_app WITH LOGIN PASSWORD ${quoteLiteral(senha)};`);
      console.log("[OK] Senha do papel 'eco_app' rotacionada.");

      const attrs = existente.rows[0];
      if (attrs.rolsuper || attrs.rolbypassrls) {
        console.error(
          '[ERRO] eco_app tem SUPERUSER ou BYPASSRLS -- a RLS nao valeria para ele.\n' +
          '       Corrija no painel da Supabase (SQL Editor):\n' +
          '       ALTER ROLE eco_app NOSUPERUSER NOBYPASSRLS;'
        );
        process.exit(1);
      }
    }

    // Privilegios minimos necessarios para a API funcionar.
    await client.query('GRANT USAGE ON SCHEMA public TO eco_app;');
    await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO eco_app;');
    await client.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO eco_app;');
    await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eco_app;');
    await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO eco_app;');

    // O ledger de migrations e somente-leitura para a aplicacao.
    await client.query('REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM eco_app;').catch(() => {});

    // Monta a connection string no mesmo formato do pooler da Supabase.
    // No Supavisor o usuario e '<papel>.<project_ref>'.
    const base = new URL(connectionString);
    const projectRef = process.env.SUPABASE_PROJECT_REF || base.username.split('.')[1] || '';
    const usuarioPooler = projectRef ? `eco_app.${projectRef}` : 'eco_app';

    const appUrl = `postgresql://${usuarioPooler}:${encodeURIComponent(senha)}@${base.hostname}:${base.port || 5432}${base.pathname}`;

    console.log('\n======================================================================');
    console.log('  ADICIONE ESTA LINHA AO SEU .env (a senha nao sera mostrada de novo)');
    console.log('======================================================================\n');
    console.log(`APP_DATABASE_URL="${appUrl}"\n`);
    console.log('======================================================================');
    console.log('  Depois rode:  node scripts/setup_app_role.js --verificar');
    console.log('======================================================================\n');
  } finally {
    await client.end();
  }
}

/** Escapa um literal para uso seguro em DDL (CREATE ROLE nao aceita parametros). */
function quoteLiteral(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERRO]', err.message);
    process.exit(1);
  });
