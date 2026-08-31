const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 * TRAVA: SALDO DO DIA NAO E TRANSACAO
 * ============================================================================
 *
 * [O PROBLEMA]
 * O OFX do Itau e do Bradesco traz, alem das transacoes, o saldo da conta em
 * cada dia. A ingestao grava essas linhas em 'transacoes_bancarias' -- de
 * proposito, porque o saldo oficial do banco e a fonte de verdade para
 * conciliar. Mas elas NAO sao movimento de dinheiro.
 *
 * Medido em producao: das 1.324 linhas da tabela, **564 sao saldo do dia**,
 * somando R$ 62.332.245,77. Sao 43% das linhas e um valor 16 vezes maior que
 * a movimentacao real do ano.
 *
 * Diego notou isso sozinho olhando o extrato: "eu vejo o sistema estar
 * interpretando o saldo do dia como uma transacao, mas nao -- aquilo e so o
 * valor da conta naquele momento".
 *
 * Toda consulta hoje filtra corretamente. O risco nao e o codigo atual, e a
 * proxima consulta que alguem escrever esquecendo o filtro: ela vai somar
 * R$ 62 milhoes que nao existem, e o numero e grande demais para passar por
 * erro de arredondamento -- vai parecer real.
 *
 * [A TRAVA]
 * Toda consulta a 'transacoes_bancarias' em src/ precisa mencionar
 * 'is_saldo_informativo'. Nao verifica semantica; verifica que quem escreveu
 * pensou no assunto. As excecoes sao declaradas aqui, com justificativa.
 * ============================================================================
 */

const RAIZ = path.join(__dirname, '..', 'src');

/** Arquivos onde a tabela aparece sem que o filtro faca sentido. */
const ISENTOS = {
  'modules/financeiro/ofx/ofx-ingestion.service.ts':
    'e a propria ingestao: ela GRAVA as linhas de saldo, marcando-as.',
  'core/database/supabase-pool.ts':
    'nao consulta a tabela; so aparece em comentario de contexto.'
};

function varrer(dir, achados = []) {
  for (const nome of fs.readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    const info = fs.statSync(caminho);
    if (info.isDirectory()) varrer(caminho, achados);
    else if (nome.endsWith('.ts')) achados.push(caminho);
  }
  return achados;
}

/** Tira comentario, para nao acusar um trecho que so descreve a consulta. */
function semComentario(conteudo) {
  return conteudo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * As consultas do projeto vivem em template literal. Cada literal e uma
 * unidade: se ele menciona a tabela, tem que mencionar o filtro.
 *
 * [ERRO ANTERIOR] A primeira versao usava
 *   /SELECT[\s\S]*?FROM\s+transacoes_bancarias[\s\S]*?/
 * que atravessa o limite entre statements -- comecava num SELECT de 'clientes'
 * e ia ate encontrar 'transacoes_bancarias' dezenas de linhas depois, acusando
 * arquivos que nao consultam a tabela. Delimitar pelo literal elimina isso.
 */
function consultasDaTabela(conteudo) {
  const limpo = semComentario(conteudo);
  const literais = limpo.match(/`[^`]*`/g) || [];
  return literais.filter((l) => /\btransacoes_bancarias\b/.test(l));
}

test('toda consulta a transacoes_bancarias considera o saldo do dia', () => {
  const arquivos = varrer(RAIZ);
  const faltando = [];

  for (const caminho of arquivos) {
    const rel = path.relative(RAIZ, caminho).replace(/\\/g, '/');
    if (ISENTOS[rel]) continue;

    const conteudo = fs.readFileSync(caminho, 'utf8');
    if (!/transacoes_bancarias/.test(conteudo)) continue;

    for (const bloco of consultasDaTabela(conteudo)) {
      if (!/is_saldo_informativo/.test(bloco)) {
        const trecho = bloco.replace(/\s+/g, ' ').slice(0, 90);
        faltando.push(rel + '  ->  ' + trecho + '...');
      }
    }
  }

  assert.deepEqual(
    faltando,
    [],
    'Consulta a transacoes_bancarias sem mencionar is_saldo_informativo:\n  ' +
      faltando.join('\n  ') +
      '\n\n564 das 1.324 linhas da tabela sao saldo do dia, somando R$ 62,3 milhoes.' +
      '\nAdicione o filtro, ou registre a isencao em ISENTOS com a justificativa.'
  );
});

test('a lista de isencoes nao cresce em silencio', () => {
  // Isencao e decisao consciente. Se a lista crescer, alguem precisa explicar.
  assert.equal(
    Object.keys(ISENTOS).length,
    2,
    'A lista de isencoes mudou. Cada isencao precisa de justificativa escrita ' +
      'e revisao -- e o unico jeito de a trava nao virar carimbo.'
  );

  for (const [arquivo, motivo] of Object.entries(ISENTOS)) {
    assert.ok(motivo && motivo.length > 20, arquivo + ' esta isento sem justificativa util');
  }
});
