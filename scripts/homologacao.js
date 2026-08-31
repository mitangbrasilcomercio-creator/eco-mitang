#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * AMBIENTE DE HOMOLOGACAO -- ciclo de vida
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * Nao existia ambiente de homologacao. O plano de execucao aponta isso como
 * "o risco mais urgente hoje": migration, re-ingestao e carga rodavam direto
 * na base que a empresa usa.
 *
 * [CORRECAO]
 * Um PostgreSQL 17 local em container -- a mesma versao maior de producao.
 * As migrations do projeto sao PostgreSQL puro: as unicas extensoes usadas sao
 * uuid-ossp e pgcrypto (ambas no contrib), e o unico trecho especifico da
 * Supabase (REVOKE de anon/authenticated) ja vem protegido por IF EXISTS.
 * Nao foi preciso emular nada.
 *
 * Por que container local e nao um terceiro projeto Supabase:
 *   - custo zero, contra o preco de sair do plano gratuito;
 *   - reset completo em segundos ('zerar'), que e o que faz um ambiente de
 *     teste valer -- em nuvem, recriar do zero da preguica e a base apodrece;
 *   - funciona sem rede;
 *   - o que ele NAO cobre (Supavisor, TLS com CA fixada, papeis do PostgREST)
 *     e superficie de plataforma, nao de schema, e continua sendo exercitada
 *     em producao pelo 'npm run verificar'.
 *
 * Comandos:
 *   subir      sobe o container e espera ficar saudavel
 *   preparar   subir + migrations + papel eco_app + fixtures de teste
 *   espelhar   copia producao para ca, ANONIMIZANDO (pede confirmacao)
 *   zerar      destroi o volume e refaz do zero
 *   derrubar   para o container (mantem os dados)
 *   status     mostra o estado atual
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
const ambiente = require('./lib/ambiente');
const backup = require('./lib/backup');

const RAIZ = path.join(__dirname, '..');
const COMPOSE = path.join(RAIZ, 'docker-compose.homologacao.yml');
const ANONIMIZAR = path.join(RAIZ, 'database', 'homologacao', 'anonimizar.sql');
const DIR_CERTS = path.join(RAIZ, 'database', 'certs');
const SERVICO = 'homologacao';
const CONTAINER = 'eco-mitang-homologacao';

// Dentro de um container, 'localhost' e o proprio container.
const HOST_DE_DENTRO = 'host.docker.internal';

function executar(cmd, args, opcoes) {
  return spawnSync(cmd, args, Object.assign({ stdio: 'inherit', cwd: RAIZ }, opcoes || {}));
}

function capturar(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: RAIZ });
}

function compose(args) {
  return executar('docker', ['compose', '-f', COMPOSE].concat(args));
}

