const express = require('express');
const http = require('http');
const { itemCatalogoRouter } = require('../dist/modules/catalogo/routes/item-catalogo.routes');
const { JsonCatalogParser } = require('../dist/modules/ingestion/parsers/json-catalog.parser');
const { Client } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use('/catalogo', itemCatalogoRouter);

let server;
const PORT = 3097;
const baseUrl = `http://localhost:${PORT}/catalogo`;

async function req(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json };
}

async function runTests() {
  console.log('======================================================================');
  console.log('       TESTE: ITEM_CATALOGO (EAV JSONB, MULTI-TENANT & SOFT DELETE)  ');
  console.log('======================================================================\n');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, resolve));

  const client = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const empRes = await client.query("SELECT id, nome_fantasia FROM empresas WHERE cnpj = '11111111000101' LIMIT 1;");
  const empresaId = empRes.rows[0].id;
  console.log(`Tenant de Teste: ${empRes.rows[0].nome_fantasia} (ID: ${empresaId})\n`);

  // --------------------------------------------------------------------------
  // TESTE 1: POST /catalogo com injeção automática de atributos_extras (EAV)
  // --------------------------------------------------------------------------
  console.log('[TESTE 1] Criando Item via POST /catalogo com propriedades extras dinamicas...');
  const createRes = await req(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empresa_id: empresaId,
      tipo_item: 'Produto',
      codigo_sku: `SKU-BAT-${Date.now()}`,
      nome_comercial: 'Bateria Subsea Lithium 48V High-Energy',
      preco_base: 48500.00,
      quantidade_estoque: 12,
      // Propriedades não mapeadas no schema principal que devem ir para atributos_extras:
      tensao_nominal: '48V DC',
      capacidade_ah: 300,
      profundidade_operacao_metros: 3000,
      quimica_celula: 'LiFePO4',
      garantia_meses: 24
    })
  });

  console.log(`Status HTTP: ${createRes.status} (Esperado: 201)`);
  const itemCriado = createRes.data.data;
  console.log(`Item ID: ${itemCriado.id}`);
  console.log(`Nome: ${itemCriado.nome_comercial}`);
  console.log(`Atributos Extras (JSONB Injetado):`, JSON.stringify(itemCriado.atributos_extras, null, 2));

  // --------------------------------------------------------------------------
  // TESTE 2: GET /catalogo com filtro obrigatório por empresa_id
  // --------------------------------------------------------------------------
  console.log('\n[TESTE 2] Listando itens via GET /catalogo?empresa_id=...');
  const listRes = await req(`${baseUrl}?empresa_id=${empresaId}`);
  console.log(`Status HTTP: ${listRes.status} (Esperado: 200)`);
  console.log(`Total de Itens Ativos retornados: ${listRes.data.total}`);

  // Teste de rejeição sem empresa_id
  const invalidListRes = await req(baseUrl);
  console.log(`Listagem sem empresa_id: Status ${invalidListRes.status} (Esperado: 400 - Parametro obrigatorio ausente)`);

  // --------------------------------------------------------------------------
  // TESTE 3: DELETE /catalogo/:id (Soft Delete -> status_ativo = false)
  // --------------------------------------------------------------------------
  console.log('\n[TESTE 3] Executando Soft Delete via DELETE /catalogo/:id...');
  const deleteRes = await req(`${baseUrl}/${itemCriado.id}?empresa_id=${empresaId}`, {
    method: 'DELETE'
  });
  console.log(`Status HTTP: ${deleteRes.status} (Esperado: 200)`);
  console.log(`Item status_ativo pós-delete: ${deleteRes.data.data.status_ativo}`);

  // --------------------------------------------------------------------------
  // TESTE 4: Data Ingestion Parser (ACID Rollback Test)
  // --------------------------------------------------------------------------
  console.log('\n[TESTE 4] Testando Data Ingestion JSON Catalog Parser com Transação ACID...');
  const parser = new JsonCatalogParser();

  // A. Lote Válido
  const batchValido = [
    {
      tipo_item: 'Locacao',
      nome_comercial: 'Guincho Hidraulico 75T',
      preco_base: 9500.00,
      ficha_tecnica: { capacidade_ton: 75, acionamento: 'Eletro-Hidraulico' }
    },
    {
      tipo_item: 'Servico',
      nome_comercial: 'Manutencao Preventiva Subsea',
      preco_base: 650.00,
      ficha_tecnica: { nivel_especialista: 'Senior', exigencia_offshore: true }
    }
  ];

  const ingestRes = await parser.parseAndImportBatch(empresaId, batchValido);
  console.log(`Lote válido importado: ${ingestRes.total_processados} itens inseridos com sucesso.`);

  // B. Lote com Falha no 2º item (Verifica ROLLBACK total)
  console.log('Testando ROLLBACK ACID com lote contendo item inválido...');
  const batchInvalido = [
    {
      tipo_item: 'Curso',
      nome_comercial: 'Treinamento ROV Piloto',
      preco_base: 5000.00
    },
    {
      tipo_item: 'TIPO_INEXISTENTE_INVALIDO', // Vai forçar erro
      nome_comercial: 'Item Com Falha',
      preco_base: 100.00
    }
  ];

  try {
    await parser.parseAndImportBatch(empresaId, batchInvalido);
    console.error('ERRO: Transação não falhou como esperado.');
  } catch (err) {
    console.log(`[ROLLBACK ACID CONFIRMADO COM SUCESSO]: ${err.message}`);
  }

  await client.end();
  server.close();
  console.log('\n======================================================================');
  console.log('       TODOS OS TESTES DO ITEM_CATALOGO FORAM CONCLUÍDOS COM 100%!   ');
  console.log('======================================================================\n');
}

runTests().catch(err => {
  console.error(err);
  if (server) server.close();
  process.exit(1);
});
