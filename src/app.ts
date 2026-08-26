import express from 'express';
import cors from 'cors';
import { catalogoRouter } from './modules/catalogo/catalogo.routes';

export const app = express();

app.use(cors());
app.use(express.json());

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'eco-mitang-erp-api' });
});

// API Routes
app.use('/api/v1/catalogo', catalogoRouter);
