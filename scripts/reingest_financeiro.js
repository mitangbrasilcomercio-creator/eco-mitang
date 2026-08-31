#!/usr/bin/env node
/**
 * ============================================================================
 * RE-INGESTAO LIMPA DOS EXTRATOS BANCARIOS
 * ============================================================================
 *
 * POR QUE ESTE SCRIPT EXISTE:
 * A base de transacoes acumulou tres classes de erro que nao dao para consertar
 * com UPDATE sem virar adivinhacao:
 *
 *   1. 294 linhas de saldo diario contabilizadas como movimentacao
 *      (R$ 41.164.240,85 de ruido), porque o parser procurava
 *      'SALDO APLIC. AUT.' e o Itau escreve 'SALDO APLICACAO AUTOMATICA'.
 *   2. 110 lancamentos com o empresa_id de um CNPJ dentro da conta de outro.
 *   3. 165 rendimentos de CDI classificados como varredura de liquidez, e
 *      categorias sobrescritas por scripts avulsos ao longo do tempo.
 *
 * Com o parser corrigido, reimportar os 30 arquivos OFX reais reproduz a base
 * inteira de forma auditavel: o resultado passa a ser funcao dos arquivos-fonte,
 * nao do historico de correcoes manuais.
 *
 * Uso:
 *   node scripts/reingest_financeiro.js --dry-run   relatorio, sem gravar nada
 *   node scripts/reingest_financeiro.js             executa de verdade
 *   node scripts/reingest_financeiro.js --sem-backup
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const ambiente = require('./lib/ambiente');

const RAIZ = path.join(__dirname, '..');
const DIR_OFX = path.join(RAIZ, 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');
const DIR_XML = path.join(RAIZ, 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'NFe e NFSe');
const DIR_BACKUP = path.join(RAIZ, 'database', 'backups');

const dryRun = process.argv.includes('--dry-run');
const semBackup = process.argv.includes('--sem-backup');


const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function acharArquivos(dir, padrao) {
  const encontrados = [];
  if (!fs.existsSync(dir)) return encontrados;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) encontrados.push(...acharArquivos(p, padrao));
    else if (padrao.test(item.name)) encontrados.push(p);
  }
  return encontrados;
}

const acharOfx = (dir) => acharArquivos(dir, /\.ofx$/i);

/**
 * Le o OFX respeitando a codificacao declarada no cabecalho. Os arquivos do
 * Itau e do Bradesco vem em ISO-8859-1 (latin1); ler como UTF-8 corrompe os
 * acentos -- e era exatamente por isso que 'SALDO APLICACAO AUTOMATICA'
 * aparecia com mojibake em varios scripts do repositorio.
 */
function lerOfx(caminho) {
  const bruto = fs.readFileSync(caminho);
  const cabecalho = bruto.subarray(0, 512).toString('latin1').toUpperCase();
  const utf8 = /CHARSET:\s*UTF-8|ENCODING:\s*UTF-8/.test(cabecalho);
  return bruto.toString(utf8 ? 'utf8' : 'latin1');
}

