const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '..', 'database', 'seeds', 'Planilha de Orçamentos - Atualizada 26-08-2026.txt'), 'utf8');
const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--- Page'));
const headerIdx = lines.indexOf('N°');
const dataLines = lines.slice(headerIdx + 1);

const quotes = [];
let current = [];
for (let i = 0; i < dataLines.length; i++) {
  const line = dataLines[i];
  const next = dataLines[i+1];
  if (/^\d{6}$/.test(line) && (next === 'Mitang' || next === 'Arandu')) {
    if (current.length > 0) quotes.push(current);
    current = [line];
  } else {
    current.push(line);
  }
}
if (current.length > 0) quotes.push(current);

const pendentes = quotes.filter(q => q.some(c => c === 'Aguardando Pagamento' || c === 'Em Atraso' || c === 'A Pagar'));
console.log('Total de linhas com pendencia financeira:', pendentes.length);

pendentes.forEach(p => {
  const qNum = p[0];
  const vend = p[1];
  const empresa = p[5];
  const pack = p[8];
  const finalVal = p.slice(-6, -3).find(c => c.startsWith('R$')) || p.find(c => c.startsWith('R$'));
  const venc = p.find(c => /^\d{2}\/\d{2}\/\d{4}$/.test(c) && c !== p[4]);
  const nfe = p.find(c => /^\d{2}\.\d{3}\.\d{3}$/.test(c) || c.includes('NFS'));
  const obs = p[p.length - 2];
  console.log(`\nQuote #${qNum} [${vend}] | ${empresa}`);
  console.log(`  Pack: ${pack} | Valor: ${finalVal} | NF: ${nfe} | Venc: ${venc}`);
  console.log(`  Obs: ${obs}`);
});
