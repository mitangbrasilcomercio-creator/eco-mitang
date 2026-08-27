const fs = require('fs');

function fixDatesInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace patterns like: t.data_lancamento ? t.data_lancamento.split('T')[0] : '-'
  content = content.replace(/(\w+)\.data_lancamento \? \1\.data_lancamento\.split\('T'\)\[0\] : '-'/g, 'window.formatDateBR($1.data_lancamento)');
  content = content.replace(/(\w+)\.data_emissao \? \1\.data_emissao\.split\('T'\)\[0\] : '-'/g, 'window.formatDateBR($1.data_emissao)');
  content = content.replace(/(\w+)\.data_emissao \? \1\.data_emissao\.split\('T'\)\[0\] : \(([^)]+)\)/g, 'window.formatDateBR($1.data_emissao || ($2))');
  content = content.replace(/(\w+)\.data_vencimento \? \1\.data_vencimento\.split\('T'\)\[0\] : '-'/g, 'window.formatDateBR($1.data_vencimento)');
  content = content.replace(/(\w+)\.created_at \? \1\.created_at\.split\('T'\)\[0\] : '-'/g, 'window.formatDateBR($1.created_at)');

  // Generic .split('T')[0] replacements for dates
  content = content.replace(/(\w+\.data_\w+)\.split\('T'\)\[0\]/g, 'window.formatDateBR($1)');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[OK] Formatadas datas brasileiras em ${filePath}`);
  } else {
    console.log(`[SEM ALTERAÇÃO] Nenhuma data AAAA-MM-DD restante em ${filePath}`);
  }
}

fixDatesInFile('public/renderRealModules.js');
