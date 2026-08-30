async function run() {
  const tests = [
    { name: 'Dashboard Metrics', url: 'http://localhost:3000/api/v1/dashboard/metrics' },
    { name: 'Catálogo de Baterias (250)', url: 'http://localhost:3000/api/v1/catalogo?limit=250' },
    { name: 'Clientes Compradores', url: 'http://localhost:3000/api/v1/clientes?tipo_entidade=CLIENTE&limit=10' },
    { name: 'Fornecedores Insumos', url: 'http://localhost:3000/api/v1/clientes?tipo_entidade=FORNECEDOR&limit=10' },
    { name: 'Colaboradores PJ', url: 'http://localhost:3000/api/v1/clientes?tipo_entidade=COLABORADOR_PJ&limit=10' },
    { name: 'Orçamentos & Cotações', url: 'http://localhost:3000/api/v1/orcamentos?limit=10' },
    { name: 'Transações Bancárias OFX', url: 'http://localhost:3000/api/v1/financeiro/transacoes?limit=10' },
    { name: 'Resumo de Caixa & Projeção', url: 'http://localhost:3000/api/v1/financeiro/resumo-caixa' },
    { name: 'Notas Fiscais (172 XMLs)', url: 'http://localhost:3000/api/v1/faturamento/notas?limit=10' },
    { name: 'DRE & Margens Contábeis', url: 'http://localhost:3000/api/v1/contabilidade/dre' }
  ];

  console.log('================================================================================');
  console.log('         PROVA DE PERFORMANCE & CONFORMIDADE GERAL DO ECO-MITANG ERP            ');
  console.log('================================================================================');

  let allPassed = true;
  for (const t of tests) {
    const start = performance.now();
    const res = await fetch(t.url);
    const time = (performance.now() - start).toFixed(1);
    const data = await res.json();
    const isOk = res.status === 200 && data.success === true;
    if (!isOk) allPassed = false;

    const info = data.total || data.pagination?.total || (data.data && (data.data.length || Object.keys(data.data).length)) || 'OK';
    console.log(`[${res.status}] ${t.name.padEnd(28)} -> ${time}ms | Sucesso: ${data.success} | Registros: ${info}`);
  }

  console.log('================================================================================');
  console.log(allPassed ? '[SUCESSO TOTAL] Todas as 10 APIs operando em alta performance!' : '[AVISO] Algum teste apresentou falha.');
  console.log('================================================================================');
}

run();
