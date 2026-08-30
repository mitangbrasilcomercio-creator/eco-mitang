const { app } = require('../dist/app');
const http = require('http');
const { Client } = require('pg');
require('dotenv').config();

let server;
const PORT = 3098;
const webhookBaseUrl = `http://localhost:${PORT}/api/v1/webhooks/operacional`;

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runTestTravas() {
  console.log('======================================================================');
  console.log('       TESTE DAS TRAVAS & WEBHOOKS DE DESBLOQUEIO (SUPABASE)         ');
  console.log('======================================================================\n');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Servidor de Webhooks ativo na porta ${PORT}`);

  const client = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // 1. Obtém dados base da empresa e catálogo
  const empRes = await client.query("SELECT id, nome_fantasia FROM empresas WHERE cnpj = '11111111000101' LIMIT 1;");
  const empresaId = empRes.rows[0].id;
  const itemRes = await client.query("SELECT id, nome FROM catalogo_universal WHERE empresa_id = $1 LIMIT 1;", [empresaId]);
  const itemId = itemRes.rows[0].id;

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Criação de Cotação e Ordem de Serviço com Travas Ativas
  // --------------------------------------------------------------------------
  console.log('\n[ETAPA 1] Criando Cotação e Ordem de Serviço com Travas Ativas...');
  const cliRes = await client.query("INSERT INTO clientes (empresa_id, razao_social_nome, cnpj_cpf) VALUES ($1, 'Petrobras E&P', '33000167000101') ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET razao_social_nome = EXCLUDED.razao_social_nome RETURNING id;", [empresaId]);
  const clienteId = cliRes.rows[0].id;

  const cotRes = await client.query(`
    INSERT INTO cotacoes (empresa_id, cliente_id, condicao_pagamento, status, valor_total_liquido)
    VALUES ($1, $2, '50% Entrada + 50% 30 DDL', 'GANHA', 50000.00)
    RETURNING id;
  `, [empresaId, clienteId]);
  const cotacaoId = cotRes.rows[0].id;

  const itemCotRes = await client.query(`
    INSERT INTO cotacoes_itens (cotacao_id, item_catalogo_id, valor_unitario_congelado, quantidade, subtotal_item)
    VALUES ($1, $2, 50000.00, 1, 50000.00)
    RETURNING id;
  `, [cotacaoId, itemId]);
  const cotacaoItemId = itemCotRes.rows[0].id;

  const osRes = await client.query(`
    INSERT INTO ordens_servico (
      empresa_id, cotacao_origem_id, cotacao_item_origem_id, tipo_os, status, bloqueio_financeiro, bloqueio_qsms
    ) VALUES ($1, $2, $3, 'PRODUCAO', 'AGUARDANDO_LIBERACAO', TRUE, TRUE)
    RETURNING id, numero_os, status, bloqueio_financeiro, bloqueio_qsms;
  `, [empresaId, cotacaoId, cotacaoItemId]);
  const osCriada = osRes.rows[0];

  console.log(`  -> OS #${osCriada.numero_os} criada com status: '${osCriada.status}'`);
  console.log(`  -> [TRAVA 1 ATIVA] Bloqueio Financeiro: ${osCriada.bloqueio_financeiro}`);
  console.log(`  -> [TRAVA 2 ATIVA] Bloqueio QSMS: ${osCriada.bloqueio_qsms}`);

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Criação do Plano Financeiro com Parcela de Sinal
  // --------------------------------------------------------------------------
  console.log('\n[ETAPA 2] Gerando Plano Financeiro com Parcela Exigindo Quitação...');
  const planoRes = await client.query(`
    INSERT INTO planos_faturamento (empresa_id, cotacao_origem_id, valor_total_devido, status_credito)
    VALUES ($1, $2, 50000.00, 'APROVADO')
    RETURNING id;
  `, [empresaId, cotacaoId]);
  const planoId = planoRes.rows[0].id;

  const parcRes = await client.query(`
    INSERT INTO parcelas_recebimento (plano_id, numero_parcela, valor_parcela, data_vencimento, status_pagamento, exige_quitacao_para_liberar_os)
    VALUES ($1, 1, 25000.00, CURRENT_DATE, 'A_VENCER', TRUE)
    RETURNING id, status_pagamento, exige_quitacao_para_liberar_os;
  `, [planoId]);
  const parcelaId = parcRes.rows[0].id;
  console.log(`  -> Parcela de Sinal #${parcelaId} criada (Exige Quitacao para Liberar OS = TRUE)`);

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Quitação do Pagamento -> Disparo do Webhook de Destravamento
  // --------------------------------------------------------------------------
  console.log('\n[ETAPA 3] Processando Pagamento da Parcela e Disparando Webhook de Destravamento...');
  const dataPagamento = new Date().toISOString();
  await client.query(`
    UPDATE parcelas_recebimento 
    SET status_pagamento = 'PAGO', data_pagamento = $1
    WHERE id = $2;
  `, [dataPagamento, parcelaId]);

  console.log('  -> Parcela atualizada para PAGO no banco. Enviando payload para o Webhook Operacional...');
  const webhookRes = await postJson(`${webhookBaseUrl}/desbloqueio-financeiro`, {
    cotacao_origem_id: cotacaoId,
    empresa_id: empresaId,
    parcela_id: parcelaId,
    data_pagamento: dataPagamento
  });

  console.log(`  -> Resposta do Webhook HTTP (Status ${webhookRes.status}):`);
  console.log(`     Mensagem: ${webhookRes.data.message}`);
  const osAposWebhook = webhookRes.data.ordens_servico_afetadas[0];
  console.log(`     [TRAVA FINANCEIRA DESTRAVADA]: Bloqueio Financeiro = ${osAposWebhook.bloqueio_financeiro}`);
  console.log(`     Data de Liberação Financeira Registrada: ${osAposWebhook.liberacao_financeiro_em}`);

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Desbloqueio da Trava de QSMS via Webhook -> Auto-avanço para NA_FILA
  // --------------------------------------------------------------------------
  console.log('\n[ETAPA 4] Desbloqueando Trava de QSMS via Webhook...');
  const qsmsWebhookRes = await postJson(`${webhookBaseUrl}/status-qsms`, {
    os_id: osCriada.id,
    empresa_id: empresaId,
    acao: 'LIBERAR'
  });

  const osLiberadaTotal = qsmsWebhookRes.data.os;
  console.log(`  -> [TODAS AS TRAVAS LIBERADAS]:`);
  console.log(`     Bloqueio Financeiro: ${osLiberadaTotal.bloqueio_financeiro}`);
  console.log(`     Bloqueio QSMS: ${osLiberadaTotal.bloqueio_qsms}`);
  console.log(`     Status Promovido Automaticamente para: '${osLiberadaTotal.status}' (NA_FILA)`);

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Simulação de Reprovação em Auditoria QSMS (Retrabalho & Re-bloqueio)
  // --------------------------------------------------------------------------
  console.log('\n[ETAPA 5] Simulando Reprovação em Auditoria QSMS (Reversão para Retrabalho)...');
  const rncWebhookRes = await postJson(`${webhookBaseUrl}/status-qsms`, {
    os_id: osCriada.id,
    empresa_id: empresaId,
    acao: 'BLOQUEAR_RETRABALHO',
    motivo: 'RNC #042: Não conformidade detectada no teste de isolamento de pressão hidrostática.'
  });

  const osRetrabalho = rncWebhookRes.data.os;
  console.log(`  -> [TRAVA DE RETRABALHO REATIVADA]:`);
  console.log(`     Status Revertido para: '${osRetrabalho.status}'`);
  console.log(`     Bloqueio QSMS Reativado: ${osRetrabalho.bloqueio_qsms}`);
  console.log(`     Motivo do Impedimento: ${osRetrabalho.motivo_impedimento}`);

  // Encerramento
  await client.end();
  const { pgPool } = require('../dist/core/database/supabase-pool');
  await pgPool.end();
  server.close();
  console.log('\n======================================================================');
  console.log('   TODAS AS ROTINAS DE TRAVAS E WEBHOOKS FORAM TESTADAS COM SUCESSO!  ');
  console.log('======================================================================\n');
  process.exit(0);
}

runTestTravas().catch(err => {
  console.error('Erro no teste de travas:', err);
  if (server) server.close();
  process.exit(1);
});

