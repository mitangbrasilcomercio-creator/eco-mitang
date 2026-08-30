const fs = require('fs');
const crypto = require('crypto');

const ID_MITANG = '29ea0857-7cf7-44e1-ba36-a3f323c4670c';
const ID_ARANDU = '0754c882-d528-4d34-8c96-6d9af7e8d322';

const rawLines = fs.readFileSync('scripts/extracted_despesas_receitas.txt', 'utf-8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l.length > 0)
  .slice(1);

function categorize(detalhe) {
  const d = detalhe.toLowerCase();
  
  if (d.includes('vr benefício') || d.includes('benefício alimentação')) {
    return { macro: 'RECURSOS_HUMANOS', cat: 'Benefício Alimentação (VR)', tipo: 'COLABORADOR_PJ', parceiro: 'VR Benefícios' };
  }
  if (d.includes('bradesco vida e previdência')) {
    return { macro: 'RECURSOS_HUMANOS', cat: 'Benefício Previdência Privada', tipo: 'INSTITUICAO_FINANCEIRA', parceiro: 'Bradesco Vida e Previdência' };
  }
  if (d.includes('sulamérica')) {
    return { macro: 'RECURSOS_HUMANOS', cat: 'Benefício Saúde (SulAmérica)', tipo: 'PRESTADOR_CONTINUO', parceiro: 'SulAmérica Saúde' };
  }
  if (d.includes('passagem') || d.includes('alim+trans')) {
    let p = 'Colaborador';
    if (d.includes('jandson')) p = 'Jandson Pereira de Oliveira';
    else if (d.includes('marcelo')) p = 'Marcelo Ferreira';
    else if (d.includes('diego')) p = 'Diego Ribeiro';
    return { macro: 'RECURSOS_HUMANOS', cat: 'Vale Transporte & Passagens', tipo: d.includes('diego') ? 'SOCIO_DIRETORIA' : 'COLABORADOR_PJ', parceiro: p };
  }
  if (d.includes('desligamento') || d.includes('destrato')) {
    return { macro: 'RECURSOS_HUMANOS', cat: 'Rescisão & Desligamento', tipo: 'COLABORADOR_PJ', parceiro: 'Allan Lourenço' };
  }
  if (d.includes('pró-labore')) {
    let p = 'Regina F.';
    if (d.includes('diego')) p = 'Diego Ribeiro';
    else if (d.includes('paulo')) p = 'Paulo Cesar';
    return { macro: 'SOCIOS_DIRETORIA', cat: 'Pró-Labore da Diretoria', tipo: 'SOCIO_DIRETORIA', parceiro: p };
  }
  if (d.includes('dividendo')) {
    return { macro: 'SOCIOS_DIRETORIA', cat: 'Distribuição de Dividendos / Lucros', tipo: 'SOCIO_DIRETORIA', parceiro: 'Paulo Cesar' };
  }
  if (d.includes('remuneração dos colab') || d.includes('rem (isolada') || d.includes('complemento salarial') || d.includes('embarque')) {
    if (d.includes('diego r.')) {
      return { macro: 'SOCIOS_DIRETORIA', cat: 'Honorários & Diárias de Embarque', tipo: 'SOCIO_DIRETORIA', parceiro: 'Diego Ribeiro' };
    }
    let p = 'Colaborador';
    if (d.includes('jandson')) p = 'Jandson Pereira de Oliveira';
    else if (d.includes('marcelo')) p = 'Marcelo Ferreira';
    else if (d.includes('allan')) p = 'Allan Lourenço';
    else if (d.includes('tom')) p = 'Tom Alves';
    else if (d.includes('andrielly')) p = 'Andrielly Britto';
    return { macro: 'RECURSOS_HUMANOS', cat: 'Remuneração da Equipe Técnica', tipo: 'COLABORADOR_PJ', parceiro: p };
  }
  if (d.includes('pronamp')) {
    return { macro: 'FINANCEIRO', cat: 'Empréstimo Capital de Giro (PRONAMPE)', tipo: 'INSTITUICAO_FINANCEIRA', parceiro: 'Banco Bradesco (PRONAMPE)' };
  }
  if (d.includes('aluguel') || d.includes('prima imobiliária') || d.includes('cristiana garcia')) {
    const p = d.includes('cristiana') ? 'Cristiana Garcia De Britto' : 'Prima Imobiliária';
    return { macro: 'INFRAESTRUTURA', cat: 'Locação de Salas Comerciais', tipo: 'INFRAESTRUTURA_FIXA', parceiro: p };
  }
  if (d.includes('light')) {
    return { macro: 'INFRAESTRUTURA', cat: 'Energia Elétrica', tipo: 'INFRAESTRUTURA_FIXA', parceiro: 'Light Serviços de Eletricidade' };
  }
  if (d.includes('vivo') || d.includes('claro')) {
    const p = d.includes('vivo') ? 'Vivo S.A.' : 'Claro S.A.';
    return { macro: 'INFRAESTRUTURA', cat: 'Telecomunicações e Internet', tipo: 'INFRAESTRUTURA_FIXA', parceiro: p };
  }
  if (d.includes('hostgator') || d.includes('omie') || d.includes('nfemail')) {
    let p = 'Hostgator';
    if (d.includes('omie')) p = 'OMIE Soluções';
    else if (d.includes('nfemail')) p = 'NFeMail Plataforma';
    return { macro: 'SERVICOS_TERCEIROS', cat: 'Software, ERP e Hospedagem', tipo: 'PRESTADOR_CONTINUO', parceiro: p };
  }
  if (d.includes('strema') || d.includes('hayamax')) {
    const p = d.includes('strema') ? 'Strema Ind. Com. de Equip. Eletrônicos' : 'Hayamax Distribuidora';
    return { macro: 'PRODUCAO_INSUMOS', cat: 'Matéria-Prima (Pilhas e Células Li-SOCL2)', tipo: 'FORNECEDOR_INSUMO', parceiro: p };
  }
  if (d.includes('lacre') || d.includes('spray') || d.includes('cesta de natal') || d.includes('comida e lanche')) {
    let p = 'SBT Embalagens';
    if (d.includes('brf')) p = 'BRF S.A. (Cesta Natal)';
    return { macro: 'PRODUCAO_INSUMOS', cat: 'Insumos de Bancada & Consumíveis', tipo: 'FORNECEDOR_INSUMO', parceiro: p };
  }
  if (d.includes('wpme') || d.includes('contabilidade')) {
    return { macro: 'SERVICOS_TERCEIROS', cat: 'Assessoria Contábil & Fiscal', tipo: 'PRESTADOR_CONTINUO', parceiro: 'WPME Contabilidade' };
  }
  if (d.includes('c4 treinamentos') || d.includes('certibrasil')) {
    const p = d.includes('c4') ? 'C4 Treinamentos' : 'Certibrasil Certificadora';
    return { macro: 'SERVICOS_TERCEIROS', cat: 'Certificações & Treinamentos ISO', tipo: 'PRESTADOR_CONTINUO', parceiro: p };
  }
  if (d.includes('karina') || d.includes('faxineira')) {
    return { macro: 'SERVICOS_TERCEIROS', cat: 'Higienização e Limpeza', tipo: 'PRESTADOR_CONTINUO', parceiro: 'Karina dos Santos' };
  }
  if (d.includes('hfg')) {
    return { macro: 'SERVICOS_TERCEIROS', cat: 'Projetos Mecânicos & Moldes Subsea', tipo: 'PRESTADOR_CONTINUO', parceiro: 'HFG Desenhos e Projetos' };
  }
  if (d.includes('movvi') || d.includes('ups') || d.includes('correios')) {
    let p = 'Movvi Transportadora';
    if (d.includes('ups')) p = 'UPS do Brasil';
    else if (d.includes('correios')) p = 'Correios ECT';
    return { macro: 'SERVICOS_TERCEIROS', cat: 'Transporte e Logística de Cargas', tipo: 'PRESTADOR_CONTINUO', parceiro: p };
  }
  if (d.includes('simples nacional')) {
    return { macro: 'TRIBUTOS', cat: 'DAS - Simples Nacional', tipo: 'GOVERNO_TRIBUTO', parceiro: 'Receita Federal do Brasil' };
  }
  if (d.includes('darf') || d.includes('inss')) {
    return { macro: 'TRIBUTOS', cat: 'DARF / INSS Previdenciário', tipo: 'GOVERNO_TRIBUTO', parceiro: 'Receita Federal / INSS' };
  }
  if (d.includes('fgts')) {
    return { macro: 'TRIBUTOS', cat: 'FGTS - Fundo de Garantia', tipo: 'GOVERNO_TRIBUTO', parceiro: 'Caixa Econômica Federal' };
  }
  if (d.includes('alvará') || d.includes('jucerja') || d.includes('licença')) {
    return { macro: 'TRIBUTOS', cat: 'Taxas Municipais, Licenças & JUCERJA', tipo: 'GOVERNO_TRIBUTO', parceiro: 'JUCERJA / Prefeitura' };
  }
  if (d.includes('tarifa') || d.includes('plano adapt') || d.includes('max empresarial') || d.includes('custas')) {
    return { macro: 'FINANCEIRO', cat: 'Tarifas Bancárias & Manutenção de Conta', tipo: 'INSTITUICAO_FINANCEIRA', parceiro: 'Tarifas Bancárias' };
  }
  if (d.includes('cartão de crédito')) {
    return { macro: 'FINANCEIRO', cat: 'Fatura de Cartão de Crédito Corporativo', tipo: 'INSTITUICAO_FINANCEIRA', parceiro: 'Cartão Corporativo' };
  }
  return { macro: 'OUTROS', cat: 'Outras Despesas Operacionais', tipo: 'PRESTADOR_CONTINUO', parceiro: 'Outros' };
}

const obrigacoes = [];
const novosParceirosMap = {};

for (let i = 0; i < rawLines.length; i++) {
  const line = rawLines[i].replace(/^\d+:\s*/, '');
  
  let empresa = 'Mitang';
  let rest = line;
  if (rest.startsWith('Mitang ')) {
    empresa = 'Mitang';
    rest = rest.substring(7);
  } else if (rest.startsWith('Arandu ')) {
    empresa = 'Arandu';
    rest = rest.substring(7);
  } else if (rest.startsWith('Paulo ')) {
    empresa = 'Mitang';
    rest = rest.substring(6);
  }

  let tipoOperacao = 'DESPESA';
  if (rest.startsWith('Despesa ')) {
    rest = rest.substring(8);
  } else if (rest.startsWith('DespesaPrestador ')) {
    rest = 'Prestador ' + rest.substring(17);
  } else if (rest.startsWith('Receita ')) {
    tipoOperacao = 'RECEITA';
    rest = rest.substring(8);
  }

  const valorMatch = rest.match(/(?:(Bradesco|Itaú|Paulo|-)\s+)?([\d\.]+,\d{2})\s*R\$/);
  if (!valorMatch) continue;

  const banco = valorMatch[1] === 'Itaú' ? 'Banco Itaú' : 'Banco Bradesco';
  const valor = parseFloat(valorMatch[2].replace(/\./g, '').replace(',', '.'));
  const antesValor = rest.substring(0, valorMatch.index).trim();
  const depoisValor = rest.substring(valorMatch.index + valorMatch[0].length).trim();

  const dates = depoisValor.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const dataPag = dates[0] || null;
  const dataVenc = dates.length > 1 ? dates[1] : dataPag;

  let recorrencia = 'PONTUAL';
  if (/Mensal/i.test(depoisValor)) recorrencia = 'MENSAL';
  else if (/Semanal/i.test(depoisValor)) recorrencia = 'SEMANAL';
  else if (/Anual/i.test(depoisValor)) recorrencia = 'ANUAL';
  else if (/Trienal/i.test(depoisValor)) recorrencia = 'TRIENAL';
  else if (/Semestral/i.test(depoisValor)) recorrencia = 'SEMESTRAL';

  let formaPag = 'A_VISTA';
  if (/À Prazo/i.test(depoisValor)) formaPag = 'A_PRAZO';
  else if (/Parcelado/i.test(depoisValor)) formaPag = 'PARCELADO';

  let metodo = 'PIX';
  if (/Cartão de Crédito/i.test(depoisValor)) metodo = 'CARTAO_CREDITO';
  else if (/Débito Automático/i.test(depoisValor)) metodo = 'DEBITO_AUTOMATICO';
  else if (/Boleto/i.test(depoisValor)) metodo = 'BOLETO';
  else if (/Pix/i.test(depoisValor)) metodo = 'PIX';

  let statusPag = 'PAGO';
  let statusVenc = 'PAGO';
  if (/À Pagar/i.test(depoisValor)) statusPag = 'A_PAGAR';
  else if (/Programado/i.test(depoisValor)) statusPag = 'PROGRAMADO';

  if (/Em Atraso/i.test(depoisValor)) statusVenc = 'EM_ATRASO';
  else if (/À Vencer/i.test(depoisValor)) statusVenc = 'A_VENCER';

  const catInfo = categorize(antesValor);

  // Parcelamento check (ex: Parcela 23 de 42, ou 6 3ª, ou 4 1ª)
  let parcelasInfo = null;
  const parcPronamp = antesValor.match(/Parcela\s+(\d+)\s+de\s+(\d+)/i);
  if (parcPronamp) {
    parcelasInfo = {
      parcela_atual: parseInt(parcPronamp[1], 10),
      total_parcelas: parseInt(parcPronamp[2], 10)
    };
  } else {
    const parcGen = depoisValor.match(/Parcelado\s+(\d+)\s+(\d+)ª/i);
    if (parcGen) {
      parcelasInfo = {
        total_parcelas: parseInt(parcGen[1], 10),
        parcela_atual: parseInt(parcGen[2], 10)
      };
    }
  }

  // Rateio sócios
  const isDiego = /Diego/i.test(depoisValor) && !/Ambos/i.test(depoisValor);
  const isPaulo = /Paulo/i.test(depoisValor) && !/Ambos/i.test(depoisValor);
  const rateio = {
    percentual_diego: isDiego ? 100 : (isPaulo ? 0 : 50),
    percentual_paulo: isPaulo ? 100 : (isDiego ? 0 : 50),
    valor_diego: isDiego ? valor : (isPaulo ? 0 : valor / 2),
    valor_paulo: isPaulo ? valor : (isDiego ? 0 : valor / 2)
  };

  const obId = crypto.createHash('sha256').update(`${empresa}|${antesValor}|${valor}|${dataPag}|${dataVenc}|${i}`).digest('hex');

  obrigacoes.push({
    id: obId,
    empresa_id: empresa === 'Arandu' ? ID_ARANDU : ID_MITANG,
    empresa_nome: empresa,
    tipo_operacao: tipoOperacao,
    macro_categoria: catInfo.macro,
    categoria_detalhada: catInfo.cat,
    tipo_entidade: catInfo.tipo,
    favorecido_nome: catInfo.parceiro,
    descricao: antesValor,
    banco,
    valor,
    data_pagamento: dataPag,
    data_vencimento: dataVenc,
    recorrencia,
    forma_pagamento: formaPag,
    metodo_pagamento: metodo,
    parcelas_info: parcelasInfo,
    rateio_socios: rateio,
    status_pagamento: statusPag,
    status_vencimento: statusVenc
  });

  // Track partners
  if (catInfo.parceiro && catInfo.parceiro !== 'Outros' && catInfo.parceiro !== 'Tarifas Bancárias' && catInfo.parceiro !== 'Cartão Corporativo') {
    novosParceirosMap[catInfo.parceiro] = {
      nome: catInfo.parceiro,
      tipo_entidade: catInfo.tipo,
      categoria: catInfo.cat
    };
  }
}

console.log(`Parsed ${obrigacoes.length} obrigações financeiras reais.`);

// Write to database/local_mirror/obrigacoes_recorrentes.json
fs.writeFileSync('database/local_mirror/obrigacoes_recorrentes.json', JSON.stringify(obrigacoes, null, 2), 'utf-8');
console.log('Saved database/local_mirror/obrigacoes_recorrentes.json');

// Now enrich clientes.json with the structured partner types!
const clientesPath = 'database/local_mirror/clientes.json';
let clientes = [];
if (fs.existsSync(clientesPath)) {
  clientes = JSON.parse(fs.readFileSync(clientesPath, 'utf-8'));
}

// Check existing partner names
const existingNames = new Set(clientes.map(c => (c.razao_social_nome || '').toLowerCase().trim()));

let partnersAdded = 0;
let partnersUpdated = 0;

for (const pName of Object.keys(novosParceirosMap)) {
  const pData = novosParceirosMap[pName];
  const pLower = pName.toLowerCase().trim();
  
  // Find if already exists
  const existing = clientes.find(c => (c.razao_social_nome || '').toLowerCase().trim() === pLower);
  if (existing) {
    existing.tipo_entidade = pData.tipo_entidade;
    partnersUpdated++;
  } else {
    // Add new entity
    clientes.push({
      id: crypto.randomUUID(),
      empresa_id: ID_MITANG,
      razao_social_nome: pData.nome,
      nome_fantasia: pData.nome,
      cnpj_cpf: null,
      tipo_entidade: pData.tipo_entidade,
      situacao_cadastral: 'ATIVA',
      ativo: true,
      email: null,
      telefone: null,
      municipio: 'Rio de Janeiro',
      uf: 'RJ',
      dados_receita_brutos: {
        categoria_operacional: pData.categoria
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    partnersAdded++;
  }
}

fs.writeFileSync(clientesPath, JSON.stringify(clientes, null, 2), 'utf-8');
console.log(`Clientes mirror updated: ${partnersAdded} novos parceiros cadastrados, ${partnersUpdated} atualizados.`);
