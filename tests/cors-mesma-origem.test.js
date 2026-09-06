const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

/**
 * ============================================================================
 * CORS: A PROPRIA TELA CHAMANDO A PROPRIA API
 * ============================================================================
 *
 * [ERRO ANTERIOR, encontrado no primeiro login em producao]
 *
 * O codigo do CORS trazia este comentario:
 *
 *     // Requisicoes do mesmo host chegam sem Origin (fetch same-origin, curl).
 *     if (!origin || origensPermitidas.includes(origin)) ...
 *
 * A premissa e falsa. Um `fetch` POST com Content-Type application/json MANDA
 * o cabecalho Origin mesmo quando a pagina e do mesmo dominio da API. Como o
 * dominio de producao nao estava na lista CORS_ORIGINS, a tela de login
 * servida pelo proprio sistema era recusada pelo proprio sistema, com a
 * mensagem "Origem nao permitida pelo CORS". Nao havia como entrar.
 *
 * Este teste existe para essa premissa nunca mais voltar: mesma origem passa,
 * origem de fora so passa se estiver na lista, e o que for recusado diz por que.
 *
 * Roda sem banco: o CORS e resolvido antes de qualquer rota tocar o Postgres.
 * ============================================================================
 */

process.env.ECO_AMBIENTE = process.env.ECO_AMBIENTE || 'homologacao';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'teste-de-cors-com-mais-de-32-caracteres!!';
process.env.CORS_ORIGINS = 'https://parceiro-externo.com';

const HOST_PUBLICO = 'eco-mitang.vercel.app';
const { app } = require(path.join(__dirname, '..', 'dist', 'app.js'));

/** Simula o navegador: POST com Origin, como o fetch da tela de login faz. */
function postarComOrigem(origin) {
  return new Promise((resolve, reject) => {
    const servidor = http.createServer(app).listen(0, () => {
      const req = http.request(
        {
          port: servidor.address().port,
          path: '/api/v1/auth/login',
          method: 'POST',
          headers: { 'content-type': 'application/json', origin, host: HOST_PUBLICO },
        },
        (res) => {
          let corpo = '';
          res.on('data', (c) => (corpo += c));
          res.on('end', () => {
            servidor.close();
            resolve({ status: res.statusCode, corpo });
          });
        }
      );
      req.on('error', (e) => {
        servidor.close();
        reject(e);
      });
      req.end(JSON.stringify({ email: 'ninguem@exemplo.invalido', senha: 'senha-qualquer' }));
    });
  });
}

test('a propria tela do sistema nao pode ser bloqueada pela propria API', async () => {
  const r = await postarComOrigem(`https://${HOST_PUBLICO}`);
  assert.notEqual(r.status, 403, `mesma origem foi bloqueada: ${r.corpo}`);
});

test('origem externa cadastrada em CORS_ORIGINS passa', async () => {
  const r = await postarComOrigem('https://parceiro-externo.com');
  assert.notEqual(r.status, 403, `origem da lista foi bloqueada: ${r.corpo}`);
});

test('barra no fim da origem nao muda a decisao', async () => {
  const r = await postarComOrigem('https://parceiro-externo.com/');
  assert.notEqual(r.status, 403, `barra no fim nao pode mudar a decisao: ${r.corpo}`);
});

test('origem desconhecida e recusada, e a resposta diz qual foi', async () => {
  const r = await postarComOrigem('https://site-de-fora.example');
  assert.equal(r.status, 403);
  assert.match(r.corpo, /CORS_BLOQUEADO/);
  assert.match(r.corpo, /site-de-fora\.example/, 'a mensagem precisa nomear a origem recusada');
});
