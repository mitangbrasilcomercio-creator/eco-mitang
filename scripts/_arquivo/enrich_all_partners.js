const { pgPool } = require('../dist/core/database/supabase-pool');
const { CnpjEnrichmentService } = require('../dist/modules/clientes/cnpj-enrichment.service');
const { localMirror } = require('../dist/core/database/local-mirror.service');

async function enrichAllPartners() {
  let client;
  try {
    client = await pgPool.connect();
  } catch (e) {
    console.log('Tentando reconectar em 2s...');
    await new Promise(r => setTimeout(r, 2000));
    client = await pgPool.connect();
  }

  try {
    console.log('========================================================================');
    console.log('      AUTO-ENRIQUECIMENTO DE CNPJs COM RECEITA FEDERAL & VERTICAIS      ');
    console.log('========================================================================');

    const res = await client.query(`
      SELECT id, empresa_id, razao_social_nome, cnpj_cpf, capital_social, cnae_principal
      FROM clientes
      WHERE cnpj_cpf IS NOT NULL AND cnpj_cpf != ''
      ORDER BY created_at ASC;
    `);

    console.log(`Total de parceiros para análise e enriquecimento: ${res.rows.length}`);

    let enriquecidos = 0;
    let jaCompletos = 0;
    let falhas = 0;

    for (const c of res.rows) {
      const cleanCnpj = c.cnpj_cpf.replace(/[^\d]/g, '');
      if (cleanCnpj.length !== 14) continue;

      // Se já tem capital social e CNAE, apenas garante que a vertical esteja preenchida
      if (c.capital_social && c.cnae_principal) {
        const vert = CnpjEnrichmentService.inferirVertical(c.cnae_principal, null, c.razao_social_nome);
        await client.query(`
          UPDATE clientes 
          SET dados_receita_brutos = jsonb_set(COALESCE(dados_receita_brutos, '{}'::jsonb), '{vertical}', $1::jsonb)
          WHERE id = $2;
        `, [JSON.stringify(vert), c.id]);
        jaCompletos++;
        continue;
      }

      console.log(`Consultando e enriquecendo CNPJ ${cleanCnpj} (${c.razao_social_nome})...`);
      try {
        const rawData = await CnpjEnrichmentService.consultarCnpj(cleanCnpj);
        if (rawData && !rawData.error) {
          await CnpjEnrichmentService.salvarParceiroEnriquecido(c.empresa_id, rawData);
          enriquecidos++;
          console.log(` -> [OK] ${rawData.razao_social || c.razao_social_nome} enriquecido com sucesso!`);
        } else {
          falhas++;
        }
      } catch (err) {
        console.warn(` -> [AVISO] Não foi possível consultar ${cleanCnpj}: ${err.message}`);
        falhas++;
      }

      // Pequena pausa para respeitar limites de requisição caso precise consultar externa
      await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n========================================================================');
    console.log(`Enriquecimento finalizado: ${enriquecidos} novos enriquecidos, ${jaCompletos} já completos, ${falhas} não consultados.`);
    console.log('========================================================================');

    // Atualiza mirror local
    await localMirror.syncAllTables();

  } finally {
    client.release();
    pgPool.end();
  }
}

enrichAllPartners();
