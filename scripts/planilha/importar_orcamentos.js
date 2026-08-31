#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * IMPORTA OS ORCAMENTOS DA PLANILHA PARA O BANCO
 * ============================================================================
 *
 * Nao e substituicao, e mesclagem por numero de orcamento -- que e a chave de
 * negocio da Mitang: o mesmo numero aparece na planilha, no Word, no PDF, na
 * nota fiscal e no boleto.
 *
 * O que a reconciliacao mostrou antes de escrever isto:
 *   220 orcamentos nos dois lados, nenhum entra, nenhum sai
 *   215 identicos
 *     5 divergem, e nos 5 a planilha tem MAIS itens -- a extracao anterior por
 *       PDF capturou uma linha de orcamentos com 2 a 4 produtos
 *   A diferenca de R$ 138.438,40 entre os totais e explicada ao centavo por
 *   esses 5. Sobra inexplicada: R$ 0,00.
 *
 * Entao esta importacao, na pratica, so acrescenta itens que faltavam e
 * preenche colunas que nao existiam.
 *
 * Tudo roda numa transacao. Em producao exige confirmacao digitada e backup.
 *
 * Uso:
 *   node scripts/planilha/importar_orcamentos.js              homologacao
 *   node scripts/planilha/importar_orcamentos.js --producao   producao
 *   node scripts/planilha/importar_orcamentos.js --simular    so mostra o plano
 * ============================================================================
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const ambiente = require('../lib/ambiente');
const backup = require('../lib/backup');

const ENTRADA = path.join(__dirname, '..', '..', 'local', 'planilhas', 'orcamentos-extraidos.json');
const args = process.argv.slice(2);
const simular = args.includes('--simular');

const brl = (n) =>
  'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A planilha diz 'Mitang' e 'Arandu'; o cadastro tem razao social completa. */
const EMPRESA_POR_CNPJ = { Mitang: '44221348000184', Arandu: '61349982000116' };

/**
 * '010526-2' -> base '010526', versao 2. O sufixo existe porque o cliente
 * pediu duas propostas ao mesmo tempo, em formatos diferentes, para o mesmo
 * negocio -- e Diego marcou as duas com o mesmo numero base.
 */
function separarVersao(numero) {
  const m = /^(.+?)-(\d+)$/.exec(String(numero || ''));
  return m ? { base: m[1], versao: Number(m[2]) } : { base: String(numero || ''), versao: 1 };
}

function agrupar(registros) {
  const porNumero = new Map();
  for (const r of registros) {
    if (!r.numero_orcamento) continue;
    if (!porNumero.has(r.numero_orcamento)) porNumero.set(r.numero_orcamento, []);
    porNumero.get(r.numero_orcamento).push(r);
  }
  return porNumero;
}

