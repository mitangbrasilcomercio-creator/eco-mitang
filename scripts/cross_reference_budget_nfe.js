const { pgPool } = require('../dist/core/database/supabase-pool');
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

async function crossReferenceBudgetAndNFe() {
  const client = await pgPool.connect();
  try {
    const nfRes = await client.query(`
      SELECT id, numero_nota, serie, tipo_documento, valor_total, data_emissao, emitente_nome, emitente_cnpj_cpf, destinatario_nome, destinatario_cnpj_cpf
      FROM notas_fiscais;
    `);
    console.log(`Total de notas fiscais no banco: ${nfRes.rows.length}`);

    // Carregar itens estruturados
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

    let nfeMatchCount = 0;
    let nfeNotFound = 0;

    const nfeMap = new Map();
    nfRes.rows.forEach(nf => {
      const numInt = parseInt(nf.numero_nota, 10);
      nfeMap.set(numInt, nf);
    });

    const matches = [];

    for (const b of rows) {
      let mIdx = -1;
      for (let j = 12; j < b.length - 4; j++) {
        if (b[j].startsWith('R$') && b[j+1].startsWith('R$') && b[j+2].includes('%') && b[j+3].startsWith('R$') && b[j+4].startsWith('R$')) {
          mIdx = j;
          break;
        }
      }
      if (mIdx === -1) continue;

      const middle = b.slice(14, mIdx - 2);
      let tipoNfeIdx = middle.findIndex(c => c.includes('NFe') || c.includes('NFSe'));
      if (tipoNfeIdx !== -1) {
        const afterNfe = middle.slice(tipoNfeIdx + 1);
        for (const val of afterNfe) {
          if (/^\d{2}\.\d{3}\.\d{3}$/.test(val) || /^00\.\d{3}\.\d{3}$/.test(val)) {
            const numInt = parseInt(val.replace(/\D/g, ''), 10);
            if (nfeMap.has(numInt)) {
              nfeMatchCount++;
              matches.push({ quote: b[0], cliente: b[5], nfNumero: val, nfDb: nfeMap.get(numInt) });
            } else {
              nfeNotFound++;
            }
          }
        }
      }
    }

    console.log(`\nCruzamento Orçamentos x NF-e:`);
    console.log(` -> NFes vinculadas com sucesso no banco: ${nfeMatchCount}`);
    console.log(` -> NFes da planilha que são de períodos não importados em XML: ${nfeNotFound}`);
    console.log(`\nExemplos de vínculo perfeito Orçamento <-> PO <-> NF-e:`);
    matches.slice(0, 8).forEach(m => {
      console.log(`  Orçamento #${m.quote} (${m.cliente}) <---> NF-e #${m.nfDb.numero_nota} (R$ ${m.nfDb.valor_total}, Emitida: ${m.nfDb.data_emissao.toISOString().substring(0,10)})`);
    });

  } finally {
    client.release();
    pgPool.end();
  }
}
crossReferenceBudgetAndNFe();
