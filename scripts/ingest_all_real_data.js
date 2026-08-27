const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const { OfxIngestionService } = require('../dist/modules/financeiro/ofx/ofx-ingestion.service');
const { NfeIngestionService } = require('../dist/modules/faturamento/xml/nfe-ingestion.service');

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const MITANG_ID = '29ea0857-7cf7-44e1-ba36-a3f323c4670c';
const ARANDU_ID = '0754c882-d528-4d34-8c96-6d9af7e8d322';

function findFilesRecursive(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findFilesRecursive(fullPath, exts));
    } else {
      const ext = path.extname(item.name).toLowerCase();
      if (exts.includes(ext)) results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('======================================================================');
    console.log('     CARGA INTEGRAL EM MASSA: OFX, XMLs, CLIENTES E PRODUTOS          ');
    console.log('======================================================================');

    // 1. Atualizar Empresas com Razão Social e CNPJs Oficiais
    await client.query(`
      UPDATE empresas 
      SET razao_social = 'MITANG BRASIL COMERCIO E SERVICOS LTDA',
          nome_fantasia = 'Mitang Brasil (Baterias)',
          cnpj = '44221348000184'
      WHERE id = $1;
    `, [MITANG_ID]);

    await client.query(`
      UPDATE empresas 
      SET razao_social = 'ARANDU COMERCIO E SERVICOS LTDA',
          nome_fantasia = 'Arandu Comércio (Baterias)',
          cnpj = '61349982000116'
      WHERE id = $1;
    `, [ARANDU_ID]);

    console.log('[OK] Empresas atualizadas com CNPJs reais.');

    // 2. Replicar todos os clientes para Arandu também (compartilhamento de carteira)
    console.log('\n[CLIENTES] Replicando base de 58 clientes para Mitang e Arandu...');
    const clientesMitang = await client.query(`SELECT * FROM clientes WHERE empresa_id = $1;`, [MITANG_ID]);
    
    let inseridosArandu = 0;
    for (const c of clientesMitang.rows) {
      await client.query(`
        INSERT INTO clientes (
          empresa_id, razao_social_nome, nome_fantasia, cnpj_cpf, email, telefone,
          ativo, cep, logradouro, numero, complemento, bairro, municipio, uf,
          cnae_principal, cnae_descricao, situacao_cadastral, motivo_situacao_cadastral,
          data_situacao_cadastral, capital_social, porte, natureza_juridica,
          opcao_pelo_simples, opcao_pelo_mei, qsa, cnaes_secundarios, dados_receita_brutos,
          bloqueio_fiscal, ultima_sincronizacao_rfb
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
        )
        ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET
          capital_social = EXCLUDED.capital_social,
          qsa = EXCLUDED.qsa,
          bloqueio_fiscal = EXCLUDED.bloqueio_fiscal;
      `, [
        ARANDU_ID, c.razao_social_nome, c.nome_fantasia, c.cnpj_cpf, c.email, c.telefone,
        c.ativo, c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.municipio, c.uf,
        c.cnae_principal, c.cnae_descricao, c.situacao_cadastral, c.motivo_situacao_cadastral,
        c.data_situacao_cadastral, c.capital_social, c.porte, c.natureza_juridica,
        c.opcao_pelo_simples, c.opcao_pelo_mei, JSON.stringify(c.qsa || []), JSON.stringify(c.cnaes_secundarios || []),
        JSON.stringify(c.dados_receita_brutos || {}), c.bloqueio_fiscal, c.ultima_sincronizacao_rfb
      ]);
      inseridosArandu++;
    }
    console.log(`[OK] ${inseridosArandu} clientes vinculados à Arandu! Total de clientes agora ativo em ambas empresas.`);

    // 3. Ingestão em Massa dos 24 Extratos OFX Reais
    console.log('\n[OFX] Localizando e ingerindo todos os 24 arquivos OFX...');
    const baseOfxDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'Extratos Bancários OFX');
    const ofxFiles = findFilesRecursive(baseOfxDir, ['.ofx']);
    console.log(`Encontrados ${ofxFiles.length} arquivos OFX para processamento.`);

    const ofxService = new OfxIngestionService();
    let totalTransacoesNovas = 0;
    let totalArquivosOfxProcessados = 0;

    for (const filePath of ofxFiles) {
      const fileName = path.basename(filePath);
      const isArandu = filePath.includes('Arandu');
      const empresaId = isArandu ? ARANDU_ID : MITANG_ID;
      const content = fs.readFileSync(filePath, 'latin1');

      try {
        const res = await ofxService.importarOfx(empresaId, fileName, content, 'BULK_SEEDED');
        totalTransacoesNovas += res.transacoesInseridas;
        totalArquivosOfxProcessados++;
        console.log(`  -> OFX [${isArandu ? 'Arandu' : 'Mitang'}]: ${fileName} (${res.transacoesInseridas} novas, ${res.transacoesDuplicadasIgnoradas} duplicadas, Banco: ${res.banco})`);
      } catch (err) {
        console.error(`  [ERRO OFX]: ${fileName}:`, err.message);
      }
    }
    console.log(`[OK] ${totalArquivosOfxProcessados} extratos OFX processados com sucesso! (+${totalTransacoesNovas} transações inseridas)`);

    // 4. Ingestão em Massa dos 173 XMLs Fiscais (NF-e e NFS-e)
    console.log('\n[XML FISCAL] Localizando e ingerindo todos os 173 XMLs...');
    const baseXmlDir = path.join(__dirname, '..', 'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro', 'NFe e NFSe');
    const xmlFiles = findFilesRecursive(baseXmlDir, ['.xml']);
    console.log(`Encontrados ${xmlFiles.length} arquivos XML para processamento.`);

    const nfeService = new NfeIngestionService();
    let totalXmlInseridos = 0;
    let totalXmlDuplicados = 0;

    for (const filePath of xmlFiles) {
      const fileName = path.basename(filePath);
      const isArandu = filePath.includes('Arandu');
      const empresaId = isArandu ? ARANDU_ID : MITANG_ID;
      const cnpjEmpresa = isArandu ? '61349982000116' : '44221348000184';
      const content = fs.readFileSync(filePath, 'utf8');

      try {
        const res = await nfeService.importarXml(empresaId, cnpjEmpresa, content);
        if (res.duplicataIgnorada) {
          totalXmlDuplicados++;
        } else {
          totalXmlInseridos++;
        }
      } catch (err) {
        console.error(`  [ERRO XML]: ${fileName}:`, err.message);
      }
    }
    console.log(`[OK] ${xmlFiles.length} XMLs processados! (${totalXmlInseridos} novos gravados, ${totalXmlDuplicados} já existentes)`);

    // 5. Totalizador Geral
    const countTransacoes = await client.query(`SELECT count(*) FROM transacoes_bancarias;`);
    const countNotas = await client.query(`SELECT count(*) FROM notas_fiscais;`);
    const countClientes = await client.query(`SELECT count(*) FROM clientes;`);
    const countBaterias = await client.query(`SELECT count(*) FROM catalogo_universal;`);
    const countOrc = await client.query(`SELECT count(*) FROM orcamentos_historico;`);

    console.log('\n======================================================================');
    console.log('               ESTADO FINAL DO BANCO DE DADOS SUPABASE                ');
    console.log('======================================================================');
    console.log(`  -> Total de Clientes Cadastrados:     ${countClientes.rows[0].count}`);
    console.log(`  -> Total de Baterias em Catálogo:     ${countBaterias.rows[0].count}`);
    console.log(`  -> Total de Cotações & Orçamentos:    ${countOrc.rows[0].count}`);
    console.log(`  -> Total de Notas Fiscais no DB:      ${countNotas.rows[0].count}`);
    console.log(`  -> Total de Transações Bancárias OFX: ${countTransacoes.rows[0].count}`);
    console.log('======================================================================\n');

  } catch (err) {
    console.error('Erro na carga integral:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
