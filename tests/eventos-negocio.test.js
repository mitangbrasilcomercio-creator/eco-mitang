const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const ambiente = require('../scripts/lib/ambiente');

/**
 * ============================================================================
 * O LIVRO DE EVENTOS GUARDA AS DUAS DATAS E RECUSA O QUE NAO PODE ACONTECER
 * ============================================================================
 *
 * [O PEDIDO]
 * "Permitir alteracoes de estado -- e pegar quando que eu atualizei isso, ou
 *  se foi pago em um dia que eu nao tinha visto: foi pago semana passada e eu
 *  nao vi." (Diego, 06/09/2026)
 *
 * Duas datas diferentes, e confundi-las corrompe o caixa em silencio:
 *   ocorrido_em    -- quando o dinheiro entrou / o cliente aprovou
 *   registrado_em  -- quando alguem digitou
 *
 * [POR QUE ESTES TESTES EXISTEM]
 * A regra em prosa e ignorada; a regra que quebra o build e obedecida. Se
 * alguem afrouxar a validacao -- aceitar data futura, deixar dar baixa sem
 * comprovante, permitir UPDATE no livro -- estes testes falham.
 *
 * Rodam contra o banco: grupo 'test:db'.
 * Os eventos que eles criam FICAM no livro (append-only vale para o teste
 * tambem) com entidade 'teste_automatizado' -- nenhuma consulta de negocio
 * olha para essa entidade.
 * ============================================================================
 */

const ctx = ambiente.resolver({ papel: 'migration', args: [] });
const ENTIDADE = 'teste_automatizado';

async function conectar() {
  const c = new Client(ctx.configCliente());
  await c.connect();
  return c;
}

function idNovo() {
  return 'T-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function empresaQualquer(c) {
  const r = await c.query('SELECT id FROM empresas ORDER BY created_at LIMIT 1');
  assert.ok(r.rows.length, 'e preciso ao menos uma empresa cadastrada');
  return r.rows[0].id;
}

/** As regras da entidade de teste: criadas uma vez, vigentes desde sempre. */
async function garantirRegras(c) {
  await c.query(
    `INSERT INTO transicoes_permitidas
       (entidade, estado_de, tipo_evento, estado_para, exige_prova, exige_justificativa,
        dias_retroativos_livres, rotulo, vigencia_inicio)
     VALUES
       ($1,'INEXISTENTE','ABRIR','ABERTO', false,false,3650,'Abrir','2020-01-01'),
       ($1,'ABERTO','FECHAR','FECHADO', false,false,30,'Fechar','2020-01-01'),
       ($1,'ABERTO','PAGAR', 'PAGO',    true, false,30,'Pagar','2020-01-01'),
       ($1,'FECHADO','REABRIR','ABERTO',false,true, 30,'Reabrir','2020-01-01')
     ON CONFLICT (entidade, estado_de, tipo_evento) DO NOTHING`,
    [ENTIDADE]
  );
}

async function registrar(c, campos) {
  const base = {
    empresa_id: campos.empresa_id,
    entidade: ENTIDADE,
    entidade_id: campos.entidade_id,
    tipo_evento: campos.tipo_evento,
    estado_anterior: campos.estado_anterior,
    estado_novo: 'IGNORADO',            // o banco sobrescreve a partir da regra
    ocorrido_em: campos.ocorrido_em,
    autor: campos.autor || 'teste@bateriasmitang.com.br',
    origem: campos.origem || 'SCRIPT',
    documento_ref: campos.documento_ref || null,
    justificativa: campos.justificativa || null,
    dados: JSON.stringify(campos.dados || {}),
    chave_idempotencia: campos.chave_idempotencia || null
  };
  return c.query(
    `INSERT INTO eventos_negocio
       (empresa_id, entidade, entidade_id, tipo_evento, estado_anterior, estado_novo,
        ocorrido_em, autor, origem, documento_ref, justificativa, dados, chave_idempotencia)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, estado_novo, ocorrido_em, registrado_data, defasagem_dias`,
    Object.values(base)
  );
}

/** Toda entidade entra no livro por um evento de abertura. */
async function abrir(c, empresa, alvo, ocorrido) {
  return registrar(c, {
    empresa_id: empresa, entidade_id: alvo, tipo_evento: 'ABRIR',
    estado_anterior: null, ocorrido_em: ocorrido
  });
}

const hojeMenos = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