function exigirDocker() {
  if (!backup.dockerDisponivel()) {
    console.error('[ERRO] Docker nao esta respondendo.');
    console.error('       Abra o Docker Desktop e tente de novo.');
    process.exit(1);
  }
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera o healthcheck do compose, nao um sleep arbitrario. */
async function esperarSaudavel(segundos = 90) {
  process.stdout.write('Esperando o banco aceitar conexao ');
  for (let i = 0; i < segundos; i++) {
    const r = capturar('docker', ['inspect', '-f', '{{.State.Health.Status}}', CONTAINER]);
    if (r.status === 0 && String(r.stdout).trim() === 'healthy') {
      console.log(' pronto.');
      return true;
    }
    process.stdout.write('.');
    await dormir(1000);
  }
  console.log(' tempo esgotado.');
  return false;
}

/** URL da homologacao vista de dentro de outro container. */
function urlDeDentro(url) {
  const u = new URL(url);
  u.hostname = HOST_DE_DENTRO;
  u.port = '5433';
  return u.toString();
}

/**
 * Roda outro script deste repositorio, sempre apontado para homologacao.
 *
 * Chama o node direto, e nao 'npm run': a partir do Node 22, spawn de um '.cmd'
 * sem shell e recusado por seguranca (CVE-2024-27980), e o subcomando falhava
 * em silencio -- 'preparar' dizia ter subido o container e parava ali.
 */
function rodar(nomeDoScript) {
  return executar(process.execPath, [path.join(RAIZ, 'scripts', nomeDoScript)], {
    env: Object.assign({}, process.env, { ECO_AMBIENTE: 'homologacao' })
  });
}

// ---------------------------------------------------------------------------

async function subir() {
  exigirDocker();
  console.log('Subindo o container de homologacao...\n');
  if (compose(['up', '-d']).status !== 0) process.exit(1);
  if (!(await esperarSaudavel())) {
    console.error('\n[ERRO] O container subiu mas nao ficou saudavel. Veja:');
    console.error('       docker compose -f docker-compose.homologacao.yml logs');
    process.exit(1);
  }
}

function derrubar() {
  exigirDocker();
  compose(['down']);
  console.log('\nContainer parado. Os dados continuam no volume.');
  console.log('Para apagar tambem os dados: npm run homolog:zerar');
}

async function zerar() {
  exigirDocker();
  console.log('Destruindo o volume de homologacao...\n');
  compose(['down', '-v']);
  await subir();
  console.log('\nBanco vazio. Rode: npm run homolog:preparar');
}

async function preparar() {
  await subir();

  console.log('\n--- Migrations ------------------------------------------------------\n');
  if (rodar('migrate.js').status !== 0) process.exit(1);

  console.log('\n--- Papel eco_app ---------------------------------------------------\n');
  if (rodar('setup_app_role.js').status !== 0) process.exit(1);

  console.log('\n--- Fixtures --------------------------------------------------------\n');
  if (rodar('seed_homologacao.js').status !== 0) process.exit(1);

  console.log('\n======================================================================');
  console.log('  Homologacao pronta.');
  console.log('======================================================================\n');
  console.log('  ' + ambiente.HOMOLOG_PADRAO.migration);
  console.log('');
  console.log('  Schema completo, fixtures minimas e usuarios de teste.');
  console.log('  Login: gestor@homologacao.local / homologacao');
  console.log('');
  console.log('    npm test                   agora roda contra este banco');
  console.log('    npm run verificar:homolog  pilha completa em homologacao');
  console.log('    npm run homolog:espelhar   copia producao anonimizada para ca');
  console.log('');
}

/**
 * Producao -> homologacao, com anonimizacao obrigatoria.
 *
 * O dump sai de producao em modo somente-leitura (pg_dump nao escreve), entao
 * a operacao e segura do lado de la. O lado perigoso e o de ca: a base local e
 * recriada do zero, e por isso o comando avisa antes.
 */
async function espelhar() {
  exigirDocker();

  const ctxProd = ambiente.resolver({ papel: 'migration', args: ['--producao'] });
  const ctxHomolog = ambiente.resolver({ papel: 'migration', args: ['--homologacao'] });

  console.log('Espelhar producao em homologacao');
  console.log('  origem  : ' + ctxProd.alvo.host + ':' + ctxProd.alvo.porta + '/' + ctxProd.alvo.base + '  (somente leitura)');
  console.log('  destino : ' + ctxHomolog.alvo.host + ':' + ctxHomolog.alvo.porta + '/' + ctxHomolog.alvo.base + '  (sera RECRIADO)');
  console.log('');

  if (process.stdin.isTTY && !process.argv.includes('--sim')) {
    const r = await ambiente.perguntar('A base de homologacao sera apagada. Continuar? (s/N) ');
    if (r.toLowerCase() !== 's') {
      console.log('Cancelado.');
      return;
    }
  }

  await subir();

  console.log('\n--- 1/4 Dump de producao --------------------------------------------\n');
  const dump = backup.dumpar(ctxProd, 'espelho');
  if (!dump.ok) {
    console.error('[ERRO] ' + dump.erro);
    process.exit(1);
  }
  console.log('OK  ' + path.relative(RAIZ, dump.arquivo) + '  (' + (dump.bytes / 1024 / 1024).toFixed(1) + ' MB)');

  console.log('\n--- 2/4 Recriando a base local --------------------------------------\n');
  const admin = new Client({
    connectionString: ctxHomolog.connectionString.replace(/\/eco_mitang(\?|$)/, '/postgres$1'),
    ssl: false
  });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS eco_mitang WITH (FORCE);');
  await admin.query('CREATE DATABASE eco_mitang;');
  await admin.end();
  console.log('OK  eco_mitang recriada, vazia.');

  console.log('\n--- 3/4 Restaurando -------------------------------------------------\n');
  const restaurar = executar('docker', [
    'run', '--rm',
    '-v', backup.DIR_BACKUPS.replace(/\\/g, '/') + ':/entrada:ro',
    backup.IMAGEM,
    'pg_restore',
    '--no-owner',
    '--no-acl',
    '--exit-on-error',
    '--dbname=' + urlDeDentro(ctxHomolog.connectionString),
    '/entrada/' + path.basename(dump.arquivo)
  ]);
  if (restaurar.status !== 0) {
    console.error('\n[ERRO] pg_restore falhou. A base local ficou incompleta.');
    process.exit(1);
  }
  console.log('OK  schema e dados restaurados.');

  console.log('\n--- 4/4 Anonimizando ------------------------------------------------\n');
  const alvo = new Client(ctxHomolog.configCliente());
  await alvo.connect();
  try {
    await alvo.query('BEGIN');
    await alvo.query(fs.readFileSync(ANONIMIZAR, 'utf8'));
    await alvo.query('COMMIT');
  } catch (err) {
    await alvo.query('ROLLBACK');
    console.error('[ERRO] A anonimizacao falhou: ' + err.message);
    console.error('       A base tem dado real e NAO deve ser usada. Rode: npm run homolog:zerar');
    await alvo.end();
    process.exit(1);
  }

  const conferencia = await alvo.query(
    "SELECT count(*)::int AS reais FROM usuarios WHERE email NOT LIKE '%@homologacao.local'"
  );
  await alvo.end();

  if (conferencia.rows[0].reais > 0) {
    console.error('[ERRO] Sobraram ' + conferencia.rows[0].reais + ' e-mails reais. Rode: npm run homolog:zerar');
    process.exit(1);
  }

  console.log('OK  nenhum e-mail real restou.');

  // Papel da aplicacao: some no DROP DATABASE? Nao -- papel e do cluster. Mas
  // os GRANTs sao por base, e a base e nova. Reaplica.
  console.log('\n--- Papel eco_app ---------------------------------------------------\n');
  rodar('setup_app_role.js');

  console.log('\n======================================================================');
  console.log('  Espelho pronto. Senha de qualquer usuario: homologacao');
  console.log('======================================================================\n');
}

async function status() {
  const r = capturar('docker', ['inspect', '-f', '{{.State.Status}}/{{.State.Health.Status}}', CONTAINER]);
  const estado = r.status === 0 ? String(r.stdout).trim() : 'inexistente';

  console.log('Container : ' + CONTAINER + '  ->  ' + estado);
  console.log('Conexao   : ' + ambiente.HOMOLOG_PADRAO.migration);

  if (!estado.startsWith('running')) {
    console.log('\nSuba com: npm run homolog:subir');
    return;
  }

  const ctx = ambiente.resolver({ papel: 'migration', args: ['--homologacao'] });
  const c = new Client(ctx.configCliente({ connectionTimeoutMillis: 5000 }));
  try {
    await c.connect();
    const t = await c.query(
      "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
    );
    const v = await c.query('SHOW server_version');
    let migrations = { rows: [{ n: 0 }] };
    try {
      migrations = await c.query('SELECT count(*)::int n FROM schema_migrations');
    } catch { /* base ainda sem ledger */ }

    console.log('PostgreSQL: ' + v.rows[0].server_version);
    console.log('Tabelas   : ' + t.rows[0].n);
    console.log('Migrations: ' + migrations.rows[0].n + ' aplicadas');
    await c.end();
  } catch (err) {
    console.log('\n[AVISO] Container no ar, mas a conexao falhou: ' + err.message);
  }
}

// ---------------------------------------------------------------------------

const COMANDOS = { subir, derrubar, zerar, preparar, espelhar, status };

async function main() {
  const comando = process.argv[2];

  if (!comando || !COMANDOS[comando]) {
    console.log('Uso: node scripts/homologacao.js <comando>\n');
    console.log('  subir      sobe o container e espera ficar saudavel');
    console.log('  preparar   subir + migrations + papel eco_app');
    console.log('  espelhar   copia producao para ca, anonimizando');
    console.log('  zerar      destroi o volume e refaz do zero');
    console.log('  derrubar   para o container (mantem os dados)');
    console.log('  status     mostra o estado atual\n');
    process.exit(comando ? 1 : 0);
  }

  await COMANDOS[comando]();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERRO FATAL] ' + err.message);
    process.exit(1);
  });
