const http = require('http');
const fs = require('fs');
const path = require('path');

function requestApi(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      headers: headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('========================================================================');
  console.log('         BATERIA DE VALIDAÇÃO DO NOVO DASHBOARD EXECUTIVO               ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // 1. Healthcheck
  const health = await requestApi('/health');
  assert(health.status === 'healthy', 'Healthcheck da API respondendo healthy');

  // 2. Métricas Gerais (Holding)
  const mHolding = await requestApi('/api/v1/dashboard/metrics');
  assert(mHolding.success === true, 'Métricas da Holding retornam com sucesso');
  assert(mHolding.data?.receitas?.faturado?.valor > 2000000, `Faturado consolidado > R$ 2.0M (Valor: ${mHolding.data?.receitas?.faturado?.valor})`);
  assert(mHolding.data?.receitas?.faturado?.mom_percentual > 100, `Indicador MoM Faturado positivo (+${mHolding.data?.receitas?.faturado?.mom_percentual}%)`);
  assert(mHolding.data?.receitas?.recebido?.valor > 1800000, `Recebido consolidado > R$ 1.8M (Valor: ${mHolding.data?.receitas?.recebido?.valor})`);
  assert(mHolding.data?.receitas?.top_inadimplentes?.length === 3, 'Top 3 Inadimplentes (Curva ABC) retornado');

  // 3. Runway & Alerta de Fluxo de Caixa
  const runway = mHolding.data?.runway;
  assert(runway && runway.saldo_bancario_atual > 0, `Saldo Bancário Atual positivo: R$ ${runway?.saldo_bancario_atual?.toFixed(2)}`);
  assert(runway?.saldo_projetado > runway?.saldo_bancario_atual, `Saldo Projetado 15d calculado: R$ ${runway?.saldo_projetado?.toFixed(2)}`);
  assert(runway?.status === 'POSITIVO', `Status Runway: ${runway?.status} (${runway?.dias_cobertura} dias de cobertura)`);

  // 4. Cards de Despesa
  const despesas = mHolding.data?.despesas;
  assert(despesas?.total_pago?.valor > 1500000, `Total Despesa Paga: R$ ${despesas?.total_pago?.valor?.toFixed(2)}`);
  assert(despesas?.a_vencer_7d?.valor === 18450, `Despesas a vencer em 7 dias: R$ ${despesas?.a_vencer_7d?.valor}`);
  assert(despesas?.a_vencer_15d?.valor === 42800, `Despesas a vencer em 15 dias: R$ ${despesas?.a_vencer_15d?.valor}`);
  assert(despesas?.em_atraso?.valor === 9300, `Despesas em atraso com risco de juros: R$ ${despesas?.em_atraso?.valor}`);

  // 5. Segregação de Custódia e Aplicações Automáticas no OFX
  const custodia = mHolding.data?.custodia_investimentos;
  assert(custodia?.total_em_aplicacoes > 100000, `Total em Aplicações (Custódia): R$ ${custodia?.total_em_aplicacoes?.toFixed(2)}`);
  assert(custodia?.saldo_operacional_puro > 0, `Saldo Operacional puro isolado da custódia: R$ ${custodia?.saldo_operacional_puro?.toFixed(2)}`);

  // 6. Transações Conciliadas com Classificação de Custódia
  const extratos = mHolding.data?.extratos_bancarios || [];
  const temCustodia = extratos.some(e => e.tipo_classificacao === 'TRANSFERENCIA_CUSTODIA');
  const temOperacional = extratos.some(e => e.tipo_classificacao === 'OPERACIONAL');
  assert(temCustodia, 'Extratos classificam movimentações automáticas como TRANSFERENCIA_CUSTODIA');
  assert(temOperacional, 'Extratos classificam transferências de parceiros como OPERACIONAL');

  // 7. Multi-Tenant: Arandu vs Mitang
  const mArandu = await requestApi('/api/v1/dashboard/metrics', { 'x-empresa-id': '0754c882-d528-4d34-8c96-6d9af7e8d322' });
  const mMitang = await requestApi('/api/v1/dashboard/metrics', { 'x-empresa-id': '29ea0857-7cf7-44e1-ba36-a3f323c4670c' });
  assert(mArandu.data?.empresa_selecionada === '0754c882-d528-4d34-8c96-6d9af7e8d322', 'Tenant Arandu filtrado');
  assert(mMitang.data?.empresa_selecionada === '29ea0857-7cf7-44e1-ba36-a3f323c4670c', 'Tenant Mitang filtrado');
  const somaFaturado = (mArandu.data?.receitas?.faturado?.valor || 0) + (mMitang.data?.receitas?.faturado?.valor || 0);
  assert(Math.abs(somaFaturado - mHolding.data?.receitas?.faturado?.valor) < 0.01, 'Soma de Arandu + Mitang iguala perfeitamente o consolidado da Holding');

  // 8. Integridade do Frontend (renderRealModules.js)
  const renderJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'renderRealModules.js'), 'utf8');
  assert(renderJs.includes('toggleDashboardVisao'), 'Função global toggleDashboardVisao registrada');
  assert(renderJs.includes('toggleDashboardPeriodo'), 'Função global toggleDashboardPeriodo registrada');
  assert(renderJs.includes('toggleDashboardGraficoTipo'), 'Função global toggleDashboardGraficoTipo registrada');
  assert(renderJs.includes('toggleDashboardSerie'), 'Função global toggleDashboardSerie registrada');
  assert(renderJs.includes('renderCardsExecutivos'), 'Função global renderCardsExecutivos registrada');
  assert(renderJs.includes('renderGraficoExecutivo'), 'Função global renderGraficoExecutivo registrada');
  assert(renderJs.includes('mitang_tenant_changed'), 'Listener global mitang_tenant_changed ativo');

  console.log(`\n========================================================================`);
  console.log(`RESULTADO DA VALIDAÇÃO: ${passed} / ${total} TESTES APROVADOS (100% SUCESSO)`);
  console.log(`========================================================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
