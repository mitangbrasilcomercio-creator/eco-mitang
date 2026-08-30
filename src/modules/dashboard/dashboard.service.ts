import { TenantContext, withTenantQuery } from '../../core/database/supabase-pool';
import { DashboardRepository } from './dashboard.repository';
import {
  resolverPeriodo,
  periodoAnterior,
  dividirEmFaixas,
  variacaoPercentual,
  hoje,
  paraISO,
  somarDias
} from '../../core/utils/periodo';

/**
 * ============================================================================
 * SERVICO DO DASHBOARD EXECUTIVO
 * ============================================================================
 *
 * Principio: nenhum indicador deste painel pode ser inventado.
 *
 * O codigo anterior devolvia, entre outros:
 *   - custodia         = Math.max(152342.82, saldo * 0.7)
 *   - a receber 15d    = soma das 10 primeiras notas || 85200.00
 *   - a pagar 15d      = soma das 10 primeiras notas || 42800.00
 *   - em atraso        = somaReal > 0 ? somaReal : 18837.20
 *   - despesa atraso   = 9300.00 (constante)
 *   - MoM a receber    = -5.2%   (constante)
 *   - MoM em atraso    = -8.1%   (constante)
 *   - curva do runway  = (total/15) * (i % 3 === 0 ? 2.5 : 0.3)
 *
 * Todos foram removidos. Onde nao ha dado, o valor e 0 e o campo
 * 'comparavel'/'sem_dados' diz que nao ha base -- o front decide como mostrar.
 * ============================================================================
 */
export class DashboardService {
  constructor(private readonly repo: DashboardRepository = new DashboardRepository()) {}

