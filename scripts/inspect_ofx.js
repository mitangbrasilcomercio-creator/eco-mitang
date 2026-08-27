const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');

function getTags(content) {
  const tags = new Set();
  const regex = /<([A-Za-z0-9_]+)>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.add(match[1]);
  }
  return Array.from(tags);
}

const itauSample = fs.readFileSync(path.join(root, 'Arandu (Baterias)', 'Itaú', 'Extrato_1155_995077_26-08-2026-Abril-2026.ofx'), 'latin1');
const bradescoSample = fs.readFileSync(path.join(root, 'Mitang Brasil (Baterias)', 'Bradesco', 'Bradesco_26082026_205354-Agosto-2026.OFX'), 'latin1');

console.log('--- ITAU TAGS ---');
console.log(getTags(itauSample));

console.log('\n--- BRADESCO TAGS ---');
console.log(getTags(bradescoSample));

console.log('\n--- ITAU STMTTRN SAMPLES (first 3) ---');
const itauMatches = itauSample.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g);
if (itauMatches) {
  itauMatches.slice(0, 3).forEach((m, i) => console.log(`[${i+1}]\n` + m + '\n'));
} else {
  console.log(itauSample.slice(itauSample.indexOf('<BANKTRANLIST>'), itauSample.indexOf('<BANKTRANLIST>') + 1000));
}

console.log('\n--- BRADESCO STMTTRN SAMPLES (first 3) ---');
const bradMatches = bradescoSample.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g);
if (bradMatches) {
  bradMatches.slice(0, 3).forEach((m, i) => console.log(`[${i+1}]\n` + m + '\n'));
} else {
  console.log(bradescoSample.slice(bradescoSample.indexOf('<BANKTRANLIST>'), bradescoSample.indexOf('<BANKTRANLIST>') + 1000));
}

console.log('\n--- ITAU LEDGERBAL & BALANCE ---');
const itauBal = itauSample.match(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/);
console.log(itauBal ? itauBal[0] : 'N/A');

console.log('\n--- BRADESCO LEDGERBAL & BALANCE ---');
const bradBal = bradescoSample.match(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/);
console.log(bradBal ? bradBal[0] : 'N/A');
