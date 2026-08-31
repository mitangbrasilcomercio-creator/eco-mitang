const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * ============================================================================
 * TRAVA DE AMBIENTE
 * ============================================================================
 *
 * [ERRO ANTERIOR]: todo script de banco resolvia a conexao sozinho, com
 *
 *     process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL
 *
 * e o alvo era, sempre e sem aviso, o Supabase de producao. 'db:reingest'
 * apagava e recarregava dados reais.
 *
 * [CORRECAO]: um resolvedor unico, com homologacao por padrao. Estes testes
 * travam as tres propriedades que fazem a protecao valer:
 *
 *   1. sem pedido explicito, o alvo NUNCA e producao;
 *   2. a flag da linha de comando ganha da variavel de ambiente;
 *   3. TLS e decidido pelo destino -- CA fixada fora, sem TLS no container.
 *
 * Se alguem inverter o padrao "por conveniencia", o build para aqui.
 * ============================================================================
 */

const ambiente = require('../scripts/lib/ambiente');

/** Roda um trecho com ECO_AMBIENTE controlado, sem vazar para os outros testes. */
function comEnv(valor, fn) {
  const anterior = process.env.ECO_AMBIENTE;
  if (valor === undefined) delete process.env.ECO_AMBIENTE;
  else process.env.ECO_AMBIENTE = valor;
  try {
    return fn();
  } finally {
    if (anterior === undefined) delete process.env.ECO_AMBIENTE;
    else process.env.ECO_AMBIENTE = anterior;
  }
}

// ---------------------------------------------------------------------------

test('sem pedido explicito, o alvo e homologacao', () => {
  comEnv(undefined, () => {
    assert.equal(ambiente.detectarAmbiente([]), 'homologacao');
    const ctx = ambiente.resolver({ args: [] });
    assert.equal(ctx.ambiente, 'homologacao');
    assert.equal(ctx.ehProducao, false);
    assert.equal(ctx.alvo.host, 'localhost');
  });
});

test('producao exige a flag ou a variavel -- nao acontece por acidente', () => {
  comEnv(undefined, () => {
    assert.equal(ambiente.detectarAmbiente(['--dry-run', '--status']), 'homologacao');
    assert.equal(ambiente.detectarAmbiente(['--producao']), 'producao');
    assert.equal(ambiente.detectarAmbiente(['--prod']), 'producao');
  });
  comEnv('producao', () => {
    assert.equal(ambiente.detectarAmbiente([]), 'producao');
  });
});

test('a flag da linha de comando ganha da variavel de ambiente', () => {
  // Um .env apontando para producao nao pode contaminar um comando que o
  // operador escreveu de proposito para rodar em homologacao.
  comEnv('producao', () => {
    assert.equal(ambiente.detectarAmbiente(['--homologacao']), 'homologacao');
  });
});

test('ECO_AMBIENTE com valor desconhecido falha alto, nao escolhe sozinho', () => {
  comEnv('staging', () => {
    assert.throws(() => ambiente.detectarAmbiente([]), /nao e um ambiente conhecido/);
  });
});

test('TLS e decidido pelo destino, nao por variavel global', () => {
  // Container local: sem TLS -- o postgres:17 do compose nao serve certificado.
  assert.equal(ambiente.sslPara('postgresql://postgres:x@localhost:5433/eco_mitang'), false);
  assert.equal(ambiente.sslPara('postgresql://postgres:x@127.0.0.1:5433/eco_mitang'), false);

  // Supabase: CA fixada e verificacao ligada.
  const remoto = ambiente.sslPara('postgresql://u:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres');
  assert.equal(typeof remoto, 'object');
  assert.equal(remoto.rejectUnauthorized, true);
  assert.ok(remoto.ca && remoto.ca.includes('BEGIN CERTIFICATE'), 'o certificado precisa estar fixado');
});

test('a descricao do alvo nunca carrega usuario nem senha', () => {
  const alvo = ambiente.descreverAlvo('postgresql://usuario_secreto:senha_secreta@host.exemplo:5432/base');
  const texto = JSON.stringify(alvo);
  assert.ok(!texto.includes('senha_secreta'), 'a senha nao pode aparecer no banner');
  assert.ok(!texto.includes('usuario_secreto'), 'o usuario nao pode aparecer no banner');
  assert.equal(alvo.host, 'host.exemplo');
  assert.equal(alvo.base, 'base');
});

test('todo script de banco passa pelo resolvedor', () => {
  // A protecao so vale se nao houver porta dos fundos. Um script que monte a
  // conexao na mao volta a apontar para producao sem aviso.
  const fs = require('fs');
  const dir = path.join(__dirname, '..', 'scripts');
  const infratores = [];

  for (const arquivo of fs.readdirSync(dir)) {
    if (!arquivo.endsWith('.js')) continue;
    const conteudo = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    if (!/MIGRATION_DATABASE_URL|DIRECT_URL|DATABASE_URL/.test(conteudo)) continue;
    // homologacao.js e o proprio dono do ambiente; ambiente.js e o resolvedor.
    if (arquivo === 'homologacao.js') continue;
    if (!/require\(['"]\.\/lib\/ambiente['"]\)/.test(conteudo)) infratores.push(arquivo);
  }

  assert.deepEqual(
    infratores,
    [],
    'Estes scripts montam a conexao sem o resolvedor e podem cair em producao ' +
      'sem aviso:\n  ' + infratores.join('\n  ')
  );
});

test('a prova de homologacao barra migration nunca testada', () => {
  const homologado = require('../scripts/lib/homologado');
  const provadas = homologado.ler();

  const inventada = [{ nome: '99_migration_que_nunca_existiu.sql', hash: 'abc' }];
  const problemas = homologado.naoProvadas(inventada);
  assert.equal(problemas.length, 1);
  assert.match(problemas[0].motivo, /nunca aplicada em homologacao/);

  // E migration que passou, mas foi editada depois, tambem barra.
  const nome = Object.keys(provadas)[0];
  if (nome) {
    const alterada = homologado.naoProvadas([{ nome, hash: 'hash-diferente' }]);
    assert.equal(alterada.length, 1);
    assert.match(alterada[0].motivo, /alterada depois de passar/);

    // E a mesma, intacta, passa.
    const intacta = homologado.naoProvadas([{ nome, hash: provadas[nome].hash }]);
    assert.deepEqual(intacta, []);
  }
});

test('toda migration do repositorio ja passou em homologacao', () => {
  // Fecha o circulo: nao adianta a trava existir se o arquivo novo entra no
  // repositorio sem nunca ter sido aplicado em lugar nenhum.
  const fs = require('fs');
  const crypto = require('crypto');
  const homologado = require('../scripts/lib/homologado');

  const dir = path.join(__dirname, '..', 'database');
  const arquivos = fs.readdirSync(dir).filter((f) => /^\d+[a-z]?_.*\.sql$/.test(f));

  const migrations = arquivos.map((nome) => {
    let sql = fs.readFileSync(path.join(dir, nome), 'utf8');
    if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1);
    sql = sql.trim();
    return { nome, hash: crypto.createHash('sha256').update(sql).digest('hex') };
  });

  const problemas = homologado.naoProvadas(migrations);
  assert.deepEqual(
    problemas.map((p) => p.nome + ' -- ' + p.motivo),
    [],
    'Rode "npm run db:migrate" (homologacao) antes de commitar a migration.'
  );
});
