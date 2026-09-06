/**
 * ============================================================================
 * PONTE PARA A VERCEL
 * ============================================================================
 *
 * Ate aqui o sistema so subia com 'npm start', num processo que fica de pe
 * escutando uma porta. Na Vercel nao existe processo de pe: existe uma funcao
 * que acorda a cada requisicao. Este arquivo e a unica diferenca entre as duas
 * coisas -- ele entrega o mesmo `app` do Express, sem `listen`.
 *
 * O QUE ISSO EXPLICA
 *
 * 1. Por que /api/health devolvia HTML.
 *    A Vercel estava servindo apenas a pasta 'public' como site estatico. Nao
 *    havia nada que a fizesse executar o Express, entao qualquer caminho caia
 *    no index.html. O backend existia no repositorio e nunca rodava.
 *
 * 2. Por que nao se importa 'server.ts' aqui.
 *    O server.ts faz `app.listen(...)` e `process.exit(1)` quando falta
 *    variavel de ambiente. Numa funcao serverless isso derruba a requisicao
 *    inteira em vez de responder. Aqui se importa o `app`, que e so o
 *    roteamento, e as conferencias de ambiente viram uma RESPOSTA, nao uma
 *    morte do processo.
 *
 * 3. Por que a conexao com o banco nao e aberta no boot.
 *    Cada invocacao pode cair numa instancia nova. O pool do supabase-pool.ts
 *    ja abre sob demanda e e reaproveitado enquanto a instancia viver.
 * ============================================================================
 */
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Falta de configuracao vira resposta legivel, nao erro 500 mudo.
 * Sem isto, o sintoma na tela seria "FUNCTION_INVOCATION_FAILED" e ninguem
 * saberia que o que faltou foi uma variavel de ambiente.
 */
function faltando(): string[] {
  const faltas: string[] = [];
  if (!process.env.APP_DATABASE_URL && !process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    faltas.push('APP_DATABASE_URL');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    faltas.push('JWT_SECRET (minimo 32 caracteres)');
  }
  return faltas;
}

let appCarregado: any = null;
let erroDeCarga: Error | null = null;

function carregar(): any {
  if (appCarregado || erroDeCarga) return appCarregado;
  try {
    // require tardio: se o modulo quebrar por configuracao, a mensagem chega
    // ao navegador em vez de sumir no log da plataforma.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    appCarregado = require('../src/app').app;
  } catch (e: any) {
    erroDeCarga = e;
  }
  return appCarregado;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const faltas = faltando();
  if (faltas.length > 0) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify(
        {
          erro: 'CONFIGURACAO_INCOMPLETA',
          mensagem:
            'O sistema subiu, mas nao tem como falar com o banco. Faltam variaveis de ambiente no projeto da Vercel.',
          faltando: faltas,
          onde: 'Vercel > projeto eco-mitang > Settings > Environment Variables',
        },
        null,
        2
      )
    );
    return;
  }

  const app = carregar();
  if (!app) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify(
        {
          erro: 'FALHA_AO_CARREGAR_APLICACAO',
          mensagem: erroDeCarga?.message ?? 'motivo desconhecido',
        },
        null,
        2
      )
    );
    return;
  }

  return app(req, res);
}
