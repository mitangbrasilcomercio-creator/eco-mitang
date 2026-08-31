const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const ambiente = require('../scripts/lib/ambiente');

/**
 * ============================================================================
 * A TRILHA DE AUDITORIA REGISTRA O QUE PRECISA E NADA ALEM
 * ============================================================================
 *
 * [ERRO ANTERIOR]
 * A auditoria era por chamada de aplicacao. 'clientes_historico_alteracoes'
 * existe desde a migration 10, o codigo que escreve nela existe, e a tabela
 * esta VAZIA em producao. Alguem esqueceu de chamar e ninguem percebeu.
 *
 * Estes testes existem para que a mesma coisa nao possa acontecer de novo em
 * silencio: se o trigger sumir, for desligado numa tabela, ou parar de capturar
 * o contexto, o build quebra.
 *
 * Rodam contra o banco -- entram no grupo 'test:db'.
 * ============================================================================
 */

const ctx = ambiente.resolver({ papel: 'migration', args: [] });

async function conectar() {
  const c = new Client(ctx.configCliente());
  await c.connect();
  return c;
}

/**
 * Cria (ou reseta) uma empresa descartavel e devolve o id.
 *
 * O reset do nome importa: sem ele os testes ficam dependentes da ordem em que
 * rodam -- o segundo encontraria o nome que o primeiro deixou, e a suite
 * passaria ou falharia conforme o humor do runner.
 */
async function empresaDeTeste(c) {
  const cnpj = '11222333000181'; // valido no digito verificador
  const r = await c.query(
    `INSERT INTO empresas (cnpj, razao_social, nome_fantasia, ramo_atividade)
     VALUES ($1, 'TESTE AUDITORIA LTDA', 'Teste Auditoria', 'Manufatura Baterias')
     ON CONFLICT (cnpj) DO UPDATE
        SET nome_fantasia = 'Teste Auditoria',
            razao_social  = 'TESTE AUDITORIA LTDA',
            updated_at    = NOW()
     RETURNING id`,
    [cnpj]
  );
  return r.rows[0].id;
}

async function eventosDe(c, tabela, registroId) {
  const r = await c.query(
    `SELECT operacao, campos_alterados, dados_antes, dados_depois,
            usuario_id, usuario_email, motivo, origem
       FROM auditoria_eventos
      WHERE tabela = $1 AND registro_id = $2
      ORDER BY id`,
    [tabela, String(registroId)]
  );
  return r.rows;
}

// ---------------------------------------------------------------------------

test('INSERT e UPDATE viram evento, com os campos que mudaram', async () => {
  const c = await conectar();
  try {
    const id = await empresaDeTeste(c);
    await c.query('DELETE FROM auditoria_eventos WHERE tabela = $1 AND registro_id = $2',
      ['empresas', id]);

    await c.query("UPDATE empresas SET nome_fantasia = 'Teste Auditoria II' WHERE id = $1", [id]);

    const eventos = await eventosDe(c, 'empresas', id);
    assert.ok(eventos.length >= 1, 'o UPDATE nao gerou evento de auditoria');

    const ultimo = eventos[eventos.length - 1];
    assert.equal(ultimo.operacao, 'U');
    assert.ok(
      ultimo.campos_alterados.includes('nome_fantasia'),
      'campos_alterados deveria citar nome_fantasia, veio: ' + ultimo.campos_alterados
    );
    assert.equal(ultimo.dados_antes.nome_fantasia, 'Teste Auditoria');
    assert.equal(ultimo.dados_depois.nome_fantasia, 'Teste Auditoria II');
  } finally {
    await c.end();
  }
});

