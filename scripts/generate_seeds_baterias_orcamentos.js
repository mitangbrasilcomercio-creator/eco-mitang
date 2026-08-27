const fs = require('fs');
const path = require('path');

function parseMoney(val) {
  if (!val || typeof val !== 'string') return 0;
  const clean = val.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parsePercent(val) {
  if (!val || typeof val !== 'string') return 0;
  const clean = val.replace('%', '').replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function generateSeeds() {
  console.log('======================================================================');
  console.log('    GERAÇÃO DOS SEEDS JSON: PRODUTOS BATERIAS & ORÇAMENTOS HISTÓRICOS  ');
  console.log('======================================================================\n');

  // --------------------------------------------------------------------------
  // 1. PROCESSAR CATÁLOGO DE PRODUTOS DE BATERIAS
  // --------------------------------------------------------------------------
  const prodTextPath = path.join(__dirname, '..', 'database', 'seeds', 'Produtos - Baterias.txt');
  const prodContent = fs.readFileSync(prodTextPath, 'utf8');
  const prodLines = prodContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--- Page'));

  const produtosBaterias = [];
  // Linhas 0-5 são cabeçalhos: Tipo, Setor, Fabricante, Produto, Código, Química
  for (let i = 6; i < prodLines.length; i += 6) {
    const chunk = prodLines.slice(i, i + 6);
    if (chunk.length === 6) {
      const nomeProd = chunk[3];
      
      // Regex para extrair especificações técnicas
      const tensaoMatch = nomeProd.match(/(\d+(?:,\d+)?)\s*v/i);
      const capacidadeMatch = nomeProd.match(/(\d+(?:,\d+)?)\s*(?:ah|mah)/i);
      const energiaMatch = nomeProd.match(/(\d+(?:[.,]\d+)?)\s*wh/i);

      let tensaoV = tensaoMatch ? parseFloat(tensaoMatch[1].replace(',', '.')) : null;
      let capacidadeAh = null;
      if (capacidadeMatch) {
        let capVal = parseFloat(capacidadeMatch[1].replace(',', '.'));
        if (/mah/i.test(capacidadeMatch[0])) capVal = capVal / 1000;
        capacidadeAh = capVal;
      }
      let energiaWh = energiaMatch ? parseFloat(energiaMatch[1].replace('.', '').replace(',', '.')) : null;

      produtosBaterias.push({
        tipo: chunk[0].toUpperCase(),
        setor: chunk[1].toUpperCase(),
        fabricante: chunk[2],
        nome: nomeProd,
        codigo_sku: chunk[4],
        quimica: chunk[5],
        especificacoes_tecnicas: {
          tensao_nominal_v: tensaoV,
          capacidade_nominal_ah: capacidadeAh,
          energia_nominal_wh: energiaWh,
          quimica_detalhada: chunk[5]
        }
      });
    }
  }

  const prodJsonPath = path.join(__dirname, '..', 'database', 'seeds', 'catalogo_baterias_produtos.json');
  fs.writeFileSync(prodJsonPath, JSON.stringify(produtosBaterias, null, 2), 'utf8');
  console.log(`[1/2] Catálogo de Produtos de Baterias gerado com sucesso:`);
  console.log(`      Arquivo: ${prodJsonPath}`);
  console.log(`      Total de Itens: ${produtosBaterias.length} produtos estruturados\n`);

  // --------------------------------------------------------------------------
  // 2. PROCESSAR PLANILHA DE ORÇAMENTOS HISTÓRICOS
  // --------------------------------------------------------------------------
  const orcTextPath = path.join(__dirname, '..', 'database', 'seeds', 'Planilha de Orçamentos - Atualizada 26-08-2026.txt');
  const orcContent = fs.readFileSync(orcTextPath, 'utf8');
  const orcLines = orcContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('--- Page'));

  const headerIndex = orcLines.indexOf('N°');
  const dataLines = orcLines.slice(headerIndex + 1);

  const quoteBlocks = [];
  let currentBlock = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const nextLine = dataLines[i + 1];
    const isQuoteStart = /^\d{6}$/.test(line) && (nextLine === 'Mitang' || nextLine === 'Arandu');
    
    if (isQuoteStart && currentBlock.length > 0) {
      quoteBlocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    quoteBlocks.push(currentBlock);
  }

  const orcamentosMap = new Map();

  for (const b of quoteBlocks) {
    if (b.length < 20) continue;

    const numeroOrcamento = b[0];
    const vendidoPor = b[1]; // 'Mitang' ou 'Arandu'
    const mesEmissao = b[2];
    const anoEmissao = b[3];
    const dataEmissao = b[4];
    const empresaCliente = b[5];
    const cnpjCpf = b[6].replace(/\D/g, '');
    const contato = b[7];
    const packProduto = b[8];
    const codigoSku = b[9];
    const quantidade = parseInt(b[10]) || 1;
    const quimica = b[11];
    const orcamentoEnviado = b[12];
    const aprovado = b[13]; // 'Compra Aprovada', 'Não Aprovada'

    // Dados ancorados do final do bloco
    const len = b.length;
    const sequencialN = b[len - 1];
    const observacao = b[len - 2] === '-' ? null : b[len - 2];
    const situacaoPedido = b[len - 3];
    const statusPagamento = b[len - 4];
    const valorFinal = parseMoney(b[len - 5]);
    const valorFrete = parseMoney(b[len - 6]);
    const descontoPercentual = parsePercent(b[len - 7]);
    const valorTotalProdutos = parseMoney(b[len - 8]);
    const valorUnitario = parseMoney(b[len - 9]);
    const statusFinanceiro = b[len - 10];
    const metodoPagamento = b[len - 11] === '-' ? null : b[len - 11];

    // Meio do bloco (NFe, datas, etc)
    const middle = b.slice(14, len - 11);
    let tipoNfe = null;
    let numeroNfe = null;
    let poCliente = null;
    let vencimento = null;

    middle.forEach(m => {
      if (m.includes('NFe') || m.includes('NFSe')) tipoNfe = m;
      if (/^\d{2}\.\d{3}\.\d{3}$/.test(m) || /^\d{3}\.\d{3}\.\d{3}$/.test(m)) numeroNfe = m;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(m) && m !== dataEmissao) vencimento = m;
      if (m.startsWith('PO') || m.startsWith('325') || m.startsWith('173') || m.startsWith('005')) poCliente = m;
    });

    const item = {
      sequencial: parseInt(sequencialN) || null,
      codigo_sku: codigoSku,
      pack_produto: packProduto,
      quimica: quimica,
      quantidade: quantidade,
      valor_unitario: valorUnitario,
      valor_total_produtos: valorTotalProdutos,
      desconto_percentual: descontoPercentual,
      valor_frete: valorFrete,
      valor_final_item: valorFinal,
      tipo_nfe: tipoNfe,
      numero_nfe: numeroNfe,
      po_cliente: poCliente,
      vencimento: vencimento,
      metodo_pagamento: metodoPagamento,
      status_financeiro: statusFinanceiro,
      pagamento_status: statusPagamento,
      situacao_item: situacaoPedido,
      observacao: observacao
    };

    if (!orcamentosMap.has(numeroOrcamento)) {
      orcamentosMap.set(numeroOrcamento, {
        numero_orcamento: numeroOrcamento,
        vendido_por: vendidoPor,
        data_emissao: dataEmissao,
        mes_emissao: mesEmissao,
        ano_emissao: anoEmissao,
        cliente: {
          nome: empresaCliente,
          cnpj_cpf: cnpjCpf,
          contato: contato
        },
        status_aprovacao: aprovado,
        orcamento_enviado: orcamentoEnviado,
        situacao_geral: situacaoPedido,
        valor_total_orcamento: 0,
        itens: []
      });
    }

    const orc = orcamentosMap.get(numeroOrcamento);
    orc.itens.push(item);
    orc.valor_total_orcamento = parseFloat((orc.valor_total_orcamento + valorFinal).toFixed(2));
  }

  const orcamentosArray = Array.from(orcamentosMap.values());
  const orcJsonPath = path.join(__dirname, '..', 'database', 'seeds', 'orcamentos_historico.json');
  fs.writeFileSync(orcJsonPath, JSON.stringify(orcamentosArray, null, 2), 'utf8');

  console.log(`[2/2] Planilha de Orçamentos Históricos processada com sucesso:`);
  console.log(`      Arquivo: ${orcJsonPath}`);
  console.log(`      Total de Orçamentos Consolidados: ${orcamentosArray.length} propostas comerciais`);
  console.log(`      Total de Itens Cotados:           ${quoteBlocks.length} itens individuais`);

  // Métricas financeiras da planilha
  let totalFaturadoAprovado = 0;
  let totalNaoAprovado = 0;
  orcamentosArray.forEach(o => {
    if (o.status_aprovacao === 'Compra Aprovada') {
      totalFaturadoAprovado += o.valor_total_orcamento;
    } else {
      totalNaoAprovado += o.valor_total_orcamento;
    }
  });

  console.log(`\nResumo Financeiro da Base Histórica:`);
  console.log(`  * Total Aprovado e Comercializado: R$ ${totalFaturadoAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`  * Total em Propostas Não Aprovadas: R$ ${totalNaoAprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log('\n======================================================================');
  console.log('>>> ARQUIVOS JSON GERADOS PARA ALIMENTAÇÃO DO BANCO COM SUCESSO! <<<');
  console.log('======================================================================\n');
}

generateSeeds();
