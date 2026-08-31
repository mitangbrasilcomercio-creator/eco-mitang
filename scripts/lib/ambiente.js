'use strict';
/**
 * ============================================================================
 * RESOLVEDOR DE AMBIENTE -- producao x homologacao
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * Seis scripts (migrate, reingest, seed_obrigacoes, criar_usuario,
 * setup_app_role, verificar_integridade) repetiam a mesma linha:
 *
 *     process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL
 *
 * Ou seja: o alvo era sempre o Supabase de producao, sem aviso e sem escolha.
 * 'npm run db:reingest' apagava e recarregava dados reais; 'npm run db:migrate'
 * aplicava DDL nova direto na base que a empresa usa. A unica protecao era
 * lembrar de nao errar -- e ja falhou pelo menos duas vezes nesta base
 * (dist desatualizado criando contas bancarias duplicadas; TRUNCATE CASCADE
 * levando junto 75 duplicatas de nota fiscal).
 *
 * [CORRECAO]
 * Um unico lugar decide para onde a conexao vai, e o padrao e homologacao.
 * Producao exige escolha explicita ('--producao' ou ECO_AMBIENTE=producao) e,
 * quando a operacao escreve, confirmacao digitada por extenso.
 *
 * Regras:
 *   1. Padrao = homologacao. Errar de mao pesada agora custa um
 *      'docker compose down -v', nao um restore.
 *   2. Producao nunca e alcancada por acidente: precisa da flag OU da variavel.
 *   3. Operacao destrutiva em producao pede confirmacao digitada. Sem TTY,
 *      exige '--confirmar-producao'.
 *   4. O alvo e sempre impresso antes de qualquer query -- host, porta e base.
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RAIZ = path.join(__dirname, '..', '..');
const CA_PATH = path.join(RAIZ, 'database', 'certs', 'supabase-ca.crt');

require('dotenv').config({ path: path.join(RAIZ, '.env') });

/**
 * Padroes de homologacao. Batem com docker-compose.homologacao.yml, entao o
 * ambiente funciona sem escrever uma linha no .env. A senha e fixa e publica
 * de proposito: o container ouve em localhost e e descartavel.
 */
const HOMOLOG_PADRAO = {
  migration: 'postgresql://postgres:homologacao@localhost:5433/eco_mitang',
  app: 'postgresql://eco_app:homologacao@localhost:5433/eco_mitang'
};

const HOMOLOG_SENHA_APP = 'homologacao';

// ---------------------------------------------------------------------------

function ehLocal(connectionString) {
  return /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(connectionString || '');
}

/**
 * TLS por destino, nao por variavel global.
 * Supabase: CA fixada e verificacao ligada. Container local: sem TLS.
 */
