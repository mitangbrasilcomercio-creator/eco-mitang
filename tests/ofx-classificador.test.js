const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizarMemo,
  classificarLancamento,
  extrairDocumento
} = require('../dist/modules/financeiro/ofx/ofx-classificador');

/**
 * ============================================================================
 * TESTES DO CLASSIFICADOR DE LANCAMENTOS
 * ============================================================================
 * Os memos aqui sao REAIS, extraidos do banco de producao. Cada um representa
 * um erro de classificacao que ja aconteceu -- estes testes existem para que
 * nao volte a acontecer.
 * ============================================================================
 */

test('normalizacao remove acento, pontuacao e espaco duplicado', () => {
  assert.equal(normalizarMemo('SALDO APLICAÇÃO AUTOMÁTICA'), 'SALDO APLICACAO AUTOMATICA');
  assert.equal(normalizarMemo('RESG.INVEST FACILCRED*'), 'RESG INVEST FACILCRED');
  assert.equal(normalizarMemo('APL. AUT.'), 'APL AUT');
  assert.equal(normalizarMemo('  TED   376.0001  '), 'TED 376 0001');
});

test('REGRESSAO R$ 40,8 MI: linha de saldo do Itau nao e movimentacao', () => {
  // 284 linhas com este memo, somando R$ 40.874.212,36, estavam classificadas
  // como APLICACAO_RESGATE_AUTOMATICO porque o codigo procurava
  // 'SALDO APLIC. AUT.' e 'SALDO APLIC AUTOM' -- nenhum casa com o texto real.
  const c = classificarLancamento('SALDO APLICAÇÃO AUTOMÁTICA', 143000.55);
  assert.equal(c.categoria, 'INFORMATIVO_SALDO');
  assert.equal(c.isSaldoInformativo, true);
  assert.equal(c.isAplicacaoAutomatica, false);
});

test('todas as variantes de linha de saldo sao informativas', () => {
  const memos = [
    'SALDO APLICAÇÃO AUTOMÁTICA',
    'SALDO APLIC. AUT.',
    'SALDO APLIC AUTOM',
    'SALDO TOTAL DISPONÍVEL DIA',
    'SALDO ANTERIOR',
    'SDO ANTERIOR',
    'SDO APLIC AUT MAIS AP',
    'SALDO MOVIMENTAÇÃO CONTA',
    'SALDO DO DIA'
  ];
  for (const m of memos) {
    const c = classificarLancamento(m, 1000);
    assert.equal(c.categoria, 'INFORMATIVO_SALDO', `"${m}" deveria ser INFORMATIVO_SALDO`);
    assert.equal(c.isSaldoInformativo, true, `"${m}" deveria ter isSaldoInformativo=true`);
  }
});

test('REGRESSAO: rendimento ganha de sweep mesmo contendo "APLIC AUT"', () => {
  // 88 linhas de 'RENDIMENTOS REND PAGO APLIC AUT MAIS' e 73 de
  // 'RENTAB.INVEST FACILCRED*' estavam gravadas como custodia no banco.
  const casos = [
    'RENDIMENTOS REND PAGO APLIC AUT MAIS',
    'REND PAGO APLIC AUT APR',
    'REND PAGO APLIC AUT MAIS',
    'RENTAB.INVEST FACILCRED*'
  ];
  for (const m of casos) {
    const c = classificarLancamento(m, 12.5);
    assert.equal(c.categoria, 'RECEITA_FINANCEIRA_JUROS', `"${m}" deveria ser rendimento`);
    assert.equal(c.isRendimentoFinanceiro, true);
    assert.equal(c.isAplicacaoAutomatica, false, `"${m}" nao pode ser sweep`);
  }
});

test('varredura de liquidez continua sendo reconhecida', () => {
  const casos = ['APL APLIC AUT MAIS', 'RES APLIC AUT MAIS', 'RES APLIC AUT MAIS AP', 'INVEST FACIL'];
  for (const m of casos) {
    const c = classificarLancamento(m, -50000);
    assert.equal(c.categoria, 'APLICACAO_RESGATE_AUTOMATICO', `"${m}" deveria ser sweep`);
    assert.equal(c.isAplicacaoAutomatica, true);
    assert.equal(c.isSaldoInformativo, false);
  }
});

test('categorias operacionais', () => {
  assert.equal(classificarLancamento('DAS SIMPLES NACIONAL', -5500).categoria, 'IMPOSTOS_E_TRIBUTOS');
  assert.equal(classificarLancamento('DARF INSS', -1200).categoria, 'IMPOSTOS_E_TRIBUTOS');
  assert.equal(classificarLancamento('PRO-LABORE PAULO CESAR', -8000).categoria, 'REPASSES_SOCIOS_DIRETORIA');
  assert.equal(classificarLancamento('TAR PLANO MENSAL', -49.9).categoria, 'TARIFAS_E_DESPESAS_BANCARIAS');
  assert.equal(classificarLancamento('PAG BOLETO STREMA INDUSTRIA', -12000).categoria, 'FORNECEDORES_OPERACIONAIS');
  assert.equal(classificarLancamento('PIX RECEBIDO REM: FUGRO BRASIL', 45000).categoria, 'RECEBIMENTO_CLIENTES');
});

test('tarifa nao captura palavra que apenas contem "tar"', () => {
  // O codigo antigo usava "memo ILIKE '%tar%'" na DRE, o que classificava
  // TARGET, ALTAIR e MONTARIA como despesa bancaria.
  for (const m of ['PAGAMENTO TARGET SERVICOS', 'PIX ALTAIR SOUZA', 'BOLETO MONTARIA LTDA']) {
    const c = classificarLancamento(m, -900);
    assert.notEqual(c.categoria, 'TARIFAS_E_DESPESAS_BANCARIAS', `"${m}" nao e tarifa bancaria`);
  }
});

test('extracao de CNPJ/CPF com e sem mascara', () => {
  assert.equal(extrairDocumento('PIX 44.221.348/0001-84 MITANG'), '44221348000184');
  assert.equal(extrairDocumento('TED 123.456.789-01 JOAO'), '12345678901');
  assert.equal(extrairDocumento('PAGTO 44221348000184 FORNECEDOR'), '44221348000184');
  assert.equal(extrairDocumento('TRANSFERENCIA SEM DOCUMENTO'), null);
  // Nao pode confundir um numero de documento longo com CNPJ
  assert.equal(extrairDocumento('BOLETO 123456789012345678'), null);
});

test('precedencia: SALDO ganha de tudo', () => {
  // Um memo que casaria com varias regras deve resolver como saldo.
  const c = classificarLancamento('SALDO APLIC AUT MAIS REND PAGO', 999);
  assert.equal(c.categoria, 'INFORMATIVO_SALDO');
});
