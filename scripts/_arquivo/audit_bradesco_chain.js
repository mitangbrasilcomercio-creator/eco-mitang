const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\diego\\eco-mitang\\Arquivos_Reais_Para_A_IA_Usar_Como_Parametro\\Extratos Bancários OFX\\Mitang Brasil (Baterias)\\Bradesco';
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto'];

let runningBalance = 0; // Vamos descobrir o saldo inicial ou ver se bate mês a mês

months.forEach(mName => {
  const f = fs.readdirSync(dir).find(x => x.includes(mName) && x.endsWith('.OFX'));
  if (!f) return;
  const content = fs.readFileSync(path.join(dir, f), 'latin1');
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  let rec = 0;
  let desp = 0;
  let rend = 0;
  while ((m = trnRegex.exec(content)) !== null) {
    const block = m[1];
    const val = parseFloat(block.match(/<TRNAMT>([\s\S]*?)(?:<|\r?\n)/)[1].trim().replace(',', '.'));
    const memo = (block.match(/<MEMO>([\s\S]*?)(?:<|\r?\n)/) || ['', ''])[1].trim().toUpperCase();
    if (memo.includes('RENTAB.INVEST')) rend += val;
    else if (val > 0) rec += val;
    else desp += Math.abs(val);
  }
  const balMatch = content.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([\s\S]*?)(?:<|\r?\n)/);
  const ledgerBal = balMatch ? parseFloat(balMatch[1].trim().replace(',', '.')) : null;

  console.log(`Bradesco ${mName}: Rec=${rec.toFixed(2)} | Desp=${desp.toFixed(2)} | Rend=${rend.toFixed(2)} | Liquido=${(rec - desp + rend).toFixed(2)} | LedgerBal=${ledgerBal}`);
});
