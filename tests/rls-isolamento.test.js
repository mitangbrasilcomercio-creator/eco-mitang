const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const {
  withTenantQuery,
  withTenantTransaction,
  contextoTodosTenants,
  encerrarPool,
  pgPool
} = require('../dist/core/database/supabase-pool');

/**
 * ============================================================================
 * TESTES DE ISOLAMENTO MULTI-TENANT (RLS)
 * ============================================================================
 * Tocam o banco real. Provam a correcao mais importante do projeto: as policies
 * antigas eram todas RESTRICTIVE sem nenhuma PERMISSIVE, o que no PostgreSQL
 * significa negar tudo -- e nao filtrar por tenant. Como a aplicacao conectava
 * como 'postgres' (BYPASSRLS), a RLS era simplesmente ignorada e o isolamento
 * nao existia em lugar nenhum.
 *
 * Se APP_DATABASE_URL nao apontar para um papel sem BYPASSRLS, estes testes
 * falham -- que e o comportamento desejado.
 * ============================================================================
 */

let empresas = [];

test.before(async () => {
  const ctx = await contextoTodosTenants();
  empresas = ctx.empresaIds;
});

test.after(async () => {
  await encerrarPool();
});

test('a aplicacao NAO conecta com um papel que ignora a RLS', async () => {
  const r = await pgPool.query(
    'SELECT current_user AS usuario, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS ignora_rls;'
  );
  assert.equal(
    r.rows[0].ignora_rls,
    false,
    `Conectado como '${r.rows[0].usuario}', que ignora a RLS. Configure APP_DATABASE_URL com o papel eco_app.`
  );
});

test('cada tenant enxerga apenas as proprias transacoes', async () => {
  assert.ok(empresas.length >= 2, 'o teste precisa de ao menos 2 CNPJs cadastrados');
  const [a, b] = empresas;

  const contar = (empresaId) =>
    withTenantQuery({ empresaId, empresaIds: [empresaId] }, async (c) => {
      const r = await c.query('SELECT count(*)::int AS n FROM transacoes_bancarias;');
      return r.rows[0].n;
    });

  const nA = await contar(a);
  const nB = await contar(b);

  const consolidado = await withTenantQuery(
    { empresaId: a, empresaIds: [a, b], userRole: 'Gestor_CLevel' },
    async (c) => (await c.query('SELECT count(*)::int AS n FROM transacoes_bancarias;')).rows[0].n
  );

  // A visao consolidada e exatamente a soma -- nem a mais (vazamento), nem a
  // menos (linha invisivel para todos).
  assert.equal(consolidado, nA + nB, 'a visao consolidada deve ser a soma exata dos tenants');
});

test('sem contexto de tenant, nenhuma linha e visivel', async () => {
  // pgPool.query nao passa por withTenantQuery, entao app.empresa_ids fica vazio.
  const r = await pgPool.query('SELECT count(*)::int AS n FROM transacoes_bancarias;');
  assert.equal(r.rows[0].n, 0, 'consulta sem contexto de tenant nao pode devolver linhas');
});

test('escrita com empresa_id de outro tenant e rejeitada pelo WITH CHECK', async () => {
  const [a, b] = empresas;
  await assert.rejects(
    () =>
      withTenantTransaction({ empresaId: a, empresaIds: [a] }, async (c) => {
        await c.query(
          `INSERT INTO clientes (empresa_id, razao_social_nome, cnpj_cpf)
           VALUES ($1, 'TESTE RLS - NAO DEVE GRAVAR', '00000000000191');`,
          [b] // tenant diferente do contexto
        );
      }),
    /row-level security/i,
    'a policy precisa recusar gravacao em outro CNPJ'
  );
});

test('leitura de outro tenant devolve vazio, nao erro', async () => {
  const [a, b] = empresas;

  const idDeB = await withTenantQuery({ empresaId: b, empresaIds: [b] }, async (c) => {
    const r = await c.query('SELECT id FROM clientes LIMIT 1;');
    return r.rows[0]?.id ?? null;
  });

  if (!idDeB) return; // sem dados nesse tenant, nada a provar

  const visto = await withTenantQuery({ empresaId: a, empresaIds: [a] }, async (c) => {
    const r = await c.query('SELECT id FROM clientes WHERE id = $1;', [idDeB]);
    return r.rows.length;
  });

  assert.equal(visto, 0, 'um cliente de outro CNPJ nao pode aparecer nem por id direto');
});

test('trigger de coerencia recusa transacao no CNPJ errado', async () => {
  const [a, b] = empresas;

  // Pega uma conta bancaria do tenant A.
  const conta = await withTenantQuery({ empresaId: a, empresaIds: [a] }, async (c) => {
    const r = await c.query('SELECT id FROM contas_bancarias LIMIT 1;');
    return r.rows[0]?.id ?? null;
  });
  if (!conta) return;

  // Tenta gravar um lancamento dessa conta marcado como do tenant B.
  await assert.rejects(
    () =>
      withTenantTransaction({ empresaId: b, empresaIds: [b] }, async (c) => {
        await c.query(
          `INSERT INTO transacoes_bancarias (
             empresa_id, conta_bancaria_id, bank_id, acct_id, fitid, tipo_operacao,
             data_lancamento, dtposted_raw, valor, memo, idempotency_hash
           ) VALUES ($1, $2, '0341', '999', 'TESTE', 'CREDIT', CURRENT_DATE, '20260101', 1.00,
                     'TESTE TRIGGER', 'hash-de-teste-' || gen_random_uuid());`,
          [b, conta]
        );
      }),
    /INTEGRIDADE MULTI-TENANT|row-level security/i,
    'a conta bancaria precisa ditar o CNPJ do lancamento'
  );
});
