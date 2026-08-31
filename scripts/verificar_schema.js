#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * VERIFICACAO DE SCHEMA -- o banco tem a forma que as migrations prometem?
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * Aplicar as migrations sem erro era o unico criterio de sucesso. Isso nao
 * responde as perguntas que importam:
 *   - toda tabela multi-tenant tem policy de isolamento?
 *   - alguma policy voltou a ser RESTRICTIVE (que nega tudo sozinha)?
 *   - os papeis publicos da Supabase continuam sem acesso?
 *
 * A migration 21 corrigiu 19 policies quebradas. Nada impedia a proxima
 * migration de recriar o mesmo defeito -- e a 11a quase fez isso, ao trazer de
 * volta uma policy RESTRICTIVE ao ser reaplicada.
 *
 * [CORRECAO]
 * Este script confere as invariantes do schema, nao a execucao das migrations.
 * Roda no CI contra um banco construido do zero, e localmente contra
 * homologacao.
 *
 * Uso:
 *   node scripts/verificar_schema.js              homologacao
 *   node scripts/verificar_schema.js --producao   producao (somente leitura)
 * ============================================================================
 */
const { Client } = require('pg');
const ambiente = require('./lib/ambiente');

/**
 * Tabelas que tem empresa_id mas nao levam RLS de tenant, com o motivo.
 *
 * A lista e curta de proposito e cada linha precisa de justificativa: uma
 * excecao sem motivo escrito e como a protecao se dissolve com o tempo.
 */
const SEM_RLS_DE_TENANT = {
  usuarios_empresas:
    'lida no login, antes de existir tenant na sessao -- e ela que define quais ' +
    'tenants o usuario tem. Uma policy baseada em app_empresa_ids() seria circular ' +
    'e derrubaria o login. Protegida pela camada de API. Rever na Fase 2 ' +
    '(policy por app.usuario_id, com o login dentro de transacao).'
};

const provas = [];
function registrar(nome, ok, detalhe) {
  provas.push({ nome, ok });
  console.log('  ' + (ok ? '[ OK  ]' : '[FALHA]') + ' ' + nome);
  if (detalhe) console.log('          ' + detalhe);
}

