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
 * [ERRO ANTERIOR 4]:
 *    O alvo era sempre producao. Nao havia escolha, aviso nem etapa
 *    intermediaria: escrever a migration e aplica-la nos dados reais da
 *    empresa eram o mesmo gesto.
 *
 * [COMO FOI CORRIGIDO 4]:
 *    O alvo padrao passou a ser homologacao (scripts/lib/ambiente.js).
 *    Producao exige '--producao', confirmacao digitada, backup previo, e que
 *    cada migration pendente ja tenha passado em homologacao com o mesmo hash
 *    (database/homologado.json).
 *
 * Uso:
 *   node scripts/migrate.js                 aplica as pendentes em HOMOLOGACAO
 *   node scripts/migrate.js --producao      aplica em producao (com travas)
 *   node scripts/migrate.js --status        so mostra o estado
 *   node scripts/migrate.js --baseline      marca as existentes como aplicadas
 *                                           sem executar (adocao de banco legado)
 *   Escapes, para quando o operador sabe o que esta fazendo:
 *     --sem-backup           pula o dump previo de producao
 *     --sem-homologacao      aplica em producao sem prova de homologacao
 * ============================================================================
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ambiente = require('./lib/ambiente');
const homologado = require('./lib/homologado');
const backup = require('./lib/backup');

const DIR = path.join(__dirname, '..', 'database');

/**
 * Nome valido: '<numero>[letra]_<descricao>.sql'.
 *
 * A letra opcional existe para inserir uma migration ENTRE duas ja aplicadas
 * sem renumerar as posteriores -- foi o que '11a_item_catalogo_eav.sql'
 * precisou, porque a 12 tem uma FK para uma tabela que ele cria. Sem esse
 * sufixo a unica saida seria criar uma colisao de numeracao, que e a origem
 * do [ERRO ANTERIOR 1] la em cima.
 *
 * A ordenacao usa o numero; entre nomes de mesmo numero, a ordem alfabetica.
 */
function listarMigrations() {
  return fs
    .readdirSync(DIR)
    .filter((f) => /^\d+[a-z]?_.*\.sql$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      return na !== nb ? na - nb : a.localeCompare(b);
    })
    .map((nome) => {
      let sql = fs.readFileSync(path.join(DIR, nome), 'utf8');
      if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1); // remove BOM UTF-8
      sql = sql.trim();

      // [ERRO ANTERIOR 5]: o hash era do conteudo cru. No Windows os arquivos
      // ficam com CRLF e no CI com LF, entao o MESMO arquivo produzia dois
      // hashes -- e o executor acusava 'ALTERADA' em migration que ninguem
      // tocou, a cada clone.
      // [CORRECAO]: hash sobre a versao normalizada em LF. 'hashBruto' fica so
      // para reconhecer ledger antigo e atualiza-lo (ver reconciliarHash).
      const normalizado = sql.split('\r\n').join('\n');
      return {
        nome,
        versao: parseInt(nome, 10),
        sql,
        hash: crypto.createHash('sha256').update(normalizado).digest('hex'),
        hashBruto: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

/**
 * Ledger gravado antes da normalizacao guarda o hash do conteudo cru. Quando o
 * hash antigo bate, e o mesmo arquivo com outro fim de linha: a linha e
 * atualizada para o hash normalizado, em silencio e uma unica vez.
 *
 * Um arquivo de fato alterado nao bate com nenhum dos dois, entao esta
 * reconciliacao nao mascara mudanca real -- que continua sendo denunciada.
 */
async function reconciliarHash(client, m, hashAplicado) {
  if (hashAplicado !== m.hashBruto) return false;
  await client.query('UPDATE schema_migrations SET hash = $2 WHERE nome = $1;', [m.nome, m.hash]);
  console.log(`  [ normaliza ] ${m.nome}  <-- mesmo conteudo, fim de linha diferente`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const somenteStatus = args.includes('--status');
  const baseline = args.includes('--baseline');

  const ctx = ambiente.resolver({ papel: 'migration', args });
  ambiente.banner(ctx, somenteStatus ? 'Migrations (consulta)' : 'Migrations');

  const client = new Client(ctx.configCliente());
  await client.connect();

  const versaoPg = (await client.query('SHOW server_version')).rows[0].server_version;

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
        if (!somenteStatus && (await reconciliarHash(client, m, hashAplicado))) continue;
        if (somenteStatus && hashAplicado === m.hashBruto) {
          console.log(`  [ normaliza ] ${m.nome}  <-- so o fim de linha difere`);
          continue;
        }
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

    const aAplicar = migrations.filter((m) => !aplicadas.has(m.nome));

    // -----------------------------------------------------------------------
    // Travas de producao. Nenhuma delas roda em homologacao: la a base e
    // descartavel, e friccao sem risco so ensina a confirmar no automatico.
    // -----------------------------------------------------------------------
    if (ctx.ehProducao && aAplicar.length > 0) {
      const semProva = homologado.naoProvadas(aAplicar);

      if (semProva.length > 0 && !args.includes('--sem-homologacao')) {
        console.error('[BLOQUEADO] Migration sem prova de homologacao:\n');
        for (const p of semProva) console.error(`  ${p.nome}  --  ${p.motivo}`);
        console.error(
          '\n  Rode primeiro em homologacao:\n' +
            '      npm run homolog:preparar\n' +
            '      npm run db:migrate\n\n' +
            '  Isso registra o hash em database/homologado.json e libera producao.\n' +
            '  Para pular conscientemente: --sem-homologacao\n'
        );
        await client.end();
        process.exit(1);
      }

      if (semProva.length > 0) {
        console.log('[AVISO] --sem-homologacao: aplicando em producao sem prova previa.\n');
      }

      await ambiente.confirmarSeProducao(ctx, {
        operacao: `aplicar ${aAplicar.length} migration(s)`,
        args
      });

      if (!args.includes('--sem-backup')) {
        process.stdout.write('Backup de producao antes de aplicar ... ');
        const r = backup.dumpar(ctx, 'antes-de-migrate');
        if (!r.ok) {
          console.log('FALHOU');
          console.error(`\n[BLOQUEADO] ${r.erro}\n`);
          console.error('  Sem backup nao ha como desfazer. Corrija, ou use --sem-backup\n');
          await client.end();
          process.exit(1);
        }
        console.log(`OK (${(r.bytes / 1024).toFixed(0)} KB)`);
        console.log(`         ${path.relative(process.cwd(), r.arquivo)}\n`);
      }
    }

    for (const m of aAplicar) {
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

        // A prova so e emitida por quem tem o direito de emiti-la: homologacao.
        if (!ctx.ehProducao) homologado.registrar(m.nome, m.hash, versaoPg);
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
