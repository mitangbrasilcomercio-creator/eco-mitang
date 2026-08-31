'use strict';
/**
 * ============================================================================
 * BACKUP DE PRODUCAO ANTES DE OPERACAO DESTRUTIVA
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * O backup automatico da Supabase existia, mas nunca foi testado -- e um
 * restore nao verificado nao e um backup, e uma esperanca. Quando o
 * 'TRUNCATE ... CASCADE' levou junto 75 duplicatas de nota fiscal, a
 * recuperacao dependeu de reingerir XML na mao.
 *
 * [CORRECAO]
 * Toda operacao que escreve em producao passa por aqui primeiro. O dump sai em
 * formato custom (pg_restore seletivo, por tabela se preciso) para
 * database/backups/, que ja e ignorado pelo git.
 *
 * pg_dump vem do container postgres:17 -- a maquina nao precisa ter cliente
 * PostgreSQL instalado, e a versao acompanha a de producao (17.6). Um pg_dump
 * mais antigo que o servidor se recusa a rodar.
 *
 * O certificado da Supabase e montado dentro do container e a conexao usa
 * 'verify-full': o dump nao afrouxa a verificacao que o resto do sistema faz.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');
const DIR_BACKUPS = path.join(RAIZ, 'database', 'backups');
const DIR_CERTS = path.join(RAIZ, 'database', 'certs');
const IMAGEM = 'postgres:17';

function carimbo() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function docker(args, opcoes) {
  // spawnSync sem shell: nenhum caminho do Windows passa por expansao do bash.
  return spawnSync('docker', args, Object.assign({ encoding: 'utf8' }, opcoes || {}));
}

function dockerDisponivel() {
  const r = docker(['version', '--format', '{{.Server.Version}}']);
  return r.status === 0;
}

/**
 * Acrescenta verificacao de certificado apontando para o CA montado no
 * container, sem mexer nos parametros que ja vierem na URL.
 */
function urlComCaDoContainer(connectionString) {
  const u = new URL(connectionString);
  u.searchParams.set('sslmode', 'verify-full');
  u.searchParams.set('sslrootcert', '/certs/supabase-ca.crt');
  return u.toString();
}

/**
 * @param {object} ctx     contexto devolvido por ambiente.resolver()
 * @param {string} rotulo  vai para o nome do arquivo (ex.: 'antes-de-migrate')
 * @returns {{ok: boolean, arquivo?: string, erro?: string}}
 */
function dumpar(ctx, rotulo, opcoes) {
  const soPublic = !!(opcoes && opcoes.somentePublic);
  if (!dockerDisponivel()) {
    return { ok: false, erro: 'Docker nao esta respondendo -- e ele que fornece o pg_dump.' };
  }

  fs.mkdirSync(DIR_BACKUPS, { recursive: true });
  const nome = ctx.ambiente + '_' + rotulo + '_' + carimbo() + '.dump';

  const resultado = docker([
    'run', '--rm',
    '-v', DIR_CERTS.replace(/\\/g, '/') + ':/certs:ro',
    '-v', DIR_BACKUPS.replace(/\\/g, '/') + ':/saida',
    IMAGEM,
    'pg_dump',
    '--format=custom',
    '--no-owner',
    '--no-acl',
    // Restaurar num PostgreSQL puro exige deixar de fora o que so existe na
    // Supabase: o dump completo traz CREATE EXTENSION supabase_vault, e o
    // pg_restore para nele.
    ...(soPublic ? ['--schema=public'] : []),
    '--file=/saida/' + nome,
    urlComCaDoContainer(ctx.connectionString)
  ], { timeout: 15 * 60 * 1000 });

  if (resultado.status !== 0) {
    const saida = (resultado.stderr || resultado.stdout || '').trim().split('\n').slice(-6).join('\n');
    return { ok: false, erro: saida || 'pg_dump terminou com codigo ' + resultado.status };
  }

  const caminho = path.join(DIR_BACKUPS, nome);
  const bytes = fs.existsSync(caminho) ? fs.statSync(caminho).size : 0;
  if (bytes === 0) return { ok: false, erro: 'pg_dump gerou arquivo vazio.' };

  return { ok: true, arquivo: caminho, bytes };
}

module.exports = { dumpar, dockerDisponivel, DIR_BACKUPS, IMAGEM };
