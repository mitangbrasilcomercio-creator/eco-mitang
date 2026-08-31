const test = require('node:test');
const assert = require('node:assert/strict');

const { calcularDre } = require('../dist/modules/contabilidade/dre.calculo');

/**
 * ============================================================================
 * TESTES DE CALCULO DA DRE
 * ============================================================================
 * Entrada conhecida -> resultado esperado escrito a mao -> assert.
 * Nao toca banco: roda em milissegundos e falha na hora em que alguem mudar
 * uma regra sem perceber.
 *
 * Cada bloco marcado REGRESSAO trava um defeito que ja esteve em producao.
 * ============================================================================
 */

const PERIODO = { inicio: '2026-01-01', fim: '2026-12-31', dias: 365, rotulo: 'Exercicio 2026' };

/** Base minima; cada teste sobrescreve o que interessa. */
function base(over = {}) {
  return {
    receitas: {
      receita_bruta_total: 0,
      vendas_produtos: 0,
      servicos_prestados: 0,
      total_tributos: 0,
      qtd_notas: 0,
      qtd_notas_com_imposto: 0,
      ...(over.receitas || {})
    },
    compras: { compras_insumos_periodo: 0, qtd_notas: 0, ...(over.compras || {}) },
    servicosTomados: { despesas_servicos_pj: 0, qtd_notas: 0, ...(over.servicosTomados || {}) },
    tarifas: { despesas_bancarias: 0, qtd_lancamentos: 0, ...(over.tarifas || {}) },
    despesasPorCategoria: over.despesasPorCategoria || [],
    duplicidade: { valor_pareado: 0, qtd_pareada: 0, qtd_sem_documento: 0, ...(over.duplicidade || {}) }
  };
}

// ---------------------------------------------------------------------------

test('cenario completo: cada linha da DRE bate com o calculo manual', () => {
  const r = calcularDre(
    base({
      receitas: {
        receita_bruta_total: 1000000,
        vendas_produtos: 800000,
        servicos_prestados: 200000,
        total_tributos: 150000,
        qtd_notas: 40,
        qtd_notas_com_imposto: 40
      },
      compras: { compras_insumos_periodo: 400000, qtd_notas: 25 },
      servicosTomados: { despesas_servicos_pj: 60000, qtd_notas: 10 },
      tarifas: { despesas_bancarias: 5000, qtd_lancamentos: 30 },
      despesasPorCategoria: [
        { categoria_financeira: 'OUTRAS_DESPESAS_OPERACIONAIS', total: 90000 },
        { categoria_financeira: 'FORNECEDORES_OPERACIONAIS', total: 120000 },
        { categoria_financeira: 'IMPOSTOS_E_TRIBUTOS', total: 70000 },
        { categoria_financeira: 'REPASSES_SOCIOS_DIRETORIA', total: 50000 }
      ]
    }),
    PERIODO
  ).dre;

  // receita liquida = 1.000.000 - 150.000
  assert.equal(r.receita_liquida, 850000);
  // lucro bruto = 850.000 - 400.000 (compras)
  assert.equal(r.lucro_bruto, 450000);
  // despesas = 60.000 PJ + 5.000 tarifas + 90.000 outras + 120.000 fornecedores
  assert.equal(r.despesas_operacionais.total, 275000);
  // EBITDA = 450.000 - 275.000
  assert.equal(r.ebitda, 175000);

  // Repasse a socio e distribuicao de lucro: fica fora do EBITDA.
  assert.equal(r.resultado_financeiro.repasses_socios, 50000);

  assert.equal(r.margem_bruta_pct, 52.9);
  assert.equal(r.margem_ebitda_pct, 20.6);
});

test('REGRESSAO 0.1: pagamento a fornecedor entra na despesa', () => {
  // Antes: a categoria era buscada no banco e descartada no controller, entao
  // R$ 462.487,63 de 2026 sumiam do resultado e inflavam o EBITDA.
  const semFornecedor = calcularDre(
    base({
      receitas: { receita_bruta_total: 100000, qtd_notas: 1 },
      despesasPorCategoria: [{ categoria_financeira: 'OUTRAS_DESPESAS_OPERACIONAIS', total: 10000 }]
    }),
    PERIODO
  ).dre;

  const comFornecedor = calcularDre(
    base({
      receitas: { receita_bruta_total: 100000, qtd_notas: 1 },
      despesasPorCategoria: [
        { categoria_financeira: 'OUTRAS_DESPESAS_OPERACIONAIS', total: 10000 },
        { categoria_financeira: 'FORNECEDORES_OPERACIONAIS', total: 30000 }
      ]
    }),
    PERIODO
  ).dre;

  assert.equal(comFornecedor.despesas_operacionais.fornecedores_operacionais, 30000);
  assert.equal(comFornecedor.despesas_operacionais.total, 40000);
  // O fornecedor precisa reduzir o EBITDA em exatamente o seu valor.
  assert.equal(semFornecedor.ebitda - comFornecedor.ebitda, 30000);
});

test('REGRESSAO 0.1: risco de dupla contagem e exposto, nao escondido', () => {
  const r = calcularDre(
    base({
      receitas: { receita_bruta_total: 100000, qtd_notas: 1 },
      despesasPorCategoria: [{ categoria_financeira: 'FORNECEDORES_OPERACIONAIS', total: 464487.63 }],
      duplicidade: { valor_pareado: 2000, qtd_pareada: 1, qtd_sem_documento: 88 }
    }),
    PERIODO
  ).dre;

  const d = r.despesas_operacionais.possivel_duplicidade_nfe;
  assert.equal(d.valor, 2000);
  assert.equal(d.qtd_lancamentos, 1);
  assert.equal(d.qtd_sem_cnpj_para_parear, 88);
  // O valor pareado NAO e subtraido automaticamente: e informado para decisao.
  assert.equal(r.despesas_operacionais.fornecedores_operacionais, 464487.63);
});

