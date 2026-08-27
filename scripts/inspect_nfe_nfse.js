const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'NFe e NFSe');

function findXmls(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(findXmls(full));
    } else if (file.endsWith('.xml')) {
      results.push({ file, full });
    }
  });
  return results;
}

function analyzeAllXmls() {
  const xmls = findXmls(baseDir);
  console.log(`======================================================================`);
  console.log(`Total de XMLs encontrados na pasta 'NFe e NFSe': ${xmls.length}`);
  console.log(`======================================================================\n`);

  let nfeCount = 0;
  let nfseCount = 0;

  const nfeList = [];
  const nfseList = [];

  xmls.forEach(({ file, full }) => {
    const content = fs.readFileSync(full, 'utf8');
    if (content.includes('<infNFe') || content.includes('<NFe')) {
      nfeCount++;
      nfeList.push({ file, full, content });
    } else if (content.includes('<CompNfse') || content.includes('<Nfse') || content.includes('<InfNfse')) {
      nfseCount++;
      nfseList.push({ file, full, content });
    } else {
      console.log('Outro tipo de XML:', file);
    }
  });

  console.log(`NF-e (Produtos / SEFAZ):   ${nfeCount} arquivos`);
  console.log(`NFS-e (Serviços / Cidades): ${nfseCount} arquivos\n`);

  // Analyze NF-e
  const emitentes = new Map();
  const destinatarios = new Map();
  let totalNfeValor = 0;

  nfeList.forEach(({ file, content }) => {
    const vNFMatch = content.match(/<vNF>([\s\S]*?)<\/vNF>/);
    const valor = vNFMatch ? parseFloat(vNFMatch[1]) : 0;
    totalNfeValor += valor;

    const emitMatch = content.match(/<emit>([\s\S]*?)<\/emit>/);
    let emitNome = 'Desconhecido', emitCnpj = '';
    if (emitMatch) {
      const n = emitMatch[1].match(/<xNome>([\s\S]*?)<\/xNome>/);
      const c = emitMatch[1].match(/<CNPJ>(\d+)<\/CNPJ>/);
      emitNome = n ? n[1] : 'Desconhecido';
      emitCnpj = c ? c[1] : '';
    }

    const destMatch = content.match(/<dest>([\s\S]*?)<\/dest>/);
    let destNome = 'Desconhecido', destCnpj = '';
    if (destMatch) {
      const n = destMatch[1].match(/<xNome>([\s\S]*?)<\/xNome>/);
      const c = destMatch[1].match(/<CNPJ>(\d+)<\/CNPJ>/) || destMatch[1].match(/<CPF>(\d+)<\/CPF>/);
      destNome = n ? n[1] : 'Desconhecido';
      destCnpj = c ? c[1] : '';
    }

    if (!emitentes.has(emitNome)) emitentes.set(emitNome, { count: 0, total: 0, cnpj: emitCnpj });
    emitentes.get(emitNome).count++;
    emitentes.get(emitNome).total += valor;

    if (!destinatarios.has(destNome)) destinatarios.set(destNome, { count: 0, total: 0, cnpj: destCnpj });
    destinatarios.get(destNome).count++;
    destinatarios.get(destNome).total += valor;
  });

  console.log(`Valor Total Movimentado em NF-e: R$ ${totalNfeValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

  console.log(`\n>>> TOP 10 EMITENTES (QUEM EMITIU AS NF-e):`);
  Array.from(emitentes.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .forEach(([nome, d], i) => {
      console.log(`  ${i+1}. ${nome} [CNPJ: ${d.cnpj}] | ${d.count} notas | R$ ${d.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    });

  console.log(`\n>>> TOP 10 DESTINATÁRIOS (QUEM RECEBEU AS NF-e):`);
  Array.from(destinatarios.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .forEach(([nome, d], i) => {
      console.log(`  ${i+1}. ${nome} [CNPJ: ${d.cnpj}] | ${d.count} notas | R$ ${d.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    });

  // Analyze NFS-e
  console.log(`\n======================================================================`);
  console.log(`                     DETALHES DAS NFS-e (SERVIÇOS)                   `);
  console.log(`======================================================================\n`);

  let totalNfseValor = 0;
  nfseList.forEach(({ file, content }) => {
    const numMatch = content.match(/<Numero>(\d+)<\/Numero>/);
    const valMatch = content.match(/<ValorServicos>([\s\S]*?)<\/ValorServicos>/);
    const tomadorMatch = content.match(/<RazaoSocial>([\s\S]*?)<\/RazaoSocial>/);
    const tomadorCnpj = content.match(/<Cnpj>(\d+)<\/Cnpj>/);
    const val = valMatch ? parseFloat(valMatch[1]) : 0;
    totalNfseValor += val;

    console.log(`NFS-e #${numMatch ? numMatch[1] : '?'} | Tomador: ${tomadorMatch ? tomadorMatch[1] : '-'} [CNPJ: ${tomadorCnpj ? tomadorCnpj[1] : '-'}] | Valor: R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  });

  console.log(`\nValor Total em NFS-e: R$ ${totalNfseValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
}

analyzeAllXmls();
