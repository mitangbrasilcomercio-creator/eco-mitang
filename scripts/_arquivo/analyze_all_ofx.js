const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');

// Robust OFX parser that handles both Itaú and Bradesco quirks (commas, timestamps, unclosed tags)
function parseOfxFile(filePath) {
  const content = fs.readFileSync(filePath, 'latin1');

  // Extract Bank Info
  const bankIdMatch = content.match(/<BANKID>([\s\S]*?)(?:<|\r?\n)/);
  const acctIdMatch = content.match(/<ACCTID>([\s\S]*?)(?:<|\r?\n)/);
  const acctTypeMatch = content.match(/<ACCTTYPE>([\s\S]*?)(?:<|\r?\n)/);
  const curDefMatch = content.match(/<CURDEF>([\s\S]*?)(?:<|\r?\n)/);

  const bankId = bankIdMatch ? bankIdMatch[1].trim() : '';
  const acctId = acctIdMatch ? acctIdMatch[1].trim() : '';
  const acctType = acctTypeMatch ? acctTypeMatch[1].trim() : '';
  const curDef = curDefMatch ? curDefMatch[1].trim() : 'BRL';

  // Extract Balance
  const balAmtMatch = content.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([\s\S]*?)(?:<|\r?\n)/);
  const dtAsOfMatch = content.match(/<LEDGERBAL>[\s\S]*?<DTASOF>([\s\S]*?)(?:<|\r?\n)/);

  let ledgerBalance = null;
  if (balAmtMatch) {
    ledgerBalance = parseFloat(balAmtMatch[1].trim().replace(',', '.'));
  }

  // Extract Transactions
  const transactions = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let match;

  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];

    const typeMatch = block.match(/<TRNTYPE>([\s\S]*?)(?:<|\r?\n)/);
    const dtPostedMatch = block.match(/<DTPOSTED>([\s\S]*?)(?:<|\r?\n)/);
    const trnAmtMatch = block.match(/<TRNAMT>([\s\S]*?)(?:<|\r?\n)/);
    const fitidMatch = block.match(/<FITID>([\s\S]*?)(?:<|\r?\n)/);
    const checkNumMatch = block.match(/<CHECKNUM>([\s\S]*?)(?:<|\r?\n)/);
    const memoMatch = block.match(/<MEMO>([\s\S]*?)(?:<|\r?\n)/);

    const trntype = typeMatch ? typeMatch[1].trim() : '';
    const dtpostedRaw = dtPostedMatch ? dtPostedMatch[1].trim() : '';
    const rawAmt = trnAmtMatch ? trnAmtMatch[1].trim().replace(',', '.') : '0';
    const trnamt = parseFloat(rawAmt);
    const fitid = fitidMatch ? fitidMatch[1].trim() : '';
    const checknum = checkNumMatch ? checkNumMatch[1].trim() : '';
    const memo = memoMatch ? memoMatch[1].trim() : '';

    // Standardize date to YYYY-MM-DD
    let dateStr = '';
    if (dtpostedRaw.length >= 8) {
      dateStr = `${dtpostedRaw.substring(0, 4)}-${dtpostedRaw.substring(4, 6)}-${dtpostedRaw.substring(6, 8)}`;
    }

    // Extract CNPJ/CPF from memo if available
    const cnpjMatch = memo.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    const cpfMatch = memo.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    const cnpj_cpf = cnpjMatch ? cnpjMatch[0] : (cpfMatch ? cpfMatch[0] : null);

    // Is saldo anterior
    const isSaldoAnterior = memo.toUpperCase().includes('SALDO ANTERIOR') || memo.toUpperCase().includes('SDO ANTERIOR');

    transactions.push({
      bankId,
      acctId,
      trntype,
      dtpostedRaw,
      dateStr,
      trnamt,
      fitid,
      checknum,
      memo,
      cnpj_cpf,
      isSaldoAnterior
    });
  }

  return {
    filePath,
    bankId,
    acctId,
    acctType,
    curDef,
    ledgerBalance,
    transactions
  };
}