test('o estado atual e o ultimo evento, e as duas datas ficam separadas', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    const alvo = idNovo();

    await abrir(c, empresa, alvo, hojeMenos(20));
    const r = await registrar(c, {
      empresa_id: empresa, entidade_id: alvo, tipo_evento: 'FECHAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(6)
    });

    // O destino vem da regra, nao de quem escreveu.
    assert.equal(r.rows[0].estado_novo, 'FECHADO');
    // "Foi feito semana passada e eu nao vi": seis dias de defasagem.
    assert.equal(r.rows[0].defasagem_dias, 6);

    const estado = await c.query('SELECT fn_estado_atual($1,$2) AS e', [ENTIDADE, alvo]);
    assert.equal(estado.rows[0].e, 'FECHADO');

    const vista = await c.query(
      'SELECT estado, defasagem_dias FROM vw_estado_atual WHERE entidade=$1 AND entidade_id=$2',
      [ENTIDADE, alvo]
    );
    assert.equal(vista.rows[0].estado, 'FECHADO');
    assert.equal(vista.rows[0].defasagem_dias, 6);
  } finally { await c.end(); }
});

test('transicao que nao esta na tabela de regras nao acontece', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    await assert.rejects(
      () => registrar(c, {
        empresa_id: empresa, entidade_id: idNovo(), tipo_evento: 'INVENTADO',
        estado_anterior: null, ocorrido_em: hojeMenos(0)
      }),
      /TRANSICAO_INVALIDA/
    );
  } finally { await c.end(); }
});

test('nao se registra o futuro como fato', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    await assert.rejects(
      () => registrar(c, {
        empresa_id: empresa, entidade_id: idNovo(), tipo_evento: 'FECHAR',
        estado_anterior: null, ocorrido_em: hojeMenos(-3)
      }),
      /DATA_NO_FUTURO/
    );
  } finally { await c.end(); }
});

test('dar baixa sem a prova e recusado', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    const alvo = idNovo();
    await abrir(c, empresa, alvo, hojeMenos(10));
    await assert.rejects(
      () => registrar(c, {
        empresa_id: empresa, entidade_id: alvo, tipo_evento: 'PAGAR',
        estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(1)
      }),
      /PROVA_OBRIGATORIA/
    );
    // com o comprovante, entra
    const ok = await registrar(c, {
      empresa_id: empresa, entidade_id: alvo, tipo_evento: 'PAGAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(1),
      documento_ref: 'Clientes/WAMS/070826 - Comprovante 2.pdf'
    });
    assert.equal(ok.rows[0].estado_novo, 'PAGO');
  } finally { await c.end(); }
});

test('retroagir muito exige motivo; pouco nao', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);

    const a1 = idNovo(); await abrir(c, empresa, a1, hojeMenos(300));
    await assert.rejects(
      () => registrar(c, {
        empresa_id: empresa, entidade_id: a1, tipo_evento: 'FECHAR',
        estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(200)
      }),
      /RETROATIVO_SEM_MOTIVO/
    );

    const a2 = idNovo(); await abrir(c, empresa, a2, hojeMenos(300));
    const comMotivo = await registrar(c, {
      empresa_id: empresa, entidade_id: a2, tipo_evento: 'FECHAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(200),
      justificativa: 'lancamento historico da carga inicial da planilha'
    });
    assert.equal(comMotivo.rows[0].defasagem_dias, 200);
  } finally { await c.end(); }
});

test('justificativa obrigatoria quando a regra pede', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    const alvo = idNovo();
    await abrir(c, empresa, alvo, hojeMenos(5));
    await registrar(c, {
      empresa_id: empresa, entidade_id: alvo, tipo_evento: 'FECHAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(0)
    });
    await assert.rejects(
      () => registrar(c, {
        empresa_id: empresa, entidade_id: alvo, tipo_evento: 'REABRIR',
        estado_anterior: 'FECHADO', ocorrido_em: hojeMenos(0)
      }),
      /JUSTIFICATIVA_OBRIGATORIA/
    );
  } finally { await c.end(); }
});

test('quem mudou antes de voce ganha: o estado anterior tem de bater', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    const alvo = idNovo();
    await abrir(c, empresa, alvo, hojeMenos(3));
    await registrar(c, {
      empresa_id: empresa, entidade_id: alvo, tipo_evento: 'FECHAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(0)
    });
    // uma segunda tela, que ainda achava que estava ABERTO
    await assert.rejects(
      () => registrar(c, {
        empresa_id: empresa, entidade_id: alvo, tipo_evento: 'FECHAR',
        estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(0)
      }),
      /CONFLITO_DE_ESTADO/
    );
  } finally { await c.end(); }
});

/**
 * Duas travas diferentes protegem o importador, e e bom saber qual pega quando:
 *   - reprocessamento sequencial: a maquina de estados barra (a parcela ja esta PAGA);
 *   - corrida entre dois importadores: o indice unico de idempotencia barra.
 * O teste prova que a segunda tentativa nao entra, e que o indice existe.
 */
