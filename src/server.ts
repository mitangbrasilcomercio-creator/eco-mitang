import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';
import { localMirror } from './core/database/local-mirror.service';
import { cnpjAutoDiscovery } from './modules/clientes/cnpj-auto-discovery.service';
import { pgPool, encerrarPool } from './core/database/supabase-pool';

/**
 * ============================================================================
 * BOOTSTRAP DA API
 * ============================================================================
 *
 * [ERROS ANTERIORES]:
 * 1. O servidor subia sem conferir nada. Sem JWT_SECRET, sem banco alcancavel,
 *    sem segredo de webhook -- so descobria no primeiro erro de requisicao.
 * 2. 'setInterval(..., 86400000)' como "cron diario": se o processo reiniciar
 *    a cada 20 horas, a rotina nunca roda.
 * 3. Nenhum encerramento gracioso: SIGTERM matava o processo com transacoes
 *    abertas.
 * ============================================================================
 */

const PORT = Number(process.env.PORT || 3000);

/** Falha alto e cedo, em vez de subir pela metade. */
function conferirAmbiente(): string[] {
  const problemas: string[] = [];

  if (!process.env.APP_DATABASE_URL && !process.env.DIRECT_URL && !process.env.DATABASE_URL) {
    problemas.push('APP_DATABASE_URL nao definida.');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    problemas.push('JWT_SECRET ausente ou com menos de 32 caracteres. Gere com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"');
  }
  if (!process.env.ECO_WEBHOOK_SECRET || process.env.ECO_WEBHOOK_SECRET.length < 24) {
    problemas.push('ECO_WEBHOOK_SECRET ausente ou curto. Os webhooks vao responder 503 ate ser configurado.');
  }
  if (process.env.DB_SSL_INSECURE === 'true') {
    problemas.push('DB_SSL_INSECURE=true: o certificado do banco nao esta sendo verificado.');
  }
  return problemas;
}

async function iniciar() {
  const problemas = conferirAmbiente();
  const fatais = problemas.filter((p) => p.includes('APP_DATABASE_URL') || p.includes('JWT_SECRET'));

  if (problemas.length > 0) {
    console.warn('\n[AMBIENTE] Pendencias de configuracao:');
    problemas.forEach((p) => console.warn(`  - ${p}`));
    console.warn('');
  }
  if (fatais.length > 0) {
    console.error('[FATAL] O servidor nao pode subir sem banco e sem segredo de assinatura do JWT.\n');
    process.exit(1);
  }

  // Conectividade conferida no boot, nao na primeira requisicao do usuario.
  try {
    const r = await pgPool.query('SELECT current_user, now() AS agora;');
    console.log(`[BANCO] Conectado como '${r.rows[0].current_user}' (TLS verificado).`);
    if (r.rows[0].current_user === 'postgres') {
      console.warn(
        '[BANCO] ATENCAO: conectado como superusuario do projeto, que ignora a RLS.\n' +
        '        Configure APP_DATABASE_URL com o papel eco_app (node scripts/setup_app_role.js).'
      );
    }
  } catch (err: any) {
    console.error(`[FATAL] Banco inacessivel: ${err.message}\n`);
    process.exit(1);
  }

  const servidor = app.listen(PORT, () => {
    console.log(`\n[Eco-Mitang ERP] API na porta ${PORT}`);
    console.log(`  Healthcheck : http://localhost:${PORT}/health`);
    console.log(`  Login       : POST http://localhost:${PORT}/api/v1/auth/login\n`);
  });

  // -------------------------------------------------------------------
  // Rotinas de manutencao em segundo plano.
  // -------------------------------------------------------------------
  const rotinaManutencao = async (origem: string) => {
    try {
      console.log(`[${origem}] Sincronizando espelho local e varrendo CNPJs...`);
      await localMirror.syncAllTables();
      if (process.env.CNPJ_AUTO_DISCOVERY === 'true') {
        await cnpjAutoDiscovery.executarVarreduraEAutoCadastro();
      }
    } catch (err: any) {
      // Rotina de manutencao nunca derruba a API.
      console.warn(`[${origem}] Falha nao-bloqueante:`, err.message);
    }
  };

  const primeiraSync = setTimeout(() => rotinaManutencao('BOOT'), 15000);

  /**
   * [CORRECAO] O intervalo antigo era de 24h fixas. Como o processo reinicia
   * com frequencia, a rotina praticamente nunca completava um ciclo. Agora roda
   * a cada 6h -- e a varredura de CNPJ, que gasta cota de API externa, so roda
   * quando explicitamente ligada por CNPJ_AUTO_DISCOVERY=true.
   */
  const intervalo = Number(process.env.SYNC_INTERVAL_MS || 6 * 60 * 60 * 1000);
  const cron = setInterval(() => rotinaManutencao('ROTINA'), intervalo);

  // -------------------------------------------------------------------
  // Encerramento gracioso.
  // -------------------------------------------------------------------
  const encerrar = async (sinal: string) => {
    console.log(`\n[${sinal}] Encerrando...`);
    clearTimeout(primeiraSync);
    clearInterval(cron);
    servidor.close(async () => {
      try {
        await encerrarPool();
        console.log('[SHUTDOWN] Pool de conexoes encerrado. Ate logo.');
      } finally {
        process.exit(0);
      }
    });
    // Se as conexoes nao fecharem em 10s, encerra assim mesmo.
    setTimeout(() => process.exit(0), 10000).unref();
  };

  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

iniciar().catch((err) => {
  console.error('[FATAL] Falha ao iniciar:', err.message);
  process.exit(1);
});