test('REGRESSAO: updated_at nao conta como alteracao', async () => {
  // Toda tabela tem updated_at e ele muda sempre. Se contasse, um UPDATE que
  // nao mudou nada geraria evento, e a trilha encheria de ruido ate a
  // informacao util ficar impossivel de achar.
  const c = await conectar();
  try {
    const id = await empresaDeTeste(c);
    await c.query('DELETE FROM auditoria_eventos WHERE tabela = $1 AND registro_id = $2',
      ['empresas', id]);

    // Grava exatamente o mesmo valor que ja esta la.
    await c.query(
      'UPDATE empresas SET nome_fantasia = nome_fantasia, updated_at = NOW() WHERE id = $1',
      [id]
    );

    const eventos = await eventosDe(c, 'empresas', id);
    assert.equal(
      eventos.length, 0,
      'UPDATE que nao mudou nada gerou evento -- a trilha vai encher de ruido'
    );
  } finally {
    await c.end();
  }
});

test('coluna de segredo nao e copiada para a trilha', async () => {
  // Guardar senha_hash na auditoria criaria uma segunda copia justamente do
  // que se esta protegendo -- e numa tabela que muita gente pode ler.
  const c = await conectar();
  try {
    const r = await c.query(
      `SELECT id FROM usuarios ORDER BY created_at LIMIT 1`
    );
    if (r.rows.length === 0) return; // banco sem usuario: nada a testar

    const id = r.rows[0].id;
    await c.query('DELETE FROM auditoria_eventos WHERE tabela = $1 AND registro_id = $2',
      ['usuarios', id]);
    await c.query("UPDATE usuarios SET nome = nome || '' , ativo = ativo WHERE id = $1", [id]);
    await c.query("UPDATE usuarios SET nome = nome || ' ' WHERE id = $1", [id]);

    const eventos = await eventosDe(c, 'usuarios', id);
    for (const e of eventos) {
      for (const lado of [e.dados_antes, e.dados_depois]) {
        if (!lado || !('senha_hash' in lado)) continue;
        assert.equal(
          lado.senha_hash, '[protegido]',
          'senha_hash foi copiada crua para a auditoria'
        );
      }
    }
  } finally {
    await c.end();
  }
});

test('o contexto de quem fez chega ao evento', async () => {
  const c = await conectar();
  try {
    const id = await empresaDeTeste(c);
    await c.query('DELETE FROM auditoria_eventos WHERE tabela = $1 AND registro_id = $2',
      ['empresas', id]);

    await c.query('BEGIN');
    await c.query("SELECT set_config('app.usuario_email', 'teste@eco-mitang.local', true)");
    await c.query("SELECT set_config('app.motivo', 'teste automatizado da trilha', true)");
    await c.query("SELECT set_config('app.origem', 'API', true)");
    await c.query("UPDATE empresas SET nome_fantasia = 'Teste Auditoria III' WHERE id = $1", [id]);
    await c.query('COMMIT');

    const eventos = await eventosDe(c, 'empresas', id);
    const ultimo = eventos[eventos.length - 1];
    assert.equal(ultimo.usuario_email, 'teste@eco-mitang.local');
    assert.equal(ultimo.motivo, 'teste automatizado da trilha');
    assert.equal(ultimo.origem, 'API');
  } finally {
    await c.end();
  }
});

test('escrita sem contexto e registrada como SCRIPT, nao perdida', async () => {
  // A ausencia de autor e ela mesma um dado: revela escrita que nao passou
  // pela API. Perder o evento seria pior que registrar sem autor.
  const c = await conectar();
  try {
    const id = await empresaDeTeste(c);
    await c.query('DELETE FROM auditoria_eventos WHERE tabela = $1 AND registro_id = $2',
      ['empresas', id]);
    await c.query("UPDATE empresas SET nome_fantasia = 'Teste Auditoria IV' WHERE id = $1", [id]);

    const eventos = await eventosDe(c, 'empresas', id);
    const ultimo = eventos[eventos.length - 1];
    assert.equal(ultimo.usuario_id, null);
    assert.equal(ultimo.origem, 'SCRIPT');
  } finally {
    await c.end();
  }
});

