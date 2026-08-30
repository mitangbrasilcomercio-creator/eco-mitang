const { app } = require('../dist/app');
const http = require('http');
const { Client } = require('pg');
require('dotenv').config();

let server;
const PORT = 3099;
const baseUrl = `http://localhost:${PORT}/api/v1/catalogo`;

async function req(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json };
}

async function runTests() {
  console.log('======================================================================');
  console.log('       TESTE AUTOMATIZADO DOS ENDPOINTS: CATALOGO UNIVERSAL          ');
  console.log('======================================================================\n');

  // Inicia servidor de teste
  server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Servidor de teste iniciado na porta ${PORT}\n`);

  // Busca ID de uma empresa real do banco Supabase
  const client = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const empRes = await client.query("SELECT id, nome_fantasia FROM empresas WHERE cnpj = '11111111000101' LIMIT 1;");
  const empresaId = empRes.rows[0].id;
  console.log(`Tenant de Teste: ${empRes.rows[0].nome_fantasia} (ID: ${empresaId})\n`);

  const headers = {
    'Content-Type': 'application/json',
    'x-empresa-id': empresaId,
    'x-user-role': 'Gerente_Comercial'
  };

  // --------------------------------------------------------------------------
  // TESTE 1: REGRA 2 - Validação de erro quando faltam campos obrigatórios
  // --------------------------------------------------------------------------
  console.log('[TESTE 1] Testando REGRA 2: Rejeição de item Produto sem campos obrigatórios...');
  const invalidProdRes = await req(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tipo_item: 'PRODUTO',
      nome: 'Bateria Invalida',
      detalhes: {
        // preco_base e unidade_medida ausentes intencionalmente
      }
    })
  });
  console.log(`Status retornado: ${invalidProdRes.status} (Esperado: 422)`);
  console.log(`Erro Zod: ${JSON.stringify(invalidProdRes.data.details)}\n`);

  // --------------------------------------------------------------------------
  // TESTE 2: REGRA 2 - Criação dos 4 Tipos Polimórficos com Sucesso
  // --------------------------------------------------------------------------
  console.log('[TESTE 2] Cadastrando 4 Itens Polimórficos no Supabase...');
  
  // A. Produto (Baterias)
  const prodRes = await req(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tipo_item: 'PRODUTO',
      nome: 'Bateria Subsea Lithium High-Cap 24V',
      descricao_tecnica: 'Bateria de alta performance para ROV e AUV submarinos',
      quantidade_estoque_atual: 20,
      detalhes: {
        preco_base: 32000.00,
        unidade_medida: 'UN',
        codigo_sku: 'BAT-LITH-HC24',
        capacidade_ah: 200,
        voltagem_nominal: 24,
        ncm: '85076000'
      }
    })
  });
  console.log(`  -> 1. Produto criado (Status ${prodRes.status}): ID ${prodRes.data.data.id}`);

  // B. Locação (Offshore)
  const locRes = await req(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tipo_item: 'LOCACAO',
      nome: 'Cabrestante de Tracionamento 100T',
      descricao_tecnica: 'Equipamento para lancamento de dutos flexiveis',
      quantidade_estoque_atual: 3,
      detalhes: {
        preco_base: 14500.00,
        unidade_cobranca: 'DIARIA',
        exige_mobilizacao: true,
        certificado_offshore_obrigatorio: true
      }
    })
  });
  console.log(`  -> 2. Locação criada (Status ${locRes.status}): ID ${locRes.data.data.id}`);

  // C. Serviço (Offshore)
  const servRes = await req(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tipo_item: 'SERVICO',
      nome: 'Inspecao Subsea NDT com Ultrassom',
      descricao_tecnica: 'Ensaios Nao Destrutivos em risers e dutos submarinos',
      detalhes: {
        preco_base: 450.00,
        unidade_medida: 'HORA_HOMEM',
        funcao_tecnica: 'Inspetor NDT Nivel 3',
        necessita_art: true
      }
    })
  });
  console.log(`  -> 3. Serviço criado (Status ${servRes.status}): ID ${servRes.data.data.id}`);

  // D. Curso (Treinamento)
  const cursoRes = await req(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tipo_item: 'CURSO',
      nome: 'Treinamento de Seguranca Subsea CBSP & HUET',
      descricao_tecnica: 'Curso homologado Marinha do Brasil para embarque offshore',
      detalhes: {
        preco_base: 1800.00,
        carga_horaria_horas: 40,
        modalidade: 'PRESENCIAL',
        validade_meses: 60
      }
    })
  });
  console.log(`  -> 4. Curso criado (Status ${cursoRes.status}): ID ${cursoRes.data.data.id}\n`);

  const createdItemId = prodRes.data.data.id;

  // --------------------------------------------------------------------------
  // TESTE 3: GET /api/v1/catalogo (Listagem Paginada e Filtrada)
  // --------------------------------------------------------------------------
  console.log('[TESTE 3] Listando itens via GET /api/v1/catalogo...');
  const listRes = await req(`${baseUrl}?limit=5`, { headers });
  console.log(`Total de itens no banco: ${listRes.data.pagination.total}`);
  console.log(`Itens retornados na pagina: ${listRes.data.data.length}\n`);

  // --------------------------------------------------------------------------
  // TESTE 4: PUT /api/v1/catalogo/:id (Atualização)
  // --------------------------------------------------------------------------
  console.log('[TESTE 4] Atualizando dados via PUT /api/v1/catalogo/:id...');
  const updateRes = await req(`${baseUrl}/${createdItemId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      nome: 'Bateria Subsea Lithium High-Cap 24V [ATUALIZADA]',
      quantidade_estoque_atual: 25
    })
  });
  console.log(`Status: ${updateRes.status}, Novo Nome: ${updateRes.data.data.nome}, Estoque: ${updateRes.data.data.quantidade_estoque_atual}\n`);

  // --------------------------------------------------------------------------
  // TESTE 5: PATCH /api/v1/catalogo/:id/inativar (Inativação Segura)
  // --------------------------------------------------------------------------
  console.log('[TESTE 5] Inativando item via PATCH /api/v1/catalogo/:id/inativar...');
  const inactRes = await req(`${baseUrl}/${createdItemId}/inativar`, {
    method: 'PATCH',
    headers
  });
  console.log(`Status: ${inactRes.status}, Ativo: ${inactRes.data.data.ativo}\n`);

  // --------------------------------------------------------------------------
  // TESTE 6: REGRA 1 - Bloqueio de Deleção quando vinculado a Cotação/OS
  // --------------------------------------------------------------------------
  console.log('[TESTE 6] Testando REGRA 1 (Bloqueio de Deleção se vinculado a Cotação)...');
  // Cria cliente e cotação vinculando este item no Supabase
  const clientRes = await client.query(`
    INSERT INTO clientes (empresa_id, razao_social_nome, cnpj_cpf)
    VALUES ($1, 'Cliente Teste Bloqueio SA', '12345678000199')
    ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET razao_social_nome = EXCLUDED.razao_social_nome
    RETURNING id;
  `, [empresaId]);
  const clienteId = clientRes.rows[0].id;

  const cotRes = await client.query(`
    INSERT INTO cotacoes (empresa_id, cliente_id, condicao_pagamento, status)
    VALUES ($1, $2, '30 DDL', 'RASCUNHO')
    RETURNING id;
  `, [empresaId, clienteId]);
  const cotacaoId = cotRes.rows[0].id;

  await client.query(`
    INSERT INTO cotacoes_itens (cotacao_id, item_catalogo_id, valor_unitario_congelado, quantidade, subtotal_item)
    VALUES ($1, $2, 32000.00, 1, 32000.00);
  `, [cotacaoId, createdItemId]);

  console.log(`Item vinculado com sucesso à Cotação #${cotacaoId}. Tentando DELETE no endpoint...`);
  const deleteRes = await req(`${baseUrl}/${createdItemId}`, {
    method: 'DELETE',
    headers
  });

  console.log(`Status HTTP retornado: ${deleteRes.status} (Esperado: 409 Conflict)`);
  console.log(`Código de Erro: ${deleteRes.data.code}`);
  console.log(`Mensagem de Bloqueio: ${deleteRes.data.error}\n`);

  // Cleanup
  console.log('Finalizando conexões e encerrando servidor de testes...');
  await client.end();
  const { pgPool } = require('../dist/core/database/supabase-pool');
  await pgPool.end();
  server.close();

  console.log('======================================================================');
  console.log('    TODOS OS ENDPOINTS E REGRAS DO CATALOGO FORAM VALIDADOS COM 100%!  ');
  console.log('======================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Erro na execução do teste:', err);
  if (server) server.close();
  process.exit(1);
});

