const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');

function analyzeRealMovements() {
  const files = [
    // Arandu
    { company: 'Arandu', bank: 'Itaú', dir: path.join(root, 'Arandu (Baterias)', 'Itaú') },
    // Mitang Brasil
    { company: 'Mitang Brasil', bank: 'Bradesco', dir: path.join(root, 'Mitang Brasil (Baterias)', 'Bradesco') },
    { company: 'Mitang Brasil', bank: 'Itaú', dir: path.join(root, 'Mitang Brasil (Baterias)', 'Itaú') }
  ];

  const allTx = [];

  files.forEach(src => {
    const fileList = fs.readdirSync(src.dir);
    fileList.forEach(fileName => {
      const fullPath = path.join(src.dir, fileName);
      const content = fs.readFileSync(fullPath, 'latin1');

      const bankIdMatch = content.match(/<BANKID>([\s\S]*?)(?:<|\r?\n)/);
      const acctIdMatch = content.match(/<ACCTID>([\s\S]*?)(?:<|\r?\n)/);
      const bankId = bankIdMatch ? bankIdMatch[1].trim() : '';
      const acctId = acctIdMatch ? acctIdMatch[1].trim() : '';

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
        const dtposted = dtPostedMatch ? dtPostedMatch[1].trim() : '';
        const rawAmt = trnAmtMatch ? trnAmtMatch[1].trim().replace(',', '.') : '0';
        const trnamt = parseFloat(rawAmt);
        const fitid = fitidMatch ? fitidMatch[1].trim() : '';
        const checknum = checkNumMatch ? checkNumMatch[1].trim() : '';
        const memo = memoMatch ? memoMatch[1].trim() : '';

        let dateStr = '';
        if (dtposted.length >= 8) {
          dateStr = `${dtposted.substring(0, 4)}-${dtposted.substring(4, 6)}-${dtposted.substring(6, 8)}`;
        }

        allTx.push({
          company: src.company,
          bank: src.bank,
          bankId,
          acctId,
          trntype,
          dateStr,
          month: dateStr.substring(0, 7),
          trnamt,
          fitid,
          checknum,
          memo,
          fileName
        });
      }
    });
  });

  // Deduplicate
  const uniqueMap = new Map();
  allTx.forEach(t => {
    const key = `${t.company}|${t.bankId}|${t.acctId}|${t.fitid}|${t.trnamt}|${t.dateStr}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, t);
    }
  });

  const uniqueTransactions = Array.from(uniqueMap.values());

  // Classification function
  function classify(t) {
    const m = t.memo.toUpperCase();

    // 1. Informative Balances
    if (m.includes('SALDO ANTERIOR') || m.includes('SDO ANTERIOR') || m.includes('SALDO TOTAL DISPON') || m.includes('SALDO APLIC. AUT.')) {
      return { category: 'INFORMATIVO_SALDO', isCashFlow: false };
    }

    // 2. Automatic Investment Sweep
    if (m.includes('APLIC AUT MAIS') || m.includes('RESG APLIC AUT') || m.includes('INVEST FACILCRED') || m.includes('RESG.INVEST FACIL')) {
      return { category: 'APLICACAO_RESGATE_AUTOMATICO', isCashFlow: false };
    }

    // 3. Fornecedores
    if (m.includes('FORNECEDOR') || m.includes('PAGTO ELETRON COBRANCA') || m.includes('STREMA') || m.includes('PAG BOLETO')) {
      return { category: 'FORNECEDORES_OPERACIONAIS', isCashFlow: true };
    }

    // 4. Tributos e Impostos
    if (m.includes('TRIBUTO') || m.includes('DAS SIMPLES') || m.includes('RECEITA FEDERAL') || m.includes('DARF') || m.includes('GPS') || m.includes('FGTS')) {
      return { category: 'IMPOSTOS_E_TRIBUTOS', isCashFlow: true };
    }

    // 5. Transferências Sócios / Pró-labore
    if (m.includes('PAULO CESAR') || m.includes('DIEGO RIBEIRO') || m.includes('PRO-LABORE')) {
      return { category: 'REPASSES_SOCIOS_DIRETORIA', isCashFlow: true };
    }

    // 6. Transferência Intercompany (Entre empresas do grupo)
    if (m.includes('MITANG') || m.includes('ARANDU')) {
      return { category: 'INTERCOMPANY_HOLDING', isCashFlow: true };
    }

    // 7. Tarifas Bancárias
    if (m.includes('TARIFA') || m.includes('PACOTE') || m.includes('MANUT') || m.includes('IOF')) {
      return { category: 'TARIFAS_E_DESPESAS_BANCARIAS', isCashFlow: true };
    }

    // 8. Recebimentos de Clientes (Créditos)
    if (t.trnamt > 0) {
      if (m.includes('PIX RECEBIDO') || m.includes('TED') || m.includes('TRANSF') || m.includes('RECEB') || m.includes('DEPOSITO') || m.includes('CRED') || m.includes('BOLETO')) {
        return { category: 'RECEBIMENTO_CLIENTES', isCashFlow: true };
      }
      return { category: 'OUTRAS_ENTRADAS_OPERACIONAIS', isCashFlow: true };
    }

    // 9. Outras Saídas
    return { category: 'OUTRAS_DESPESAS_OPERACIONAIS', isCashFlow: true };
  }

  // Aggregate by company and category
  const report = {};

  uniqueTransactions.forEach(t => {
    const c = classify(t);
    t.category = c.category;
    t.isCashFlow = c.isCashFlow;

    if (!report[t.company]) {
      report[t.company] = {
        realCredits: 0,
        realDebits: 0,
        categories: {},
        monthlyReal: {}
      };
    }

    if (!report[t.company].categories[c.category]) {
      report[t.company].categories[c.category] = { total: 0, count: 0, txs: [] };
    }
    report[t.company].categories[c.category].total += t.trnamt;
    report[t.company].categories[c.category].count++;
    report[t.company].categories[c.category].txs.push(t);

    if (c.isCashFlow) {
      if (t.trnamt > 0) {
        report[t.company].realCredits += t.trnamt;
      } else {
        report[t.company].realDebits += Math.abs(t.trnamt);
      }

      if (!report[t.company].monthlyReal[t.month]) {
        report[t.company].monthlyReal[t.month] = { credits: 0, debits: 0, net: 0 };
      }
      if (t.trnamt > 0) {
        report[t.company].monthlyReal[t.month].credits += t.trnamt;
      } else {
        report[t.company].monthlyReal[t.month].debits += Math.abs(t.trnamt);
      }
      report[t.company].monthlyReal[t.month].net += t.trnamt;
    }
  });

  console.log('======================================================================');
  console.log('      FLUXO DE CAIXA REAL (EXPURGANDO VARREDURAS E SALDOS DIÁRIOS)   ');
  console.log('======================================================================\n');

  for (const [comp, data] of Object.entries(report)) {
    console.log(`----------------------------------------------------------------------`);
    console.log(`EMPRESA: ${comp}`);
    console.log(`RECEITA / ENTRADAS REAIS (2026): R$ ${data.realCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`DESPESAS / SAÍDAS REAIS (2026):  R$ ${data.realDebits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`RESULTADO OPERACIONAL LÍQUIDO :  R$ ${(data.realCredits - data.realDebits).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    console.log(`\nFluxo Mensal Real:`);
    Object.keys(data.monthlyReal).sort().forEach(m => {
      const mr = data.monthlyReal[m];
      console.log(`  * ${m}: Entradas Reais: R$ ${mr.credits.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(12)} | Saídas Reais: R$ ${mr.debits.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(12)} | Líquido Real: R$ ${mr.net.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(12)}`);
    });

    console.log(`\nDetalhamento por Categoria:`);
    for (const [cat, catData] of Object.entries(data.categories)) {
      console.log(`  * ${cat.padEnd(35)}: R$ ${catData.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(14)} (${catData.count} operações)`);
    }
    console.log('\n');
  }

  // Print Sample Real Counterparties
  console.log('======================================================================');
  console.log('      AMOSTRA DE CONTRAPARTES E CLIENTES REAIS (PAGADORES/RECEBEDORES)');
  console.log('======================================================================\n');

  for (const [comp, data] of Object.entries(report)) {
    console.log(`>>> PRINCIPAIS RECEBIMENTOS DE CLIENTES EM: ${comp}`);
    const clientTxs = (data.categories['RECEBIMENTO_CLIENTES']?.txs || [])
      .sort((a, b) => b.trnamt - a.trnamt);
    clientTxs.slice(0, 15).forEach((t, i) => {
      console.log(`  ${i+1}. R$ ${t.trnamt.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10)} | ${t.dateStr} | ${t.memo}`);
    });

    console.log(`\n>>> PRINCIPAIS PAGAMENTOS A FORNECEDORES EM: ${comp}`);
    const fornTxs = (data.categories['FORNECEDORES_OPERACIONAIS']?.txs || [])
      .sort((a, b) => a.trnamt - b.trnamt);
    fornTxs.slice(0, 10).forEach((t, i) => {
      console.log(`  ${i+1}. R$ ${Math.abs(t.trnamt).toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10)} | ${t.dateStr} | ${t.memo}`);
    });
    console.log('\n');
  }
}

analyzeRealMovements();
