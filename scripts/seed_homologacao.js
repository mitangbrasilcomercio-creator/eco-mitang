#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * DADOS MINIMOS DE HOMOLOGACAO
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * Os testes de isolamento multi-tenant (tests/rls-isolamento.test.js) so
 * rodavam contra producao, porque so producao tinha dado. Consequencia dupla:
 *   - a prova mais importante do projeto -- que um CNPJ nao enxerga o outro --
 *     ficava de fora do CI, que nao tem credencial de producao;
 *   - rodar 'npm test' significava abrir conexao na base real da empresa.
 *
 * [CORRECAO]
 * Fixtures deterministicas e reconheciveis: dois CNPJs ficticios, uma conta
 * bancaria em cada, e transacoes com valores distintos por tenant. E o
 * suficiente para provar isolamento de leitura, WITH CHECK na escrita, e
 * ausencia de vazamento sem contexto.
 *
 * Deliberadamente NAO e um espelho de producao. Para dado realista existe
 * 'npm run homolog:espelhar', que anonimiza. Este seed serve ao teste
 * automatizado, e teste precisa de entrada conhecida, nao de dado bonito.
 *
 * Recusa-se a rodar em producao -- inserir CNPJ ficticio na base real seria
 * exatamente o tipo de erro que o ambiente de homologacao existe para evitar.
 *
 * Uso: node scripts/seed_homologacao.js
 * ============================================================================
 */
const crypto = require('crypto');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const ambiente = require('./lib/ambiente');

const SENHA_PADRAO = 'homologacao';

const EMPRESAS = [
  {
    cnpj: '11111111000191',
    razao_social: 'Homologacao Alfa Industria LTDA',
    nome_fantasia: 'Homolog Alfa',
    ramo: 'Manufatura Baterias'
  },
  {
    cnpj: '22222222000172',
    razao_social: 'Homologacao Beta Servicos LTDA',
    nome_fantasia: 'Homolog Beta',
    ramo: 'Servicos Offshore'
  }
];

/**
 * Valores distintos por empresa de proposito: um teste que confunda os dois
 * tenants tem de produzir um numero visivelmente errado, nao um empate.
 */
const TRANSACOES = {
  '11111111000191': [
    { tipo: 'CREDIT', valor: 1500.0, memo: 'RECEBIMENTO CLIENTE ALFA', categoria: 'RECEITA_OPERACIONAL' },
    { tipo: 'DEBIT', valor: -400.0, memo: 'PAGTO FORNECEDOR ALFA', categoria: 'FORNECEDORES_OPERACIONAIS' },
    { tipo: 'DEBIT', valor: -35.5, memo: 'TARIFA BANCARIA', categoria: 'DESPESAS_BANCARIAS' }
  ],
  '22222222000172': [
    { tipo: 'CREDIT', valor: 900.0, memo: 'RECEBIMENTO CLIENTE BETA', categoria: 'RECEITA_OPERACIONAL' },
    { tipo: 'DEBIT', valor: -120.0, memo: 'PAGTO FORNECEDOR BETA', categoria: 'FORNECEDORES_OPERACIONAIS' }
  ]
};

const USUARIOS = [
  { email: 'gestor@homologacao.local', nome: 'Gestor Homologacao', papel: 'Gestor_CLevel', consolidada: true },
  { email: 'financeiro@homologacao.local', nome: 'Financeiro Homologacao', papel: 'Financeiro', consolidada: false },
  { email: 'vendedor@homologacao.local', nome: 'Vendedor Homologacao', papel: 'Vendedor', consolidada: false }
];

/** Hash estavel: rodar o seed duas vezes nao duplica linha. */
function hashIdempotencia(cnpj, t, indice) {
  return crypto
    .createHash('sha256')
    .update([cnpj, t.tipo, t.valor, t.memo, indice].join('|'))
    .digest('hex');
}

