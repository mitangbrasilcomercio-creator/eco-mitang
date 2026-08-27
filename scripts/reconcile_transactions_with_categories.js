const fs = require('fs');

const txsPath = 'database/local_mirror/transacoes_bancarias.json';
const clientesPath = 'database/local_mirror/clientes.json';

const txs = JSON.parse(fs.readFileSync(txsPath, 'utf-8'));
const clientes = JSON.parse(fs.readFileSync(clientesPath, 'utf-8'));

// Build partner lookup
const partnersByName = {};
clientes.forEach(c => {
  partnersByName[(c.razao_social_nome || '').toLowerCase().trim()] = c;
});

let updatedCount = 0;
const categorizedStats = {};

txs.forEach(t => {
  if (t.is_saldo_informativo) return; // Skip CDI custody
  
  const memo = (t.memo || '').toLowerCase();
  const val = parseFloat(t.valor);
  
  let newCat = t.categoria_financeira;
  let matchedPartner = null;

  // Intercompany
  if (memo.includes('mitang') && t.empresa_id === '0754c882-d528-4d34-8c96-6d9af7e8d322') {
    newCat = 'INTERCOMPANY_HOLDING';
    matchedPartner = partnersByName['mitang brasil'] || { razao_social_nome: 'Mitang Brasil (Holding)', tipo_entidade: 'INTERCOMPANY' };
  } else if (memo.includes('arandu') && t.empresa_id === '29ea0857-7cf7-44e1-ba36-a3f323c4670c') {
    newCat = 'INTERCOMPANY_HOLDING';
    matchedPartner = partnersByName['arandu'] || { razao_social_nome: 'Arandu (Holding)', tipo_entidade: 'INTERCOMPANY' };
  }
  // Sócios
  else if (memo.includes('paulo cesar')) {
    if (val < 0) {
      newCat = Math.abs(val) >= 15000 ? 'SOCIOS_DIVIDENDOS' : 'SOCIOS_PRO_LABORE';
    } else {
      newCat = 'SOCIOS_APORTE';
    }
    matchedPartner = partnersByName['paulo cesar'];
  } else if (memo.includes('diego ribeiro') || memo.includes('diego r.')) {
    if (val < 0) {
      newCat = 'SOCIOS_PRO_LABORE';
    } else {
      newCat = 'SOCIOS_APORTE';
    }
    matchedPartner = partnersByName['diego ribeiro'];
  }
  // Colaboradores PJ
  else if (memo.includes('jandson')) {
    newCat = 'RECURSOS_HUMANOS_COLABORADOR_PJ';
    matchedPartner = partnersByName['jandson pereira de oliveira'];
  } else if (memo.includes('marcelo ferreira')) {
    newCat = 'RECURSOS_HUMANOS_COLABORADOR_PJ';
    matchedPartner = partnersByName['marcelo ferreira'];
  } else if (memo.includes('allan lope') || memo.includes('allan l.')) {
    newCat = 'RECURSOS_HUMANOS_COLABORADOR_PJ';
    matchedPartner = partnersByName['allan lourenço'];
  } else if (memo.includes('tom alves')) {
    newCat = 'RECURSOS_HUMANOS_COLABORADOR_PJ';
    matchedPartner = partnersByName['tom alves'];
  } else if (memo.includes('andrielly')) {
    newCat = 'RECURSOS_HUMANOS_COLABORADOR_PJ';
    matchedPartner = partnersByName['andrielly britto'];
  }
  // Benefícios
  else if (memo.includes('vr benef') || memo.includes('alimentac')) {
    newCat = 'RECURSOS_HUMANOS_BENEFICIO';
    matchedPartner = partnersByName['vr benefícios'];
  } else if (memo.includes('sulamerica')) {
    newCat = 'RECURSOS_HUMANOS_BENEFICIO';
    matchedPartner = partnersByName['sulamérica saúde'];
  } else if (memo.includes('bradesco vida')) {
    newCat = 'RECURSOS_HUMANOS_BENEFICIO';
    matchedPartner = partnersByName['bradesco vida e previdência'];
  }
  // Prestadores Contínuos
  else if (memo.includes('wpme') || memo.includes('contabil')) {
    newCat = 'PRESTADOR_SERVICOS_CONTABILIDADE';
    matchedPartner = partnersByName['wpme contabilidade'];
  } else if (memo.includes('karina dos santos')) {
    newCat = 'PRESTADOR_SERVICOS_GERAL';
    matchedPartner = partnersByName['karina dos santos'];
  } else if (memo.includes('certibrasil')) {
    newCat = 'PRESTADOR_SERVICOS_GERAL';
    matchedPartner = partnersByName['certibrasil certificadora'];
  } else if (memo.includes('c4 trein')) {
    newCat = 'PRESTADOR_SERVICOS_GERAL';
    matchedPartner = partnersByName['c4 treinamentos'];
  }
  // Fornecedores Insumos
  else if (memo.includes('strema')) {
    newCat = 'FORNECEDOR_MATERIA_PRIMA';
    matchedPartner = partnersByName['strema ind. com. de equip. eletrônicos'] || partnersByName['strema'];
  } else if (memo.includes('hayamax')) {
    newCat = 'FORNECEDOR_MATERIA_PRIMA';
    matchedPartner = partnersByName['hayamax distribuidora'];
  } else if (memo.includes('sbt embal')) {
    newCat = 'FORNECEDOR_MATERIA_PRIMA';
    matchedPartner = partnersByName['sbt embalagens'];
  }
  // Infraestrutura
  else if (memo.includes('prima') || memo.includes('cristiana garcia')) {
    newCat = 'INFRAESTRUTURA_ALUGUEL';
    matchedPartner = memo.includes('prima') ? partnersByName['prima imobiliária'] : partnersByName['cristiana garcia de britto'];
  } else if (memo.includes('light')) {
    newCat = 'INFRAESTRUTURA_ENERGIA_TELECOM';
    matchedPartner = partnersByName['light serviços de eletricidade'];
  } else if (memo.includes('vivo') || memo.includes('claro')) {
    newCat = 'INFRAESTRUTURA_ENERGIA_TELECOM';
    matchedPartner = memo.includes('vivo') ? partnersByName['vivo s.a.'] : partnersByName['claro s.a.'];
  }
  // Tributos
  else if (memo.includes('simples nacional')) {
    newCat = 'TRIBUTOS_FEDERAIS_SIMPLES';
    matchedPartner = partnersByName['receita federal do brasil'];
  } else if (memo.includes('receita federal') || memo.includes('darf') || memo.includes('inss')) {
    newCat = 'TRIBUTOS_DARF_INSS';
    matchedPartner = partnersByName['receita federal / inss'] || partnersByName['receita federal do brasil'];
  } else if (memo.includes('cef matriz') || memo.includes('fgts')) {
    newCat = 'TRIBUTOS_FGTS';
    matchedPartner = partnersByName['caixa econômica federal'];
  }
  // Empréstimo PRONAMPE
  else if (memo.includes('pronampe') || memo.includes('capital de giro') || (memo.includes('debito emprestimo') && val < -5000)) {
    newCat = 'EMPRESTIMOS_PRONAMPE';
    matchedPartner = partnersByName['banco bradesco (pronampe)'];
  }
  // Tarifas
  else if (memo.includes('tarifa') || memo.includes('tar/') || memo.includes('plano adapt') || memo.includes('max empresarial')) {
    newCat = 'TARIFAS_BANCARIAS';
  }

  if (newCat !== t.categoria_financeira || (matchedPartner && !t.nome_contraparte)) {
    t.categoria_financeira = newCat;
    if (matchedPartner) {
      t.nome_contraparte = matchedPartner.razao_social_nome;
      t.cliente_id = matchedPartner.id || t.cliente_id;
    }
    updatedCount++;
    categorizedStats[newCat] = (categorizedStats[newCat] || 0) + 1;
  }
});

console.log(`Reconciliadas ${updatedCount} transações com categorias corporativas reais!`);
console.log('Estatísticas:', categorizedStats);

fs.writeFileSync(txsPath, JSON.stringify(txs, null, 2), 'utf-8');
console.log('Salvo transacoes_bancarias.json com sucesso.');
