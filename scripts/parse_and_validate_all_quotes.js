const fs = require('fs');
const path = require('path');

function parseMoney(val) {
  if (!val || typeof val !== 'string') return 0;
  const clean = val.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parsePercent(val) {
  if (!val || typeof val !== 'string') return 0;
  const clean = val.replace('%', '').replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

const content = fs.readFileSync(path.join(__dirname, '..', 'database', 'seeds', 'Planilha de Orçamentos - Atualizada 26-08-2026.txt'), 'utf8');
const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--- Page'));
const headerIdx = lines.indexOf('N°');
const dataLines = lines.slice(headerIdx + 1);

const starts = [];
for (let i = 0; i < dataLines.length; i++) {
  const line = dataLines[i];
  const isQuoteNumber = /^\d{6}(-\d+)?$/.test(line) || /^01\.S\./.test(line);
  if (isQuoteNumber) {
    const next1 = dataLines[i+1];
    const next2 = dataLines[i+2];
    if (next1 === 'Mitang' || next1 === 'Arandu' || next2 === 'Mitang' || next2 === 'Arandu') {
      starts.push(i);
    }
  }
}

const rows = [];
for (let i = 0; i < starts.length; i++) {
  const startIdx = starts[i];
  const endIdx = (i < starts.length - 1) ? starts[i + 1] : dataLines.length;
  rows.push(dataLines.slice(startIdx, endIdx));
}

console.log(`Total de blocos: ${rows.length}`);

let matchedCount = 0;
const parsedItems = [];

for (let rIdx = 0; rIdx < rows.length; rIdx++) {
  const b = rows[rIdx];

  // Procurar a tupla de 5 valores financeiros: [Money, Money, Percent, Money, Money]
  let moneyTupleIdx = -1;
  for (let i = 12; i < b.length - 4; i++) {
    if (b[i].startsWith('R$') && b[i+1].startsWith('R$') && b[i+2].includes('%') && b[i+3].startsWith('R$') && b[i+4].startsWith('R$')) {
      moneyTupleIdx = i;
      break;
    }
  }

  if (moneyTupleIdx !== -1) {
    matchedCount++;
    const vUnit = parseMoney(b[moneyTupleIdx]);
    const vTotProd = parseMoney(b[moneyTupleIdx + 1]);
    const descPct = parsePercent(b[moneyTupleIdx + 2]);
    const vFrete = parseMoney(b[moneyTupleIdx + 3]);
    const vFinal = parseMoney(b[moneyTupleIdx + 4]);

    // Elementos depois do vFinal:
    // [moneyTupleIdx + 5]: Pagamento (Ok, -, Extornado)
    // [moneyTupleIdx + 6]: SITUAÇÃO (Compra Finalizada, Aguardando Pagamento, Pedido Cancelado, Compra Não Finalizada)
    // Se b.length === moneyTupleIdx + 8:
    //   [moneyTupleIdx + 7] é o N° sequencial, sem observação
    // Se b.length === moneyTupleIdx + 9:
    //   [moneyTupleIdx + 7] é a Observação, [moneyTupleIdx + 8] é o N° sequencial
    const posPag = b[moneyTupleIdx + 5];
    const posSit = b[moneyTupleIdx + 6];
    let obs = null;
    let seq = null;

    if (b.length === moneyTupleIdx + 8) {
      seq = parseInt(b[moneyTupleIdx + 7]);
    } else if (b.length >= moneyTupleIdx + 9) {
      obs = b[moneyTupleIdx + 7] === '-' ? null : b[moneyTupleIdx + 7];
      seq = parseInt(b[b.length - 1]);
    }

    // Elementos antes do moneyTupleIdx:
    // [moneyTupleIdx - 1]: Status Financeiro (Pago, Em Atraso, À Vencer, Extornado, -)
    // [moneyTupleIdx - 2]: Método de Pagamento (Transferência Bancária, Boleto, PIX, À Vista, -)
    const stFin = b[moneyTupleIdx - 1] === '-' ? null : b[moneyTupleIdx - 1];
    const metPag = b[moneyTupleIdx - 2] === '-' ? null : b[moneyTupleIdx - 2];

    parsedItems.push({
      sequencial: seq,
      numero_orcamento: b[0],
      vendido_por: b[1],
      data_emissao: b[4],
      cliente_nome: b[5],
      cliente_cnpj_cpf: b[6].replace(/\D/g, ''),
      cliente_contato: b[7],
      pack_produto: b[8],
      codigo_sku: b[9],
      quantidade: parseInt(b[10]) || 1,
      quimica: b[11],
      orcamento_enviado: b[12],
      status_aprovacao: b[13],
      valor_unitario: vUnit,
      valor_total_produtos: vTotProd,
      desconto_percentual: descPct,
      valor_frete: vFrete,
      valor_final: vFinal,
      status_financeiro: stFin,
      metodo_pagamento: metPag,
      pagamento_status: posPag,
      situacao_pedido: posSit,
      observacao: obs,
      middle: b.slice(14, moneyTupleIdx - 2)
    });
  }
}

console.log(`Tuplas financeiras encontradas com 100% de precisão: ${matchedCount} / ${rows.length}`);

// Validar status financeiro correto
const statusDist = {};
parsedItems.forEach(it => {
  const st = it.status_financeiro || 'N/A';
  statusDist[st] = (statusDist[st] || 0) + 1;
});
console.log('\nNova Distribuição de Status Financeiro:');
console.log(statusDist);

// Mostrar itens em atraso reais
const emAtraso = parsedItems.filter(it => it.status_financeiro === 'Em Atraso');
console.log(`\nItens com status 'Em Atraso' confirmados: ${emAtraso.length}`);
emAtraso.forEach(it => {
  console.log(` -> #${it.numero_orcamento} | ${it.cliente_nome} | Valor: R$ ${it.valor_final} | Situação: ${it.situacao_pedido} | Método: ${it.metodo_pagamento}`);
});

// Mostrar itens a vencer
const aVencer = parsedItems.filter(it => it.status_financeiro === 'À Vencer');
console.log(`\nItens com status 'À Vencer' confirmados: ${aVencer.length}`);
aVencer.forEach(it => {
  console.log(` -> #${it.numero_orcamento} | ${it.cliente_nome} | Valor: R$ ${it.valor_final} | Situação: ${it.situacao_pedido} | Método: ${it.metodo_pagamento} | Obs: ${it.observacao || '-'}`);
});
