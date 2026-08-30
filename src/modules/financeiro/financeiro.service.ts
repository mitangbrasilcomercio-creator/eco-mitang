import { TenantContext } from '../../core/database/supabase-pool';
import {
  FinanceiroRepository,
  FiltroTransacoes,
  FiltroContasAPagar
} from './financeiro.repository';
import { Periodo, resolverPeriodo, paraISO, hoje, somarDias } from '../../core/utils/periodo';

/**
 * ============================================================================
 * SERVICO DE TESOURARIA E CONTROLADORIA
 * ============================================================================
 *
 * Regra que vale para o modulo inteiro:
 * quando nao ha dado, o numero e ZERO e o payload traz 'sem_dados: true'.
 *
 * [ERRO ANTERIOR]: o codigo preenchia lacunas com valores plausiveis --
 * R$ 152.342,82 de custodia, R$ 85.200,00 a receber, R$ 42.800,00 a pagar,
 * R$ 18.837,20 em atraso, inadimplencia igual a 8% do faturado, receita de
 * R$ 150.000 em novembro. Nada disso vinha de lugar nenhum. O sistema parecia
 * saudavel exatamente quando nao sabia responder, que e a pior hora para um
 * ERP financeiro parecer confiante.
 * ============================================================================
 */
export class FinanceiroService {
  constructor(private readonly repo: FinanceiroRepository = new FinanceiroRepository()) {}

  async listarTransacoes(ctx: TenantContext, filtros: FiltroTransacoes) {
    const { linhas, total, somaEntradas, somaSaidas } = await this.repo.listarTransacoes(ctx, filtros);
    return {
      data: linhas,
      total,
      // Subtotais do recorte filtrado, calculados no banco sobre o conjunto
      // inteiro -- nao apenas sobre a pagina visivel.
      subtotais: {
        entradas: Number(somaEntradas),
        saidas: Number(somaSaidas),
        liquido: Number(somaEntradas) - Number(somaSaidas)
      }
    };
  }

  async resumoCaixa(ctx: TenantContext, opcoesPeriodo: { periodo?: string; dataInicio?: unknown; dataFim?: unknown }) {
    const periodo = resolverPeriodo(opcoesPeriodo);
    const base = await this.repo.resumoCaixa(ctx, periodo);

    const num = (v: any) => Number(v || 0);
    const entradas = num(base.fluxo.entradas_operacionais);
    const saidas = num(base.fluxo.saidas_operacionais);
    const rendimentos = num(base.fluxo.rendimentos_financeiros);
    const resgates = num(base.fluxo.resgates_automaticos);
    const aplicacoes = num(base.fluxo.aplicacoes_automaticas);

    const saldoBancario = base.contas.reduce((acc: number, c: any) => acc + num(c.saldo_atual), 0);
    const aReceber = num(base.receber.total);
    const aPagar = num(base.pagar.total);

    const semDados = base.contas.length === 0 && num(base.fluxo.total_lancamentos) === 0;

    return {
      periodo: { inicio: periodo.inicio, fim: periodo.fim, dias: periodo.dias, rotulo: periodo.rotulo },
      sem_dados: semDados,

      // Saldo oficial das contas (LEDGERBAL do extrato), nao a soma dos
      // lancamentos importados -- que so cobre o periodo carregado.
      saldo_bancario_atual: saldoBancario,

      saldo_operacional_real: entradas - saidas,
      total_entradas_operacionais: entradas,
      total_saidas_operacionais: saidas,
      rendimentos_financeiros_juros: rendimentos,

      // Varredura de liquidez overnight: neutra para a DRE, monitorada a parte.
      aplicacoes_automaticas_overnight: {
        total_aplicado_saidas: aplicacoes,
        total_resgatado_entradas: resgates,
        saldo_liquido_investido: resgates - aplicacoes
      },

      a_receber: aReceber,
      a_receber_vencido: num(base.receber.total_vencido),
      qtd_a_receber: Number(base.receber.quantidade || 0),

      a_pagar: aPagar,
      a_pagar_vencido: num(base.pagar.total_vencido),
      qtd_a_pagar: Number(base.pagar.quantidade || 0),

      saldo_projetado: saldoBancario + aReceber - aPagar,
      saldos_por_banco: base.contas.map((c: any) => ({
        id: c.id,
        banco_nome: c.banco_nome,
        agencia: c.agencia,
        conta_numero: c.conta_numero,
        saldo_conta: num(c.saldo_atual),
        data_ultimo_saldo: c.data_ultimo_saldo
      }))
    };
  }

  async listarContasAPagar(ctx: TenantContext, filtros: FiltroContasAPagar) {
    const { linhas, kpis } = await this.repo.listarContasAPagar(ctx, filtros);
    const num = (v: any) => Number(v || 0);
    return {
      kpis: {
        total_registros: Number(kpis.total_registros || 0),
        total_geral: num(kpis.total_geral),
        total_pago: num(kpis.total_pago),
        total_a_pagar: num(kpis.total_a_pagar),
        total_em_atraso: num(kpis.total_em_atraso),
        total_pessoal: num(kpis.total_pessoal),
        total_tributos: num(kpis.total_tributos),
        total_insumos: num(kpis.total_insumos),
        total_pronampe: num(kpis.total_pronampe)
      },
      data: linhas,
      sem_dados: linhas.length === 0
    };
  }

