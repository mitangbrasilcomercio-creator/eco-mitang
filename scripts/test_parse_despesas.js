const fs = require('fs');

const rawLines = fs.readFileSync('scripts/extracted_despesas_receitas.txt', 'utf-8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0);

// Line 1 is the header
const header = rawLines[0];
const dataLines = rawLines.slice(1);

console.log(`Processing ${dataLines.length} lines...`);

const parsedRows = [];
let successCount = 0;
let failCount = 0;

for (let i = 0; i < dataLines.length; i++) {
  const line = dataLines[i];
  
  // Format: "002: Mitang Despesa Benefício Alimentação VR Benefícios Jandson P. - Bradesco 800,00 R$ ..."
  const content = line.replace(/^\d+:\s*/, '');
  
  // 1. Empresa: starts with Mitang, Arandu or Paulo
  let empresa = '';
  let rest = content;
  if (rest.startsWith('Mitang ')) {
    empresa = 'Mitang';
    rest = rest.substring(7);
  } else if (rest.startsWith('Arandu ')) {
    empresa = 'Arandu';
    rest = rest.substring(7);
  } else if (rest.startsWith('Paulo ')) {
    empresa = 'Paulo';
    rest = rest.substring(6);
  } else {
    const firstWord = rest.split(' ')[0];
    empresa = firstWord;
    rest = rest.substring(firstWord.length + 1);
  }

  // 2. Tipo: Despesa or Receita
  let tipo = 'Despesa';
  if (rest.startsWith('Despesa ')) {
    tipo = 'Despesa';
    rest = rest.substring(8);
  } else if (rest.startsWith('DespesaPrestador ')) {
    tipo = 'Despesa';
    rest = 'Prestador ' + rest.substring(17);
  } else if (rest.startsWith('Receita ')) {
    tipo = 'Receita';
    rest = rest.substring(8);
  }

  // 3. Find the main monetary value
  const valorMatch = rest.match(/(?:(Bradesco|Itaú|Paulo|-)\s+)?([\d\.]+,\d{2})\s*R\$/);
  
  let banco = 'Bradesco';
  let valor = 0;
  let antesValor = '';
  let depoisValor = '';
  
  if (valorMatch) {
    banco = valorMatch[1] || 'Bradesco';
    valor = parseFloat(valorMatch[2].replace(/\./g, '').replace(',', '.'));
    antesValor = rest.substring(0, valorMatch.index).trim();
    depoisValor = rest.substring(valorMatch.index + valorMatch[0].length).trim();
  } else {
    failCount++;
    console.log(`FAIL valor at row ${i+1}:`, rest.substring(0, 80));
    continue;
  }

  // Date: first DD/MM/YYYY
  const dates = depoisValor.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const dataPag = dates[0] || null;
  const dataVenc = dates.length > 1 ? dates[1] : dataPag;

  // Recorrência
  let recorrencia = 'Pontual';
  if (/Mensal/i.test(depoisValor)) recorrencia = 'Mensal';
  else if (/Semanal/i.test(depoisValor)) recorrencia = 'Semanal';
  else if (/Anual/i.test(depoisValor)) recorrencia = 'Anual';
  else if (/Trienal/i.test(depoisValor)) recorrencia = 'Trienal';
  else if (/Semestral/i.test(depoisValor)) recorrencia = 'Semestral';

  // Forma de Pag
  let formaPag = 'À Vista';
  if (/À Prazo/i.test(depoisValor)) formaPag = 'À Prazo';
  else if (/Parcelado/i.test(depoisValor)) formaPag = 'Parcelado';

  // Método
  let metodo = 'Pix';
  if (/Cartão de Crédito/i.test(depoisValor)) metodo = 'Cartão de Crédito';
  else if (/Débito Automático/i.test(depoisValor)) metodo = 'Débito Automático';
  else if (/Boleto/i.test(depoisValor)) metodo = 'Boleto';
  else if (/Pix/i.test(depoisValor)) metodo = 'Pix';

  // Status Pagamento & Vencimento
  let statusPag = 'Pago';
  let statusVenc = 'Pago';
  if (/À Pagar/i.test(depoisValor)) statusPag = 'À Pagar';
  else if (/Programado/i.test(depoisValor)) statusPag = 'Programado';

  if (/Em Atraso/i.test(depoisValor)) statusVenc = 'Em Atraso';
  else if (/À Vencer/i.test(depoisValor)) statusVenc = 'À Vencer';

  parsedRows.push({
    row_index: i + 1,
    empresa,
    tipo,
    banco,
    valor,
    detalhe_bruto: antesValor,
    data_pagamento: dataPag,
    data_vencimento: dataVenc,
    recorrencia,
    forma_pagamento: formaPag,
    metodo_pagamento: metodo,
    status_pagamento: statusPag,
    status_vencimento: statusVenc
  });
  successCount++;
}

console.log(`Success: ${successCount} | Failed: ${failCount}`);
console.log('Sample parsed row 1:', parsedRows[0]);
console.log('Sample parsed row 14 (Allan):', parsedRows[13]);
console.log('Sample parsed row 126 (PRONAMPE):', parsedRows[125]);
