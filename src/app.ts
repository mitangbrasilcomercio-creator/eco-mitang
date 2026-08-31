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
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  helmet({
    // O front usa CDNs (Tailwind, Phosphor Icons) e estilos inline.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Requisicoes do mesmo host chegam sem Origin (fetch same-origin, curl).
      if (!origin || origensPermitidas.includes(origin)) return callback(null, true);
      return callback(new Error('Origem nao permitida pelo CORS.'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-empresa-id']
  })
);

app.use(express.json({ limit: '2mb' }));

// Frontend estatico Deep Sea UI
app.use(express.static(path.join(__dirname, '../public')));

// Healthcheck (publico de proposito: usado por monitoramento)
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'eco-mitang-erp-api' });
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
  if (err?.message === 'Origem nao permitida pelo CORS.') {
    res.status(403).json({ success: false, error: err.message, code: 'CORS_BLOQUEADO' });
    return;
  }
  console.error('[ERRO NAO TRATADO]', err?.message || err);
  // Nunca devolve stack trace ao cliente.
  res.status(500).json({ success: false, error: 'Erro interno no servidor.', code: 'INTERNAL_ERROR' });
});