  /**
   * Projecao de caixa a partir de fatos registrados.
   *
   * Entradas  = duplicatas de notas emitidas ainda em aberto, na competencia
   *             do vencimento.
   * Saidas    = obrigacoes ja lancadas para o mes + o custo fixo mensal
   *             recorrente, para os meses em que ainda nao ha lancamento.
   *
   * Nenhum mes recebe receita inventada. Mes sem recebivel projetado vem com
   * zero e 'baseado_em_dados: false', para o front poder mostrar a diferenca
   * entre "previsao de zero" e "nao sabemos".
   */
  async projecaoFutura(ctx: TenantContext, mesesAdiante = 4) {
    const meses = Math.min(Math.max(mesesAdiante, 1), 12);
    const base = await this.repo.basesProjecao(ctx, meses);

    const num = (v: any) => Number(v || 0);
    const custoFixoMensal = base.custoFixoPorCategoria.reduce(
      (acc: number, c: any) => acc + num(c.valor_mensal),
      0
    );

    const mapaReceber = new Map<string, { total: number; qtd: number }>();
    for (const r of base.recebiveisPorMes) {
      mapaReceber.set(r.competencia, { total: num(r.total), qtd: Number(r.quantidade || 0) });
    }

    const mapaPagar = new Map<string, { total: number; qtd: number }>();
    for (const o of base.obrigacoesFuturasPorMes) {
      mapaPagar.set(o.competencia, { total: num(o.total), qtd: Number(o.quantidade || 0) });
    }

    const nomesMeses = [
      'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const hojeD = hoje();
    const projecao: any[] = [];
    let saldoAcumulado = base.saldoAtual;

    for (let i = 0; i < meses; i++) {
      const d = new Date(hojeD.getFullYear(), hojeD.getMonth() + i, 1);
      const competencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const receber = mapaReceber.get(competencia);
      const pagarLancado = mapaPagar.get(competencia);

      const receitas = receber?.total ?? 0;
      // Onde ja existem obrigacoes lancadas para o mes, usa o lancado.
      // Onde nao existem, usa o custo fixo recorrente como estimativa -- e
      // marca a origem, para o numero nao passar por fato consumado.
      const saidasLancadas = pagarLancado?.total ?? 0;
      const saidas = saidasLancadas > 0 ? saidasLancadas : custoFixoMensal;
      const origemSaidas = saidasLancadas > 0 ? 'TITULOS_LANCADOS' : 'CUSTO_FIXO_RECORRENTE';

      const saldoMes = receitas - saidas;
      saldoAcumulado += saldoMes;

      projecao.push({
        mes_ano: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
        competencia,
        mes_nome: `${nomesMeses[d.getMonth()]} ${d.getFullYear()}`,
        receitas_previstas: Math.round(receitas * 100) / 100,
        qtd_titulos_receber: receber?.qtd ?? 0,
        saidas_previstas: Math.round(saidas * 100) / 100,
        origem_saidas: origemSaidas,
        saldo_projetado_mes: Math.round(saldoMes * 100) / 100,
        saldo_acumulado: Math.round(saldoAcumulado * 100) / 100,
        // Sem recebivel registrado, nao afirmamos superavit.
        baseado_em_dados: receitas > 0,
        status_cobertura:
          receitas === 0 ? 'SEM_RECEBIVEL_REGISTRADO'
          : saldoMes >= 0 ? 'SUPERAVIT'
          : 'DEFICIT'
      });
    }

    const totalReceber = Array.from(mapaReceber.values()).reduce((a, v) => a + v.total, 0);

    return {
      saldo_atual: base.saldoAtual,
      total_receber_carteira: Math.round(totalReceber * 100) / 100,
      custo_fixo_operacional_mensal: Math.round(custoFixoMensal * 100) / 100,
      estrutura_custo_recorrente: base.custoFixoPorCategoria.map((c: any) => ({
        macro_categoria: c.macro_categoria,
        tipo_entidade: c.tipo_entidade,
        valor: num(c.valor_mensal),
        quantidade: Number(c.quantidade || 0)
      })),
      faturas_receber_detalhadas: base.detalheRecebiveis,
      projecao_mensal: projecao,
      sem_dados: totalReceber === 0 && custoFixoMensal === 0
    };
  }

  /**
   * Runway de curto prazo: em quantos dias o caixa acaba, no ritmo atual.
   * Usa apenas titulos com vencimento dentro da janela -- nada de distribuir
   * o total por uma curva arbitraria como o codigo antigo fazia
   * (entrada = total/15 * (i % 3 === 0 ? 2.5 : 0.3)).
   */
  async runway(ctx: TenantContext, dias = 15) {
    const janela = Math.min(Math.max(dias, 1), 120);
    const hojeD = hoje();
    const fim = somarDias(hojeD, janela);

    const periodo: Periodo = {
      inicio: paraISO(hojeD),
      fim: paraISO(fim),
      dias: janela,
      rotulo: `Proximos ${janela} dias`
    };

    const base = await this.repo.resumoCaixa(ctx, periodo);
    const num = (v: any) => Number(v || 0);
    const saldo = base.contas.reduce((acc: number, c: any) => acc + num(c.saldo_atual), 0);

    return { periodo, saldo_atual: saldo };
  }

  async categorizarTransacao(
    ctx: TenantContext,
    dados: { transacaoId: string; categoria: string; clienteId?: string; nomeContraparte?: string }
  ) {
    return this.repo.categorizarTransacao(ctx, dados);
  }

  async listarCategorias(ctx: TenantContext) {
    return this.repo.listarCategorias(ctx);
  }
}
