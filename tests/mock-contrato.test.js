const test = require('node:test');
const assert = require('node:assert/strict');

const { lista, erro, semBase, CODIGOS } = require('../mock/contrato');
const { ROTAS, calcularOrcamento, transicoesDe, PISO_MARGEM } = require('../mock/rotas');

/**
 * ============================================================================
 * TRAVA DO CONTRATO ENTRE OS DOIS AGENTES
 * ============================================================================
 *
 * O mock existe para o frontend ser construido antes do backend. Isso so
 * funciona enquanto a forma que o mock devolve for a mesma que a rota real vai
 * devolver -- senao o frontend e escrito contra uma promessa que ninguem
 * cumpre, e a tela quebra no dia da integracao.
 *
 * Estes testes prendem a forma. Quando eu escrever a rota real, ela passa por
 * 'calcularOrcamento' e pelos mesmos helpers de 'contrato.js', e estes asserts
 * valem para os dois lados.
 *
 * O que NAO se testa aqui: os valores de exemplo do mock (nomes de cliente,
 * quantidades). Esses sao cenario, e podem mudar sem quebrar ninguem.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Forma do envelope e do erro
// ---------------------------------------------------------------------------

test('envelope de listagem tem os campos que o DataGrid espera', () => {
  const r = lista([{ a: 1 }, { a: 2 }], { pagina: 2, limite: 50, total: 120 });
  assert.deepEqual(Object.keys(r).sort(), ['completude', 'data', 'limit', 'page', 'total', 'total_pages']);
  assert.equal(r.total_pages, 3);
  assert.equal(r.completude.estado, 'AUDITADO');
});

test('erro segue RFC 7807 e nunca carrega stack trace', () => {
  const e = erro(422, 'PERIODO_FECHADO', 'Agosto está fechado.', {
    detalhe: { fechado_em: '2026-09-05' },
    acaoSugerida: { rotulo: 'Ver fechamento', url: '/api/v1/contabilidade/periodos' }
  });

  assert.equal(e.status, 422);
  assert.deepEqual(Object.keys(e.corpo).sort(), [
    'acao_sugerida', 'codigo', 'detalhe', 'mensagem', 'requisicao_id', 'status'
  ]);
  assert.ok(e.corpo.requisicao_id, 'todo erro precisa de requisicao_id para rastrear');
  assert.equal(JSON.stringify(e.corpo).includes('    at '), false, 'stack trace vazou no payload');
});

test('todo codigo de erro publicado tem um status HTTP fixo', () => {
  // Uma vez publicado, o codigo nao muda de nome nem de status: a tela liga
  // comportamento a ele.
  assert.equal(CODIGOS.PAPEL_INSUFICIENTE, 403);
  assert.equal(CODIGOS.PERIODO_FECHADO, 422);
  assert.equal(CODIGOS.DUPLICIDADE, 409);
  assert.equal(CODIGOS.APTIDAO_BLOQUEADA, 422);
});

test('numero sem base vem com motivo, nunca com valor inventado', () => {
  const s = semBase('INVENTARIO_INICIAL_PENDENTE', 'Falta o módulo de estoque.');
  assert.equal(s.disponivel, false);
  assert.equal(s.valor, null);
  assert.ok(s.motivo_codigo, 'a tela decide o banner pelo codigo');
  assert.ok(s.motivo.length > 10, 'e o usuario le o motivo');
});

// ---------------------------------------------------------------------------
// Calculo do orcamento -- a regra de negocio que os dois lados compartilham
// ---------------------------------------------------------------------------

test('desconto por item: cada produto encolhe pela sua propria margem', () => {
  const r = calcularOrcamento({
    itens: [
      { sku: 'AQL25', quantidade: 92, desconto_pct: 5 },
      { sku: 'MN1300', quantidade: 2208, desconto_pct: 10 }
    ]
  });

  // 92 x 4.380,00 = 402.960,00 · com 5% = 382.812,00
  assert.equal(r.itens[0].valor_tabela, 402960);
  assert.equal(r.itens[0].valor_final, 382812);
  // 2.208 x 34,20 = 75.513,60 · com 10% = 67.962,24
  assert.equal(r.itens[1].valor_tabela, 75513.6);
  assert.equal(r.itens[1].valor_final, 67962.24);

  assert.equal(r.totais.valor_tabela, 478473.6);
  assert.equal(r.totais.subtotal_com_desconto, 450774.24);
  assert.equal(r.totais.descontos_concedidos, 27699.36);
});

test('REGRESSAO: margem nao cai linearmente com o desconto', () => {
  // [ERRO ANTERIOR]: o mockup calculava margem = base - desconto. Em 20% de
  // desconto isso dava 23,2%, quando a margem real e 30,3%. O desconto encolhe
  // o preco, que e o DENOMINADOR da margem.
  const r = calcularOrcamento({ itens: [{ sku: 'AQL25', quantidade: 1, desconto_pct: 20 }] });

  // (0,442 - 0,20) / (1 - 0,20) = 30,25%
  assert.equal(r.itens[0].margem_pct, 30.25);
  assert.notEqual(r.itens[0].margem_pct, 24.2, 'voltou a subtrair linearmente');
});

test('acima de 44,2% de desconto o pack passa a ser vendido abaixo do custo', () => {
  const noCusto = calcularOrcamento({ itens: [{ sku: 'AQL25', quantidade: 1, desconto_pct: 44.2 }] });
  assert.equal(noCusto.itens[0].margem_pct, 0);

  const prejuizo = calcularOrcamento({ itens: [{ sku: 'AQL25', quantidade: 1, desconto_pct: 50 }] });
  assert.equal(prejuizo.itens[0].margem_pct, -11.6);
  assert.equal(prejuizo.itens[0].abaixo_do_custo, true);
});

test('o mesmo desconto machuca diferente em produtos de margem diferente', () => {
  // E o argumento de por que a alcada e por MARGEM e nao por percentual de
  // desconto: 10% num item de 28% de margem e pior que 10% num de 44%.
  const r = calcularOrcamento({
    itens: [
      { sku: 'AQL25', quantidade: 1, desconto_pct: 10 },
      { sku: 'MN1300', quantidade: 1, desconto_pct: 10 }
    ]
  });

  assert.equal(r.itens[0].abaixo_da_politica, false, 'pack de 44,2% aguenta 10%');
  assert.equal(r.itens[1].abaixo_da_politica, true, 'pilha de 28% nao aguenta');
});

// ---------------------------------------------------------------------------
// Urgencia
// ---------------------------------------------------------------------------

test('a taxa de urgencia incide sobre o valor ja descontado', () => {
  const r = calcularOrcamento({
    itens: [{ sku: 'AQL25', quantidade: 92, desconto_pct: 5 }],
    urgencia: { motivo: 'Mobilização de equipe', acrescimo_pct: 25 }
  });

  assert.equal(r.totais.subtotal_com_desconto, 382812);
  assert.equal(r.totais.acrescimo_urgencia, 95703);   // 382.812 x 0,25
  assert.equal(r.totais.valor_proposta, 478515);
});

test('o custo da urgencia e declarado como desconhecido, nao estimado', () => {
  const r = calcularOrcamento({
    itens: [{ sku: 'AQL25', quantidade: 1, desconto_pct: 0 }],
    urgencia: { acrescimo_pct: 25 }
  });

  assert.equal(r.urgencia.custo_da_urgencia.disponivel, false);
  assert.equal(r.urgencia.custo_da_urgencia.valor, null);
  assert.match(r.urgencia.custo_da_urgencia.motivo_codigo, /APONTAMENTO/);
});

test('REGRESSAO: a urgencia nao pode salvar um desconto ruim', () => {
  // A urgencia e receita extra que carrega custo extra ainda nao medido.
  // Se a alcada olhasse a margem COM urgencia, uma taxa alta esconderia um
  // desconto que estourou a politica -- e a diretoria nunca seria consultada.
  const r = calcularOrcamento({
    itens: [{ sku: 'MN1300', quantidade: 100, desconto_pct: 15 }],
    urgencia: { acrescimo_pct: 60 }
  });

  assert.ok(r.margem.proposta_pct < PISO_MARGEM, 'a margem sem urgencia estourou o piso');
  assert.ok(r.margem.com_urgencia_pct > r.margem.proposta_pct, 'a urgencia levanta a margem aparente');
  assert.equal(r.margem.abaixo_da_politica, true, 'e mesmo assim a alcada continua exigida');
  assert.equal(r.margem.com_urgencia_confiavel, false);

  assert.equal(transicoesDe(r)[0].para, 'AGUARDANDO_ALCADA');
});

test('o comparativo mostra de quanto a empresa abriu mao', () => {
  const r = calcularOrcamento({
    itens: [{ sku: 'AQL25', quantidade: 92, desconto_pct: 5 }],
    urgencia: { acrescimo_pct: 25 }
  });

  // Sem desconto, com a mesma urgencia: 402.960 x 1,25 = 503.700
  assert.equal(r.totais.entraria_sem_desconto, 503700);
  assert.equal(r.totais.diferenca_do_desconto, -25185);
});

test('margem sempre declara que o custo veio de cadastro manual', () => {
  const r = calcularOrcamento({ itens: [{ sku: 'AQL25', quantidade: 1, desconto_pct: 0 }] });
  assert.equal(r.margem.custo_origem, 'CATALOGO_MANUAL');
  assert.equal(r.itens[0].custo_origem, 'CATALOGO_MANUAL');
});

// ---------------------------------------------------------------------------
// Maquina de estados
// ---------------------------------------------------------------------------

test('a transicao disponivel decide o botao -- a tela nao conhece a regra', () => {
  const livre = calcularOrcamento({ itens: [{ sku: 'AQL25', quantidade: 1, desconto_pct: 0 }] });
  assert.equal(transicoesDe(livre)[0].para, 'APROVADO');
  assert.equal(transicoesDe(livre)[0].exige_justificativa, false);

  const alcada = calcularOrcamento({ itens: [{ sku: 'MN1300', quantidade: 1, desconto_pct: 10 }] });
  assert.equal(transicoesDe(alcada)[0].para, 'AGUARDANDO_ALCADA');
  assert.equal(transicoesDe(alcada)[0].exige_justificativa, true);
  assert.equal(transicoesDe(alcada)[0].severidade, 'MEDIA');

  const prejuizo = calcularOrcamento({ itens: [{ sku: 'AQL25', quantidade: 1, desconto_pct: 60 }] });
  assert.equal(transicoesDe(prejuizo)[0].severidade, 'ALTA');
  assert.match(transicoesDe(prejuizo)[0].rotulo, /abaixo do custo/);
});

// ---------------------------------------------------------------------------
// Higiene das rotas mockadas
// ---------------------------------------------------------------------------

test('nenhuma rota mockada colide com uma rota que ja existe de verdade', () => {
  // Duplicar uma rota real no mock cria duas fontes de verdade -- pior que
  // nao ter mock. Estas ja existem na API e devem ser encaminhadas.
  const reais = [
    'GET /api/v1/orcamentos',
    'GET /api/v1/financeiro/transacoes',
    'GET /api/v1/contabilidade/dre',
    'GET /api/v1/clientes',
    'GET /api/v1/dashboard/metrics',
    'POST /api/v1/auth/login'
  ];

  const colisoes = reais.filter((r) => Object.keys(ROTAS).includes(r));
  assert.deepEqual(colisoes, [], 'o mock esta sequestrando rota real: ' + colisoes.join(', '));
});

test('toda rota mockada devolve status e corpo', () => {
  for (const chave of Object.keys(ROTAS)) {
    const r = ROTAS[chave]({ corpo: {}, params: { numero: 'X', id: '1', cnpj: '00' }, query: new URLSearchParams() });
    assert.ok(typeof r.status === 'number', chave + ' nao devolveu status');
    assert.ok(r.corpo && typeof r.corpo === 'object', chave + ' nao devolveu corpo');
  }
});
