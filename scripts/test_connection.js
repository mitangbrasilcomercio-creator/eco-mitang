#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * DIAGNOSTICO DE CONEXAO
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * Este script conectava direto em producao (DIRECT_URL) com
 * 'ssl: { rejectUnauthorized: false }' -- a mesma verificacao de certificado
 * desligada que foi removida de src/core/database/supabase-pool.ts no
 * saneamento. Ela sobreviveu aqui, escondida num utilitario que ninguem le.
 *
 * Encontrado por tests/ambiente.test.js, que exige que todo script de banco
 * passe pelo resolvedor de ambiente.
 *
 * [CORRECAO]
 * Passou a usar scripts/lib/ambiente.js: alvo padrao em homologacao, e o
 * certificado da Supabase fixado com verificacao ligada quando o alvo e
 * producao.
 *
 * Uso:
 *   node scripts/test_connection.js              testa homologacao
 *   node scripts/test_connection.js --producao   testa producao
 *   node scripts/test_connection.js --app        usa o papel eco_app (RLS vale)
 * ============================================================================
 */
const { Client } = require('pg');
const ambiente = require('./lib/ambiente');

async function main() {
  const args = process.argv.slice(2);
  const papel = args.includes('--app') ? 'app' : 'migration';

  const ctx = ambiente.resolver({ papel, args });
  ambiente.banner(ctx, 'Diagnostico de conexao');

  const client = new Client(ctx.configCliente({ connectionTimeoutMillis: 15000 }));

  try {
    await client.connect();
  } catch (err) {
    console.error('[FALHOU] ' + err.message);
    if (!ctx.ehProducao) {
      console.error('\n  O container de homologacao esta no ar? Confira com:');
      console.error('      npm run homolog:status');
    }
    process.exit(1);
  }

  const r = await client.query(
    'SELECT version() AS versao, current_database() AS base, current_user AS usuario'
  );
  const rls = await client.query(
    'SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user'
  );

  console.log('[OK] Conexao estabelecida.\n');
  console.log('  PostgreSQL : ' + String(r.rows[0].versao).split(' ').slice(0, 2).join(' '));
  console.log('  Base       : ' + r.rows[0].base);
  console.log('  Usuario    : ' + r.rows[0].usuario);
  console.log('  BYPASSRLS  : ' + (rls.rows[0] ? rls.rows[0].rolbypassrls : '?'));

  if (papel === 'app' && rls.rows[0] && rls.rows[0].rolbypassrls) {
    console.error('\n[ERRO] O papel da aplicacao tem BYPASSRLS -- a RLS nao vale para ele.');
    await client.end();
    process.exit(1);
  }

  console.log('');
  await client.end();
}

main().catch((err) => {
  console.error('[ERRO FATAL] ' + err.message);
  process.exit(1);
});