function runAnalysis() {
  const companies = [
    { name: 'Arandu (Baterias)', path: path.join(root, 'Arandu (Baterias)') },
    { name: 'Mitang Brasil (Baterias)', path: path.join(root, 'Mitang Brasil (Baterias)') }
  ];

  const overallResults = {};

  companies.forEach(comp => {
    overallResults[comp.name] = {
      banks: {},
      allTransactions: [],
      uniqueTransactionsMap: new Map(),
      duplicatesCount: 0,
      totalCredits: 0,
      totalDebits: 0,
      monthlySummary: {}
    };

    const banks = fs.readdirSync(comp.path);
    banks.forEach(bank => {
      const bankPath = path.join(comp.path, bank);
      if (!fs.statSync(bankPath).isDirectory()) return;

      overallResults[comp.name].banks[bank] = [];
      const files = fs.readdirSync(bankPath);

      files.forEach(file => {
        const fullPath = path.join(bankPath, file);
        const parsed = parseOfxFile(fullPath);
        parsed.fileName = file;
        overallResults[comp.name].banks[bank].push(parsed);

        parsed.transactions.forEach(t => {
          overallResults[comp.name].allTransactions.push({
            ...t,
            company: comp.name,
            bank,
            fileName: file
          });

          // Unique key for deduplication
          // (company + bankId + acctId + fitid)
          const uniqueKey = `${comp.name}|${t.bankId}|${t.acctId}|${t.fitid}|${t.trnamt}|${t.dateStr}`;
          if (overallResults[comp.name].uniqueTransactionsMap.has(uniqueKey)) {
            overallResults[comp.name].duplicatesCount++;
          } else {
            overallResults[comp.name].uniqueTransactionsMap.set(uniqueKey, {
              ...t,
              company: comp.name,
              bank,
              fileName: file
            });
          }
        });
      });
    });

    // Calculate unique metrics excluding pseudo-transactions like 'SALDO ANTERIOR'
    const uniqueTxList = Array.from(overallResults[comp.name].uniqueTransactionsMap.values());

    uniqueTxList.forEach(t => {
      if (t.isSaldoAnterior) return; // Skip pseudo saldo anterior from cash flow

      const month = t.dateStr.substring(0, 7);
      if (!overallResults[comp.name].monthlySummary[month]) {
        overallResults[comp.name].monthlySummary[month] = {
          credits: 0,
          debits: 0,
          net: 0,
          count: 0
        };
      }

      if (t.trnamt > 0) {
        overallResults[comp.name].totalCredits += t.trnamt;
        overallResults[comp.name].monthlySummary[month].credits += t.trnamt;
      } else {
        overallResults[comp.name].totalDebits += Math.abs(t.trnamt);
        overallResults[comp.name].monthlySummary[month].debits += Math.abs(t.trnamt);
      }

      overallResults[comp.name].monthlySummary[month].net += t.trnamt;
      overallResults[comp.name].monthlySummary[month].count++;
    });
  });

  // Print Summary
  console.log('======================================================================');
  console.log('      ESTUDO FINANCEIRO DOS EXTRATOS BANCÁRIOS OFX (2026)             ');
  console.log('======================================================================\n');

  for (const [compName, data] of Object.entries(overallResults)) {
    console.log(`----------------------------------------------------------------------`);
    console.log(`EMPRESA: ${compName}`);
    console.log(`Bancos: ${Object.keys(data.banks).join(', ')}`);
    console.log(`Total de transações nos arquivos: ${data.allTransactions.length}`);
    console.log(`Transações duplicadas detectadas entre arquivos mensais: ${data.duplicatesCount}`);
    console.log(`Transações únicas válidas: ${data.uniqueTransactionsMap.size - (data.allTransactions.filter(t => t.isSaldoAnterior).length > 0 ? 1 : 0)}`);
    console.log(`Total Entradas (Créditos 2026): R$ ${data.totalCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`Total Saídas (Débitos 2026):    R$ ${data.totalDebits.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const netFlow = data.totalCredits - data.totalDebits;
    console.log(`Fluxo Líquido Acumulado (2026): R$ ${netFlow.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`\nEvolução Mensal (Fluxo de Caixa Líquido):`);
    
    Object.keys(data.monthlySummary).sort().forEach(m => {
      const ms = data.monthlySummary[m];
      console.log(`  * ${m}: Entradas: R$ ${ms.credits.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)} | Saídas: R$ ${ms.debits.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)} | Líquido: R$ ${ms.net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)} (${ms.count} txs)`);
    });
    console.log('\n');
  }

  // Deep dive into transaction categories and major counterparties
  console.log('======================================================================');
  console.log('      ANÁLISE DE CONTRAPARTES & NECESSIDADES FINANCEIRAS              ');
  console.log('======================================================================\n');

  for (const [compName, data] of Object.entries(overallResults)) {
    console.log(`>>> MAIORES SAÍDAS (DÉBITOS) DE: ${compName}`);
    const debits = Array.from(data.uniqueTransactionsMap.values())
      .filter(t => !t.isSaldoAnterior && t.trnamt < 0)
      .sort((a, b) => a.trnamt - b.trnamt); // most negative first

    debits.slice(0, 10).forEach((t, i) => {
      console.log(`  ${i+1}. R$ ${Math.abs(t.trnamt).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Data: ${t.dateStr} | ${t.memo} ${t.cnpj_cpf ? '[' + t.cnpj_cpf + ']' : ''}`);
    });

    console.log(`\n>>> MAIORES ENTRADAS (CRÉDITOS) DE: ${compName}`);
    const credits = Array.from(data.uniqueTransactionsMap.values())
      .filter(t => !t.isSaldoAnterior && t.trnamt > 0)
      .sort((a, b) => b.trnamt - a.trnamt); // largest first

    credits.slice(0, 10).forEach((t, i) => {
      console.log(`  ${i+1}. R$ ${t.trnamt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Data: ${t.dateStr} | ${t.memo} ${t.cnpj_cpf ? '[' + t.cnpj_cpf + ']' : ''}`);
    });
    console.log('\n');
  }
}

runAnalysis();
