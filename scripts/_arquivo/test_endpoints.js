async function testEndpoints() {
  try {
    // 1. Clientes
    const cliRes = await fetch('http://localhost:3000/api/v1/clientes?limit=5', {
      headers: { 'x-empresa-id': 'all' }
    });
    const cliJson = await cliRes.json();
    console.log('Clientes total:', cliJson.total, 'items length:', cliJson.items ? cliJson.items.length : 0);

    if (cliJson.items && cliJson.items.length > 0) {
      const sampleClient = cliJson.items[0];
      console.log('Sample client:', sampleClient.razao_social_nome, 'CNPJ:', sampleClient.cnpj_cpf);

      // 2. Dossiê 360°
      const dossieRes = await fetch(`http://localhost:3000/api/v1/clientes/${sampleClient.id}/dossie`, {
        headers: { 'x-empresa-id': 'all' }
      });
      const dossieJson = await dossieRes.json();
      console.log('\nDossiê 360° success:', dossieJson.success);
      if (dossieJson.data) {
        console.log(' -> Vertical:', dossieJson.data.vertical);
        console.log(' -> KPIs:', dossieJson.data.kpis);
        console.log(' -> Notas fiscais:', dossieJson.data.notas_fiscais.length);
        console.log(' -> Orçamentos:', dossieJson.data.orcamentos.length);
        console.log(' -> Baterias movimentadas:', dossieJson.data.produtos_mais_movimentados.length);
        console.log(' -> Transações bancárias:', dossieJson.data.transacoes_bancarias.length);
      }
    }

    // 3. Test Petrobras specifically
    const petroRes = await fetch('http://localhost:3000/api/v1/clientes?busca=PETROBRAS', {
      headers: { 'x-empresa-id': 'all' }
    });
    const petroJson = await petroRes.json();
    if (petroJson.items && petroJson.items.length > 0) {
      const petro = petroJson.items[0];
      console.log('\nPetrobras found:', petro.razao_social_nome);
      const petroDossie = await fetch(`http://localhost:3000/api/v1/clientes/${petro.id}/dossie`, {
        headers: { 'x-empresa-id': 'all' }
      });
      const pj = await petroDossie.json();
      console.log(' -> Petrobras Vertical:', pj.data?.vertical);
      console.log(' -> Petrobras KPIs:', pj.data?.kpis);
    }

  } catch (err) {
    console.error('Test error:', err);
  }
}

testEndpoints();
