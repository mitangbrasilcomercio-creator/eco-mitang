const { cnpjAutoDiscovery } = require('../dist/modules/clientes/cnpj-auto-discovery.service');

async function main() {
  try {
    const res = await cnpjAutoDiscovery.executarVarreduraEAutoCadastro();
    console.log('[RESULTADO AUTO-DISCOVERY]', res);
    process.exit(0);
  } catch (err) {
    console.error('[ERRO AUTO-DISCOVERY]', err);
    process.exit(1);
  }
}

main();