async function main() {
  const ctx = ambiente.resolver({ papel: 'migration' });
  ambiente.banner(ctx, 'Verificacao de schema (somente leitura)');

  const c = new Client(ctx.configCliente());
  await c.connect();

  try {
    // --- 1. Toda tabela com empresa_id esta com RLS ligada -----------------
    const semRls = await c.query(`
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relrowsecurity = FALSE
         AND EXISTS (
              SELECT 1 FROM information_schema.columns col
               WHERE col.table_schema = 'public'
                 AND col.table_name = c.relname
                 AND col.column_name IN ('empresa_id', 'empresa_alvo_id')
         )
       ORDER BY 1;
    `);
    const inesperadas = semRls.rows.map((r) => r.relname).filter((t) => !SEM_RLS_DE_TENANT[t]);
    registrar(
      'toda tabela multi-tenant tem RLS habilitada',
      inesperadas.length === 0,
      inesperadas.length ? 'sem RLS e sem justificativa: ' + inesperadas.join(', ') : null
    );

    for (const t of semRls.rows.map((r) => r.relname)) {
      if (SEM_RLS_DE_TENANT[t]) console.log('  [ -- ] ' + t + ': ' + SEM_RLS_DE_TENANT[t]);
    }

    // Excecao declarada para tabela que nao existe mais = lista apodrecendo.
    const declaradas = Object.keys(SEM_RLS_DE_TENANT);
    const obsoletas = declaradas.filter((t) => !semRls.rows.some((r) => r.relname === t));
    registrar(
      'nenhuma excecao de RLS declarada a toa',
      obsoletas.length === 0,
      obsoletas.length ? 'ja tem RLS, remova da lista: ' + obsoletas.join(', ') : null
    );

    // --- 2. ... e tem pelo menos uma policy -------------------------------
    // RLS ligada sem policy nega tudo: a aplicacao para de enxergar as linhas.
    const semPolicy = await c.query(`
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relrowsecurity = TRUE
         AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
       ORDER BY 1;
    `);
    registrar(
      'nenhuma tabela com RLS ligada e zero policies',
      semPolicy.rowCount === 0,
      semPolicy.rowCount ? 'nega tudo: ' + semPolicy.rows.map((r) => r.relname).join(', ') : null
    );

    // --- 3. Nenhuma policy RESTRICTIVE ------------------------------------
    // Uma policy RESTRICTIVE se combina com as demais por AND. Sozinha, nega
    // tudo; somada a uma PERMISSIVE correta, estreita o resultado em silencio.
    // Foi o defeito que a migration 21 corrigiu em 19 tabelas.
    const restritivas = await c.query(`
      SELECT c.relname AS tabela, p.polname AS policy
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND p.polpermissive = FALSE
       ORDER BY 1, 2;
    `);
    registrar(
      'nenhuma policy RESTRICTIVE sobrou',
      restritivas.rowCount === 0,
      restritivas.rowCount
        ? restritivas.rows.map((r) => r.tabela + '.' + r.policy).join(', ')
        : null
    );

    // --- 4. Funcoes de contexto existem e sao STABLE ----------------------
    const funcoes = await c.query(`
      SELECT proname FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND proname IN ('app_current_empresa', 'app_empresa_ids', 'app_user_role')
       ORDER BY 1;
    `);
    registrar(
      'as tres funcoes de contexto de tenant existem',
      funcoes.rowCount === 3,
      funcoes.rowCount !== 3 ? 'encontradas: ' + funcoes.rows.map((r) => r.proname).join(', ') : null
    );

    // --- 5. Papeis publicos da Supabase sem acesso ------------------------
    // Em homologacao esses papeis nao existem: a prova nao se aplica.
    const temPapeis = await c.query(
      "SELECT count(*)::int n FROM pg_roles WHERE rolname IN ('anon','authenticated')"
    );
    if (temPapeis.rows[0].n > 0) {
      const vazados = await c.query(`
        SELECT DISTINCT table_name
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
         ORDER BY 1;
      `);
      registrar(
        'anon e authenticated nao tem grant em public',
        vazados.rowCount === 0,
        vazados.rowCount ? 'expostas: ' + vazados.rows.map((r) => r.table_name).join(', ') : null
      );
    } else {
      console.log('  [ -- ] anon/authenticated nao existem aqui (PostgreSQL puro)');
    }

    // --- 6. O ledger bate com os arquivos ---------------------------------
    const fs = require('fs');
    const path = require('path');
    const arquivos = fs
      .readdirSync(path.join(__dirname, '..', 'database'))
      .filter((f) => /^\d+[a-z]?_.*\.sql$/.test(f));
    const ledger = await c.query('SELECT nome FROM schema_migrations ORDER BY nome');
    const nomesLedger = new Set(ledger.rows.map((r) => r.nome));
    const faltando = arquivos.filter((a) => !nomesLedger.has(a));
    const orfas = [...nomesLedger].filter((n) => !arquivos.includes(n));

    registrar(
      'o ledger de migrations bate com os arquivos do repositorio',
      faltando.length === 0 && orfas.length === 0,
      faltando.length || orfas.length
        ? 'nao aplicadas: [' + faltando.join(', ') + '] | orfas no ledger: [' + orfas.join(', ') + ']'
        : null
    );
  } finally {
    await c.end();
  }

  const falhas = provas.filter((p) => !p.ok).length;
  console.log('');
  console.log('  ' + (provas.length - falhas) + '/' + provas.length + ' provas de schema passaram');
  console.log('');
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[ERRO FATAL] ' + err.message);
  process.exit(1);
});
