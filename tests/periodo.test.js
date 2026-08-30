const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolverPeriodo,
  periodoAnterior,
  dividirEmFaixas,
  variacaoPercentual,
  diffDias
} = require('../dist/core/utils/periodo');

/**
 * ============================================================================
 * TESTES DE RESOLUCAO DE PERIODO
 * ============================================================================
 * A data de referencia e injetada, entao estes testes nao envelhecem -- que era
 * exatamente o problema do codigo antigo, com '2026-08-27' escrito no fonte.
 * ============================================================================
 */

const REF = new Date(2026, 7, 30); // 30/08/2026 (mes 7 = agosto)

test('mes_atual cobre o mes inteiro, com o ultimo dia correto', () => {
  const p = resolverPeriodo({ periodo: 'mes_atual' }, REF);
  assert.equal(p.inicio, '2026-08-01');
  assert.equal(p.fim, '2026-08-31');
  assert.equal(p.dias, 31);
});

test('mes_anterior nao cai no mes errado', () => {
  const p = resolverPeriodo({ periodo: 'mes_anterior' }, REF);
  assert.equal(p.inicio, '2026-07-01');
  assert.equal(p.fim, '2026-07-31');
});

test('fevereiro tem o ultimo dia correto (nao "31")', () => {
  // O codigo antigo montava o fim do mes como `${chave}-31` para qualquer mes.
  const p = resolverPeriodo({ periodo: 'mes_atual' }, new Date(2026, 1, 10));
  assert.equal(p.fim, '2026-02-28');

  const bissexto = resolverPeriodo({ periodo: 'mes_atual' }, new Date(2024, 1, 10));
  assert.equal(bissexto.fim, '2024-02-29');
});

test('ultimos_30 conta a partir da data de referencia, nao de uma data fixa', () => {
  const p = resolverPeriodo({ periodo: 'ultimos_30' }, REF);
  assert.equal(p.fim, '2026-08-30');
  assert.equal(p.dias, 30);
});

test('datas explicitas ganham do periodo nomeado', () => {
  const p = resolverPeriodo({ periodo: 'mes_atual', dataInicio: '2026-03-01', dataFim: '2026-03-15' }, REF);
  assert.equal(p.inicio, '2026-03-01');
  assert.equal(p.fim, '2026-03-15');
  assert.equal(p.dias, 15);
});

test('intervalo invertido e corrigido em vez de devolver conjunto vazio', () => {
  const p = resolverPeriodo({ dataInicio: '2026-03-15', dataFim: '2026-03-01' }, REF);
  assert.equal(p.inicio, '2026-03-01');
  assert.equal(p.fim, '2026-03-15');
});

test('data invalida cai no periodo nomeado', () => {
  const p = resolverPeriodo({ periodo: 'mes_atual', dataInicio: '2026-02-31', dataFim: '2026-03-01' }, REF);
  assert.equal(p.inicio, '2026-08-01');
});

test('periodo anterior tem a mesma duracao e termina na vespera', () => {
  const atual = resolverPeriodo({ dataInicio: '2026-08-01', dataFim: '2026-08-31' }, REF);
  const ant = periodoAnterior(atual);
  assert.equal(ant.fim, '2026-07-31');
  assert.equal(ant.dias, 31);
  assert.equal(diffDias(ant.inicio, ant.fim), 31);
});

test('REGRESSAO: faixas semanais atravessando a virada de mes nao travam', () => {
  // O laco antigo fazia curD.setDate(actualEndD.getDate() + 1). Com inicio em
  // 28/08 e fim em 03/09, setDate(4) jogava o cursor para 04/08 -- para tras --
  // e o 'while (curD <= endD)' nunca terminava, travando o processo.
  const p = resolverPeriodo({ dataInicio: '2026-08-28', dataFim: '2026-09-30' }, REF);
  const { faixas } = dividirEmFaixas(p, 'SEMANAL');

  assert.ok(faixas.length > 0 && faixas.length <= 12, `faixas fora do esperado: ${faixas.length}`);
  // Cada faixa comeca depois do fim da anterior, sempre avancando.
  for (let i = 1; i < faixas.length; i++) {
    assert.ok(faixas[i].inicio > faixas[i - 1].fim, 'as faixas precisam avancar no tempo');
  }
  assert.equal(faixas[0].inicio, '2026-08-28');
  assert.ok(faixas[faixas.length - 1].fim <= '2026-09-30');
});

test('faixas mensais cobrem os meses reais do periodo', () => {
  const p = resolverPeriodo({ dataInicio: '2026-01-01', dataFim: '2026-08-30' }, REF);
  const { faixas, granularidade } = dividirEmFaixas(p);
  assert.equal(granularidade, 'MENSAL');
  assert.equal(faixas.length, 8);
  assert.equal(faixas[0].rotulo, 'JAN');
  assert.equal(faixas[7].rotulo, 'AGO');
  assert.equal(faixas[1].fim, '2026-02-28'); // e nao '2026-02-31'
});

test('variacao percentual admite nao ter base de comparacao', () => {
  // O codigo antigo devolvia "+100%" quando o periodo anterior era zero,
  // inventando um crescimento que ninguem mediu.
  const semBase = variacaoPercentual(5000, 0);
  assert.equal(semBase.comparavel, false);
  assert.equal(semBase.pct, 0);

  const comBase = variacaoPercentual(150, 100);
  assert.equal(comBase.comparavel, true);
  assert.equal(comBase.pct, 50);
  assert.equal(comBase.direcao, 'UP');

  const queda = variacaoPercentual(80, 100);
  assert.equal(queda.pct, -20);
  assert.equal(queda.direcao, 'DOWN');
});
