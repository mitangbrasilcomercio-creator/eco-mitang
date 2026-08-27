import { app } from './app';
import dotenv from 'dotenv';
import { localMirror } from './core/database/local-mirror.service';
import { cnpjAutoDiscovery } from './modules/clientes/cnpj-auto-discovery.service';
dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[Eco-Mitang ERP] API Server rodando na porta ${PORT}`);
  console.log(`[Healthcheck] http://localhost:${PORT}/health`);
  console.log(`[Catalogo API] http://localhost:${PORT}/api/v1/catalogo`);

  // Sincronização e monitoramento silencioso em background
  setTimeout(async () => {
    try {
      console.log('[BACKGROUND WORKER] Inicializando verificação de novos CNPJs e sincronização do mirror...');
      await cnpjAutoDiscovery.executarVarreduraEAutoCadastro();
      await localMirror.syncAllTables();
    } catch (err: any) {
      console.warn('[BACKGROUND WORKER] Erro não-bloqueante:', err.message);
    }
  }, 15000);

  // Executa diariamente (a cada 24h = 86.400.000 ms)
  setInterval(async () => {
    try {
      console.log('[CRON DIÁRIO] Executando rotina diária de integridade cadastral e atualização de espelho...');
      await cnpjAutoDiscovery.executarVarreduraEAutoCadastro();
      await localMirror.syncAllTables();
    } catch (err: any) {
      console.warn('[CRON DIÁRIO] Erro na rotina diária:', err.message);
    }
  }, 86400000);
});