/** Monta a linha do banco a partir das N linhas de item da planilha. */
function montar(numero, linhas) {
  const p = linhas[0];
  const { base, versao } = separarVersao(numero);

  const itens = linhas.map((l, i) => ({
    sequencial: i + 1,
    pack_produto: l.pack,
    codigo_sku: l.codigo,
    quimica: l.quimica,
    quantidade: l.quantidade,
    valor_unitario: l.valor_unitario,
    valor_total_produtos: l.valor_mercadoria,
    desconto_percentual: l.desconto_pct,
    valor_frete: l.frete_bruto,
    base_desconto: l.base_desconto,
    valor_final_item: l.valor_final,
    tipo_nfe: l.tipo_nf,
    numero_nfe: l.numero_nf,
    prazo: l.prazo_dias,
    vencimento: l.vencimento,
    metodo_pagamento: l.metodo_pagamento,
    status_item: l.aprovado,
    situacao_item: l.situacao,
    pagamento_status: l.pagamento,
    po_cliente: l.po_cliente,
    data_aprovacao: l.data_aprovacao,
    observacao: l.observacao,
    fonte_linha: l.origem.linha
  }));

  const soma = (f) => linhas.reduce((a, l) => a + Number(f(l) || 0), 0);

  return {
    numero_orcamento: numero,
    numero_base: base,
    versao,
    padrao_numeracao: p.padrao_numeracao,
    cnpj_empresa: EMPRESA_POR_CNPJ[p.vendido_por] || null,
    vendido_por: p.vendido_por,
    data_emissao: p.data_emissao,
    // Mes e ano derivados da data, nunca digitados: era exatamente o campo
    // digitado que ficou errado em 20 linhas da planilha.
    mes_emissao: p.data_emissao ? p.data_emissao.slice(5, 7) : null,
    ano_emissao: p.data_emissao ? p.data_emissao.slice(0, 4) : null,
    cliente_nome: p.cliente_nome,
    cliente_cnpj_cpf: p.cliente_documento,
    cliente_contato: p.contato,
    status_aprovacao: p.aprovado || '-',
    orcamento_enviado: p.enviado || null,
    situacao_geral: p.situacao || null,
    valor_total: Math.round(soma((l) => l.valor_final) * 100) / 100,
    frete_bruto: Math.round(soma((l) => l.frete_bruto) * 100) / 100,
    desconto_pct: p.desconto_pct,
    base_desconto: linhas.map((l) => l.base_desconto).find(Boolean) || null,
    confiabilidade: p.confiabilidade,
    divergencia_data: p.divergencia_data || null,
    fonte_arquivo: p.origem.arquivo,
    fonte_linha: p.origem.linha,
    itens
  };
}

