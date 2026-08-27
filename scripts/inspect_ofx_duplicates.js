const fs = require('fs');
const path = require('path');

function findFilesRecursive(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findFilesRecursive(fullPath, exts));
    } else {
      const ext = path.extname(item.name).toLowerCase();
      if (exts.includes(ext)) results.push(fullPath);
    }
  }
  return results;
}

const baseDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');
const files = findFilesRecursive(baseDir, ['.ofx']);

console.log('Total OFX files:', files.length);

const occurrences = [];
for (const f of files) {
  const content = fs.readFileSync(f, 'latin1');
  const matches = content.match(/KARINA DOS SANTOS SIL/g);
  if (matches) {
    console.log(`File: ${path.basename(f)} | Relative path: ${path.relative(baseDir, f)} | Occurrences: ${matches.length}`);
  }
  const stremaMatches = content.match(/2919\.35|2919,35/g);
  if (stremaMatches) {
    console.log(`STREMA 2919.35 in File: ${path.basename(f)} | Path: ${path.relative(baseDir, f)} | Matches: ${stremaMatches.length}`);
  }
}