async function main() {
  const arquivos = acharOfx(DIR_OFX);

  console.log('======================================================================');
  console.log(`   RE-INGESTAO FINANCEIRA ${dryRun ? '(SIMULACAO -- nada sera gravado)' : ''}`);
  console.log('======================================================================\n');
  console.log(`Arquivos OFX encontrados: ${arquivos.length}`);

  if (arquivos.length === 0) {
    console.error(`[ERRO] Nenhum .ofx em "${DIR_OFX}".`);
    process.exit(1);
  }

  // Relata as pastas vazias em vez de fingir que os dados existem.
  if (fs.existsSync(DIR_OFX)) {
    for (const d of fs.readdirSync(DIR_OFX, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const qtd = acharOfx(path.join(DIR_OFX, d.name)).length;
      console.log(`  ${qtd.toString().padStart(3)} arquivo(s)  ${d.name}`);
      if (qtd === 0) {
        console.log(`      ^ pasta sem extratos. Nenhum dado sera inventado para este CNPJ.`);
      }
    }
  }
  console.log('');

  const ctx = ambiente.resolver({ papel: 'migration' });
  ambiente.banner(ctx, 'Re-ingestao financeira (OFX + XML)');

  await ambiente.confirmarSeProducao(ctx, { operacao: 'apagar e recarregar transacoes bancarias e notas fiscais' });

  const client = new Client(ctx.configCliente());
  await client.connect();

  try {
    const antes = await client.query(`
      SELECT (SELECT count(*)::int FROM transacoes_bancarias)       AS transacoes,
             (SELECT count(*)::int FROM extratos_ofx_importacoes)   AS importacoes,
             (SELECT count(*)::int FROM transacoes_bancarias t
                JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
               WHERE t.empresa_id <> c.empresa_id)                  AS cruzadas,
             (SELECT count(*)::int FROM transacoes_bancarias
               WHERE is_saldo_informativo = FALSE
                 AND (memo ILIKE 'SALDO%' OR memo ILIKE 'SDO %'))   AS saldo_como_movimento;`);
    const a = antes.rows[0];

    console.log('ESTADO ATUAL:');
    console.log(`  transacoes ................. ${a.transacoes}`);
    console.log(`  importacoes ................ ${a.importacoes}`);
    console.log(`  cross-tenant (bug F1) ...... ${a.cruzadas}`);
    console.log(`  saldo como movimento (F2) .. ${a.saldo_como_movimento}\n`);

    if (dryRun) {
      // Na simulacao, so faz o parsing e mostra o que a nova classificacao daria.
      const { OfxParser } = require('../dist/modules/financeiro/ofx/ofx-parser');
      let totalLinhas = 0;
      const porCategoria = {};
      let informativas = 0;

      for (const arq of arquivos) {
        const doc = OfxParser.parse(lerOfx(arq), '00000000-0000-4000-8000-000000000000');
        totalLinhas += doc.transactions.length;
        for (const t of doc.transactions) {
          porCategoria[t.categoriaSugerida] = (porCategoria[t.categoriaSugerida] || 0) + 1;
          if (t.isSaldoInformativo) informativas++;
        }
      }

      console.log('COMO A NOVA CLASSIFICACAO FICARIA:');
      console.log(`  total de lancamentos nos arquivos ... ${totalLinhas}`);
      console.log(`  linhas de saldo (expurgadas) ........ ${informativas}`);
      console.log('  por categoria:');
      Object.entries(porCategoria)
        .sort((x, y) => y[1] - x[1])
        .forEach(([k, v]) => console.log(`      ${String(v).padStart(5)}  ${k}`));
      console.log('\n[SIMULACAO] Nada foi gravado. Rode sem --dry-run para aplicar.\n');
      return;
    }

    // -----------------------------------------------------------------
    // Backup antes de qualquer coisa destrutiva.
    // -----------------------------------------------------------------
    if (!semBackup) {
      fs.mkdirSync(DIR_BACKUP, { recursive: true });
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
      const destino = path.join(DIR_BACKUP, `transacoes_bancarias_${carimbo}.json`);
      const dump = await client.query('SELECT * FROM transacoes_bancarias;');
      fs.writeFileSync(destino, JSON.stringify(dump.rows, null, 1), 'utf8');
      console.log(`[BACKUP] ${dump.rows.length} transacoes salvas em ${path.relative(RAIZ, destino)}\n`);
    }

    console.log('[LIMPEZA] Removendo transacoes, importacoes e notas fiscais...');
    await client.query('BEGIN');

    // NAO usar TRUNCATE ... CASCADE aqui: 'notas_fiscais_duplicatas' referencia
    // 'transacoes_bancarias', entao o CASCADE arrasta junto os titulos a receber
    // -- que nao tem nada a ver com o extrato bancario. Solta o vinculo primeiro
    // e apaga apenas o que os arquivos realmente reconstroem.
    await client.query('UPDATE notas_fiscais_duplicatas SET transacao_bancaria_id = NULL;');
    await client.query('DELETE FROM transacoes_bancarias;');
    await client.query('DELETE FROM extratos_ofx_importacoes;');

    // Notas fiscais sao reconstruidas a partir dos XMLs. O ON DELETE CASCADE
    // proprio delas leva itens e duplicatas junto, o que aqui e intencional.
    await client.query('DELETE FROM notas_fiscais;');

    // O saldo tambem e reconstruido pelos extratos.
    await client.query('UPDATE contas_bancarias SET saldo_atual = 0, data_ultimo_saldo = NULL;');
    await client.query('COMMIT');
    console.log('[LIMPEZA] Concluida.\n');

    // -----------------------------------------------------------------
    // Reimportacao pelo servico de dominio -- o mesmo caminho da API.
    // -----------------------------------------------------------------
    const { OfxIngestionService } = require('../dist/modules/financeiro/ofx/ofx-ingestion.service');
    const { contextoTodosTenants, encerrarPool } = require('../dist/core/database/supabase-pool');

    const ctx = await contextoTodosTenants();
    const servico = new OfxIngestionService();

    let totalInseridas = 0;
    let totalIgnoradas = 0;
    const falhas = [];

    console.log('[IMPORTACAO] Processando arquivos...\n');
    for (const arq of arquivos.sort()) {
      const nome = path.basename(arq);
      try {
        const r = await servico.importarOfx(ctx.empresaId, nome, lerOfx(arq), 'REINGESTAO');
        totalInseridas += r.transacoesInseridas;
        totalIgnoradas += r.transacoesDuplicadasIgnoradas;
        console.log(
          `  ${r.transacoesInseridas.toString().padStart(4)} novas | ` +
          `${r.transacoesInformativasIgnoradas.toString().padStart(3)} saldos | ` +
          `${r.banco} ${r.conta} | ${nome}`
        );
      } catch (err) {
        falhas.push({ nome, erro: err.message });
        console.log(`  [FALHA] ${nome}: ${err.message}`);
      }
    }

    console.log(`\n  Total inserido: ${totalInseridas} | ignorado por duplicidade: ${totalIgnoradas}`);
    if (falhas.length > 0) console.log(`  Arquivos com falha: ${falhas.length}`);

    // -----------------------------------------------------------------
    // Notas fiscais: reconstruidas a partir dos XMLs reais.
    // E daqui que saem as duplicatas (titulos a receber) usadas pelo
    // resumo de caixa e pela curva de inadimplencia.
    // -----------------------------------------------------------------
    const xmls = acharArquivos(DIR_XML, /\.xml$/i);
    console.log(`\n[NOTAS FISCAIS] ${xmls.length} XMLs encontrados.\n`);

    if (xmls.length > 0) {
      const { NfeIngestionService } = require('../dist/modules/faturamento/xml/nfe-ingestion.service');
      const servicoXml = new NfeIngestionService();

      // Mapeia o CNPJ de cada empresa para resolver o tenant de cada nota.
      const empresas = await client.query('SELECT id, cnpj, nome_fantasia FROM empresas WHERE ativo = TRUE;');
      const porCnpj = new Map(empresas.rows.map((e) => [e.cnpj.replace(/\D/g, ''), e]));

      let notasOk = 0;
      let notasFalha = 0;
      let duplicatasCriadas = 0;

      for (const arq of xmls.sort()) {
        // A pasta de origem indica de qual CNPJ e a nota.
        const caminho = arq.toLowerCase();
        let empresa = null;
        if (caminho.includes('arandu')) {
          empresa = empresas.rows.find((e) => /arandu/i.test(e.nome_fantasia));
        } else if (caminho.includes('mitang brasil')) {
          empresa = empresas.rows.find((e) => /mitang brasil/i.test(e.nome_fantasia));
        }
        if (!empresa) {
          notasFalha++;
          continue;
        }

        try {
          const r = await servicoXml.importarXml(
            empresa.id,
            empresa.cnpj,
            fs.readFileSync(arq, 'utf8')
          );
          notasOk++;
          duplicatasCriadas += r.duplicataIgnorada ? 0 : r.totalDuplicatas;
        } catch (err) {
          notasFalha++;
          if (notasFalha <= 5) console.log(`  [FALHA] ${path.basename(arq)}: ${err.message}`);
        }
      }

      console.log(`  Notas importadas: ${notasOk} | falhas: ${notasFalha} | duplicatas geradas: ${duplicatasCriadas}`);
      void porCnpj;
    }

    // -----------------------------------------------------------------
    // Conferencia pos-carga.
    // -----------------------------------------------------------------
    const depois = await client.query(`
      SELECT (SELECT count(*)::int FROM transacoes_bancarias)     AS transacoes,
             (SELECT count(*)::int FROM transacoes_bancarias t
                JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
               WHERE t.empresa_id <> c.empresa_id)                AS cruzadas,
             (SELECT count(*)::int FROM transacoes_bancarias
               WHERE is_saldo_informativo = FALSE
                 AND (memo ILIKE 'SALDO%' OR memo ILIKE 'SDO %')) AS saldo_como_movimento,
             (SELECT COALESCE(SUM(valor),0) FROM transacoes_bancarias
               WHERE is_saldo_informativo = FALSE)                AS soma_movimentos;`);
    const d = depois.rows[0];

    console.log('\nESTADO APOS A RE-INGESTAO:');
    console.log(`  transacoes ................. ${d.transacoes}  (antes ${a.transacoes})`);
    console.log(`  cross-tenant ............... ${d.cruzadas}  (antes ${a.cruzadas})`);
    console.log(`  saldo como movimento ....... ${d.saldo_como_movimento}  (antes ${a.saldo_como_movimento})`);
    console.log(`  soma da movimentacao real .. ${brl(d.soma_movimentos)}`);

    const categorias = await client.query(`
      SELECT categoria_financeira, count(*)::int AS n, COALESCE(SUM(valor),0) AS soma
        FROM transacoes_bancarias GROUP BY 1 ORDER BY 2 DESC;`);
    console.log('\nCATEGORIAS:');
    for (const c of categorias.rows) {
      console.log(`  ${String(c.n).padStart(5)}  ${c.categoria_financeira.padEnd(32)} ${brl(c.soma)}`);
    }

    console.log('\n======================================================================');
    if (d.cruzadas === 0 && d.saldo_como_movimento === 0) {
      console.log('  [OK] Base reconstruida sem cross-tenant e sem saldo virando movimento.');
    } else {
      console.log('  [ATENCAO] Ainda ha inconsistencias. Rode scripts/verificar_integridade.js');
      process.exitCode = 1;
    }
    console.log('======================================================================\n');

    await encerrarPool();
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[ERRO FATAL]', err.message);
  console.error(err.stack);
  process.exit(1);
});
