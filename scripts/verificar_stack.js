#!/usr/bin/env node
/**
 * ============================================================================
 * VERIFICACAO DE PILHA COMPLETA: BANCO + API + FRONTEND
 * ============================================================================
 *
 * Sobe a API, autentica, exercita cada endpoint e confere o frontend servido.
 * Existe para responder uma pergunta so: "o backend e o frontend, do jeito que
 * estao agora, funcionam juntos?"
 *
 * E o teste que os dois agentes rodam antes de dizer que terminaram.
 *
 * Uso:
 *   node scripts/verificar_stack.js              sobe a API numa porta livre
 *   node scripts/verificar_stack.js --porta 3000 usa uma API ja rodando
 *   node scripts/verificar_stack.js --json       saida para CI
 *
 * Sai com codigo != 0 se qualquer camada falhar.
 * ============================================================================
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RAIZ = path.join(__dirname, '..');
const args = process.argv.slice(2);
const saidaJson = args.includes('--json');
const idxPorta = args.indexOf('--porta');
const portaExterna = idxPorta !== -1 ? Number(args[idxPorta + 1]) : null;
const PORTA = portaExterna || 3999;

const resultados = [];
let servidor = null;

function registrar(camada, nome, ok, detalhe) {
  resultados.push({ camada, nome, ok, detalhe });
  if (!saidaJson) {
    console.log(`  ${ok ? '[ OK  ]' : '[FALHA]'} ${nome}`);
    if (detalhe) console.log(`          ${detalhe}`);
  }
}

const log = (...a) => { if (!saidaJson) console.log(...a); };

async function esperarApi(porta, tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`http://localhost:${porta}/health`);
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function subirApi() {
  if (portaExterna) {
    log(`Usando API ja em execucao na porta ${portaExterna}.\n`);
    return await esperarApi(portaExterna, 4);
  }

  if (!fs.existsSync(path.join(RAIZ, 'dist', 'server.js'))) {
    log('[ERRO] dist/ nao existe. Rode: npm run build\n');
    return false;
  }

  log(`Subindo a API na porta ${PORTA}...\n`);
  servidor = spawn(process.execPath, [path.join(RAIZ, 'dist', 'server.js')], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORTA), CNPJ_AUTO_DISCOVERY: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let saidaServidor = '';
  servidor.stdout.on('data', (d) => { saidaServidor += d.toString(); });
  servidor.stderr.on('data', (d) => { saidaServidor += d.toString(); });

  const subiu = await esperarApi(PORTA);
  if (!subiu) log('Saida do servidor:\n' + saidaServidor);
  return subiu;
}

function derrubarApi() {
  if (servidor && !servidor.killed) servidor.kill();
}

const EMAIL_VERIFICADOR = 'verificador@eco-mitang.local';

/**
 * Garante um usuario dedicado a esta verificacao, com senha nova a cada
 * execucao. A senha existe apenas em memoria durante o processo -- nunca vai
 * para arquivo, log ou variavel de ambiente.
 *
 * Vinculado a TODOS os CNPJs e com visao consolidada, para poder exercitar o
 * isolamento entre tenants de ponta a ponta.
 */
