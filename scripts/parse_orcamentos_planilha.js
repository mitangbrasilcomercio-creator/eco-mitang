const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '..', 'database', 'seeds', 'Planilha de Orçamentos - Atualizada 26-08-2026.txt'), 'utf8');
const allLines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--- Page'));

const headerIndex = allLines.indexOf('N°');
const dataLines = allLines.slice(headerIndex + 1);

console.log('Total data lines:', dataLines.length);

// Split into blocks where a line is a 6-digit quote number AND next line is 'Mitang' or 'Arandu'
const quoteBlocks = [];
let currentBlock = [];

for (let i = 0; i < dataLines.length; i++) {
  const line = dataLines[i];
  const nextLine = dataLines[i + 1];

  const isQuoteStart = /^\d{6}$/.test(line) && (nextLine === 'Mitang' || nextLine === 'Arandu');
  
  if (isQuoteStart && currentBlock.length > 0) {
    quoteBlocks.push(currentBlock);
    currentBlock = [line];
  } else {
    currentBlock.push(line);
  }
}
if (currentBlock.length > 0) {
  quoteBlocks.push(currentBlock);
}

console.log('Total quote item blocks found:', quoteBlocks.length);
console.log('\n--- First block (length ' + quoteBlocks[0].length + ') ---');
console.log(quoteBlocks[0]);

console.log('\n--- Block 5 (length ' + quoteBlocks[5].length + ') ---');
console.log(quoteBlocks[5]);

console.log('\n--- Last block (length ' + quoteBlocks[quoteBlocks.length - 1].length + ') ---');
console.log(quoteBlocks[quoteBlocks.length - 1]);
