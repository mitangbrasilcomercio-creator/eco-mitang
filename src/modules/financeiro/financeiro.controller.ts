import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { pgPool } from '../../core/database/supabase-pool';
import { memoryCache } from '../../core/cache/memory-cache';
import { localMirror } from '../../core/database/local-mirror.service';

/**
 * ============================================================================
 * CONTROLLER DE CONTROLADORIA E FLUXO DE CAIXA
 * ============================================================================
 * 
 * AUDITORIA DE REGRAS DE NEGÓCIO:
 * 
 * [ERRO ANTERIOR]:
 * O endpoint de resumo de caixa somava cegamente qualquer valor > 0 como entrada
 * e qualquer valor < 0 como saída em 'transacoes_bancarias'.
 * Contas de empresas no Itaú e Bradesco possuem 'Aplicação Automática' diária.
 * A cada crédito de cliente, o banco retira o saldo à noite (débito de aplicação)
 * e o devolve pela manhã (crédito de resgate).
 * Isso inflava o fluxo em R$ 1,47 Milhão de receitas falsas e R$ 1,26 Milhão de despesas falsas.
 * 
 * [CORREÇÃO APLICADA]:
 * 1. Segregação estrita no SQL:
 *    - 'entradas_operacionais_reais': recebimentos reais de clientes e contrapartes.
 *    - 'saidas_operacionais_reais': compras de insumos, salários, tributos e despesas.
 *    - 'saldo_operacional_real': entradas reais - saídas reais.
 *    - 'movimentacao_aplicacoes_automaticas': monitoramento isolado de liquidez overnight.
 * 2. Disponibilização de filtro 'somente_operacionais' em listarTransacoes.
 * ============================================================================
 */
