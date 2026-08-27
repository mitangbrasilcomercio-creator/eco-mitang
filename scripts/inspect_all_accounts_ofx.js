const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');

function inspectFolder(sub) {
  const full = path.join(baseDir, sub);
  if (!fs.existsSync(full)) return;
  const list = fs.readdirSync(full, { withFileTypes: true });
  for (const item of list) {
    const p = path.join(full, item.name);
    if (item.isDirectory()) {
      inspectFolder(path.join(sub, item.name));
    } else if (item.name.endsWith('.ofx') || item.name.endsWith('.OFX')) {
      const content = fs.readFileSync(p, 'latin1');
      const bankId = (content.match(/<BANKID>(.*?)(\r|\n|<)/) || [])[1];
      const branchId = (content.match(/<BRANCHID>(.*?)(\r|\n|<)/) || [])[1];
      const acctId = (content.match(/<ACCTID>(.*?)(\r|\n|<)/) || [])[1];
      const dtStart = (content.match(/<DTSTART>(.*?)(\r|\n|<)/) || [])[1];
      const dtEnd = (content.match(/<DTEND>(.*?)(\r|\n|<)/) || [])[1];
      console.log(`Folder: ${sub} | File: ${item.name} | Bank: ${bankId} | Branch: ${branchId} | Acct: ${acctId} | Period: ${dtStart} to ${dtEnd}`);
    }
  }
}

inspectFolder('Arandu (Baterias)');
inspectFolder('Mitang Brasil (Baterias)');
