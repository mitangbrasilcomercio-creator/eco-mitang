const fs = require('fs');
const path = require('path');

const bradescoDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX', 'Mitang Brasil (Baterias)', 'Bradesco');
const files = fs.readdirSync(bradescoDir).filter(f => f.endsWith('.OFX'));

for (const f of files) {
  const p = path.join(bradescoDir, f);
  const content = fs.readFileSync(p, 'latin1');
  const count = (content.match(/<STMTTRN>/g) || []).length;
  console.log(`Bradesco ${f} -> Total transactions: ${count}`);
}