function sslPara(connectionString) {
  if (ehLocal(connectionString)) return false;
  if (process.env.DB_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
  try {
    return { ca: fs.readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

/** Extrai host/porta/base sem nunca tocar em usuario ou senha. */
function descreverAlvo(connectionString) {
  try {
    const u = new URL(connectionString);
    return {
      host: u.hostname,
      porta: u.port || '5432',
      base: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres'
    };
  } catch {
    return { host: '?', porta: '?', base: '?' };
  }
}

/**
 * Ordem de decisao: flag na linha de comando > ECO_AMBIENTE > homologacao.
 * A flag ganha da variavel para que um .env apontando para producao nao
 * contamine um comando que o operador quis rodar em homologacao.
 */
function detectarAmbiente(args) {
  if (args.includes('--producao') || args.includes('--prod')) return 'producao';
  if (args.includes('--homologacao') || args.includes('--homolog')) return 'homologacao';

  const doEnv = String(process.env.ECO_AMBIENTE || '').trim().toLowerCase();
  if (doEnv === 'producao' || doEnv === 'production' || doEnv === 'prod') return 'producao';
  if (doEnv && doEnv !== 'homologacao' && doEnv !== 'homolog') {
    throw new Error(
      "ECO_AMBIENTE='" + doEnv + "' nao e um ambiente conhecido. Use 'producao' ou 'homologacao'."
    );
  }
  return 'homologacao';
}

function stringDeConexao(ambiente, papel) {
  if (ambiente === 'producao') {
    const url =
      papel === 'app'
        ? process.env.APP_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL
        : process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!url) {
      const nome = papel === 'app' ? 'APP_DATABASE_URL' : 'MIGRATION_DATABASE_URL';
      throw new Error('Producao pedida, mas ' + nome + ' nao esta definida no .env.');
    }
    return url;
  }

  const explicita =
    papel === 'app'
      ? process.env.HOMOLOG_APP_DATABASE_URL
      : process.env.HOMOLOG_MIGRATION_DATABASE_URL;
  return explicita || HOMOLOG_PADRAO[papel];
}

// ---------------------------------------------------------------------------

/**
 * @param {object}            opcoes
 * @param {'migration'|'app'} [opcoes.papel]  privilegiado (DDL) ou eco_app (RLS vale)
 * @param {string[]}          [opcoes.args]   argv, para ler as flags
 */
function resolver({ papel = 'migration', args = process.argv.slice(2) } = {}) {
  const ambiente = detectarAmbiente(args);
  const connectionString = stringDeConexao(ambiente, papel);

  return {
    ambiente,
    papel,
    ehProducao: ambiente === 'producao',
    connectionString,
    ssl: sslPara(connectionString),
    alvo: descreverAlvo(connectionString),
    /** Config pronta para 'new Client(...)' do pg. */
    configCliente(extras) {
      return Object.assign(
        {
          connectionString,
          ssl: sslPara(connectionString),
          connectionTimeoutMillis: 30000
        },
        extras || {}
      );
    }
  };
}

/** Impresso antes de qualquer query. O alvo nunca fica implicito. */
function banner(ctx, operacao) {
  const linha = '='.repeat(70);
  const marca = ctx.ehProducao ? '### PRODUCAO ###' : 'homologacao';
  console.log(linha);
  console.log('  ' + operacao);
  console.log('  ambiente : ' + marca);
  console.log('  alvo     : ' + ctx.alvo.host + ':' + ctx.alvo.porta + '/' + ctx.alvo.base);
  console.log('  papel    : ' + (ctx.papel === 'app' ? 'eco_app (RLS aplicada)' : 'privilegiado (DDL)'));
  console.log(linha);
  console.log('');
}

function perguntar(pergunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pergunta, (resposta) => {
      rl.close();
      resolve(String(resposta).trim());
    });
  });
}

/**
 * Porta de entrada de producao para operacao que escreve.
 *
 * Em homologacao nao pergunta nada -- a base e descartavel, e friccao ali so
 * ensinaria o operador a confirmar no automatico, que e como a protecao morre.
 */
async function confirmarSeProducao(ctx, opcoes) {
  const operacao = opcoes.operacao;
  const args = opcoes.args || process.argv.slice(2);

  if (!ctx.ehProducao) return;

  if (args.includes('--confirmar-producao')) {
    console.log("[PRODUCAO] '" + operacao + "' autorizada por --confirmar-producao.\n");
    return;
  }

  if (!process.stdin.isTTY) {
    console.error(
      "[BLOQUEADO] '" + operacao + "' escreve em PRODUCAO e nao ha terminal para confirmar.\n" +
        '            Rode com --confirmar-producao se e realmente essa a intencao.'
    );
    process.exit(1);
  }

  console.log('Esta operacao escreve em PRODUCAO: ' + operacao);
  console.log('Alvo: ' + ctx.alvo.host + ':' + ctx.alvo.porta + '/' + ctx.alvo.base);
  const resposta = await perguntar('Digite PRODUCAO para continuar (qualquer outra coisa cancela): ');

  if (resposta !== 'PRODUCAO') {
    console.log('\nCancelado. Nada foi alterado.');
    process.exit(0);
  }
  console.log('');
}

module.exports = {
  resolver,
  banner,
  confirmarSeProducao,
  sslPara,
  descreverAlvo,
  detectarAmbiente,
  ehLocal,
  perguntar,
  HOMOLOG_PADRAO,
  HOMOLOG_SENHA_APP,
  CA_PATH,
  RAIZ
};
