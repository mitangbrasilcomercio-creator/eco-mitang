const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX', 'Mitang Brasil (Baterias)', 'Bradesco');
const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.OFX'));

for (const f of files) {
  const full = path.join(baseDir, f);
  const content = fs.readFileSync(full, 'latin1');
  const trns = content.split('<STMTTRN>');
  for (const t of trns) {
    if (t.includes('KARINA DOS SANTOS SIL')) {
      const fitid = (t.match(/<FITID>(.*?)(\r|\n|<)/) || [])[1];
      const dt = (t.match(/<DTPOSTED>(.*?)(\r|\n|<)/) || [])[1];
      const amt = (t.match(/<TRNAMT>(.*?)(\r|\n|<)/) || [])[1];
      const memo = (t.match(/<MEMO>(.*?)(\r|\n|<)/) || [])[1];
      console.log(`File: ${f} | DT: ${dt} | FITID: ${fitid} | AMT: ${amt} | MEMO: ${memo}`);
    }
  }
}
