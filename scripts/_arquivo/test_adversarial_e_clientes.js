const { app } = require('../dist/app');
const http = require('http');
const { Client } = require('pg');
const { CnpjEnrichmentGateway } = require('../dist/modules/clientes/cnpj-enrichment.gateway');
const { globalEventBus } = require('../dist/core/events/event-bus');
require('dotenv').config();

let server;
const PORT = 3097;
const baseUrl = `http://localhost:${PORT}/api/v1`;

async function req(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json };
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('   SUITE DE TESTES ADVERSARIAIS & VALIDACAO DE CLIENTES INTELIGENTE   ');
  console.log('======================================================================\n');

  // Inicia servidor Express na porta 3097
  server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Servidor ativo na porta ${PORT}`);

  // Conexão com banco Supabase para obter dados de teste
  const dbClient = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await dbClient.connect();

  const empRes = await dbClient.query("SELECT id, nome_fantasia FROM empresas ORDER BY cnpj LIMIT 2;");
  const tenant1 = empRes.rows[0];
  const tenant2 = empRes.rows[1];
  console.log(`Tenant 1 (Teste Principal): ${tenant1.nome_fantasia} (${tenant1.id})`);
  console.log(`Tenant 2 (Teste Cross-Tenant): ${tenant2.nome_fantasia} (${tenant2.id})\n`);

  // Ouvinte de eventos no barramento para validar consistência Event-Driven
  const eventosCapturados = [];
  globalEventBus.subscribe('CLIENTE.CRIADO', e => eventosCapturados.push(e));
  globalEventBus.subscribe('CLIENTE.DADOS_ATUALIZADOS_AUTOMATICAMENTE', e => eventosCapturados.push(e));
  globalEventBus.subscribe('CLIENTE.SITUACAO_FISCAL_ALTERADA', e => eventosCapturados.push(e));
  globalEventBus.subscribe('ORDEM_SERVICO.STATUS_ATUALIZADO', e => eventosCapturados.push(e));

  // --------------------------------------------------------------------------
  // PROVA 1: TENTATIVA DE INJEÇÃO SQL NO MULTI-TENANT
  // --------------------------------------------------------------------------
  console.log('[PROVA 1] Testando Proteção contra SQL Injection no Tenant Middleware...');
  const sqlInjectionRes = await req(`${baseUrl}/catalogo`, {
    headers: {
      'Content-Type': 'application/json',
      'x-empresa-id': "29ea0857-7cf7-44e1-ba36-a3f323c4670c' OR '1'='1"
    }
  });

  console.log(`  -> Status retornado: ${sqlInjectionRes.status} (Esperado: 400 Bad Request)`);
  console.log(`  -> Código de erro: ${sqlInjectionRes.data.code}`);
  if (sqlInjectionRes.status === 400 && sqlInjectionRes.data.code === 'INVALID_TENANT_UUID') {
    console.log('  [PASSOU] Injeção SQL barrada na camada de middleware com validação estrita de UUID!\n');
  } else {
    throw new Error('Falha na Prova 1: Vulnerabilidade de injeção SQL no tenant permitiu passagem.');
  }

  // --------------------------------------------------------------------------
  // PROVA 2: TENTATIVA DE BURLAR VALIDAÇÃO POLIMÓRFICA NO UPDATE DO CATÁLOGO
  // --------------------------------------------------------------------------
  console.log('[PROVA 2] Testando Bloqueio de Valores Inválidos (Preço Negativo) em PUT no Catálogo...');
  // 1. Cadastra um produto válido
  const prodCriadoRes = await req(`${baseUrl}/catalogo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-empresa-id': tenant1.id },
    body: JSON.stringify({
      tipo_item: 'PRODUTO',
      nome: 'Bateria Subsea Teste Blindagem',
      quantidade_estoque_atual: 10,
      detalhes: {
        preco_base: 18000.00,
        unidade_medida: 'UN'
      }
    })
  });
  const itemId = prodCriadoRes.data.data.id;

  // 2. Tenta atualizar com preço negativo via PUT
  const updateBurlarRes = await req(`${baseUrl}/catalogo/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-empresa-id': tenant1.id },
    body: JSON.stringify({
      detalhes: {
        preco_base: -9999.00
      }
    })
  });

  console.log(`  -> Status retornado: ${updateBurlarRes.status} (Esperado: 422 Unprocessable Entity)`);
  console.log(`  -> Mensagem de erro: ${updateBurlarRes.data.error}`);
  if (updateBurlarRes.status === 422 && updateBurlarRes.data.code === 'UNPROCESSABLE_ENTITY_POLYMORPHIC_UPDATE') {
    console.log('  [PASSOU] Validação polimórfica ativa no update bloqueou preço negativo com sucesso!\n');
  } else {
    throw new Error('Falha na Prova 2: Update aceitou preço negativo ou campo inválido sem validação polimórfica.');
  }

  // --------------------------------------------------------------------------
  // PROVA 3: SEGURANÇA E RESILIÊNCIA EM WEBHOOKS OPERACIONAIS
  // --------------------------------------------------------------------------
  console.log('[PROVA 3] Testando Segurança e Validação de Ações em Webhooks...');
  // 3.1 Ação QSMS inválida
  const invalidAcaoRes = await req(`${baseUrl}/webhooks/operacional/status-qsms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      os_id: '00000000-0000-0000-0000-000000000000',
      empresa_id: tenant1.id,
      acao: 'ACAO_INEXISTENTE_HACK'
    })
  });
  console.log(`  -> Teste 3.1: Status com acao invalida: ${invalidAcaoRes.status} (Esperado: 422)`);
  if (invalidAcaoRes.status !== 422 || invalidAcaoRes.data.code !== 'INVALID_QSMS_ACTION') {
    throw new Error('Falha na Prova 3.1: Webhook QSMS aceitou ação arbitrária sem validação.');
  }

  // 3.2 Tentativa com token de autenticação falso
  const unauthRes = await req(`${baseUrl}/webhooks/operacional/status-qsms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': 'secret-malicioso-falso'
    },
    body: JSON.stringify({
      os_id: '00000000-0000-0000-0000-000000000000',
      empresa_id: tenant1.id,
      acao: 'LIBERAR'
    })
  });
  console.log(`  -> Teste 3.2: Status com segredo falso: ${unauthRes.status} (Esperado: 401 Unauthorized)`);
  if (unauthRes.status === 401 && unauthRes.data.code === 'UNAUTHORIZED_WEBHOOK_CALL') {
    console.log('  [PASSOU] Proteção de autenticação de webhooks validada!\n');
  } else {
    throw new Error('Falha na Prova 3.2: Webhook aceitou secret falso.');
  }

  // --------------------------------------------------------------------------
  // PROVA 4: CADASTRO 100% AUTOMATIZADO DE CLIENTE VIA CNPJ (ENRIQUECIMENTO)
  // --------------------------------------------------------------------------
  console.log('[PROVA 4] Cadastrando Cliente informando APENAS o CNPJ da MODEC (Auto-Enriquecimento)...');
  const cnpjModec = '05.470.395/0001-00';

  // Remove do banco se ja existir de teste anterior para teste limpo
  await dbClient.query("DELETE FROM clientes WHERE empresa_id = $1 AND regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') = '05470395000100'", [tenant1.id]);

  const cadastroAutoRes = await req(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-empresa-id': tenant1.id },
    body: JSON.stringify({
      cnpj_cpf: cnpjModec,
      auto_enriquecer_receita: true
    })
  });

  console.log(`  -> Status HTTP: ${cadastroAutoRes.status} (Esperado: 201 Created)`);
  const clienteModec = cadastroAutoRes.data.data;
  console.log(`  -> Razão Social Auto-Descoberta: '${clienteModec.razao_social_nome}'`);
  console.log(`  -> Nome Fantasia               : '${clienteModec.nome_fantasia}'`);
  console.log(`  -> CNAE Principal              : '${clienteModec.cnae_principal}' (${clienteModec.cnae_descricao})`);
  console.log(`  -> Endereço Oficial            : ${clienteModec.logradouro}, ${clienteModec.numero} - ${clienteModec.bairro}, ${clienteModec.municipio}/${clienteModec.uf}`);
  console.log(`  -> Situação na Receita Federal : '${clienteModec.situacao_cadastral}' (Bloqueio Fiscal: ${clienteModec.bloqueio_fiscal})`);
  console.log(`  -> QSA (Sócios/Diretores)      : ${clienteModec.qsa.length} sócio(s) identificado(s)`);

  if (
    clienteModec.razao_social_nome.includes('MODEC') &&
    clienteModec.situacao_cadastral === 'ATIVA' &&
    clienteModec.bloqueio_fiscal === false
  ) {
    console.log('  [PASSOU] Cliente cadastrado com 100% de automação dos dados da Receita Federal!\n');
  } else {
    throw new Error('Falha na Prova 4: Dados do cliente enriquecido não coincidem com o oficial.');
  }

  // --------------------------------------------------------------------------
  // PROVA 5: DETECÇÃO DE RISCO FISCAL & BLOQUEIO AUTOMÁTICO (EMPRESA INAPTA)
  // --------------------------------------------------------------------------
  console.log('[PROVA 5] Cadastrando Empresa Inapta na Receita Federal (Gatilho de Bloqueio Fiscal)...');
  const cnpjInapta = '11.222.333/0001-81';
  await dbClient.query("DELETE FROM clientes WHERE empresa_id = $1 AND regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') = '11222333000181'", [tenant1.id]);

  const cadastroInaptaRes = await req(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-empresa-id': tenant1.id },
    body: JSON.stringify({
      cnpj_cpf: cnpjInapta,
      auto_enriquecer_receita: true
    })
  });

  const clienteInapto = cadastroInaptaRes.data.data;
  console.log(`  -> Empresa Cadastrada          : '${clienteInapto.razao_social_nome}'`);
  console.log(`  -> Situação Cadastral Detectada: '${clienteInapto.situacao_cadastral}'`);
  console.log(`  -> Motivo Oficial              : '${clienteInapto.motivo_situacao_cadastral}'`);
  console.log(`  -> [GATILHO DE SEGURANÇA ATIVO]: Bloqueio Fiscal = ${clienteInapto.bloqueio_fiscal}`);

  if (clienteInapto.situacao_cadastral === 'INAPTA' && clienteInapto.bloqueio_fiscal === true) {
    console.log('  [PASSOU] Bloqueio fiscal ativado no ato do cadastro, impedindo faturamento irregular!\n');
  } else {
    throw new Error('Falha na Prova 5: Empresa inapta não foi bloqueada fiscalmente.');
  }

  // --------------------------------------------------------------------------
  // PROVA 6: SINCRONIZAÇÃO EM BACKGROUND ("POR TRÁS DOS PANOS") & HISTÓRICO CDC
  // --------------------------------------------------------------------------
  console.log('[PROVA 6] Simulando Alteração Cadastral Externa (Mudança de Endereço + Situação Cadastral)...');
  // O cliente MODEC mudou de endereço na base oficial para Macaé Offshore
  // e alterou o nome fantasia, SEM AVISAR NINGUÉM!
  CnpjEnrichmentGateway.simularAlteracaoOficial('05470395000100', {
    nome_fantasia: 'MODEC BASE DE APOIO MACAE OFFSHORE',
    logradouro: 'Avenida Elias Agostinho',
    numero: '500',
    bairro: 'Imbetiba',
    municipio: 'Macae',
    cep: '27913-350',
    data_situacao_cadastral: '2026-08-20'
  });

  console.log('  -> Disparando robô de sincronização em background (POST /clientes/sincronizacao-background)...');
  const syncRes = await req(`${baseUrl}/clientes/sincronizacao-background?cliente_id=${clienteModec.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-empresa-id': tenant1.id }
  });

  console.log(`  -> Status do Robô: ${syncRes.status}`);
  console.log(`  -> Relatório da Sincronização: ${syncRes.data.data.mensagem}`);
  console.log(`  -> Campos Detectados e Atualizados: [${syncRes.data.data.campos_alterados.join(', ')}]`);
  console.log(`  -> Data de Vigência da Alteração: ${syncRes.data.data.data_vigencia.substring(0, 10)}`);

  // Consulta o histórico de alterações (Audit Log / SCD Tipo 2)
  const histRes = await req(`${baseUrl}/clientes/${clienteModec.id}/historico`, {
    headers: { 'x-empresa-id': tenant1.id }
  });

  console.log(`\n  -> [REGISTROS DE AUDITORIA HISTÓRICA GERADOS]: Total = ${histRes.data.total_registros}`);
  histRes.data.data.forEach(h => {
    console.log(`     * Campo: [${h.campo_alterado}] | Antes: '${h.valor_anterior}' -> Depois: '${h.valor_novo}' | Vigência: ${h.data_vigencia.substring(0, 10)} | Origem: ${h.origem_alteracao}`);
  });

  if (histRes.data.total_registros >= 4 && syncRes.data.data.teve_alteracao === true) {
    console.log('  [PASSOU] Sincronização em background atualizou o DB e gerou histórico fiel com data de vigência!\n');
  } else {
    throw new Error('Falha na Prova 6: Histórico de alterações não registrou as divergências.');
  }

  // --------------------------------------------------------------------------
  // PROVA 7: ISOLAMENTO MULTI-TENANT ESTREITO ENTRE EMPRESAS DA HOLDING
  // --------------------------------------------------------------------------
  console.log('[PROVA 7] Testando Isolamento Multi-Tenant (Cross-Tenant Leakage Check)...');
  // Tenant 2 tenta acessar cliente cadastrado pelo Tenant 1
  const crossTenantRes = await req(`${baseUrl}/clientes/${clienteModec.id}`, {
    headers: { 'x-empresa-id': tenant2.id }
  });

  console.log(`  -> Status com tenant diferente: ${crossTenantRes.status} (Esperado: 404 Not Found)`);
  if (crossTenantRes.status === 404 && crossTenantRes.data.code === 'CLIENTE_NOT_FOUND') {
    console.log('  [PASSOU] Isolamento RLS e multi-tenant garantido: Tenant 2 não enxerga clientes do Tenant 1!\n');
  } else {
    throw new Error('Falha na Prova 7: Vazamento de dados cadastrais entre tenants!');
  }

  // --------------------------------------------------------------------------
  // PROVA 8: VERIFICAÇÃO DE EVENTOS DISPARADOS NO BARRAMENTO (EVENT-DRIVEN)
  // --------------------------------------------------------------------------
  console.log('[PROVA 8] Verificando Consistência do Barramento de Eventos de Domínio...');
  console.log(`  -> Total de eventos de clientes/OS capturados: ${eventosCapturados.length}`);
  eventosCapturados.forEach(e => {
    console.log(`     * Evento: '${e.eventType}' | Tenant: ${e.empresaId} | Timestamp: ${e.timestamp}`);
  });

  const temClienteCriado = eventosCapturados.some(e => e.eventType === 'CLIENTE.CRIADO');
  const temClienteAtualizado = eventosCapturados.some(e => e.eventType === 'CLIENTE.DADOS_ATUALIZADOS_AUTOMATICAMENTE');

  if (temClienteCriado && temClienteAtualizado) {
    console.log('  [PASSOU] Barramento de eventos publicou com sucesso todos os eventos de ciclo de vida cadastral!\n');
  } else {
    throw new Error('Falha na Prova 8: Eventos esperados não foram emitidos no barramento.');
  }

  // Cleanup
  console.log('Encerrando conexões e finalizando suíte...');
  await dbClient.end();
  const { pgPool } = require('../dist/core/database/supabase-pool');
  await pgPool.end();
  server.close();

  console.log('======================================================================');
  console.log('    TODAS AS 8 PROVAS E TESTES AUTOMATIZADOS PASSARAM COM 100%!       ');
  console.log('======================================================================\n');
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('\n[ERRO NA EXECUÇÃO DOS TESTES ADVERSARIAIS]:', err);
  if (server) server.close();
  process.exit(1);
});