async function main() {
  const doc = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
  const ctx = ambiente.resolver({ papel: 'migration', args });
  ambiente.banner(ctx, 'Importacao de orcamentos a partir da planilha');

  const porNumero = agrupar(doc.orcamentos);
  const montados = [...porNumero.entries()].map(([n, ls]) => montar(n, ls));

  const semEmpresa = montados.filter((m) => !m.cnpj_empresa);
  if (semEmpresa.length) {
    console.error('[BLOQUEADO] Orcamento sem empresa reconhecida:');
    for (const m of semEmpresa.slice(0, 10))
      console.error('   ' + m.numero_orcamento + '  vendido_por=' + JSON.stringify(m.vendido_por));
    process.exit(1);
  }

  const c = new Client(ctx.configCliente());
  await c.connect();

  const empresas = new Map(
    (await c.query('SELECT id, cnpj FROM empresas')).rows.map((r) => [r.cnpj, r.id])
  );
  const antes = new Map(
    (await c.query('SELECT numero_orcamento, valor_total, jsonb_array_length(itens_json) itens FROM orcamentos_historico')).rows
      .map((r) => [r.numero_orcamento, r])
  );

  const vaiMudar = montados.filter((m) => {
    const a = antes.get(m.numero_orcamento);
    return !a || Math.abs(Number(a.valor_total) - m.valor_total) > 0.02 || a.itens !== m.itens.length;
  });

  console.log('  orcamentos na planilha : ' + montados.length);
  console.log('  ja no banco            : ' + antes.size);
  console.log('  mudam de valor ou itens: ' + vaiMudar.length);
  console.log('');
  for (const m of vaiMudar) {
    const a = antes.get(m.numero_orcamento);
    console.log('   ' + m.numero_orcamento.padEnd(17) + String(m.cliente_nome).slice(0, 26).padEnd(28) +
      (a ? brl(a.valor_total).padStart(15) + ' -> ' : 'novo '.padStart(19)) +
      brl(m.valor_total).padStart(15) +
      (a ? '   itens ' + a.itens + ' -> ' + m.itens.length : ''));
  }

  if (simular) {
    console.log('\n[SIMULACAO] Nada foi gravado.');
    await c.end();
    return;
  }

  await ambiente.confirmarSeProducao(ctx, {
    operacao: 'reescrever ' + montados.length + ' orcamentos a partir da planilha',
    args
  });

  if (ctx.ehProducao && !args.includes('--sem-backup')) {
    process.stdout.write('\nBackup antes de gravar ... ');
    const r = backup.dumpar(ctx, 'antes-de-importar-orcamentos');
    if (!r.ok) {
      console.log('FALHOU');
      console.error('[BLOQUEADO] ' + r.erro);
      await c.end();
      process.exit(1);
    }
    console.log('OK (' + (r.bytes / 1024).toFixed(0) + ' KB)');
  }

  let atualizados = 0, inseridos = 0;
  const agora = new Date().toISOString();

  try {
    await c.query('BEGIN');
    for (const m of montados) {
      const empresaId = empresas.get(m.cnpj_empresa);
      if (!empresaId) throw new Error('empresa nao cadastrada: ' + m.cnpj_empresa);

      const valores = [
        empresaId, m.numero_orcamento, m.vendido_por, m.data_emissao, m.mes_emissao,
        m.ano_emissao, m.cliente_nome, m.cliente_cnpj_cpf, m.cliente_contato,
        m.status_aprovacao, m.orcamento_enviado, m.situacao_geral, m.valor_total,
        JSON.stringify(m.itens), m.numero_base, m.versao, m.padrao_numeracao,
        m.frete_bruto, m.desconto_pct, m.base_desconto, m.confiabilidade,
        m.divergencia_data ? JSON.stringify(m.divergencia_data) : null,
        m.fonte_arquivo, m.fonte_linha, doc.fonte_sha256, agora
      ];

      const existente = await c.query(
        'SELECT id FROM orcamentos_historico WHERE numero_orcamento = $1', [m.numero_orcamento]
      );

      if (existente.rows.length) {
        await c.query(
          `UPDATE orcamentos_historico SET
             empresa_id=$1, vendido_por=$3, data_emissao=$4, mes_emissao=$5, ano_emissao=$6,
             cliente_nome=$7, cliente_cnpj_cpf=$8, cliente_contato=$9, status_aprovacao=$10,
             orcamento_enviado=$11, situacao_geral=$12, valor_total=$13, itens_json=$14::jsonb,
             numero_base=$15, versao=$16, padrao_numeracao=$17, frete_bruto=$18,
             desconto_pct=$19, base_desconto=$20, confiabilidade=$21,
             divergencia_data=$22::jsonb, fonte_arquivo=$23, fonte_linha=$24,
             fonte_hash=$25, importado_em=$26, updated_at=NOW()
           WHERE numero_orcamento=$2`, valores
        );
        atualizados++;
      } else {
        await c.query(
          `INSERT INTO orcamentos_historico (
             empresa_id, numero_orcamento, vendido_por, data_emissao, mes_emissao, ano_emissao,
             cliente_nome, cliente_cnpj_cpf, cliente_contato, status_aprovacao, orcamento_enviado,
             situacao_geral, valor_total, itens_json, numero_base, versao, padrao_numeracao,
             frete_bruto, desconto_pct, base_desconto, confiabilidade, divergencia_data,
             fonte_arquivo, fonte_linha, fonte_hash, importado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,
                   $21,$22::jsonb,$23,$24,$25,$26)`, valores
        );
        inseridos++;
      }
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('\n[ERRO] ' + e.message + '\n       Rollback aplicado: nada foi gravado.');
    await c.end();
    process.exit(1);
  }

  const depois = await c.query(
    'SELECT count(*)::int n, sum(valor_total) total, sum(jsonb_array_length(itens_json))::int itens FROM orcamentos_historico'
  );
  await c.end();

  console.log('\n  atualizados: ' + atualizados + ' | inseridos: ' + inseridos);
  console.log('  agora no banco: ' + depois.rows[0].n + ' orcamentos, ' +
              depois.rows[0].itens + ' itens, ' + brl(depois.rows[0].total));
}

main().catch((e) => { console.error('[ERRO FATAL]', e.message); process.exit(1); });
