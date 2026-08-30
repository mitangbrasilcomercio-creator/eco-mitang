#!/usr/bin/env node
/**
 * ============================================================================
 * VERIFICACAO DE INTEGRIDADE FINANCEIRA
 * ============================================================================
 * Roda as provas que o README promete e que nunca eram conferidas de fato.
 * Sai com codigo != 0 se qualquer prova falhar -- serve para CI.
 *
 * Uso: node scripts/verificar_integridade.js
 * ============================================================================
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CA_PATH = path.join(__dirname, '..', 'database', 'certs', 'supabase-ca.crt');

function sslConfig() {
  if (process.env.DB_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
  try {
    return { ca: fs.readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

const brl = (n) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const provas = [];
function registrar(nome, ok, detalhe) {
  provas.push({ nome, ok, detalhe });
  console.log(`  ${ok ? '[ OK  ]' : '[FALHA]'} ${nome}`);
  if (detalhe) console.log(`          ${detalhe}`);
}

async function main() {
  // Usa o papel privilegiado: a auditoria precisa enxergar TODOS os tenants,
  // inclusive linhas orfas que a RLS esconderia de qualquer usuario.
  const client = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL,
    ssl: sslConfig(),
    connectionTimeoutMillis: 30000
  });
  await client.connect();

  console.log('======================================================================');
  console.log('        VERIFICACAO DE INTEGRIDADE - ECO-MITANG ERP                   ');
  console.log('======================================================================\n');

  try {
    // -------------------------------------------------------------------
    console.log('1. ISOLAMENTO MULTI-TENANT');
    // -------------------------------------------------------------------
    const cross = await client.query(`
      SELECT count(*)::int AS n
        FROM transacoes_bancarias t
        JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
       WHERE t.empresa_id <> c.empresa_id;`);
    registrar(
      'Nenhuma transacao com empresa_id diferente do titular da conta',
      cross.rows[0].n === 0,
      cross.rows[0].n > 0 ? `${cross.rows[0].n} transacoes cruzadas encontradas` : null
    );

    const semPermissiva = await client.query(`
      SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
         AND NOT EXISTS (
           SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polpermissive
         );`);
    registrar(
      'Nenhuma tabela com RLS ligada e sem policy PERMISSIVE (deny-all)',
      semPermissiva.rows.length === 0,
      semPermissiva.rows.length > 0
        ? `Tabelas em deny-all: ${semPermissiva.rows.map((r) => r.relname).join(', ')}`
        : null
    );

    const papel = await client.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'eco_app';`
    );
    registrar(
      "Papel 'eco_app' existe e nao ignora a RLS",
      papel.rows.length === 1 && !papel.rows[0].rolsuper && !papel.rows[0].rolbypassrls,
      papel.rows.length === 0 ? 'Papel eco_app nao encontrado' : null
    );

    // -------------------------------------------------------------------
    console.log('\n2. CLASSIFICACAO DO EXTRATO');
    // -------------------------------------------------------------------
    const saldoMalClassificado = await client.query(`
      SELECT count(*)::int AS n, COALESCE(SUM(valor), 0) AS soma
        FROM transacoes_bancarias
       WHERE is_saldo_informativo = FALSE
         AND (upper(unaccent_simples(memo)) LIKE 'SALDO%'
              OR upper(unaccent_simples(memo)) LIKE 'SDO %');`)
      .catch(async () => {
        // Sem a funcao auxiliar, compara direto (cobre os casos reais).
        return client.query(`
          SELECT count(*)::int AS n, COALESCE(SUM(valor), 0) AS soma
            FROM transacoes_bancarias
           WHERE is_saldo_informativo = FALSE
             AND (memo ILIKE 'SALDO%' OR memo ILIKE 'SDO %');`);
      });

    registrar(
      'Nenhuma linha de saldo contabilizada como movimentacao',
      saldoMalClassificado.rows[0].n === 0,
      saldoMalClassificado.rows[0].n > 0
        ? `${saldoMalClassificado.rows[0].n} linhas de saldo somando ${brl(saldoMalClassificado.rows[0].soma)} entrando no fluxo`
        : null
    );

    const rendimentos = await client.query(`
      SELECT count(*)::int AS n, COALESCE(SUM(valor), 0) AS soma
        FROM transacoes_bancarias
       WHERE categoria_financeira = 'RECEITA_FINANCEIRA_JUROS';`);
    registrar(
      'Rendimentos financeiros classificados e visiveis',
      rendimentos.rows[0].n > 0,
      `${rendimentos.rows[0].n} lancamentos, ${brl(rendimentos.rows[0].soma)}`
    );

    const rendimentoComoSweep = await client.query(`
      SELECT count(*)::int AS n
        FROM transacoes_bancarias
       WHERE categoria_financeira = 'APLICACAO_RESGATE_AUTOMATICO'
         AND (memo ILIKE '%REND%' OR memo ILIKE '%RENTAB%');`);
    registrar(
      'Nenhum rendimento classificado como varredura de liquidez',
      rendimentoComoSweep.rows[0].n === 0,
      rendimentoComoSweep.rows[0].n > 0
        ? `${rendimentoComoSweep.rows[0].n} lancamentos de rendimento marcados como custodia`
        : null
    );

    // -------------------------------------------------------------------
    console.log('\n3. TEOREMA DELTA (saldo do banco x soma dos lancamentos)');
    // -------------------------------------------------------------------
    const delta = await client.query(`
      SELECT c.banco_nome, c.conta_numero, c.saldo_atual,
             COALESCE(SUM(t.valor) FILTER (WHERE t.is_saldo_informativo = FALSE), 0) AS soma_movimentos,
             COUNT(t.id) FILTER (WHERE t.is_saldo_informativo = FALSE)               AS qtd
        FROM contas_bancarias c
        LEFT JOIN transacoes_bancarias t ON t.conta_bancaria_id = c.id
       GROUP BY c.id, c.banco_nome, c.conta_numero, c.saldo_atual
       ORDER BY c.banco_nome;`);

    console.log('');
    for (const r of delta.rows) {
      console.log(
        `          ${r.banco_nome} ${r.conta_numero}: saldo ${brl(r.saldo_atual)} | ` +
        `movimentos ${brl(r.soma_movimentos)} (${r.qtd} lancamentos)`
      );
    }

    // O extrato so cobre o periodo importado, entao saldo e soma nao coincidem
    // por si. A prova aqui e outra: a movimentacao nao pode estar em ordem de
    // grandeza absurda em relacao ao saldo -- foi assim que os R$ 40,8 mi de
    // linhas de saldo apareceram.
    const absurdos = delta.rows.filter((r) => {
      const saldo = Math.abs(Number(r.saldo_atual));
      const mov = Math.abs(Number(r.soma_movimentos));
      return saldo > 0 && mov > saldo * 50;
    });
    registrar(
      'Movimentacao em ordem de grandeza compativel com o saldo',
      absurdos.length === 0,
      absurdos.length > 0
        ? `Contas com movimentacao desproporcional: ${absurdos.map((a) => a.conta_numero).join(', ')}`
        : null
    );

    // -------------------------------------------------------------------
    console.log('\n4. IDEMPOTENCIA DA INGESTAO');
    // -------------------------------------------------------------------
    const importDup = await client.query(`
      SELECT arquivo_hash_sha256, conta_bancaria_id, count(*)::int AS vezes, min(nome_arquivo) AS arquivo
        FROM extratos_ofx_importacoes
       GROUP BY 1, 2 HAVING count(*) > 1;`);
    registrar(
      'Nenhum extrato OFX importado mais de uma vez na mesma conta',
      importDup.rows.length === 0,
      importDup.rows.length > 0
        ? importDup.rows.map((r) => `${r.arquivo} x${r.vezes}`).join(', ')
        : null
    );

    const constraint = await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'unq_ofx_arquivo_por_conta';`);
    registrar('Trava UNIQUE de reimportacao instalada', constraint.rows.length === 1);

    const trigger = await client.query(`
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_valida_tenant_transacao';`);
    registrar('Trigger de coerencia de tenant instalado', trigger.rows.length === 1);

    // -------------------------------------------------------------------
    console.log('\n5. MODELAGEM');
    // -------------------------------------------------------------------
    const obrig = await client.query(`SELECT count(*)::int AS n FROM obrigacoes_recorrentes;`);
    registrar(
      'Contas a pagar persistidas no banco (nao mais em JSON)',
      obrig.rows[0].n > 0,
      `${obrig.rows[0].n} obrigacoes cadastradas`
    );

    const usuarios = await client.query(`SELECT count(*)::int AS n FROM usuarios WHERE ativo;`);
    registrar('Existe ao menos um usuario ativo', usuarios.rows[0].n > 0, `${usuarios.rows[0].n} usuario(s)`);

    const migracoes = await client.query(`SELECT count(*)::int AS n FROM schema_migrations;`);
    registrar('Ledger de migrations populado', migracoes.rows[0].n > 0, `${migracoes.rows[0].n} migrations`);

    // -------------------------------------------------------------------
    const falhas = provas.filter((p) => !p.ok);
    console.log('\n======================================================================');
    console.log(`  ${provas.length - falhas.length}/${provas.length} provas passaram`);
    console.log('======================================================================\n');

    if (falhas.length > 0) {
      console.log('Provas que falharam:');
      falhas.forEach((f) => console.log(`  - ${f.nome}`));
      console.log('');
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[ERRO]', err.message);
  process.exit(1);
});