async function provisionarUsuarioVerificador() {
  const conn = process.env.MIGRATION_DATABASE_URL || process.env.DIRECT_URL;
  if (!conn) return null;

  const { Client } = require('pg');
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');

  let ssl;
  try {
    ssl = {
      ca: fs.readFileSync(path.join(RAIZ, 'database', 'certs', 'supabase-ca.crt'), 'utf8'),
      rejectUnauthorized: true
    };
  } catch {
    ssl = { rejectUnauthorized: true };
  }

  const senha = crypto.randomBytes(18).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'Vf1';
  const client = new Client({ connectionString: conn, ssl, connectionTimeoutMillis: 30000 });

  try {
    await client.connect();
    const hash = await bcrypt.hash(senha, 10);

    await client.query('BEGIN');

    // A unicidade do e-mail vem de um indice sobre lower(email), nao de uma
    // constraint nomeada -- ON CONFLICT nao tem alvo para casar. Entao consulta
    // primeiro e decide entre UPDATE e INSERT.
    const existente = await client.query(
      'SELECT id FROM usuarios WHERE lower(email) = lower($1) LIMIT 1;',
      [EMAIL_VERIFICADOR]
    );

    let id;
    if (existente.rows.length > 0) {
      const atualizado = await client.query(
        `UPDATE usuarios
            SET senha_hash = $2, ativo = TRUE, tentativas_falhas = 0, bloqueado_ate = NULL,
                papel = 'Gestor_CLevel', pode_visao_consolidada = TRUE, updated_at = NOW()
          WHERE id = $1
        RETURNING id;`,
        [existente.rows[0].id, hash]
      );
      id = atualizado.rows[0].id;
    } else {
      const criado = await client.query(
        `INSERT INTO usuarios (email, nome, senha_hash, papel, pode_visao_consolidada)
         VALUES ($1, 'Verificador Automatico', $2, 'Gestor_CLevel', TRUE) RETURNING id;`,
        [EMAIL_VERIFICADOR, hash]
      );
      id = criado.rows[0].id;
    }

    // Vincula a todos os CNPJs ativos.
    await client.query(
      `INSERT INTO usuarios_empresas (usuario_id, empresa_id)
       SELECT $1, id FROM empresas WHERE ativo = TRUE
       ON CONFLICT DO NOTHING;`,
      [id]
    );
    await client.query('COMMIT');

    return { email: EMAIL_VERIFICADOR, senha };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log(`  (nao foi possivel provisionar o usuario de verificacao: ${err.message})`);
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const base = `http://localhost:${PORTA}`;

  if (!saidaJson) {
    console.log('======================================================================');
    console.log('   VERIFICACAO DE PILHA: BANCO + API + FRONTEND');
    console.log('======================================================================\n');
  }

  // -------------------------------------------------------------------
  log('1. BANCO DE DADOS');
  // -------------------------------------------------------------------
  let ctx = null;
  try {
    const { pgPool, contextoTodosTenants, withTenantQuery, encerrarPool } =
      require(path.join(RAIZ, 'dist', 'core', 'database', 'supabase-pool'));

    const quem = await pgPool.query(
      'SELECT current_user AS usuario, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS ignora_rls;'
    );
    const u = quem.rows[0];
    registrar('banco', 'Conexao estabelecida', true, `papel: ${u.usuario}`);
    registrar(
      'banco',
      'Papel da aplicacao respeita a RLS',
      u.ignora_rls === false,
      u.ignora_rls ? `'${u.usuario}' ignora a RLS -- configure APP_DATABASE_URL com eco_app` : null
    );

    ctx = await contextoTodosTenants();
    registrar('banco', 'Empresas cadastradas', ctx.empresaIds.length > 0, `${ctx.empresaIds.length} CNPJs`);

    const contagens = await withTenantQuery(ctx, async (c) => {
      const r = await c.query(`
        SELECT (SELECT count(*)::int FROM transacoes_bancarias)   AS transacoes,
               (SELECT count(*)::int FROM notas_fiscais)          AS notas,
               (SELECT count(*)::int FROM obrigacoes_recorrentes) AS obrigacoes,
               (SELECT count(*)::int FROM clientes)               AS clientes,
               (SELECT count(*)::int FROM usuarios WHERE ativo)   AS usuarios;`);
      return r.rows[0];
    });
    registrar('banco', 'Dados carregados', contagens.transacoes > 0 && contagens.notas > 0,
      `${contagens.transacoes} transacoes, ${contagens.notas} notas, ${contagens.obrigacoes} obrigacoes, ${contagens.clientes} clientes`);
    registrar('banco', 'Existe usuario para login', contagens.usuarios > 0,
      contagens.usuarios === 0 ? 'rode: npm run db:usuario -- --email ... --nome ...' : `${contagens.usuarios} usuario(s)`);

    await encerrarPool();
  } catch (err) {
    registrar('banco', 'Conexao estabelecida', false, err.message);
  }

  // -------------------------------------------------------------------
  log('\n2. API');
  // -------------------------------------------------------------------
  const subiu = await subirApi();
  registrar('api', 'Servidor responde', subiu, subiu ? `${base}/health` : 'nao subiu -- veja o log acima');
  if (!subiu) return;

  // Rota protegida sem token precisa recusar.
  try {
    const r = await fetch(`${base}/api/v1/dashboard/metrics`);
    registrar('api', 'Rota protegida recusa sem token', r.status === 401, `HTTP ${r.status}`);
  } catch (err) {
    registrar('api', 'Rota protegida recusa sem token', false, err.message);
  }

  // Tenant nao pode mais ser escolhido pelo header.
  try {
    const r = await fetch(`${base}/api/v1/financeiro/transacoes`, {
      headers: { 'x-empresa-id': "' OR 1=1--" }
    });
    registrar('api', 'Header de tenant nao contorna a autenticacao', r.status === 401, `HTTP ${r.status}`);
  } catch (err) {
    registrar('api', 'Header de tenant nao contorna a autenticacao', false, err.message);
  }

  // Login com um usuario dedicado a verificacao.
  //
  // Nao usa credencial de pessoa real: a senha de um usuario humano muda (foi
  // exatamente o que aconteceu enquanto o frontend construia a tela de login) e
  // o teste passaria a falhar por um motivo que nada tem a ver com a pilha.
  // O usuario abaixo pertence ao verificador, tem senha nova a cada execucao e
  // nao interfere em ninguem.
  let email = process.env.ECO_TESTE_EMAIL;
  let senha = process.env.ECO_TESTE_SENHA;
  let token = null;
  let usuario = null;

  if (!email || !senha) {
    const provisionado = await provisionarUsuarioVerificador();
    if (provisionado) {
      email = provisionado.email;
      senha = provisionado.senha;
    }
  }

  if (!email || !senha) {
    registrar('api', 'Login', false,
      'nao foi possivel provisionar o usuario de verificacao (MIGRATION_DATABASE_URL ausente?)');
  } else {
    try {
      const r = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });
      const j = await r.json();
      token = j.success ? j.data.token : null;
      usuario = j.success ? j.data.usuario : null;
      registrar('api', 'Login', !!token,
        token ? `${usuario.nome} (${usuario.papel}) — ${usuario.empresas.length} CNPJs` : j.error);
    } catch (err) {
      registrar('api', 'Login', false, err.message);
    }
  }

  if (token) {
    const auth = (empresa) => ({
      Authorization: `Bearer ${token}`,
      ...(empresa ? { 'x-empresa-id': empresa } : {})
    });
    const escopo = usuario.pode_visao_consolidada ? 'all' : usuario.empresas[0].id;

    const rotas = [
      ['GET /auth/me', '/auth/me'],
      ['GET /dashboard/metrics', '/dashboard/metrics?periodo=mes_atual'],
      ['GET /financeiro/resumo-caixa', '/financeiro/resumo-caixa'],
      ['GET /financeiro/transacoes', '/financeiro/transacoes?limit=5'],
      ['GET /financeiro/contas-a-pagar', '/financeiro/contas-a-pagar'],
      ['GET /financeiro/projecao-futura', '/financeiro/projecao-futura'],
      ['GET /financeiro/categorias', '/financeiro/categorias'],
      ['GET /contabilidade/dre', '/contabilidade/dre?ano=2026'],
      ['GET /faturamento/notas', '/faturamento/notas?limit=5'],
      ['GET /orcamentos', '/orcamentos?limit=5'],
      ['GET /clientes', '/clientes?limit=5'],
      ['GET /catalogo', '/catalogo?limit=5']
    ];

    let falhas = 0;
    for (const [nome, rota] of rotas) {
      try {
        const r = await fetch(`${base}/api/v1${rota}`, { headers: auth(escopo) });
        const j = await r.json();
        if (r.status !== 200 || j.success === false) {
          falhas++;
          registrar('api', nome, false, `HTTP ${r.status} ${j.error || ''}`);
        }
      } catch (err) {
        falhas++;
        registrar('api', nome, false, err.message);
      }
    }
    registrar('api', `Endpoints de dado (${rotas.length})`, falhas === 0,
      falhas === 0 ? 'todos responderam 200' : `${falhas} falharam`);

    // Isolamento entre CNPJs, pela API.
    if (usuario.empresas.length >= 2) {
      try {
        const contar = async (empresaId) => {
          const r = await fetch(`${base}/api/v1/financeiro/transacoes?limit=1`, { headers: auth(empresaId) });
          return (await r.json()).total;
        };
        const a = await contar(usuario.empresas[0].id);
        const b = await contar(usuario.empresas[1].id);
        let consolidado = null;
        if (usuario.pode_visao_consolidada) consolidado = await contar('all');

        registrar('api', 'Tenants isolados entre si', a !== b || a === 0,
          `${usuario.empresas[0].nome_fantasia}: ${a} | ${usuario.empresas[1].nome_fantasia}: ${b}` +
          (consolidado !== null ? ` | consolidado: ${consolidado}` : ''));
      } catch (err) {
        registrar('api', 'Tenants isolados entre si', false, err.message);
      }
    }

    // CNPJ fora da lista do token.
    try {
      const r = await fetch(`${base}/api/v1/financeiro/transacoes`, {
        headers: auth('11111111-1111-4111-8111-111111111111')
      });
      registrar('api', 'CNPJ nao autorizado recebe 403', r.status === 403, `HTTP ${r.status}`);
    } catch (err) {
      registrar('api', 'CNPJ nao autorizado recebe 403', false, err.message);
    }
  }

  // -------------------------------------------------------------------
  log('\n3. FRONTEND');
  // -------------------------------------------------------------------
  try {
    const r = await fetch(`${base}/index.html`);
    const html = await r.text();
    registrar('frontend', 'index.html servido pela API', r.status === 200 && html.includes('<html'),
      `HTTP ${r.status}, ${(html.length / 1024).toFixed(0)} KB`);

    // Toda rota do menu precisa ter um arquivo, senao o item leva a lugar nenhum.
    const rotasMenu = [...new Set([...html.matchAll(/data-route="([^"]+)"/g)].map((m) => m[1]))];
    const semPagina = [];
    for (const rota of rotasMenu) {
      const resp = await fetch(`${base}/${rota}.html`);
      if (resp.status !== 200) semPagina.push(rota);
    }
    registrar('frontend', `Rotas do menu com pagina (${rotasMenu.length})`, semPagina.length === 0,
      semPagina.length ? `sem arquivo: ${semPagina.join(', ')}` : 'todas resolvem');

    /**
     * Modulos que o roteador carrega dinamicamente.
     *
     * [ERRO ANTERIOR desta propria verificacao]: checava apenas se o arquivo
     * EXISTE. Um modulo de 6 linhas com console.log passava como sucesso, e o
     * relatorio dava 18/18 com sete telas vazias. Um teste que premia arquivo
     * vazio e pior que nenhum teste: da confianca falsa.
     *
     * [CORRECAO]: classifica em implementado / casca / ausente. Casca nao conta
     * como sucesso -- aparece como pendencia, com nome e tamanho.
     */
    const scriptJs = await (await fetch(`${base}/script.js`)).text();
    const modulares = [...new Set(
      [...scriptJs.matchAll(/carregarScriptModular\('[^']+',\s*'([^']+)'/g)].map((m) => m[1])
    )];

    const ausentes = [];
    const cascas = [];
    const implementados = [];

    for (const m of modulares) {
      const resp = await fetch(`${base}/${m}`);
      if (resp.status !== 200) { ausentes.push(m); continue; }

      const corpo = await resp.text();
      // Linhas uteis: fora comentario, chave solta e linha em branco.
      const uteis = corpo
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*') && l !== '}' && l !== '};')
        .length;

      // Modulo de verdade conversa com a API. Casca so imprime no console.
      const falaComApi = /apiService|fetch\s*\(/.test(corpo);

      if (!falaComApi && uteis <= 8) cascas.push(`${m} (${uteis} linhas uteis)`);
      else if (!falaComApi) cascas.push(`${m} (nao consome a API)`);
      else implementados.push(m);
    }

    registrar('frontend', `Modulos do roteador existem (${modulares.length})`, ausentes.length === 0,
      ausentes.length ? `nao existem: ${ausentes.join(', ')}` : 'todos os arquivos estao no disco');

    registrar('frontend',
      `Modulos implementados de fato (${implementados.length}/${modulares.length})`,
      cascas.length === 0,
      cascas.length ? `casca: ${cascas.join(', ')}` : 'nenhuma casca');

    // O apiService precisa falar o contrato novo.
    const api = await (await fetch(`${base}/apiService.js`)).text();
    registrar('frontend', 'apiService envia Authorization', api.includes('Authorization'),
      api.includes('Authorization') ? null : 'o front nao vai passar da autenticacao');
    registrar('frontend', 'apiService trata 401', api.includes('401'),
      api.includes('401') ? null : 'sessao expirada nao devolve o usuario ao login');
    registrar('frontend', 'Sessao falsa removida do script.js', !scriptJs.includes('mitang-session-root'),
      scriptJs.includes('mitang-session-root') ? 'script.js ainda grava um token falso' : null);
  } catch (err) {
    registrar('frontend', 'Frontend servido', false, err.message);
  }

  // -------------------------------------------------------------------
  const falhas = resultados.filter((r) => !r.ok);
  if (saidaJson) {
    console.log(JSON.stringify({ ok: falhas.length === 0, total: resultados.length, resultados }, null, 2));
  } else {
    console.log('\n======================================================================');
    console.log(`  ${resultados.length - falhas.length}/${resultados.length} verificacoes passaram`);
    console.log('======================================================================\n');
    if (falhas.length > 0) {
      const porCamada = {};
      falhas.forEach((f) => { (porCamada[f.camada] ||= []).push(f.nome); });
      for (const [camada, itens] of Object.entries(porCamada)) {
        console.log(`  ${camada.toUpperCase()}: ${itens.length} falha(s)`);
        itens.forEach((i) => console.log(`    - ${i}`));
      }
      console.log('');
    }
  }
  if (falhas.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('[ERRO FATAL]', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    derrubarApi();
    setTimeout(() => process.exit(process.exitCode || 0), 300);
  });
