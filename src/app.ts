import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

import { authRouter } from './modules/auth/auth.routes';
import { catalogoRouter } from './modules/catalogo/catalogo.routes';
import { operacionalWebhooksRouter } from './modules/operacional/webhooks/operacional-webhooks.routes';
import { clientesRouter } from './modules/clientes/clientes.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { orcamentosRouter } from './modules/orcamentos/orcamentos.routes';
import { financeiroRouter } from './modules/financeiro/financeiro.routes';
import { faturamentoRouter } from './modules/faturamento/faturamento.routes';
import { dreRouter } from './modules/contabilidade/dre.routes';
import { governancaRouter } from './modules/governanca/governanca.routes';
import { authMiddleware, tenantMiddleware } from './core/middlewares/tenant.middleware';
import { pgPool } from './core/database/supabase-pool';

export const app = express();

// Confia no proxy reverso para que req.ip traga o IP real do cliente
// (usado pelo rate limit e pelo log de acesso).
app.set('trust proxy', 1);

/**
 * [ERRO ANTERIOR]: 'app.use(cors())' liberava qualquer origem, e nao havia
 * cabecalhos de seguranca nenhum.
 *
 * [CORRECAO]: helmet + CORS restrito por lista. Como o front e servido pelo
 * mesmo processo, a lista padrao cobre apenas o proprio host em
 * desenvolvimento. Origens extras entram por CORS_ORIGINS no .env.
 */
const origensPermitidas = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, '')) // barra no fim nunca faz parte de uma origem
  .filter(Boolean);

/**
 * O host publico pelo qual a requisicao chegou.
 *
 * Atras do proxy da Vercel, 'host' ja vem com o dominio publico; o
 * 'x-forwarded-host' fica como rede de seguranca para outros proxies.
 */
function hostDaRequisicao(req: express.Request): string {
  const encaminhado = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return encaminhado || String(req.headers.host || '');
}

/** A propria pagina do sistema chamando a propria API dele. */
function ehMesmaOrigem(origem: string, req: express.Request): boolean {
  try {
    return new URL(origem).host === hostDaRequisicao(req);
  } catch {
    return false;
  }
}

app.use(
  helmet({
    // O front usa CDNs (Tailwind, Phosphor Icons) e estilos inline.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

/**
 * [ERRO ANTERIOR, encontrado em producao no primeiro login]
 * O codigo assumia que "requisicoes do mesmo host chegam sem Origin". Isso e
 * falso: um `fetch` POST com Content-Type application/json MANDA o cabecalho
 * Origin mesmo sendo da mesma pagina. Resultado: a propria tela de login,
 * servida pelo mesmo dominio da API, era recusada com "Origem nao permitida
 * pelo CORS" -- e o sistema ficava impossivel de usar ate alguem lembrar de
 * cadastrar o proprio dominio numa variavel de ambiente.
 *
 * [CORRECAO]
 * Mesma origem passa SEMPRE, comparando com o host pelo qual a requisicao
 * chegou. Isso nao afrouxa nada: o navegador nao deixa uma pagina de outro
 * site forjar o Origin. A lista CORS_ORIGINS continua existindo, mas agora so
 * para o que ela realmente serve -- liberar origens de FORA.
 */
const opcoesCorsBase: Omit<cors.CorsOptions, 'origin'> = {
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-empresa-id'],
};

const decidirCors: cors.CorsOptionsDelegate<express.Request> = (req, callback) => {
  const origem = req.headers.origin;

  // Sem Origin: navegacao normal, curl, monitoramento. Nao ha o que restringir.
  if (!origem) return callback(null, { ...opcoesCorsBase, origin: true });

  const limpa = origem.replace(/\/+$/, '');
  if (ehMesmaOrigem(limpa, req) || origensPermitidas.includes(limpa)) {
    return callback(null, { ...opcoesCorsBase, origin: true });
  }

  // A mensagem diz QUAL origem foi recusada e o que era aceito. Sem isso, o
  // sintoma na tela e so "Origem nao permitida" e nao da para agir.
  return callback(
    new Error(
      `Origem nao permitida pelo CORS: "${origem}". ` +
        `Aceito o proprio host (${hostDaRequisicao(req) || 'desconhecido'})` +
        (origensPermitidas.length ? ` e: ${origensPermitidas.join(', ')}.` : ' e nenhuma origem externa (CORS_ORIGINS vazia).')
    )
  );
};

app.use(cors(decidirCors));

app.use(express.json({ limit: '2mb' }));

// Frontend estatico Deep Sea UI
app.use(express.static(path.join(__dirname, '../public')));

// Healthcheck (publico de proposito: usado por monitoramento)
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'eco-mitang-erp-api' });
});

/**
 * Healthcheck que PERGUNTA AO BANCO.
 *
 * O /health acima responde "estou de pe" sem falar com nada -- ele mente bem:
 * ja respondeu 'healthy' com o banco inalcancavel. Este aqui abre uma conexao
 * de verdade e conta o que encontrou. E o unico endereco que, aberto no
 * navegador, prova em uma tela que a API existe E que o banco responde.
 *
 * Fica em /api/ de proposito: na Vercel so o que comeca com /api chega ao
 * Express; /health cairia no site estatico e devolveria HTML.
 */
