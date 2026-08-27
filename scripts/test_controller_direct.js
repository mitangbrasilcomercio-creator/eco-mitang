async function testControllerDirectly() {
  const res = await fetch('http://localhost:3000/api/v1/dashboard/metrics?periodo=all', {
    headers: {
      'x-empresa-id': '29ea0857-7cf7-44e1-ba36-a3f323c4670c'
    }
  });
  const json = await res.json();
  console.log('CONTROLLER OUTPUT FOR MITANG BRASIL:');
  console.log('Receitas:', json.data.receitas);
  console.log('Periodo Info:', json.data.periodo_info);
}
testControllerDirectly().catch(console.error);
