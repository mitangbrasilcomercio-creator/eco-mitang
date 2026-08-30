async function testCustomDates() {
  const res = await fetch('http://localhost:3000/api/v1/dashboard/metrics?periodo=custom&data_inicio=2026-05-01&data_fim=2026-06-30');
  const json = await res.json();
  console.log('CUSTOM DATES TEST (01/05 a 30/06):', json.data.periodo_info);
  console.log('Faturado:', json.data.receitas.faturado.valor);
  console.log('Recebido:', json.data.receitas.recebido.valor);
  console.log('Despesas:', json.data.despesas.total_pago.valor);
}
testCustomDates().catch(console.error);
