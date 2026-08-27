async function testDashboardApi() {
  const resAll = await fetch('http://localhost:3000/api/v1/dashboard/metrics?periodo=all');
  const dataAll = await resAll.json();

  const resMes = await fetch('http://localhost:3000/api/v1/dashboard/metrics?periodo=mes_atual');
  const dataMes = await resMes.json();

  console.log('--- TESTE DINÂMICO DE PERÍODOS ---');
  console.log('PERÍODO ALL (2026 Completo):');
  console.log(' - Faturado:', dataAll.data.receitas.faturado.valor);
  console.log(' - Recebido:', dataAll.data.receitas.recebido.valor);
  console.log(' - Despesas Pagas:', dataAll.data.despesas.total_pago.valor);

  console.log('\nPERÍODO MES_ATUAL (Agosto/2026):');
  console.log(' - Faturado:', dataMes.data.receitas.faturado.valor);
  console.log(' - Recebido:', dataMes.data.receitas.recebido.valor);
  console.log(' - Despesas Pagas:', dataMes.data.despesas.total_pago.valor);

  console.log('\nRUNWAY E SALDO PROJETADO (MES_ATUAL):');
  console.log(' - Saldo Bancário Atual:', dataMes.data.runway.saldo_bancario_atual);
  console.log(' - A Receber 15d:', dataMes.data.runway.a_receber_15d);
  console.log(' - A Pagar 15d:', dataMes.data.runway.a_pagar_15d);
  console.log(' - Saldo Projetado:', dataMes.data.runway.saldo_projetado);
  console.log(' - Detalhamento Contas:', dataMes.data.runway.detalhamento.contas_bancarias.length);
  console.log(' - Faturas A Receber:', dataMes.data.runway.detalhamento.faturas_a_receber.length);
  console.log(' - Faturas A Pagar:', dataMes.data.runway.detalhamento.faturas_a_pagar.length);
  console.log(' - Dias Cobertura:', dataMes.data.runway.dias_cobertura);
}
testDashboardApi().catch(console.error);
