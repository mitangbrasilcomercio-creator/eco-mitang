const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');

function findOfxFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findOfxFiles(fullPath));
    } else if (file.toLowerCase().endsWith('.ofx')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = findOfxFiles(baseDir);
console.log('Total OFX files to audit:', files.length);

files.forEach(f => {
  const content = fs.readFileSync(f, 'latin1');
  const bankMatch = content.match(/<BANKID>([\s\S]*?)(?:<|\r?\n)/);
  const acctMatch = content.match(/<ACCTID>([\s\S]*?)(?:<|\r?\n)/);
  const bank = bankMatch ? bankMatch[1].trim() : 'UNK';
  const acct = acctMatch ? acctMatch[1].trim() : 'UNK';
  const fname = path.basename(f);

  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  let saldoAnterior = null;
  let recOperacional = 0;
  let despOperacional = 0;
  let rendimentos = 0;
  let sweep = 0;
  let saldosInformados = [];

  while ((m = trnRegex.exec(content)) !== null) {
    const block = m[1];
    const amtMatch = block.match(/<TRNAMT>([\s\S]*?)(?:<|\r?\n)/);
    const memoMatch = block.match(/<MEMO>([\s\S]*?)(?:<|\r?\n)/);
    const dtMatch = block.match(/<DTPOSTED>([\s\S]*?)(?:<|\r?\n)/);
    const val = parseFloat(amtMatch[1].trim().replace(',', '.'));
    const memo = memoMatch ? memoMatch[1].trim().toUpperCase() : '';
    const dt = dtMatch ? dtMatch[1].trim().substring(0, 8) : '';

    if (memo.includes('SALDO ANTERIOR')) {
      saldoAnterior = val;
    } else if (memo.includes('SALDO TOTAL DISPON')) {
      saldosInformados.push({ dt, val });
    } else if (memo.includes('REND PAGO') || memo.includes('RENDIMENTO') || memo.includes('RENTAB.INVEST')) {
      rendimentos += val;
    } else if (memo.includes('APLIC AUT') || memo.includes('RES APLIC') || memo.includes('INVEST FACIL')) {
      sweep += val;
    } else if (memo.includes('SALDO APLIC') || memo.includes('SALDO MOVIMENTA')) {
      // Ignora informativo secundario
    } else if (val > 0) {
      recOperacional += val;
    } else {
      despOperacional += Math.abs(val);
    }
  }

  const ultSaldoDisp = saldosInformados.length > 0 ? saldosInformados[saldosInformados.length - 1].val : null;
  console.log(`[${bank} | ${acct.padEnd(10)}] ${fname.padEnd(45)}: Ant=${saldoAnterior ?? 'N/A'} | Rec=${recOperacional.toFixed(2)} | Desp=${despOperacional.toFixed(2)} | Rend=${rendimentos.toFixed(2)} | UltDisp=${ultSaldoDisp ?? 'N/A'}`);
});