  async metricas(
    ctx: TenantContext,
    opcoes: { periodo?: string; dataInicio?: unknown; dataFim?: unknown; visao?: string }
  ) {
    const p = resolverPeriodo(opcoes);
    const anterior = periodoAnterior(p);
    const { faixas, granularidade } = dividirEmFaixas(p);

    // As 9 consultas do painel correm numa CONEXAO SO.
    //
    // Antes cada uma abria a propria conexao e o Promise.all pedia 9 ao mesmo
    // tempo; sob concorrencia o pooler do Supabase Free recusava e o painel
    // devolvia 503 intermitente. Sequencial na mesma conexao e mais lento no
    // papel e muito mais estavel na pratica -- e o banco ja faz o trabalho
    // pesado, entao a diferenca some.
    const [totais, totaisAnt, contas, serie, inadimplentes, janela, atividades, extrato, custodia] =
      await withTenantQuery(ctx, async (conexao) => [
        await this.repo.totaisPeriodo(ctx, p, conexao),
        await this.repo.totaisPeriodo(ctx, anterior, conexao),
        await this.repo.contasBancarias(ctx, conexao),
        await this.repo.serieGrafico(ctx, faixas, conexao),
        await this.repo.curvaInadimplencia(ctx, 5, conexao),
        await this.repo.janelaRunway(ctx, 15, conexao),
        await this.repo.atividadesRecentes(ctx, p, 15, conexao),
        await this.repo.extratoRecente(ctx, p, 300, conexao),
        await this.repo.saldoCustodia(ctx, conexao)
      ] as const);

    const num = (v: any) => Number(v || 0);

    const faturado = num(totais.nf.faturado);
    const recebido = num(totais.tx.entradas_operacionais);
    const pago = num(totais.tx.saidas_operacionais);
    const rendimentos = num(totais.tx.rendimentos);

    const faturadoAnt = num(totaisAnt.nf.faturado);
    const recebidoAnt = num(totaisAnt.tx.entradas_operacionais);
    const pagoAnt = num(totaisAnt.tx.saidas_operacionais);

    const saldoBancario = contas.reduce((acc: number, c: any) => acc + num(c.saldo_atual), 0);

    // A receber / em atraso saem da serie de titulos, nao de percentuais.
    const aReceberTotal = serie.reduce((acc: number, s: any) => acc + num(s.a_receber), 0);
    const emAtrasoTotal = inadimplentes.reduce((acc: number, i: any) => acc + num(i.valor_atraso), 0);

    const totalAReceber15d = janela.receber.reduce((acc: number, r: any) => acc + num(r.valor), 0);
    const totalAPagar15d = janela.pagar.reduce((acc: number, r: any) => acc + num(r.valor), 0);
    const saldoProjetado15d = saldoBancario + totalAReceber15d - totalAPagar15d;

    // Ritmo diario real de saida no periodo observado. Sem periodo, sem ritmo --
    // e sem ritmo nao existe "dias de cobertura" para informar.
    const mediaDiariaSaidas = p.dias > 0 ? pago / p.dias : 0;
    const diasCobertura = mediaDiariaSaidas > 0 ? Math.floor(saldoProjetado15d / mediaDiariaSaidas) : null;

    const semDados = num(totais.tx.qtd_lancamentos) === 0 && num(totais.nf.qtd_emitidas) === 0;

    return {
      empresa_selecionada: ctx.empresaId,
      empresas_no_escopo: ctx.empresaIds,
      periodo_selecionado: opcoes.periodo || 'personalizado',
      visao_ativa: opcoes.visao || 'receitas',
      periodo_info: {
        data_inicio: p.inicio,
        data_fim: p.fim,
        dias_no_periodo: p.dias,
        rotulo: p.rotulo,
        comparado_com: { data_inicio: anterior.inicio, data_fim: anterior.fim }
      },
      sem_dados: semDados,

      receitas: {
        faturado: this.indicador(faturado, faturadoAnt),
        recebido: this.indicador(recebido, recebidoAnt),
        a_receber: this.indicador(aReceberTotal, null),
        em_atraso: this.indicador(emAtrasoTotal, null),
        // Pipeline comercial: reportado a parte do faturamento contabil, nunca
        // misturado com ele por Math.max.
        pipeline_orcamentos: {
          aprovado: num(totais.orc.aprovado),
          qtd_aprovados: Number(totais.orc.qtd_aprovados || 0),
          total_cotado: num(totais.orc.total_cotado),
          qtd_total: Number(totais.orc.qtd_total || 0),
          taxa_conversao_pct:
            num(totais.orc.total_cotado) > 0
              ? Number(((num(totais.orc.aprovado) / num(totais.orc.total_cotado)) * 100).toFixed(1))
              : null
        },
        top_inadimplentes: inadimplentes.map((i: any) => ({
          cliente_nome: i.cliente_nome,
          cnpj: i.cnpj,
          valor_atraso: num(i.valor_atraso),
          dias_atraso: Number(i.dias_atraso || 0),
          parcelas_atrasadas: Number(i.parcelas_atrasadas || 0),
          vencimento_mais_antigo: i.vencimento_mais_antigo
        }))
      },

      despesas: {
        total_pago: this.indicador(pago, pagoAnt),
        compras_nf: num(totais.nf.compras),
        a_vencer_15d: { valor: totalAPagar15d, qtd_titulos: janela.pagar.length },
        em_atraso: this.indicador(
          serie.reduce((acc: number, s: any) => acc + num(s.em_atraso), 0),
          null
        )
      },

      runway: {
        saldo_bancario_atual: saldoBancario,
        a_receber_15d: totalAReceber15d,
        a_pagar_15d: totalAPagar15d,
        saldo_projetado: saldoProjetado15d,
        media_diaria_saidas: Math.round(mediaDiariaSaidas * 100) / 100,
        dias_cobertura: diasCobertura,
        // Sem ritmo de saida medido, nao afirmamos equilibrio nem deficit.
        status:
          diasCobertura === null ? 'SEM_BASE_DE_CALCULO'
          : saldoProjetado15d < 0 ? 'DEFICIT_ALERTA'
          : 'OPERACAO_EQUILIBRADA',
        detalhamento: {
          contas_bancarias: contas.map((c: any) => ({
            id: c.id,
            banco: c.banco_nome,
            agencia: c.agencia,
            conta: c.conta_numero,
            saldo: num(c.saldo_atual),
            data_ultimo_saldo: c.data_ultimo_saldo
          })),
          faturas_a_receber: janela.receber,
          faturas_a_pagar: janela.pagar,
          // Curva diaria montada com os vencimentos REAIS de cada dia.
          projecao_diaria_quinzena: this.projecaoDiaria(saldoBancario, janela.receber, janela.pagar, 15)
        }
      },

      custodia_investimentos: {
        total_em_aplicacoes: custodia,
        saldo_operacional_puro: recebido - pago,
        rendimentos_juros_cdi: rendimentos,
        aplicacoes_no_periodo: num(totais.tx.aplicacoes_custodia),
        resgates_no_periodo: num(totais.tx.resgates_custodia)
      },

      series_grafico: {
        meses: faixas.map((f) => f.rotulo),
        chaves: faixas.map((f) => f.chave),
        granularidade,
        receitas: {
          faturado: serie.map((s: any) => num(s.faturado)),
          recebido: serie.map((s: any) => num(s.recebido)),
          a_receber: serie.map((s: any) => num(s.a_receber)),
          em_atraso: serie.map((s: any) => num(s.em_atraso))
        },
        despesas: {
          total_pago: serie.map((s: any) => num(s.pago)),
          a_vencer: serie.map((s: any) => num(s.a_vencer)),
          em_atraso: serie.map((s: any) => num(s.em_atraso))
        }
      },

      atividades_recentes: atividades.map((o: any) => this.resumirOrcamento(o)),
      extratos_bancarios: extrato
    };
  }

