#!/usr/bin/env node
'use strict';
/**
 * ============================================================================
 * SERVIDOR DE FRONTEIRA -- API REAL + ROTAS QUE AINDA NAO EXISTEM
 * ============================================================================
 *
 * [O PROBLEMA]
 * O agente de frontend esta bloqueado esperando backend. Das dez telas do
 * roadmap, oito dependem de rotas que eu ainda nao escrevi -- criar orcamento,
 * ingerir XML e OFX, trocar de tenant. Esperar significa semanas paradas dos
 * dois lados, ou entao telas construidas contra uma API imaginada, que e como
 * nasceram as onze cascas que o projeto ja tem.
 *
 * [O QUE ESTE SERVIDOR FAZ]
 * Um endereco so, localhost:4000, que serve:
 *
 *   /                 o frontend de public/
 *   /api/v1/<real>    encaminhado para a API de verdade em localhost:3000
 *   /api/v1/<futura>  respondido pelo mock, na forma exata do contrato R03
 *
 * O frontend nao muda uma linha: apiService.js usa '/api/v1' relativo, entao
 * ele pergunta para quem o serviu.
 *
 * [A REGRA QUE IMPEDE CONFUSAO]
 * Toda resposta carrega 'X-Eco-Origem: real' ou 'X-Eco-Origem: mock', e o
 * console imprime as duas em cores diferentes. Ninguem demonstra um mock
 * achando que e software funcionando -- que e o risco real de existir um mock.
 *
 * A lista de rotas mockadas e explicita (mock/rotas.js). Nao ha adivinhacao
 * por 404: se a rota real existir e responder 404, o 404 e repassado, porque
 * pode ser um recurso que de fato nao existe.
 *
 * Uso:
 *   npm run mock                  porta 4000, API real em 3000
 *   npm run mock -- --porta 5000  outra porta
 *   npm run mock -- --so-mock     nem tenta a API real (offline)
 * ============================================================================
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ROTAS } = require('./rotas');
const { erro } = require('./contrato');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public');

const args = process.argv.slice(2);
const valorDe = (flag, padrao) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const PORTA = Number(valorDe('--porta', 4000));
const API_REAL = valorDe('--api', 'http://localhost:3000');
const SO_MOCK = args.includes('--so-mock');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// ---------------------------------------------------------------------------

/** Casa 'POST /api/v1/orcamentos/:numero/transicoes' com o caminho pedido. */
function casarRota(metodo, caminho) {
  for (const chave of Object.keys(ROTAS)) {
    const [m, padrao] = chave.split(' ');
    if (m !== metodo) continue;

    const partesPadrao = padrao.split('/');
    const partesReais = caminho.split('/');
    if (partesPadrao.length !== partesReais.length) continue;

    const params = {};
    let bateu = true;
    for (let i = 0; i < partesPadrao.length; i++) {
      if (partesPadrao[i].startsWith(':')) {
        params[partesPadrao[i].slice(1)] = decodeURIComponent(partesReais[i]);
      } else if (partesPadrao[i] !== partesReais[i]) {
        bateu = false;
        break;
      }
    }
    if (bateu) return { handler: ROTAS[chave], params, chave };
  }
  return null;
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    const pedacos = [];
    req.on('data', (c) => pedacos.push(c));
    req.on('end', () => {
      const bruto = Buffer.concat(pedacos).toString('utf8');
      if (!bruto) return resolve(null);
      try {
        resolve(JSON.parse(bruto));
      } catch {
        resolve(null);
      }
    });
  });
}

function responderJson(res, status, corpo, origem) {
  const texto = JSON.stringify(corpo, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Eco-Origem': origem,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  });
  res.end(texto);
}

function registrar(origem, metodo, caminho, status) {
  const marca = origem === 'real' ? '  real ' : '  MOCK ';
  const cor = origem === 'real' ? '\x1b[32m' : '\x1b[33m';
  console.log(cor + marca + '\x1b[0m' + String(status).padEnd(4) + metodo.padEnd(7) + caminho);
}

// ---------------------------------------------------------------------------

async function encaminhar(req, res, caminho) {
  const alvo = API_REAL + caminho;
  try {
    const cabecalhos = { ...req.headers };
    delete cabecalhos.host;
    delete cabecalhos['content-length'];

    const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await lerCorpoBruto(req);

    const resposta = await fetch(alvo, { method: req.method, headers: cabecalhos, body: corpo });
    const texto = await resposta.text();

    res.writeHead(resposta.status, {
      'Content-Type': resposta.headers.get('content-type') || 'application/json; charset=utf-8',
      'X-Eco-Origem': 'real',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(texto);
    registrar('real', req.method, caminho, resposta.status);
  } catch {
    const e = erro(
      503,
      'API_REAL_INDISPONIVEL',
      'A API real não respondeu em ' + API_REAL + '. Suba com "npm start", ou rode este servidor com --so-mock.',
      { detalhe: { alvo } }
    );
    responderJson(res, 503, e.corpo, 'mock');
    registrar('mock', req.method, caminho, 503);
  }
}

function lerCorpoBruto(req) {
  return new Promise((resolve) => {
    const pedacos = [];
    req.on('data', (c) => pedacos.push(c));
    req.on('end', () => resolve(Buffer.concat(pedacos)));
  });
}

function servirEstatico(res, caminho) {
  const rel = caminho === '/' ? '/index.html' : caminho;
  const arquivo = path.join(PUBLICO, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));

  if (!arquivo.startsWith(PUBLICO) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado em public/: ' + rel);
    return;
  }

  res.writeHead(200, {
    'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(arquivo).pipe(res);
}

// ---------------------------------------------------------------------------

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const caminho = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    });
    return res.end();
  }

  if (!caminho.startsWith('/api/') && caminho !== '/health') {
    return servirEstatico(res, caminho);
  }

  const rota = casarRota(req.method, caminho);
  if (rota) {
    const corpo = await lerCorpo(req);
    let resultado;
    try {
      resultado = rota.handler({ corpo, params: rota.params, query: url.searchParams });
    } catch (e) {
      resultado = erro(500, 'ERRO_NO_MOCK', 'O mock quebrou em ' + rota.chave + ': ' + e.message);
    }
    responderJson(res, resultado.status, resultado.corpo, 'mock');
    return registrar('mock', req.method, caminho, resultado.status);
  }

  if (SO_MOCK) {
    const e = erro(
      501,
      'ROTA_NAO_MOCKADA',
      'Rota fora da lista do mock e --so-mock está ligado: ' + req.method + ' ' + caminho,
      { detalhe: { rotas_mockadas: Object.keys(ROTAS) } }
    );
    responderJson(res, 501, e.corpo, 'mock');
    return registrar('mock', req.method, caminho, 501);
  }

  return encaminhar(req, res, req.url);
});

servidor.listen(PORTA, () => {
  const linha = '='.repeat(70);
  console.log('\n' + linha);
  console.log('  FRONTEIRA ECO-MITANG');
  console.log(linha);
  console.log('  frontend  : http://localhost:' + PORTA);
  console.log('  API real  : ' + (SO_MOCK ? '(desligada, --so-mock)' : API_REAL));
  console.log('  mockadas  : ' + Object.keys(ROTAS).length + ' rotas');
  console.log(linha);
  for (const chave of Object.keys(ROTAS)) console.log('    ' + chave);
  console.log(linha + '\n');
});
