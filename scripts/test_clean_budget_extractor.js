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

const items = [];

for (const b of rows) {
  let mIdx = -1;
  for (let j = 12; j < b.length - 4; j++) {
    if (b[j].startsWith('R$') && b[j+1].startsWith('R$') && b[j+2].includes('%') && b[j+3].startsWith('R$') && b[j+4].startsWith('R$')) {
      mIdx = j;
      break;
    }
  }
  if (mIdx === -1) continue;

  const vUnit = parseMoney(b[mIdx]);
  const vTotProd = parseMoney(b[mIdx + 1]);
  const descPct = parsePercent(b[mIdx + 2]);
  const vFrete = parseMoney(b[mIdx + 3]);
  const vFinal = parseMoney(b[mIdx + 4]);

  const posPag = b[mIdx + 5];
  const posSit = b[mIdx + 6];
  let obs = null;
  let seq = null;

  if (b.length === mIdx + 8) {
    seq = parseInt(b[mIdx + 7]);
  } else if (b.length >= mIdx + 9) {
    obs = b[mIdx + 7] === '-' ? null : b[mIdx + 7];
    seq = parseInt(b[b.length - 1]);
  }

  const stFin = b[mIdx - 1] === '-' ? null : b[mIdx - 1];
  const metPag = b[mIdx - 2] === '-' ? null : b[mIdx - 2];

  const middle = b.slice(14, mIdx - 2);

  // Encontrar índice do tipo de NFe
  let tipoNfeIdx = middle.findIndex(c => c.includes('NFe') || c.includes('NFSe'));
  let tipoNfe = tipoNfeIdx !== -1 ? middle[tipoNfeIdx] : null;

  // Tudo antes do tipoNfe pertence a PO e Data de Aprovação
  let poCliente = null;
  let dataAprovacao = null;
  if (tipoNfeIdx > 0) {
    const beforeNfe = middle.slice(0, tipoNfeIdx);
    for (const val of beforeNfe) {
      if (val === '-') continue;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        dataAprovacao = val;
      } else if (!/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{4})$/i.test(val)) {
        poCliente = val;
      }
    }
  }

  // Tudo depois do tipoNfe pertence a NFe, Datas de Envio, Prazo e Vencimento
  let numeroNfe = null;
  let dataEnvioNf = null;
  let prazo = null;
  let vencimento = null;

  if (tipoNfeIdx !== -1) {
    const afterNfe = middle.slice(tipoNfeIdx + 1);
    for (const val of afterNfe) {
      if (val === '-') continue;
      if (/^\d{2}\.\d{3}\.\d{3}$/.test(val) || /^00\.\d{3}\.\d{3}$/.test(val) || val.startsWith('NFS -')) {
        numeroNfe = val;
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
        if (!dataEnvioNf && !numeroNfe) {
          dataEnvioNf = val;
        } else if (!vencimento) {
          vencimento = val;
        }
      } else if (val === 'À Vista' || (/^\d{1,3}$/.test(val) && parseInt(val) <= 120)) {
        prazo = val;
      }
    }
  }

  items.push({
    sequencial: seq,
    numero_orcamento: b[0],
    vendido_por: b[1],
    data_emissao: b[4],
    mes_emissao: b[2],
    ano_emissao: b[3],
    cliente_nome: b[5],
    cliente_cnpj_cpf: b[6].replace(/\D/g, ''),
    cliente_contato: b[7],
    pack_produto: b[8],
    codigo_sku: b[9],
    quantidade: parseInt(b[10]) || 1,
    quimica: b[11],
    orcamento_enviado: b[12],
    status_aprovacao: b[13],
    po_cliente: poCliente,
    data_aprovacao: dataAprovacao,
    tipo_nfe: tipoNfe,
    numero_nfe: numeroNfe,
    data_envio_nf: dataEnvioNf,
    prazo: prazo,
    data_vencimento: vencimento,
    metodo_pagamento: metPag,
    status_financeiro: stFin,
    situacao_pedido: posSit,
    pagamento_status: posPag,
    valor_unitario: vUnit,
    valor_total_produtos: vTotProd,
    desconto_percentual: descPct,
    valor_frete: vFrete,
    valor_final: vFinal,
    observacao: obs
  });
}

console.log(`Itens processados: ${items.length}`);
const aprovados = items.filter(it => it.status_aprovacao === 'Compra Aprovada');
console.log(`Itens com 'Compra Aprovada': ${aprovados.length}`);

const comPo = aprovados.filter(it => it.po_cliente);
console.log(`Itens aprovados com PO identificada: ${comPo.length}`);

const comNfe = aprovados.filter(it => it.numero_nfe);
console.log(`Itens aprovados com Nº NFe identificada: ${comNfe.length}`);

const comVenc = aprovados.filter(it => it.data_vencimento);
console.log(`Itens aprovados com Data de Vencimento identificada: ${comVenc.length}`);

console.log('\n--- AMOSTRA DE 5 ITENS APROVADOS COMPLETOS ---');
aprovados.slice(10, 15).forEach(it => {
  console.log(`\nOrçamento #${it.numero_orcamento} | ${it.cliente_nome} | Pack: ${it.pack_produto}`);
  console.log(`  PO: ${it.po_cliente || 'N/A'} | Aprovado em: ${it.data_aprovacao || 'N/A'}`);
  console.log(`  Tipo NF: ${it.tipo_nfe || 'N/A'} | Nº NF: ${it.numero_nfe || 'N/A'} | Vencimento: ${it.data_vencimento || 'N/A'} (Prazo: ${it.prazo || 'N/A'})`);
  console.log(`  Qtd: ${it.quantidade} | Unit: R$ ${it.valor_unitario} | Desc: ${it.desconto_percentual}% | Frete: R$ ${it.valor_frete} | Total: R$ ${it.valor_final}`);
  console.log(`  Status Fin: ${it.status_financeiro || 'N/A'} | Pagamento: ${it.pagamento_status || 'N/A'} | Situação: ${it.situacao_pedido}`);
  console.log(`  Obs: ${it.observacao || '-'}`);
});