test('toda tabela de negocio tem o trigger, e a auditoria nao audita a si mesma', async () => {
  const c = await conectar();
  try {
    const semTrigger = await c.query(
      `SELECT c.relname
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname NOT IN ('auditoria_eventos', 'auditoria_acessos',
                                'schema_migrations', 'analytics_vendas_mensal',
                                'analytics_operacao_qualidade')
          AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                           WHERE t.tgrelid = c.oid AND t.tgname = 'trg_auditoria')
        ORDER BY 1`
    );
    assert.deepEqual(
      semTrigger.rows.map((r) => r.relname), [],
      'Tabela de negocio sem trigger de auditoria. Modulo sem trilha e divida ' +
      'que contamina os dados dele desde o primeiro dia.'
    );

    const naSiMesma = await c.query(
      `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'auditoria_eventos' AND t.tgname = 'trg_auditoria'`
    );
    assert.equal(naSiMesma.rows.length, 0, 'a auditoria esta auditando a si mesma: recursao');
  } finally {
    await c.end();
  }
});

test('a aplicacao nao pode reescrever nem apagar a trilha', async () => {
  // Trilha que se pode reescrever nao serve de trilha.
  const c = await conectar();
  try {
    const r = await c.query(
      `SELECT privilege_type FROM information_schema.table_privileges
        WHERE table_name = 'auditoria_eventos' AND grantee = 'eco_app'
        ORDER BY 1`
    );
    const privilegios = r.rows.map((x) => x.privilege_type);
    assert.ok(!privilegios.includes('UPDATE'), 'eco_app pode dar UPDATE na trilha');
    assert.ok(!privilegios.includes('DELETE'), 'eco_app pode dar DELETE na trilha');
    assert.ok(!privilegios.includes('INSERT'), 'eco_app pode inserir na trilha direto');
  } finally {
    await c.end();
  }
});

test('escrita pelo pool com contexto completo chega atribuida', async () => {
  // [ERRO ANTERIOR] O contexto de auditoria foi adicionado ao TenantContext e
  // ao pool, mas o tenantMiddleware nao o preenchia. Resultado: toda escrita
  // pela API era gravada sem autor, e a origem caia no fallback 'API' do
  // trigger -- o que fazia parecer que funcionava.
  //
  // O engano so apareceu porque um processo antigo do servidor continuava
  // segurando a porta 3000 e servindo a build anterior. Este teste nao depende
  // de servidor: exercita o pool direto.
  const { withTenantTransaction } = require('../dist/core/database/supabase-pool');
  const c = await conectar();
  try {
    // 'empresas' e somente-leitura para eco_app (migration 24): a UPDATE
    // passaria sem erro e sem efeito, e o teste falharia por motivo errado.
    // Usa uma tabela que a aplicacao de fato escreve.
    const alvo = await c.query(
      'SELECT id, empresa_id, cliente_contato FROM orcamentos_historico LIMIT 1'
    );
    if (alvo.rows.length === 0) return;
    const orc = alvo.rows[0];
    await c.query('DELETE FROM auditoria_eventos WHERE tabela = $1 AND registro_id = $2',
      ['orcamentos_historico', orc.id]);

    await withTenantTransaction(
      {
        empresaId: orc.empresa_id,
        empresaIds: [orc.empresa_id],
        userRole: 'Gestor_CLevel',
        usuarioEmail: 'trava@eco-mitang.local',
        ipOrigem: '203.0.113.9',
        origem: 'API'
      },
      async (cli) => {
        await cli.query(
          "UPDATE orcamentos_historico SET cliente_contato = $2 WHERE id = $1",
          [orc.id, String(orc.cliente_contato || '') + ' [trava]']
        );
      }
    );

    const ev = await eventosDe(c, 'orcamentos_historico', orc.id);
    assert.ok(ev.length >= 1, 'a escrita nao gerou evento');
    const ultimo = ev[ev.length - 1];
    assert.equal(ultimo.usuario_email, 'trava@eco-mitang.local',
      'o autor nao chegou ao evento -- o contexto de auditoria nao esta sendo aplicado');
    assert.equal(ultimo.origem, 'API');
  } finally {
    await c.end();
  }
});
