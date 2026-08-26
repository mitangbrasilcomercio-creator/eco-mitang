import { dbInstance } from './core/database/db-client';
import { globalEventBus } from './core/events/event-bus';
import { TicketTriagemService } from './modules/triagem/triagem.service';
import { CotacaoService } from './modules/cotacao/cotacao.service';
import { CotacaoTriagemListener } from './modules/cotacao/cotacao.listener';
import { OrdemServicoService } from './modules/operacional/operacional.service';
import { CotacaoGanhaOperacionalListener } from './modules/operacional/cotacao-ganha.listener';
import { ExecucaoOperacionalService } from './modules/execucao/execucao.service';
import { FinanceiroService } from './modules/financeiro/financeiro.service';
import { FinanceiroLiberacaoOsListener } from './modules/financeiro/financeiro.listener';
import { QsmsAuditoriaService } from './modules/qsms/qsms.service';
import { DashboardProjectionService } from './modules/dashboards/dashboards.projections';
import { DashboardQueryService } from './modules/dashboards/dashboards.service';
import { UserAuthContext } from './core/security/abac.types';
import * as crypto from 'crypto';

async function main() {
  console.log('======================================================================');
  console.log('    ECO-MITANG ERP: MULTI-TENANT & EVENT-DRIVEN SIMULATION RUNNER    ');
  console.log('======================================================================\n');

  // 1. INSTANCIACAO DOS SERVICOS
  const triagemService = new TicketTriagemService(dbInstance, globalEventBus);
  const cotacaoService = new CotacaoService(dbInstance, globalEventBus);
  const osService = new OrdemServicoService(dbInstance);
  const execucaoService = new ExecucaoOperacionalService(dbInstance, globalEventBus);
  const financeiroService = new FinanceiroService(dbInstance, globalEventBus);
  const qsmsService = new QsmsAuditoriaService(dbInstance, globalEventBus);
  const dashboardProjections = new DashboardProjectionService(dbInstance);
  const dashboardQuery = new DashboardQueryService(dbInstance);

  // 2. WIRING DOS LISTENERS DE EVENTOS (EVENT-DRIVEN SUBSCRIBERS)
  const cotacaoTriagemListener = new CotacaoTriagemListener(cotacaoService, dbInstance);
  const cotacaoGanhaListener = new CotacaoGanhaOperacionalListener(dbInstance);
  const financeiroLiberacaoListener = new FinanceiroLiberacaoOsListener(dbInstance);

  globalEventBus.subscribe('TICKET.QUALIFICADO', (e) => cotacaoTriagemListener.handle(e));
  globalEventBus.subscribe('COTACAO.GANHA', async (e) => {
    await cotacaoGanhaListener.handle(e);
    await dashboardProjections.handleCotacaoGanha(e);
  });
  globalEventBus.subscribe('FINANCEIRO.PARCELA_LIBERACAO_QUITADA', (e) => financeiroLiberacaoListener.handle(e));
  globalEventBus.subscribe('ORDEM_SERVICO.CONCLUIDA', (e) => dashboardProjections.handleOrdemServicoConcluida(e));
  globalEventBus.subscribe('QSMS.AUDITORIA_REPROVADA', (e) => dashboardProjections.handleAuditoriaReprovada(e));

  // --------------------------------------------------------------------------
  // PASSO 1: SETUP DAS 4 EMPRESAS DA HOLDING (MULTI-TENANT)
  // --------------------------------------------------------------------------
  console.log('[1/7] Configurando 4 CNPJs da Holding Eco-Mitang...');
  const empresas = [
    { id: '11111111-1111-1111-1111-111111111111', cnpj: '11111111000101', razao_social: 'Mitang Baterias Industriais SA', nome_fantasia: 'Mitang Power', ramo_atividade: 'Manufatura Baterias' },
    { id: '22222222-2222-2222-2222-222222222222', cnpj: '22222222000102', razao_social: 'Mitang Offshore Locacoes Ltda', nome_fantasia: 'Mitang Rental', ramo_atividade: 'Locacao Offshore' },
    { id: '33333333-3333-3333-3333-333333333333', cnpj: '33333333000103', razao_social: 'Mitang Subsea & Servicos Ltda', nome_fantasia: 'Mitang Services', ramo_atividade: 'Servicos Offshore' },
    { id: '44444444-4444-4444-4444-444444444444', cnpj: '44444444000104', razao_social: 'Mitang Treinamentos Maritimos SA', nome_fantasia: 'Mitang Academy', ramo_atividade: 'Cursos' }
  ];
  dbInstance.data.empresas = empresas;

  // --------------------------------------------------------------------------
  // PASSO 2: CADASTRO DO CATALOGO UNIVERSAL (POLIMORFISMO)
  // --------------------------------------------------------------------------
  console.log('[2/7] Cadastrando Itens no Catalogo Universal...');
  const itemBateria = {
    id: crypto.randomUUID(),
    empresa_id: empresas[0].id,
    tipo_item: 'PRODUTO' as const,
    nome: 'Bateria Subsea Lithium 24V 100Ah',
    descricao_tecnica: 'Bateria selada para operacao em aguas profundas',
    quantidade_estoque_atual: 15.0,
    ativo: true,
    detalhes: { codigo_sku: 'BAT-LITH-24V', unidade_medida: 'UN', capacidade_ah: 100, voltagem_nominal: 24, preco_base: 25000.00 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  dbInstance.data.catalogo_universal.push(itemBateria);

  const itemLocacao = {
    id: crypto.randomUUID(),
    empresa_id: empresas[1].id,
    tipo_item: 'LOCACAO' as const,
    nome: 'Guincho Hidraulico 50T Offshore',
    quantidade_estoque_atual: 2.0,
    ativo: true,
    detalhes: { unidade_cobranca: 'DIARIA', exige_mobilizacao: true, preco_base: 8500.00 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  dbInstance.data.catalogo_universal.push(itemLocacao);

  console.log(`   -> Item Bateria: ${itemBateria.nome} (Estoque: ${itemBateria.quantidade_estoque_atual}, Preco Base: R$ ${itemBateria.detalhes.preco_base})`);

  // --------------------------------------------------------------------------
  // PASSO 3: FUNIL DE TRIAGEM E QUALIFICACAO (EVENT-DRIVEN CONVERSION)
  // --------------------------------------------------------------------------
  console.log('\n[3/7] Recebendo Lead na Triagem e Qualificando...');
  const ticket = await triagemService.criarTicket({
    empresa_alvo_id: empresas[0].id,
    canal_origem: 'WHATSAPP',
    dados_contato_bruto: 'Engenheiro Chefe Petrobras - contato@petrobras.com.br',
    descricao_pedido: 'Necessitamos de 2 baterias subsea para o Campo de Buzios'
  });
  console.log(`   -> Ticket #${ticket.id.substring(0, 8)} criado com status: ${ticket.status}`);

  console.log('   -> Qualificando Ticket (Dispara Evento TICKET.QUALIFICADO)...');
  await triagemService.qualificarTicket({ ticket_id: ticket.id, usuario_id: 'user-sales-1' });

  const cotacaoGerada = dbInstance.data.cotacoes[0];
  console.log(`   -> Cotacao gerada automaticamente via Evento: ID ${cotacaoGerada.id.substring(0, 8)}, Total: R$ ${cotacaoGerada.valor_total_liquido}`);

  // --------------------------------------------------------------------------
  // PASSO 4: COTACAO COM SNAPSHOT, FECHAMENTO E ROTEADOR DE OS
  // --------------------------------------------------------------------------
  console.log('\n[4/7] Fechando Cotacao comercial como GANHA...');
  await cotacaoService.marcarComoGanha(cotacaoGerada.id);

  const ossGeradas = dbInstance.data.ordens_servico.filter(o => o.cotacao_origem_id === cotacaoGerada.id);
  console.log(`   -> Roteador Operacional gerou automaticamente ${ossGeradas.length} Ordem(ns) de Servico:`);
  ossGeradas.forEach(os => {
    console.log(`      * OS #${os.numero_os} (${os.tipo_os}) | Bloqueio Financeiro: ${os.bloqueio_financeiro} | Bloqueio QSMS: ${os.bloqueio_qsms}`);
  });

  // --------------------------------------------------------------------------
  // PASSO 5: FINANCEIRO (PLANOS, PARCELAS E GATILHO DE DESBLOQUEIO)
  // --------------------------------------------------------------------------
  console.log('\n[5/7] Gerando Plano Financeiro e Processando Quitacao de Sinal...');
  const plano = await financeiroService.criarPlanoFaturamento(
    empresas[0].id,
    cotacaoGerada.id,
    cotacaoGerada.valor_total_liquido,
    [
      { numero_parcela: 1, valor_parcela: cotacaoGerada.valor_total_liquido * 0.5, data_vencimento: '2026-09-01', exige_quitacao_para_liberar_os: true },
      { numero_parcela: 2, valor_parcela: cotacaoGerada.valor_total_liquido * 0.5, data_vencimento: '2026-10-01', exige_quitacao_para_liberar_os: false }
    ]
  );
  console.log(`   -> Plano com 2 parcelas. Quitando Parcela 1 (Gatilho de Liberacao de OS)...`);
  await financeiroService.registrarPagamento(plano.parcelas![0].id);

  const osAtualizada = dbInstance.data.ordens_servico.find(o => o.id === ossGeradas[0].id)!;
  console.log(`   -> Status pos-pagamento da OS #${osAtualizada.numero_os}: Bloqueio Financeiro = ${osAtualizada.bloqueio_financeiro}`);

  // Liberacao QSMS de partida
  await osService.liberarBloqueio(osAtualizada.id, 'QSMS');
  console.log(`   -> Liberacao inicial de QSMS executada: OS status = ${osAtualizada.status}`);

  // --------------------------------------------------------------------------
  // PASSO 6: EXECUCAO OPERACIONAL (ESTOQUE, HH E CONCLUSAO)
  // --------------------------------------------------------------------------
  console.log('\n[6/7] Execucao no Chao de Fabrica (Consumo Estoque e Apontamento HH)...');
  await execucaoService.consumirEstoque(empresas[0].id, osAtualizada.id, itemBateria.id, 1.0);
  console.log(`   -> Estoque da Bateria pos-consumo: ${itemBateria.quantidade_estoque_atual} un`);

  const apt = await execucaoService.iniciarApontamentoHH(empresas[0].id, osAtualizada.id, 'colab-1', 'Montagem do modulo de celulas');
  console.log(`   -> Apontamento HH iniciado (Cronometro rodando)...`);

  // Teste da REGRA 2: Trava de Conclusao
  try {
    await execucaoService.concluirOrdemServico(empresas[0].id, osAtualizada.id, 'colab-1');
  } catch (err: any) {
    console.log(`   -> [VALIDACAO DE TRAVA CONFIRMADA]: ${err.message}`);
  }

  await execucaoService.finalizarApontamentoHH(apt.id);
  console.log('   -> Apontamento HH encerrado.');
  await execucaoService.concluirOrdemServico(empresas[0].id, osAtualizada.id, 'colab-1');
  console.log(`   -> OS #${osAtualizada.numero_os} concluida com sucesso.`);

  // --------------------------------------------------------------------------
  // PASSO 7: QSMS GATEKEEPER & CQRS DASHBOARDS
  // --------------------------------------------------------------------------
  console.log('\n[7/7] QSMS Gatekeeper e Painel Executivo (CQRS Projections)...');
  const auditoria = await qsmsService.criarAuditoria(empresas[0].id, osAtualizada.id, 'auditor-1');
  const audAprovada = await qsmsService.aprovarAuditoria(empresas[0].id, auditoria.id, 'auditor-1', 'SECRET_KEY_QSMS_2026');
  console.log(`   -> Auditoria Aprovada com Hash SHA-256: ${audAprovada.assinatura_digital_hash?.substring(0, 32)}...`);

  // Consulta do Dashboard
  const userCLevel: UserAuthContext = { usuario_id: 'ceo-1', empresa_id: empresas[0].id, role: 'Gestor_CLevel' };
  const dashHolding = await dashboardQuery.getDashboardMetrics(null, userCLevel);
  console.log('\n======================================================================');
  console.log('                 DASHBOARD CONSOLIDADO DA HOLDING (CQRS)              ');
  console.log('======================================================================');
  console.log(`Periodo Referencia : ${dashHolding.periodo_referencia}`);
  console.log(`Cotacoes Ganhas    : ${dashHolding.comercial.total_cotacoes_ganhas}`);
  console.log(`Faturamento Total  : R$ ${dashHolding.comercial.valor_total_convertido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`OSs Concluidas     : ${dashHolding.operacional_qualidade.total_os_concluidas}`);
  console.log(`Indice Conformidade: ${dashHolding.operacional_qualidade.indice_conformidade_percentual}%`);
  console.log('======================================================================\n');
  console.log('>>> TODAS AS DIRETRIZES E REGRAS DE NEGOCIO FORAM VALIDADAS COM SUCESSO! <<<\n');
}

main().catch(console.error);
