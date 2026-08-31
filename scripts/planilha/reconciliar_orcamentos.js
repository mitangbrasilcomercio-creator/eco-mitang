#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * RECONCILIACAO: PLANILHA ORIGINAL x O QUE ESTA NO BANCO
 * ============================================================================
 *
 * Nao escreve nada. Compara os 325 orcamentos extraidos da planilha contra os
 * que estao em producao e produz o relatorio que precisa ser lido ANTES de
 * qualquer substituicao.
 *
 * A pergunta que ele responde: "se eu trocar os 220 do banco pelos 325 da
 * planilha, o que exatamente muda?"
 *
 * Uso:
 *   node scripts/planilha/reconciliar_orcamentos.js --producao
 *   node scripts/planilha/reconciliar_orcamentos.js --producao --json > saida.json
 * ============================================================================
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const ambiente = require('../lib/ambiente');

const ENTRADA = path.join(__dirname, '..', '..', 'local', 'planilhas', 'orcamentos-extraidos.json');
const soJson = process.argv.includes('--json');

const brl = (n) =>
  'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalizarNumero(n) {
  if (!n) return null;
  const s = String(n).trim();
  return /^\d{4,6}$/.test(s) ? s.padStart(6, '0') : s;
}

async function main() {
  const doc = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
  const ctx = ambiente.resolver({ papel: 'migration' });
  if (!soJson) ambiente.banner(ctx, 'Reconciliacao planilha x banco (somente leitura)');

  const c = new Client(ctx.configCliente());
  await c.connect();
  const { rows } = await c.query(
    `SELECT numero_orcamento, cliente_nome, valor_total, vendido_por, ano_emissao, itens_json
       FROM orcamentos_historico`
  );
  await c.end();

  // ---- agrupa os dois lados pelo numero do orcamento --------------------
  const daPlanilha = new Map();
  for (const o of doc.orcamentos) {
    const k = normalizarNumero(o.numero_orcamento);
    if (!k) continue;
    if (!daPlanilha.has(k)) daPlanilha.set(k, []);
    daPlanilha.get(k).push(o);
  }

  const doBanco = new Map();
  for (const r of rows) {
    const k = normalizarNumero(r.numero_orcamento);
    if (!k) continue;
    if (!doBanco.has(k)) doBanco.set(k, []);
    doBanco.get(k).push(r);
  }

  const soma = (xs, f) => xs.reduce((a, x) => a + Number(f(x) || 0), 0);

  const iguais = [], mudam = [], novos = [], somemNoBanco = [];

  for (const [numero, linhas] of daPlanilha) {
    const noBanco = doBanco.get(numero);
    const vPlan = soma(linhas, (x) => x.valor_final);
    if (!noBanco) {
      novos.push({ numero, cliente: linhas[0].cliente_nome, valor: vPlan,
                   linhas: linhas.length, competencia: linhas[0].competencia });
      continue;
    }
    const vBanco = soma(noBanco, (x) => x.valor_total);
    const delta = vPlan - vBanco;
    const registro = {
      numero,
      cliente_planilha: linhas[0].cliente_nome,
      cliente_banco: noBanco[0].cliente_nome,
      valor_planilha: vPlan,
      valor_banco: vBanco,
      delta,
      linhas_planilha: linhas.length,
      linhas_banco: noBanco.length,
      cliente_mudou: String(linhas[0].cliente_nome).slice(0, 12).toLowerCase() !==
                     String(noBanco[0].cliente_nome).slice(0, 12).toLowerCase()
    };
    if (Math.abs(delta) <= 0.02 && !registro.cliente_mudou) iguais.push(registro);
    else mudam.push(registro);
  }

  for (const [numero, linhas] of doBanco) {
    if (!daPlanilha.has(numero)) {
      somemNoBanco.push({ numero, cliente: linhas[0].cliente_nome,
                          valor: soma(linhas, (x) => x.valor_total), ano: linhas[0].ano_emissao });
    }
  }

  mudam.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  somemNoBanco.sort((a, b) => b.valor - a.valor);
  novos.sort((a, b) => b.valor - a.valor);

  const resumo = {
    gerado_em: new Date().toISOString(),
    fonte_sha256: doc.fonte_sha256,
    planilha: {
      registros: doc.total,
      orcamentos_distintos: daPlanilha.size,
      valor_total: soma(doc.orcamentos, (x) => x.valor_final)
    },
    banco: {
      registros: rows.length,
      orcamentos_distintos: doBanco.size,
      valor_total: soma(rows, (x) => x.valor_total)
    },
    iguais: iguais.length,
    mudam: mudam.length,
    novos: novos.length,
    somem_do_banco: somemNoBanco.length,
    avisos: doc.avisos,
    detalhe: { mudam, novos: novos.slice(0, 40), somem: somemNoBanco.slice(0, 40) }
  };

  if (soJson) {
    process.stdout.write(JSON.stringify(resumo, null, 1));
    return;
  }

  const L = '='.repeat(74);
  console.log(L);
  console.log('  PLANILHA                       BANCO');
  console.log(L);
  console.log('  registros      %s          %s'.replace('%s', String(resumo.planilha.registros).padEnd(6)).replace('%s', resumo.banco.registros));
  console.log('  orcamentos     ' + String(resumo.planilha.orcamentos_distintos).padEnd(6) + '          ' + resumo.banco.orcamentos_distintos);
  console.log('  valor total    ' + brl(resumo.planilha.valor_total).padEnd(20) + brl(resumo.banco.valor_total));
  console.log(L);
  console.log('  identicos nos dois lados : ' + resumo.iguais);
  console.log('  mudam de valor ou cliente: ' + resumo.mudam);
  console.log('  so na planilha (entram)  : ' + resumo.novos);
  console.log('  so no banco (saem)       : ' + resumo.somem_do_banco);
  console.log(L);

  console.log('\n--- MUDAM (as 20 maiores diferencas) ---');
  for (const m of mudam.slice(0, 20)) {
    console.log('  ' + m.numero + '  ' + String(m.cliente_planilha).slice(0, 26).padEnd(28) +
      'banco ' + brl(m.valor_banco).padStart(15) + '  ->  planilha ' + brl(m.valor_planilha).padStart(15) +
      '   ' + (m.delta >= 0 ? '+' : '') + brl(m.delta));
    if (m.cliente_mudou) console.log('        cliente muda: "' + m.cliente_banco + '" -> "' + m.cliente_planilha + '"');
    if (m.linhas_planilha !== m.linhas_banco)
      console.log('        itens: ' + m.linhas_banco + ' no banco -> ' + m.linhas_planilha + ' na planilha');
  }

  console.log('\n--- SO NO BANCO: sairiam na substituicao (' + somemNoBanco.length + ') ---');
  for (const s of somemNoBanco.slice(0, 20))
    console.log('  ' + s.numero + '  ' + String(s.cliente).slice(0, 30).padEnd(32) + brl(s.valor).padStart(15) + '   ano ' + s.ano);

  console.log('\n--- SO NA PLANILHA: entrariam (' + novos.length + ') ---');
  for (const n of novos.slice(0, 15))
    console.log('  ' + n.numero + '  ' + String(n.cliente).slice(0, 30).padEnd(32) + brl(n.valor).padStart(15) + '   ' + n.competencia);
}

main().catch((e) => { console.error('[ERRO]', e.message); process.exit(1); });
