const { localMirror } = require('../dist/core/database/local-mirror.service');
const { pgPool } = require('../dist/core/database/supabase-pool');

async function run() {
  try {
    await localMirror.syncAllTables();
    console.log('[SUCESSO] Mirror local 100% populado e pronto para contingência.');
  } catch (err) {
    console.error('Erro na sincronização do mirror:', err);
  } finally {
    pgPool.end();
  }
}

run();