test('o importador roda duas vezes e nao duplica', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    const alvo = idNovo();
    const chave = 'ofx:0341:2927986634:2026-09-02:2372.70';
    await abrir(c, empresa, alvo, hojeMenos(9));

    await registrar(c, {
      empresa_id: empresa, entidade_id: alvo, tipo_evento: 'PAGAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(4), origem: 'IMPORTADOR',
      documento_ref: 'Extratos/2026/Itau/agosto.ofx', chave_idempotencia: chave
    });

    await assert.rejects(
      () => registrar(c, {
        empresa_id: empresa, entidade_id: alvo, tipo_evento: 'PAGAR',
        estado_anterior: 'PAGO', ocorrido_em: hojeMenos(4), origem: 'IMPORTADOR',
        documento_ref: 'Extratos/2026/Itau/agosto.ofx', chave_idempotencia: chave
      }),
      /TRANSICAO_INVALIDA|duplicate key|uq_evento_idempotencia/
    );

    const indice = await c.query(
      "SELECT 1 FROM pg_indexes WHERE indexname = 'uq_evento_idempotencia'"
    );
    assert.equal(indice.rows.length, 1, 'a segunda trava (idempotencia) tem de existir');

    const n = await c.query(
      "SELECT count(*)::int AS n FROM eventos_negocio WHERE entidade=$1 AND entidade_id=$2 AND tipo_evento='PAGAR'",
      [ENTIDADE, alvo]
    );
    assert.equal(n.rows[0].n, 1);
  } finally { await c.end(); }
});

test('evento nao se altera nem se apaga -- nem em teste', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    const alvo = idNovo();
    await abrir(c, empresa, alvo, hojeMenos(1));
    const r = await registrar(c, {
      empresa_id: empresa, entidade_id: alvo, tipo_evento: 'FECHAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(0)
    });
    const id = r.rows[0].id;

    await assert.rejects(
      () => c.query('UPDATE eventos_negocio SET ocorrido_em = $1 WHERE id = $2', [hojeMenos(30), id]),
      /EVENTO_IMUTAVEL/
    );
    await assert.rejects(
      () => c.query('DELETE FROM eventos_negocio WHERE id = $1', [id]),
      /EVENTO_IMUTAVEL/
    );
  } finally { await c.end(); }
});

test('estorno e evento inverso: o original permanece', async () => {
  const c = await conectar();
  try {
    await garantirRegras(c);
    const empresa = await empresaQualquer(c);
    const alvo = idNovo();

    await abrir(c, empresa, alvo, hojeMenos(8));
    const original = await registrar(c, {
      empresa_id: empresa, entidade_id: alvo, tipo_evento: 'FECHAR',
      estado_anterior: 'ABERTO', ocorrido_em: hojeMenos(2)
    });

    await c.query(
      `INSERT INTO eventos_negocio
         (empresa_id, entidade, entidade_id, tipo_evento, estado_anterior, estado_novo,
          ocorrido_em, autor, origem, justificativa, reverte_evento_id)
       VALUES ($1,$2,$3,'REABRIR','FECHADO','IGNORADO',CURRENT_DATE,$4,'TELA',$5,$6)`,
      [empresa, ENTIDADE, alvo, 'teste@bateriasmitang.com.br',
       'estorno: o pagamento voltou pelo banco', original.rows[0].id]
    );

    const estado = await c.query('SELECT fn_estado_atual($1,$2) AS e', [ENTIDADE, alvo]);
    assert.equal(estado.rows[0].e, 'ABERTO');

    const historico = await c.query(
      'SELECT count(*)::int AS n FROM eventos_negocio WHERE entidade=$1 AND entidade_id=$2',
      [ENTIDADE, alvo]
    );
    assert.equal(historico.rows[0].n, 3, 'abertura, fechamento e estorno: nada some');
  } finally { await c.end(); }
});

test('a aplicacao nao tem privilegio para alterar nem apagar o livro', async () => {
  const c = await conectar();
  try {
    // A primeira tranca e o trigger (teste acima). Esta e a segunda: o papel da
    // aplicacao simplesmente nao tem o privilegio. Migrations anteriores dao
    // privilegio amplo a eco_app por default privileges do schema -- por isso a
    // 33 revoga explicitamente. Se alguem reconceder, este teste falha.
    const r = await c.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee='eco_app' AND table_name='eventos_negocio'
        ORDER BY privilege_type`
    );
    const privilegios = r.rows.map((x) => x.privilege_type);
    assert.deepEqual(privilegios, ['INSERT', 'SELECT']);

    const t = await c.query(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee='eco_app' AND table_name='transicoes_permitidas'
        ORDER BY privilege_type`
    );
    assert.deepEqual(t.rows.map((x) => x.privilege_type), ['SELECT'],
      'regra de transicao so muda por migration');
  } finally { await c.end(); }
});