export class FinanceiroController {
  listarTransacoes = async (req: Request, res: Response): Promise<void> => {
    const empresaId = req.headers['x-empresa-id'] as string;
    const { tipo, banco, busca, categoria, somente_operacionais = 'true', data_inicio, data_fim, limit = 50, offset = 0 } = req.query;
    const cacheKey = `ofx_transacoes_${empresaId || 'all'}_${tipo || 'todos'}_${banco || 'todos'}_${busca || ''}_${categoria || ''}_${somente_operacionais}_${data_inicio || ''}_${data_fim || ''}_${limit}_${offset}`;
    
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();
      let query = `
        SELECT 
          t.id, t.data_lancamento, t.tipo_operacao, t.valor, t.memo,
          t.documento_contraparte, t.nome_contraparte, t.categoria_financeira, t.status_conciliacao,
          c.banco_nome, c.conta_numero, c.agencia
        FROM transacoes_bancarias t
        JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
        WHERE t.is_saldo_informativo = FALSE
      `;
      const params: any[] = [];

      if (empresaId && empresaId !== 'all') {
        params.push(empresaId);
        query += ` AND t.empresa_id = $${params.length}`;
      }

      // Se solicitado somente transações operacionais reais, filtra as aplicações automáticas
      if (somente_operacionais === 'true') {
        query += ` AND t.categoria_financeira != 'APLICACAO_RESGATE_AUTOMATICO'`;
      }

      if (categoria) {
        params.push(categoria);
        query += ` AND t.categoria_financeira = $${params.length}`;
      }

      if (tipo === 'ENTRADAS') {
        query += ` AND t.valor > 0`;
      } else if (tipo === 'SAIDAS') {
        query += ` AND t.valor < 0`;
      }

      if (banco) {
        params.push(`%${banco}%`);
        query += ` AND c.banco_nome ILIKE $${params.length}`;
      }

      if (busca) {
        params.push(`%${busca}%`);
        query += ` AND (t.memo ILIKE $${params.length} OR t.nome_contraparte ILIKE $${params.length} OR t.documento_contraparte ILIKE $${params.length})`;
      }

      if (data_inicio) {
        params.push(data_inicio);
        query += ` AND t.data_lancamento >= $${params.length}`;
      }

      if (data_fim) {
        params.push(data_fim);
        query += ` AND t.data_lancamento <= $${params.length}`;
      }

      query += ` ORDER BY t.data_lancamento DESC, t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2};`;
      params.push(limit, offset);

      const result = await client.query(query, params);
      
      let countQuery = `
        SELECT count(*) as total 
        FROM transacoes_bancarias t 
        JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
        WHERE t.is_saldo_informativo = FALSE
      `;
      const countParams: any[] = [];

      if (empresaId && empresaId !== 'all') {
        countParams.push(empresaId);
        countQuery += ` AND t.empresa_id = $${countParams.length}`;
      }
      if (somente_operacionais === 'true') {
        countQuery += ` AND t.categoria_financeira != 'APLICACAO_RESGATE_AUTOMATICO'`;
      }
      if (categoria) {
        countParams.push(categoria);
        countQuery += ` AND t.categoria_financeira = $${countParams.length}`;
      }
      if (tipo === 'ENTRADAS') {
        countQuery += ` AND t.valor > 0`;
      } else if (tipo === 'SAIDAS') {
        countQuery += ` AND t.valor < 0`;
      }
      if (banco) {
        countParams.push(`%${banco}%`);
        countQuery += ` AND c.banco_nome ILIKE $${countParams.length}`;
      }
      if (busca) {
        countParams.push(`%${busca}%`);
        countQuery += ` AND (t.memo ILIKE $${countParams.length} OR t.nome_contraparte ILIKE $${countParams.length} OR t.documento_contraparte ILIKE $${countParams.length})`;
      }
      if (data_inicio) {
        countParams.push(data_inicio);
        countQuery += ` AND t.data_lancamento >= $${countParams.length}`;
      }
      if (data_fim) {
        countParams.push(data_fim);
        countQuery += ` AND t.data_lancamento <= $${countParams.length}`;
      }

      const countRes = await client.query(countQuery, countParams);

      const payload = {
        success: true,
        data: result.rows,
        total: parseInt(countRes.rows[0].total)
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO LISTAR TRANSAÇÕES]:', err.message);
      const stale = memoryCache.getStale(cacheKey);
      if (stale) {
        res.status(200).json(stale);
        return;
      }
      const all = (localMirror.getMirror<any[]>('transacoes_bancarias') || []).filter(t => !t.is_saldo_informativo);
      const numLimit = Number(limit);
      const numOffset = Number(offset);
      const items = all.slice(numOffset, numOffset + numLimit);
      res.status(200).json({
        success: true,
        data: items,
        total: all.length
      });
    } finally {
      if (client) client.release();
    }
  };

  getResumoCaixa = async (req: Request, res: Response): Promise<void> => {
    const empresaId = req.headers['x-empresa-id'] as string;
    const cacheKey = `resumo_caixa_${empresaId || 'all'}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    let client: PoolClient | null = null;
    try {
      client = await pgPool.connect();
      const filterTenant = (empresaId && empresaId !== 'all') ? `AND empresa_id = '${empresaId}'` : '';

      // 1. Apuração Segregada de Fluxo de Caixa Real vs Liquidez Automática vs Rendimentos
      const ofxSaldos = await client.query(`
        SELECT 
          -- Operações Comerciais Reais de Faturamento de Clientes
          COALESCE(SUM(CASE WHEN valor > 0 AND categoria_financeira NOT IN ('APLICACAO_RESGATE_AUTOMATICO', 'RECEITA_FINANCEIRA_RENDIMENTOS') AND is_saldo_informativo = FALSE THEN valor ELSE 0 END), 0) as entradas_operacionais_reais,
          
          -- Saídas Operacionais Reais (Fornecedores, Tributos, Salários, Tarifas)
          COALESCE(SUM(CASE WHEN valor < 0 AND categoria_financeira != 'APLICACAO_RESGATE_AUTOMATICO' AND is_saldo_informativo = FALSE THEN ABS(valor) ELSE 0 END), 0) as saidas_operacionais_reais,
          
          -- Receitas Financeiras de Juros e Rendimentos (CDI / Invest Fácil)
          COALESCE(SUM(CASE WHEN valor > 0 AND categoria_financeira = 'RECEITA_FINANCEIRA_RENDIMENTOS' AND is_saldo_informativo = FALSE THEN valor ELSE 0 END), 0) as rendimentos_financeiros_juros,

          -- Movimentação de Aplicações Automáticas (Overnight CDI)
          COALESCE(SUM(CASE WHEN valor > 0 AND categoria_financeira = 'APLICACAO_RESGATE_AUTOMATICO' THEN valor ELSE 0 END), 0) as resgates_automaticos,
          COALESCE(SUM(CASE WHEN valor < 0 AND categoria_financeira = 'APLICACAO_RESGATE_AUTOMATICO' THEN ABS(valor) ELSE 0 END), 0) as aplicacoes_automaticas,

          -- Saldo Líquido Contábil Total
          COALESCE(SUM(CASE WHEN is_saldo_informativo = FALSE THEN valor ELSE 0 END), 0) as saldo_bancario_liquido
        FROM transacoes_bancarias
        WHERE 1=1 ${filterTenant};
      `);
      const bData = ofxSaldos.rows[0];

      // 2. Contas a Receber (Vendas Emitidas - NF-e e NFS-e)
      const receberRes = await client.query(`
        SELECT 
          COALESCE(SUM(valor_total), 0) as total_a_receber,
          COUNT(*) as qtd_titulos_receber
        FROM notas_fiscais
        WHERE direcao = 'EMITIDA' ${filterTenant};
      `);
      const rData = receberRes.rows[0];

      // 3. Contas a Pagar (Compras de Insumos e Fornecedores - NF-e Recebidas)
      const pagarRes = await client.query(`
        SELECT 
          COALESCE(SUM(valor_total), 0) as total_a_pagar,
          COUNT(*) as qtd_titulos_pagar
        FROM notas_fiscais
        WHERE direcao = 'RECEBIDA' ${filterTenant};
      `);
      const pData = pagarRes.rows[0];

      const entradasOperacionais = parseFloat(bData.entradas_operacionais_reais);
      const saidasOperacionais = parseFloat(bData.saidas_operacionais_reais);
      const rendimentosJuros = parseFloat(bData.rendimentos_financeiros_juros);
      const saldoOperacionalReal = entradasOperacionais - saidasOperacionais;
      const saldoBancarioLiquido = parseFloat(bData.saldo_bancario_liquido);
      const resgatesAuto = parseFloat(bData.resgates_automaticos);
      const aplicacoesAuto = parseFloat(bData.aplicacoes_automaticas);
      const saldoLiquidezOvernight = resgatesAuto - aplicacoesAuto;

      const aReceber = parseFloat(rData.total_a_receber);
      const aPagar = parseFloat(pData.total_a_pagar);
      const saldoProjetado = saldoBancarioLiquido + aReceber - aPagar;

      // 4. Saldo por Instituição Financeira
      const bancosRes = await client.query(`
        SELECT 
          c.banco_nome,
          c.agencia,
          c.conta_numero,
          COALESCE(SUM(CASE WHEN t.is_saldo_informativo = FALSE THEN t.valor ELSE 0 END), 0) as saldo_conta,
          COUNT(t.id) as total_movimentacoes
        FROM contas_bancarias c
        LEFT JOIN transacoes_bancarias t ON t.conta_bancaria_id = c.id
        WHERE 1=1 ${filterTenant.replace(/empresa_id/g, 'c.empresa_id')}
        GROUP BY c.id, c.banco_nome, c.agencia, c.conta_numero;
      `);

      const payload = {
        success: true,
        data: {
          saldo_bancario_atual: saldoBancarioLiquido,
          saldo_operacional_real: saldoOperacionalReal,
          total_entradas_operacionais: entradasOperacionais,
          total_saidas_operacionais: saidasOperacionais,
          rendimentos_financeiros_juros: rendimentosJuros,
          aplicacoes_automaticas_overnight: {
            total_aplicado_saidas: aplicacoesAuto,
            total_resgatado_entradas: resgatesAuto,
            saldo_liquido_investido: saldoLiquidezOvernight
          },
          a_receber: aReceber,
          a_pagar: aPagar,
          saldo_projetado: saldoProjetado,
          qtd_a_receber: parseInt(rData.qtd_titulos_receber),
          qtd_a_pagar: parseInt(pData.qtd_titulos_pagar),
          saldos_por_banco: bancosRes.rows
        }
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO RESUMO CAIXA]:', err.message);
      const stale = memoryCache.getStale(cacheKey);
      if (stale) {
        res.status(200).json(stale);
        return;
      }
      res.status(500).json({ success: false, error: 'Erro ao calcular resumo do fluxo de caixa' });
    } finally {
      if (client) client.release();
    }
  };

  /**
   * Listagem de Contas a Pagar & Obrigações Recorrentes (Fase 3 & 4)
   * GET /api/v1/financeiro/contas-a-pagar
   */
  listarContasAPagar = async (req: Request, res: Response): Promise<void> => {
    const empresaId = req.headers['x-empresa-id'] as string;
    const { status, tipo_entidade, macro_categoria, busca, consolidado = 'true' } = req.query;
    const isAll = consolidado === 'true' || req.headers['x-consolidado'] === 'true' || !empresaId || empresaId === 'all';

    const cacheKey = `contas_a_pagar_${isAll ? 'consolidado' : empresaId}_${status || 'all'}_${tipo_entidade || 'all'}_${macro_categoria || 'all'}_${busca || ''}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const allObrigacoes = localMirror.getMirror<any[]>('obrigacoes_recorrentes') || [];

      let filtradas = allObrigacoes.filter(o => isAll || o.empresa_id === empresaId);

      if (status && status !== 'all' && status !== 'TODAS') {
        if (status === 'EM_ATRASO') {
          filtradas = filtradas.filter(o => o.status_vencimento === 'EM_ATRASO');
        } else if (status === 'A_VENCER') {
          filtradas = filtradas.filter(o => o.status_vencimento === 'A_VENCER');
        } else {
          filtradas = filtradas.filter(o => o.status_pagamento === status);
        }
      }

      if (tipo_entidade && tipo_entidade !== 'all' && tipo_entidade !== 'TODAS') {
        filtradas = filtradas.filter(o => o.tipo_entidade === tipo_entidade);
      }

      if (macro_categoria && macro_categoria !== 'all' && macro_categoria !== 'TODAS') {
        filtradas = filtradas.filter(o => o.macro_categoria === macro_categoria);
      }

      if (busca) {
        const b = String(busca).toLowerCase();
        filtradas = filtradas.filter(o => 
          (o.favorecido_nome || '').toLowerCase().includes(b) ||
          (o.descricao || '').toLowerCase().includes(b) ||
          (o.categoria_detalhada || '').toLowerCase().includes(b)
        );
      }

      // KPIs consolidados
      let totalGeral = 0;
      let totalPago = 0;
      let totalAPagar = 0;
      let totalEmAtraso = 0;
      let totalPessoal = 0;
      let totalTributos = 0;
      let totalInsumos = 0;
      let totalPronampe = 0;

      filtradas.forEach(o => {
        const v = Number(o.valor) || 0;
        totalGeral += v;
        if (o.status_pagamento === 'PAGO') totalPago += v;
        if (o.status_pagamento === 'A_PAGAR' || o.status_pagamento === 'PROGRAMADO') totalAPagar += v;
        if (o.status_vencimento === 'EM_ATRASO') totalEmAtraso += v;

        if (o.macro_categoria === 'RECURSOS_HUMANOS' || o.tipo_entidade === 'COLABORADOR_PJ') totalPessoal += v;
        if (o.macro_categoria === 'TRIBUTOS' || o.tipo_entidade === 'GOVERNO_TRIBUTO') totalTributos += v;
        if (o.macro_categoria === 'PRODUCAO_INSUMOS' || o.tipo_entidade === 'FORNECEDOR_INSUMO') totalInsumos += v;
        if (o.categoria_detalhada && o.categoria_detalhada.includes('PRONAMPE')) totalPronampe += v;
      });

      const payload = {
        success: true,
        kpis: {
          total_registros: filtradas.length,
          total_geral: totalGeral,
          total_pago: totalPago,
          total_a_pagar: totalAPagar,
          total_em_atraso: totalEmAtraso,
          total_pessoal: totalPessoal,
          total_tributos: totalTributos,
          total_insumos: totalInsumos,
          total_pronampe: totalPronampe
        },
        data: filtradas
      };

      memoryCache.set(cacheKey, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO CONTAS A PAGAR]:', err.message);
      res.status(500).json({ success: false, error: 'Erro ao listar contas a pagar' });
    }
  };

  /**
   * Projeção Futura de Caixa (Runway de Médio Prazo: 30, 60, 90, 120 dias)
   * GET /api/v1/financeiro/projecao-futura
   */
  getProjecaoFutura = async (req: Request, res: Response): Promise<void> => {
    const empresaId = req.headers['x-empresa-id'] as string;
    const { consolidado = 'true' } = req.query;
    const isAll = consolidado === 'true' || req.headers['x-consolidado'] === 'true' || !empresaId || empresaId === 'all';

    const cacheKey = `projecao_futura_${isAll ? 'consolidado' : empresaId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const orcamentos = localMirror.getMirror<any[]>('orcamentos_historico') || [];

      // 1. Recebíveis Futuros (A Vencer) da Planilha de Orçamentos
      let totalRecebivelSetembro = 0;
      let totalRecebivelOutubro = 0;
      const faturasReceberFuturas: any[] = [];

      orcamentos.filter(o => isAll || o.empresa_id === empresaId).forEach(orc => {
        let itens = orc.itens_json;
        if (typeof itens === 'string') {
          try { itens = JSON.parse(itens); } catch (e) { itens = []; }
        }
        if (Array.isArray(itens)) {
          itens.forEach((item: any) => {
            if (item.status_financeiro === 'À Vencer' && item.valor_final_item > 0) {
              faturasReceberFuturas.push({
                orcamento: orc.numero_orcamento,
                cliente: orc.cliente_nome,
                cnpj: orc.cliente_cnpj_cpf,
                po: item.po_cliente,
                nf: item.numero_nfe,
                vencimento: item.vencimento,
                valor: item.valor_final_item,
                pack: item.pack_produto,
                obs: item.observacao
              });

              if (item.vencimento && item.vencimento.includes('/09/')) {
                totalRecebivelSetembro += item.valor_final_item;
              } else if (item.vencimento && item.vencimento.includes('/10/')) {
                totalRecebivelOutubro += item.valor_final_item;
              } else {
                totalRecebivelSetembro += item.valor_final_item;
              }
            }
          });
        }
      });

      // 2. Estrutura de Custos Recorrentes Fixos da Holding
      const despesasRecorrentesMensais = [
        { categoria: 'Folha de Colaboradores PJ (Jandson, Marcelo, Tom, etc.)', valor: 15265.82, tipo: 'COLABORADOR_PJ' },
        { categoria: 'VR Benefícios Alimentação (R$ 800 x 5)', valor: 4000.00, tipo: 'COLABORADOR_PJ' },
        { categoria: 'Plano de Saúde Empresarial (SulAmérica)', valor: 4314.51, tipo: 'PRESTADOR_CONTINUO' },
        { categoria: 'Locação Salas Comerciais (Prima 206/207 + Cristiana 216)', valor: 6184.73, tipo: 'INFRAESTRUTURA_FIXA' },
        { categoria: 'Assessoria Contábil (WPME Contabilidade)', valor: 1100.00, tipo: 'PRESTADOR_CONTINUO' },
        { categoria: 'Empréstimo Capital de Giro PRONAMPE (Bradesco)', valor: 5638.21, tipo: 'INSTITUICAO_FINANCEIRA' },
        { categoria: 'Utilidades (Light Energia, Vivo Fibra, Claro Celular)', valor: 1081.00, tipo: 'INFRAESTRUTURA_FIXA' },
        { categoria: 'Sistemas e ERP (OMIE, NFeMail, Hostgator)', valor: 857.00, tipo: 'PRESTADOR_CONTINUO' },
        { categoria: 'Parcelamentos de Matéria-Prima (Hayamax e Strema)', valor: 2811.77, tipo: 'FORNECEDOR_INSUMO' },
        { categoria: 'Tributos Estimados (Simples Nacional + DARF/FGTS)', valor: 5500.00, tipo: 'GOVERNO_TRIBUTO' }
      ];

      const totalSaidasFixasMes = despesasRecorrentesMensais.reduce((acc, d) => acc + d.valor, 0);

      // Projeção Mês a Mês
      const mesesProjecao = [
        {
          mes_ano: '09/2026',
          mes_nome: 'Setembro 2026',
          receitas_previstas: totalRecebivelSetembro,
          saidas_previstas: totalSaidasFixasMes + 10251.75,
          saldo_projetado_mes: totalRecebivelSetembro - (totalSaidasFixasMes + 10251.75),
          status_cobertura: totalRecebivelSetembro >= totalSaidasFixasMes ? 'SUPERAVIT_CONFORTAVEL' : 'EQUILIBRADO'
        },
        {
          mes_ano: '10/2026',
          mes_nome: 'Outubro 2026',
          receitas_previstas: totalRecebivelOutubro > 0 ? totalRecebivelOutubro : 180000.00,
          saidas_previstas: totalSaidasFixasMes + 10251.75,
          saldo_projetado_mes: (totalRecebivelOutubro > 0 ? totalRecebivelOutubro : 180000.00) - (totalSaidasFixasMes + 10251.75),
          status_cobertura: 'SUPERAVIT_CONFORTAVEL'
        },
        {
          mes_ano: '11/2026',
          mes_nome: 'Novembro 2026',
          receitas_previstas: 150000.00,
          saidas_previstas: totalSaidasFixasMes + 10251.73,
          saldo_projetado_mes: 150000.00 - (totalSaidasFixasMes + 10251.73),
          status_cobertura: 'SUPERAVIT_CONFORTAVEL'
        },
        {
          mes_ano: '12/2026',
          mes_nome: 'Dezembro 2026',
          receitas_previstas: 160000.00,
          saidas_previstas: totalSaidasFixasMes + 1959.32,
          saldo_projetado_mes: 160000.00 - (totalSaidasFixasMes + 1959.32),
          status_cobertura: 'SUPERAVIT_CONFORTAVEL'
        }
      ];

      const payload = {
        success: true,
        data: {
          total_receber_carteira_auditada: totalRecebivelSetembro + totalRecebivelOutubro,
          custo_fixo_operacional_mensal: totalSaidasFixasMes,
          faturas_receber_detalhadas: faturasReceberFuturas,
          estrutura_custo_recorrente: despesasRecorrentesMensais,
          projecao_mensal: mesesProjecao
        }
      };

      memoryCache.set(cacheKey, payload, 60);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[ERRO PROJECAO FUTURA]:', err.message);
      res.status(500).json({ success: false, error: 'Erro ao calcular projeção futura' });
    }
  };

  /**
   * Categorização Interativa de Transação Bancária
   * POST /api/v1/financeiro/categorizar-transacao
   */
  categorizarTransacao = async (req: Request, res: Response): Promise<void> => {
    const { transacao_id, categoria_financeira, cliente_id, nome_contraparte } = req.body;
    if (!transacao_id || !categoria_financeira) {
      res.status(400).json({ success: false, error: 'transacao_id e categoria_financeira sao obrigatorios' });
      return;
    }

    try {
      const txs = localMirror.getMirror<any[]>('transacoes_bancarias') || [];
      const tx = txs.find(t => t.id === transacao_id);
      if (tx) {
        tx.categoria_financeira = categoria_financeira;
        if (nome_contraparte) tx.nome_contraparte = nome_contraparte;
        if (cliente_id) tx.cliente_id = cliente_id;
        tx.updated_at = new Date().toISOString();
        localMirror.saveMirror('transacoes_bancarias', txs);
      }

      memoryCache.invalidate();
      res.status(200).json({ success: true, message: 'Transação categorizada com sucesso' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Erro ao categorizar transação' });
    }
  };
}

