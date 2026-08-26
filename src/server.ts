import { app } from './app';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[Eco-Mitang ERP] API Server rodando na porta ${PORT}`);
  console.log(`[Healthcheck] http://localhost:${PORT}/health`);
  console.log(`[Catalogo API] http://localhost:${PORT}/api/v1/catalogo`);
});
