const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX', 'Arandu (Baterias)', 'Itaú', 'Extrato_1155_995077_26-08-2026-Abril-2026.ofx');
const content = fs.readFileSync(filePath, 'latin1');
const trns = content.split('<STMTTRN>');

for (const t of trns) {
  if (t.includes('2919.35') || t.includes('2919,35')) {
    const fitid = (t.match(/<FITID>(.*?)(\r|\n|<)/) || [])[1];
    const dt = (t.match(/<DTPOSTED>(.*?)(\r|\n|<)/) || [])[1];
    const amt = (t.match(/<TRNAMT>(.*?)(\r|\n|<)/) || [])[1];
    const memo = (t.match(/<MEMO>(.*?)(\r|\n|<)/) || [])[1];
    console.log(`Abril Itaú | DT: ${dt} | FITID: ${fitid} | AMT: ${amt} | MEMO: ${memo}`);
  }
}