test('REGRESSAO 0.2: guia de tributo paga nao reduz o resultado uma segunda vez', () => {
  // Antes: 'lucroLiquido = ebitda - tributosPagos', enquanto os mesmos tributos
  // ja tinham sido subtraidos como deducao da receita.
  const semGuia = calcularDre(
    base({ receitas: { receita_bruta_total: 500000, total_tributos: 50000, qtd_notas: 5, qtd_notas_com_imposto: 5 } }),
    PERIODO
  ).dre;

  const comGuia = calcularDre(
    base({
      receitas: { receita_bruta_total: 500000, total_tributos: 50000, qtd_notas: 5, qtd_notas_com_imposto: 5 },
      despesasPorCategoria: [{ categoria_financeira: 'IMPOSTOS_E_TRIBUTOS', total: 50000 }]
    }),
    PERIODO
  ).dre;

  // A guia e informacao de caixa: aparece, mas nao mexe no EBITDA.
  assert.equal(semGuia.ebitda, comGuia.ebitda);
  assert.equal(comGuia.resultado_financeiro.tributos_pagos_periodo, 50000);
  // E a deducao continua vindo da nota, uma vez so.
  assert.equal(comGuia.deducoes.total, 50000);
  assert.equal(comGuia.receita_liquida, 450000);
});

test('REGRESSAO 0.2: lucro liquido nao e apresentado como se fosse apurado', () => {
  // Duas versoes anteriores erraram em direcoes opostas:
  //   'lucroLiquido = ebitda'            -> renomeou EBITDA
  //   'lucroLiquido = ebitda - tributos' -> contou tributo duas vezes
  const r = calcularDre(
    base({ receitas: { receita_bruta_total: 500000, qtd_notas: 5 } }),
    PERIODO
  ).dre;

  assert.equal(r.lucro_liquido, null);
  assert.equal(r.lucro_liquido_disponivel, false);
  assert.equal(r.margem_liquida_pct, null);
  assert.notEqual(r.lucro_liquido, r.ebitda, 'lucro liquido nao pode ser um apelido do EBITDA');
  assert.match(r.lucro_liquido_observacao, /IRPJ\/CSLL/);
});

test('REGRESSAO 0.3: compra do periodo nao e chamada de CMV', () => {
  const r = calcularDre(
    base({
      receitas: { receita_bruta_total: 200000, qtd_notas: 3 },
      compras: { compras_insumos_periodo: 80000, qtd_notas: 12 }
    }),
    PERIODO
  ).dre;

  assert.equal(r.custos_operacionais.compras_insumos_periodo, 80000);
  assert.equal(r.custos_operacionais.cmv_disponivel, false);
  assert.equal(r.custos_operacionais.cmv_total, undefined, 'o campo cmv_total nao deve existir');
  assert.equal(r.lucro_bruto_aproximado, true);
  assert.match(r.custos_operacionais.cmv_observacao, /estoque/i);
});

test('sem imposto destacado, a deducao e zero e o payload avisa', () => {
  const r = calcularDre(
    base({
      receitas: { receita_bruta_total: 300000, total_tributos: 0, qtd_notas: 10, qtd_notas_com_imposto: 0 }
    }),
    PERIODO
  ).dre;

  assert.equal(r.deducoes.total, 0);
  assert.equal(r.deducoes.base_tributaria_disponivel, false);
  assert.equal(r.deducoes.notas_sem_imposto_destacado, 10);
  // Receita liquida == bruta: nao houve estimativa de aliquota.
  assert.equal(r.receita_liquida, 300000);
});

test('periodo sem movimento devolve zeros marcados, nunca NaN', () => {
  const r = calcularDre(base(), PERIODO);

  assert.equal(r.sem_dados, true);
  assert.equal(r.dre.receita_bruta.total, 0);
  assert.equal(r.dre.ebitda, 0);
  assert.equal(r.dre.margem_bruta_pct, null);
  assert.equal(r.dre.margem_ebitda_pct, null);

  const valores = JSON.stringify(r);
  assert.ok(!valores.includes('NaN'), 'nenhum campo pode sair como NaN');
  assert.ok(!valores.includes('null,"vendas'), 'campos numericos nao viram null por acidente');
});

test('valores vindos do banco como string sao tratados como numero', () => {
  // node-postgres devolve NUMERIC como string. Somar string produz concatenacao.
  const r = calcularDre(
    base({
      receitas: { receita_bruta_total: '1000.50', total_tributos: '100.50', qtd_notas: '2' },
      compras: { compras_insumos_periodo: '200.00' }
    }),
    PERIODO
  ).dre;

  assert.equal(r.receita_liquida, 900);
  assert.equal(r.lucro_bruto, 700);
  assert.equal(typeof r.receita_bruta.total, 'number');
});

test('o regime do calculo e declarado explicitamente', () => {
  const r = calcularDre(base(), PERIODO);
  assert.equal(r.regime_do_calculo, 'COMPETENCIA');
  assert.match(r.regime_observacao, /competencia/i);
});
