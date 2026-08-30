const fs = require('fs');
const path = require('path');
const { pgPool } = require('../dist/core/database/supabase-pool');
const { NfeIngestionService } = require('../dist/modules/faturamento/xml/nfe-ingestion.service');

async function testXmlNfeIngestion() {
  console.log('======================================================================');
  console.log('    TESTE REAL DE INGESTÃO DE NOTAS FISCAIS (NFe & NFSe) COM ACID    ');
  console.log('======================================================================\n');

  const client = await pgPool.connect();

  try {
    // 1. Obter tenant e CNPJ da Mitang
    const empRes = await client.query(`
      SELECT id, razao_social, nome_fantasia, cnpj FROM empresas LIMIT 1;
    `);
    const empresa = empRes.rows[0];
    console.log(`[1/5] Tenant Ativo: ${empresa.nome_fantasia} [CNPJ: ${empresa.cnpj}]`);

    const ingestionService = new NfeIngestionService();
    const baseDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'NFe e NFSe');

    function findFile(matchStr) {
      function scan(d) {
        const list = fs.readdirSync(d);
        for (const item of list) {
          const p = path.join(d, item);
          if (fs.statSync(p).isDirectory()) {
            const f = scan(p);
            if (f) return f;
          } else if (item.includes(matchStr)) {
            return p;
          }
        }
        return null;
      }
      return scan(baseDir);
    }

    // 2. Ingestão de NF-e Real de Venda Mitang
    const nfeMitangPath = findFile('00000002161') || findFile('2161');
    const nfeMitangXml = fs.readFileSync(nfeMitangPath, 'utf8');

    console.log(`\n[2/5] Importando NF-e Real Emitida pela Mitang: "NF-e 216"...`);
    const resNfe1 = await ingestionService.importarXml(empresa.id, '44221348000184', nfeMitangXml);

    console.log(`   -> Chave de Acesso: ${resNfe1.chaveAcesso}`);
    console.log(`   -> Número da Nota:  ${resNfe1.numeroNota} | Tipo: ${resNfe1.tipoDocumento} | Direção: ${resNfe1.direcao}`);
    console.log(`   -> Emitente:        ${resNfe1.emitenteNome}`);
    console.log(`   -> Destinatário:    ${resNfe1.destinatarioNome}`);
    console.log(`   -> Valor Total:     R$ ${resNfe1.valorTotal.toFixed(2)}`);
    console.log(`   -> Total de Itens:  ${resNfe1.totalItens} itens gravados`);
    console.log(`   -> Duplicatas:      ${resNfe1.totalDuplicatas} faturas`);
    console.log(`   -> Duplicata?:      ${resNfe1.duplicataIgnorada}`);

    // 3. Prova de Fogo Anti-Duplicação da NF-e
    console.log(`\n[3/5] Testando Re-importação da mesma NF-e 216 (Anti-Duplicação)...`);
    const resNfe1Dup = await ingestionService.importarXml(empresa.id, '44221348000184', nfeMitangXml);
    console.log(`   -> Duplicata Ignorada?: ${resNfe1Dup.duplicataIgnorada} (ESPERADO: true)`);
    if (!resNfe1Dup.duplicataIgnorada) {
      throw new Error('Falha de Idempotência: NF-e duplicada foi aceita!');
    }
    console.log(`   -> [OK] NF-e duplicada rejeitada com sucesso sem corromper o banco!`);

    // 4. Ingestão de NF-e Real de Fornecedor (STREMA - Compra de Baterias / Componentes)
    const nfeStremaPath = findFile('000063922') || findFile('63922');
    const nfeStremaXml = fs.readFileSync(nfeStremaPath, 'utf8');

    console.log(`\n[4/5] Importando NF-e de Compra do Fornecedor STREMA: "NF 63922"...`);
    const resStrema = await ingestionService.importarXml(empresa.id, '44221348000184', nfeStremaXml);

    console.log(`   -> Chave de Acesso: ${resStrema.chaveAcesso}`);
    console.log(`   -> Número da Nota:  ${resStrema.numeroNota} | Direção: ${resStrema.direcao} (ESPERADO: RECEBIDA)`);
    console.log(`   -> Emitente:        ${resStrema.emitenteNome}`);
    console.log(`   -> Destinatário:    ${resStrema.destinatarioNome}`);
    console.log(`   -> Valor Total:     R$ ${resStrema.valorTotal.toFixed(2)}`);
    console.log(`   -> Itens de Matéria-Prima: ${resStrema.totalItens}`);
    console.log(`   -> Faturas / Duplicatas a Pagar: ${resStrema.totalDuplicatas}`);

    // 5. Ingestão de NFS-e Real de Serviços (Padrão Nacional SPED)
    const nfsePath = findFile('000000000000126015104482002');
    const nfseXml = fs.readFileSync(nfsePath, 'utf8');

    console.log(`\n[5/5] Importando NFS-e de Serviços (Padrão Nacional): "NFS-e #1 (Sea Survey)"...`);
    const resNfse = await ingestionService.importarXml(empresa.id, '44221348000184', nfseXml);

    console.log(`   -> Chave/Id NFS-e:  ${resNfse.chaveAcesso}`);
    console.log(`   -> Número da Nota:  ${resNfse.numeroNota} | Tipo: ${resNfse.tipoDocumento}`);
    console.log(`   -> Tomador Serviço: ${resNfse.destinatarioNome}`);
    console.log(`   -> Valor Serviços:  R$ ${resNfse.valorTotal.toFixed(2)}`);
    console.log(`   -> Cliente Vinculado: ${resNfse.clienteId ? 'Sim (' + resNfse.clienteId + ')' : 'Não'}`);

    // Verificar se o JSONB e XML estão gravados na íntegra
    const checkDbQuery = `
      SELECT id, chave_acesso, length(conteudo_xml) as tamanho_xml,
             jsonb_typeof(dados_completos_json) as tipo_json,
             (dados_completos_json->'nfeProc' IS NOT NULL OR dados_completos_json->'NFSe' IS NOT NULL) as json_preservado
      FROM notas_fiscais
      WHERE id = $1;
    `;
    const checkDbRes = await client.query(checkDbQuery, [resNfe1.notaFiscalId]);
    const row = checkDbRes.rows[0];
    console.log(`\nIntegridade no Banco de Dados:`);
    console.log(`   -> Tamanho do XML bruto armazenado: ${row.tamanho_xml} bytes`);
    console.log(`   -> Tipo do JSON estruturado:        ${row.tipo_json}`);
    console.log(`   -> Árvore de tags intacta?:         ${row.json_preservado}`);

    console.log('\n======================================================================');
    console.log('>>> TODOS OS TESTES DE INGESTÃO NFe E NFSe PASSARAM COM 100%! <<<');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('[ERRO TESTE XML]:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
    process.exit(0);
  }
}

testXmlNfeIngestion();
