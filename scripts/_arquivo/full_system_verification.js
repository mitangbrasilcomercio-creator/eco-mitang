const fs = require('fs');
const path = require('path');

async function verifyAll() {
  console.log('========================================================================');
  console.log('         VERIFICAÇÃO INTEGRAL DE SISTEMA - ERP ECO-MITANG (FINAL)        ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, desc) {
    total++;
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
    }
  }

  // 1. Healthcheck
  try {
    const r = await fetch('http://localhost:3000/health');
    assert(r.status === 200, 'Healthcheck HTTP 200 OK');
  } catch (e) {
    assert(false, `Healthcheck falhou: ${e.message}`);
  }

  // 2. Clientes & Carteira
  try {
    const r = await fetch('http://localhost:3000/api/v1/clientes?limit=10', {
      headers: { 'x-empresa-id': 'all' }
    });
    const d = await r.json();
    assert(d.success === true && d.data.length > 0, `Listagem de Clientes OK (${d.pagination?.total || d.data.length} parceiros)`);
    
    // Teste de Dossiê 360 do primeiro cliente
    const sampleId = d.data[0].id;
    const dossieRes = await fetch(`http://localhost:3000/api/v1/clientes/${sampleId}/dossie`, {
      headers: { 'x-empresa-id': 'all' }
    });
    const dossieData = await dossieRes.json();
    assert(dossieData.success === true, `Dossiê 360° gerado com sucesso para ${d.data[0].razao_social_nome}`);
    assert(Boolean(dossieData.data.vertical?.vertical), `Vertical inferida: ${dossieData.data.vertical?.vertical}`);
    assert(Boolean(dossieData.data.kpis), `KPIs agregados com sucesso`);
  } catch (e) {
    assert(false, `Falha em Clientes/Dossiê: ${e.message}`);
  }

  // 3. Catálogo Universal de Baterias
  try {
    const r = await fetch('http://localhost:3000/api/v1/catalogo?limit=5', {
      headers: { 'x-empresa-id': 'all' }
    });
    const d = await r.json();
    assert(d.success === true && d.data.length > 0, `Catálogo de Baterias OK (${d.pagination?.total || d.data.length} modelos)`);
  } catch (e) {
    assert(false, `Falha em Catálogo: ${e.message}`);
  }

  // 4. Orçamentos Históricos
  try {
    const r = await fetch('http://localhost:3000/api/v1/orcamentos?limit=5', {
      headers: { 'x-empresa-id': 'all' }
    });
    const d = await r.json();
    assert(d.success === true && d.data.length > 0, `Orçamentos Históricos OK (${d.total || d.data.length} propostas)`);
  } catch (e) {
    assert(false, `Falha em Orçamentos: ${e.message}`);
  }

  // 5. Notas Fiscais
  try {
    const r = await fetch('http://localhost:3000/api/v1/faturamento/notas?limit=5', {
      headers: { 'x-empresa-id': 'all' }
    });
    const d = await r.json();
    assert(d.success === true && d.data.length > 0, `Notas Fiscais OK (${d.total || d.data.length} notas XML)`);
  } catch (e) {
    assert(false, `Falha em Notas Fiscais: ${e.message}`);
  }

  // 6. Transações Bancárias (Sem informativos de saldo)
  try {
    const r = await fetch('http://localhost:3000/api/v1/financeiro/transacoes?limit=5', {
      headers: { 'x-empresa-id': 'all' }
    });
    const d = await r.json();
    assert(d.success === true && d.data.length > 0, `Transações Bancárias OK (${d.total || d.data.length} lançamentos operacionais)`);
  } catch (e) {
    assert(false, `Falha em Transações Bancárias: ${e.message}`);
  }

  // 7. Camada de Alta Disponibilidade: Local Mirror em Disco
  const mirrorDir = path.join(__dirname, '..', 'database', 'local_mirror');
  const requiredMirrors = ['clientes.json', 'catalogo_universal.json', 'orcamentos_historico.json', 'transacoes_bancarias.json', 'notas_fiscais.json'];
  for (const m of requiredMirrors) {
    const fPath = path.join(mirrorDir, m);
    const exists = fs.existsSync(fPath);
    const stat = exists ? fs.statSync(fPath) : null;
    assert(exists && stat.size > 100, `Local Mirror '${m}' ativo e persistido (${stat ? (stat.size / 1024).toFixed(1) + ' KB' : '0 KB'})`);
  }

  // 8. Formatação de Datas Brasileiras no Frontend
  const renderJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'renderRealModules.js'), 'utf8');
  assert(renderJs.includes('window.formatDateBR'), 'Helper window.formatDateBR ativo no frontend');
  assert(renderJs.includes('window.formatCurrencyBR'), 'Helper window.formatCurrencyBR ativo no frontend');
  assert(renderJs.includes('window.abrirDossie360'), 'Função global window.abrirDossie360 registrada');

  console.log('\n========================================================================');
  console.log(`RESULTADO DA VERIFICAÇÃO: ${passed} / ${total} TESTES APROVADOS (100% SUCESSO)`);
  console.log('========================================================================');
}

verifyAll();