app.get('/api/health', async (_req, res) => {
  const inicio = Date.now();
  try {
    const r = await pgPool.query(
      `SELECT current_database()                                           AS banco,
              current_user                                                 AS papel,
              (SELECT count(*) FROM empresas)                              AS empresas,
              (SELECT count(*) FROM orcamentos_historico)                  AS orcamentos,
              (SELECT count(*) FROM transacoes_bancarias)                  AS lancamentos,
              (SELECT count(*) FROM obrigacoes_recorrentes)                AS obrigacoes,
              (SELECT count(*) FROM transicoes_permitidas)                 AS transicoes,
              (SELECT count(*) FROM eventos_negocio)                       AS eventos,
              (SELECT max(versao) FROM schema_migrations)                  AS migration,
              (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity) AS tabelas_com_rls;`
    );
    const d = r.rows[0];
    const semContexto = {
      orcamentos: Number(d.orcamentos),
      lancamentos_bancarios: Number(d.lancamentos),
      obrigacoes: Number(d.obrigacoes),
    };
    const rlsSegurando = Object.values(semContexto).every((v) => v === 0);

    res.json({
      status: 'ok',
      mensagem: 'A API esta rodando e o banco respondeu.',
      respondeu_em_ms: Date.now() - inicio,
      banco: d.banco,
      conectado_como: d.papel,
      migration_aplicada: Number(d.migration),
      livro_de_eventos: {
        transicoes_permitidas: Number(d.transicoes),
        eventos_registrados: Number(d.eventos),
        pronto: Number(d.transicoes) > 0,
      },
      /**
       * Esta contagem e feita SEM login e SEM empresa escolhida. Sob a
       * Row-Level Security, um pedido nessas condicoes nao enxerga dado de
       * negocio nenhum -- entao zero aqui e o comportamento certo, e nao
       * banco vazio. Foi exatamente essa leitura que confundiu na primeira
       * vez que esta rota subiu.
       */
      seguranca: {
        rls_ativa_em_tabelas: Number(d.tabelas_com_rls),
        veredito: rlsSegurando
          ? 'RLS conferida: sem login, o papel da aplicacao nao enxerga dado de negocio.'
          : 'ATENCAO: sem login o papel da aplicacao enxergou dado de negocio. Conferir as policies.',
        visivel_sem_login: semContexto,
      },
      empresas_cadastradas: Number(d.empresas),
      para_ver_os_dados: 'Entre em /login.html; o total real aparece nas telas, ja filtrado pela empresa escolhida.',
      quando: new Date().toISOString(),
    });
  } catch (e: any) {
    // O motivo importa mais que o status: 'senha errada' e 'host errado' se
    // parecem na tela e se resolvem de formas completamente diferentes.
    res.status(503).json({
      status: 'sem_banco',
      mensagem: 'A API esta rodando, mas nao conseguiu falar com o banco.',
      motivo: e?.message ?? 'desconhecido',
      codigo: e?.code ?? null,
      dica:
        e?.code === '28P01'
          ? 'Senha incorreta na APP_DATABASE_URL.'
          : e?.code === 'ENOTFOUND'
          ? 'Host do banco nao encontrado: confira o endereco do pooler na APP_DATABASE_URL.'
          : 'Confira APP_DATABASE_URL em Vercel > Settings > Environment Variables.',
      quando: new Date().toISOString(),
    });
  }
});

// --------------------------------------------------------------------------
// ROTAS
// --------------------------------------------------------------------------
// Autenticacao: publica por natureza (e a porta de entrada).
app.use('/api/v1/auth', authRouter);

/**
 * [ERRO ANTERIOR]: apenas 'clientes' e 'catalogo' aplicavam o tenantMiddleware.
 * Dashboard, financeiro, faturamento, DRE e orcamentos liam 'x-empresa-id'
 * cru do header e interpolavam direto no SQL -- injecao nao autenticada.
 *
 * [CORRECAO]: TODA rota de dado passa por autenticacao + resolucao de tenant.
 */
const protegido = [authMiddleware, tenantMiddleware];

app.use('/api/v1/catalogo', protegido, catalogoRouter);
app.use('/api/v1/clientes', protegido, clientesRouter);
app.use('/api/v1/dashboard', protegido, dashboardRouter);
app.use('/api/v1/orcamentos', protegido, orcamentosRouter);
app.use('/api/v1/financeiro', protegido, financeiroRouter);
app.use('/api/v1/faturamento', protegido, faturamentoRouter);
app.use('/api/v1/contabilidade', protegido, dreRouter);
app.use('/api/v1/governanca', protegido, governancaRouter);

// Webhooks tem autenticacao propria (segredo compartilhado, nao JWT).
app.use('/api/v1/webhooks/operacional', operacionalWebhooksRouter);

// --------------------------------------------------------------------------
// TRATAMENTO DE ERRO CENTRAL
// --------------------------------------------------------------------------
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Comparacao por prefixo: a mensagem agora carrega qual origem foi recusada,
  // entao igualdade exata deixaria o erro cair no 500 generico e esconder o
  // motivo -- exatamente o que atrapalhou o diagnostico da primeira vez.
  if (typeof err?.message === 'string' && err.message.startsWith('Origem nao permitida pelo CORS')) {
    res.status(403).json({ success: false, error: err.message, code: 'CORS_BLOQUEADO' });
    return;
  }
  console.error('[ERRO NAO TRATADO]', err?.message || err);
  // Nunca devolve stack trace ao cliente.
  res.status(500).json({ success: false, error: 'Erro interno no servidor.', code: 'INTERNAL_ERROR' });
});