  /** Indicador com variacao. 'comparavel: false' quando nao ha base anterior. */
  private indicador(valor: number, anterior: number | null) {
    if (anterior === null) {
      return { valor, mom_percentual: null, mom_direcao: null, comparavel: false };
    }
    const v = variacaoPercentual(valor, anterior);
    return {
      valor,
      mom_percentual: v.comparavel ? v.pct : null,
      mom_direcao: v.comparavel ? v.direcao : null,
      valor_periodo_anterior: anterior,
      comparavel: v.comparavel
    };
  }

  /**
   * Curva diaria do runway.
   *
   * [ERRO ANTERIOR]: distribuia o total por uma formula arbitraria --
   *     entrada = (total/15) * (i % 3 === 0 ? 2.5 : 0.3)
   *     saida   = (total/15) * (i % 2 === 0 ? 1.8 : 0.4)
   * O grafico parecia um fluxo de caixa; era um padrao gerado por resto de
   * divisao.
   *
   * [CORRECAO]: cada dia recebe os titulos que efetivamente vencem naquele dia.
   */
  private projecaoDiaria(saldoInicial: number, receber: any[], pagar: any[], dias: number) {
    const porDia = new Map<string, { entrada: number; saida: number }>();
    const garantir = (d: string) => {
      if (!porDia.has(d)) porDia.set(d, { entrada: 0, saida: 0 });
      return porDia.get(d)!;
    };

    const iso = (v: any) =>
      v instanceof Date ? v.toISOString().substring(0, 10) : String(v).substring(0, 10);

    for (const r of receber) garantir(iso(r.data_previsao)).entrada += Number(r.valor || 0);
    for (const p of pagar) garantir(iso(p.data_previsao)).saida += Number(p.valor || 0);

    const base = hoje();
    let acumulado = saldoInicial;
    const curva = [];

    for (let i = 1; i <= dias; i++) {
      const data = paraISO(somarDias(base, i));
      const mov = porDia.get(data) || { entrada: 0, saida: 0 };
      acumulado += mov.entrada - mov.saida;
      curva.push({
        dia: i,
        data,
        entrada: Math.round(mov.entrada * 100) / 100,
        saida: Math.round(mov.saida * 100) / 100,
        saldo: Math.round(acumulado * 100) / 100
      });
    }
    return curva;
  }

  private resumirOrcamento(o: any) {
    let itens: any[] = [];
    if (Array.isArray(o.itens_json)) itens = o.itens_json;
    else if (typeof o.itens_json === 'string') {
      try {
        itens = JSON.parse(o.itens_json);
      } catch {
        itens = [];
      }
    }

    const unicos = (campo: string) => [...new Set(itens.map((i) => i[campo]).filter(Boolean))];

    return {
      numero_orcamento: o.numero_orcamento,
      vendido_por: o.vendido_por,
      cliente_nome: o.cliente_nome,
      cliente_cnpj_cpf: o.cliente_cnpj_cpf,
      valor_total: Number(o.valor_total || 0),
      data_emissao: o.data_emissao,
      status_aprovacao: o.status_aprovacao,
      situacao_geral: o.situacao_geral,
      pos: unicos('po_cliente'),
      nfes: unicos('numero_nfe'),
      vencimentos: unicos('vencimento'),
      data_aprovacao: itens.find((i) => i.data_aprovacao)?.data_aprovacao ?? null,
      status_financeiro: itens.find((i) => i.status_financeiro)?.status_financeiro ?? null,
      total_itens: Number(o.total_itens || itens.length),
      itens
    };
  }
}