async function main() {
  const ctx = ambiente.resolver({ papel: 'migration' });
  ambiente.banner(ctx, 'Dados minimos de homologacao');

  if (ctx.ehProducao) {
    console.error('[RECUSADO] Este seed cria CNPJs ficticios. Ele nunca roda em producao.');
    process.exit(1);
  }

  const c = new Client(ctx.configCliente());
  await c.connect();

  try {
    await c.query('BEGIN');

    const idPorCnpj = {};
    for (const e of EMPRESAS) {
      const r = await c.query(
        `INSERT INTO empresas (cnpj, razao_social, nome_fantasia, ramo_atividade, ativo)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (cnpj) DO UPDATE SET razao_social = EXCLUDED.razao_social, ativo = TRUE
         RETURNING id;`,
        [e.cnpj, e.razao_social, e.nome_fantasia, e.ramo]
      );
      idPorCnpj[e.cnpj] = r.rows[0].id;
    }

    for (const e of EMPRESAS) {
      const empresaId = idPorCnpj[e.cnpj];

      const conta = await c.query(
        `INSERT INTO contas_bancarias
           (empresa_id, banco_codigo, banco_nome, agencia, conta_numero, tipo_conta, saldo_atual)
         VALUES ($1, '0341', 'Itau Unibanco', '0001', $2, 'CORRENTE', 0)
         ON CONFLICT (empresa_id, banco_codigo, agencia, conta_numero)
           DO UPDATE SET ativo = TRUE
         RETURNING id;`,
        [empresaId, e.cnpj.slice(0, 6)]
      );
      const contaId = conta.rows[0].id;

      let saldo = 0;
      const lista = TRANSACOES[e.cnpj];
      for (let i = 0; i < lista.length; i++) {
        const t = lista[i];
        saldo += t.valor;
        await c.query(
          `INSERT INTO transacoes_bancarias
             (empresa_id, conta_bancaria_id, bank_id, acct_id, fitid, tipo_operacao,
              data_lancamento, dtposted_raw, valor, memo, categoria_financeira,
              is_saldo_informativo, idempotency_hash)
           VALUES ($1, $2, '0341', $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11)
           ON CONFLICT (idempotency_hash) DO NOTHING;`,
          [
            empresaId,
            contaId,
            e.cnpj.slice(0, 6),
            'HML-' + e.cnpj.slice(0, 4) + '-' + i,
            t.tipo,
            '2026-0' + (i + 1) + '-15',
            '20260' + (i + 1) + '15120000[-3:BRT]',
            t.valor,
            t.memo,
            t.categoria,
            hashIdempotencia(e.cnpj, t, i)
          ]
        );
      }

      await c.query('UPDATE contas_bancarias SET saldo_atual = $2 WHERE id = $1;', [contaId, saldo]);
    }

    const hash = await bcrypt.hash(SENHA_PADRAO, 10);
    for (const u of USUARIOS) {
      const existente = await c.query('SELECT id FROM usuarios WHERE lower(email) = lower($1);', [u.email]);
      let id;
      if (existente.rows.length > 0) {
        id = existente.rows[0].id;
        await c.query(
          `UPDATE usuarios SET senha_hash = $2, papel = $3, nome = $4, ativo = TRUE,
                  pode_visao_consolidada = $5, tentativas_falhas = 0, bloqueado_ate = NULL
            WHERE id = $1;`,
          [id, hash, u.papel, u.nome, u.consolidada]
        );
      } else {
        const r = await c.query(
          `INSERT INTO usuarios (email, nome, senha_hash, papel, pode_visao_consolidada)
           VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
          [u.email, u.nome, hash, u.papel, u.consolidada]
        );
        id = r.rows[0].id;
      }

      await c.query(
        `INSERT INTO usuarios_empresas (usuario_id, empresa_id)
         SELECT $1, id FROM empresas WHERE ativo = TRUE
         ON CONFLICT DO NOTHING;`,
        [id]
      );
    }

    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  }

  const resumo = await c.query(`
    SELECT e.nome_fantasia,
           count(t.id)::int AS transacoes,
           COALESCE(sum(t.valor), 0)::float AS saldo
      FROM empresas e
      LEFT JOIN transacoes_bancarias t ON t.empresa_id = e.id
     GROUP BY e.nome_fantasia
     ORDER BY 1;
  `);
  await c.end();

  console.log('[OK] Fixtures aplicadas.\n');
  console.table(resumo.rows);
  console.log('  Usuarios: ' + USUARIOS.map((u) => u.email).join(', '));
  console.log('  Senha   : ' + SENHA_PADRAO + '\n');
}

main().catch((err) => {
  console.error('[ERRO] ' + err.message);
  process.exit(1);
});
