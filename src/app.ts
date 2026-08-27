import express from 'express';
import cors from 'cors';
import { catalogoRouter } from './modules/catalogo/catalogo.routes';
import path from 'path';
import { itemCatalogoRouter } from './modules/catalogo/routes/item-catalogo.routes';
import { operacionalWebhooksRouter } from './modules/operacional/webhooks/operacional-webhooks.routes';
import { clientesRouter } from './modules/clientes/clientes.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { orcamentosRouter } from './modules/orcamentos/orcamentos.routes';
import { financeiroRouter } from './modules/financeiro/financeiro.routes';
import { faturamentoRouter } from './modules/faturamento/faturamento.routes';
import { dreRouter } from './modules/contabilidade/dre.routes';

export const app = express();

app.use(cors());
app.use(express.json());

// Servir frontend estático Deep Sea UI
app.use(express.static(path.join(__dirname, '../public')));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'eco-mitang-erp-api' });
});

// API Routes
app.use('/catalogo', itemCatalogoRouter);
app.use('/api/v1/catalogo', catalogoRouter);
app.use('/api/v1/clientes', clientesRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/orcamentos', orcamentosRouter);
app.use('/api/v1/financeiro', financeiroRouter);
app.use('/api/v1/faturamento', faturamentoRouter);
app.use('/api/v1/contabilidade', dreRouter);
app.use('/api/v1/webhooks/operacional', operacionalWebhooksRouter);
