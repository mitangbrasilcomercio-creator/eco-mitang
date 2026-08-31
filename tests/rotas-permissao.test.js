const test = require('node:test');
const assert = require('node:assert/strict');

// A app precisa de JWT_SECRET para carregar; nos testes basta um valor valido.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'segredo-apenas-para-teste-de-rotas-com-mais-de-32-caracteres';

const { app } = require('../dist/app');

/**
 * ============================================================================
 * TRAVA DE REGRESSAO DE SEGURANCA
 * ============================================================================
 *
 * [ERRO ANTERIOR]: 'exigirPapel' existia e estava aplicado em 2 de 30 rotas.
 * As outras 28 tinham apenas autenticacao e isolamento de tenant -- entao um
 * usuario 'Vendedor' autenticado lia o extrato bancario completo, o resumo de
 * caixa e a DRE consolidada da holding. O tenant estava isolado; a funcao nao.
 *
 * O problema nao foi falta de mecanismo, foi falta de aplicacao. Depender de
 * alguem lembrar de escrever 'exigirPapel' em cada rota nova garante que a
 * falha volta.
 *
 * [CORRECAO]: este teste percorre o router do Express e falha o build quando
 * uma rota de dado nao declara papel. Rota nova sem permissao nao passa no CI.
 * ============================================================================
 */

/** Rotas publicas por natureza -- a porta de entrada e o healthcheck. */
const PUBLICAS = new Set([
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'GET /health'
]);

/**
 * Webhooks nao usam JWT: sao autenticados por segredo compartilhado
 * (webhookAuthMiddleware). Papel de usuario nao se aplica.
 */
const PREFIXO_WEBHOOK = '/api/v1/webhooks';

/** Rotas que exigem apenas sessao valida, sem papel especifico. */
const SO_AUTENTICADA = new Set(['GET /api/v1/auth/me']);

/** Percorre a arvore de routers do Express e devolve as rotas registradas. */
function coletarRotas(pilha, prefixo = '') {
  const rotas = [];

  for (const camada of pilha) {
    if (camada.route) {
      const caminho = prefixo + camada.route.path;
      const metodos = Object.keys(camada.route.methods)
        .filter((m) => m !== '_all')
        .map((m) => m.toUpperCase());

      // Middlewares da propria rota + os do router que a contem.
      const handlers = camada.route.stack.map((c) => c.handle);
      for (const metodo of metodos) {
        rotas.push({ metodo, caminho, handlers });
      }
      continue;
    }

    if (camada.name === 'router' && camada.handle?.stack) {
      // Reconstroi o prefixo montado por app.use('/api/v1/...', router)
      const fonte = camada.regexp?.source ?? '';
      const trecho = fonte
        .replace('^\\/', '/')
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '')
        .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':param');

      const base = trecho === '/' || trecho === '' ? '' : trecho;

      // Guardas aplicados no app.use(...) valem para todas as rotas do router.
      const guardasDoRouter = Array.isArray(camada.handle.__guardas) ? camada.handle.__guardas : [];
      const filhas = coletarRotas(camada.handle.stack, prefixo + base);
      for (const f of filhas) f.handlers = [...guardasDoRouter, ...f.handlers];
      rotas.push(...filhas);
    }
  }

  return rotas;
}

function temGuardaDePapel(handlers) {
  return handlers.some((h) => Array.isArray(h?.papeisExigidos) && h.papeisExigidos.length > 0);
}

const rotas = coletarRotas(app._router.stack);

// ---------------------------------------------------------------------------

test('o coletor enxerga as rotas registradas', () => {
  assert.ok(rotas.length >= 20, `esperava >= 20 rotas, encontrei ${rotas.length}`);
});

test('toda rota de dado declara papel explicitamente', () => {
  const semPapel = [];

  for (const r of rotas) {
    const chave = `${r.metodo} ${r.caminho}`;
    if (PUBLICAS.has(chave)) continue;
    if (SO_AUTENTICADA.has(chave)) continue;
    if (r.caminho.startsWith(PREFIXO_WEBHOOK)) continue;
    if (!r.caminho.startsWith('/api/v1')) continue;

    if (!temGuardaDePapel(r.handlers)) semPapel.push(chave);
  }

  assert.deepEqual(
    semPapel,
    [],
    'Rotas sem exigirPapel:\n  ' +
      semPapel.join('\n  ') +
      '\n\nAdicione exigirPapel(...) na rota, ou registre em PUBLICAS/SO_AUTENTICADA ' +
      'neste teste com a justificativa.'
  );
});

test('nenhum papel declarado esta fora do enum do banco', () => {
  // database/20_auth_usuarios.sql
  const validos = new Set(['Gestor_CLevel', 'Financeiro', 'Vendedor', 'Operacional']);
  const invalidos = new Set();

  for (const r of rotas) {
    for (const h of r.handlers) {
      if (!Array.isArray(h?.papeisExigidos)) continue;
      for (const p of h.papeisExigidos) if (!validos.has(p)) invalidos.add(`${p} (${r.caminho})`);
    }
  }

  assert.deepEqual(
    [...invalidos],
    [],
    'Papeis inexistentes no enum papel_usuario: ' + [...invalidos].join(', ')
  );
});

test('dado financeiro nao e exposto a Vendedor', () => {
  const sensiveis = [
    'GET /api/v1/financeiro/transacoes',
    'GET /api/v1/financeiro/resumo-caixa',
    'GET /api/v1/financeiro/contas-a-pagar',
    'GET /api/v1/financeiro/projecao-futura',
    'GET /api/v1/contabilidade/dre',
    'GET /api/v1/dashboard/metrics'
  ];

  for (const alvo of sensiveis) {
    const rota = rotas.find((r) => `${r.metodo} ${r.caminho}` === alvo);
    assert.ok(rota, `rota nao encontrada: ${alvo}`);

    const guarda = rota.handlers.find((h) => Array.isArray(h?.papeisExigidos));
    assert.ok(guarda, `${alvo} nao declara papel`);
    assert.ok(
      !guarda.papeisExigidos.includes('Vendedor'),
      `${alvo} esta liberada para Vendedor -- e o extrato/DRE da holding`
    );
  }
});
