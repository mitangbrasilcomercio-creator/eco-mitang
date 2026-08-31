import { Periodo } from '../../core/utils/periodo';

/**
 * ============================================================================
 * CALCULO DA DRE (funcao pura, sem banco e sem HTTP)
 * ============================================================================
 *
 * [ERRO ANTERIOR]: o calculo vivia dentro do handler HTTP em dre.controller.ts.
 * Para testar qualquer regra era preciso subir servidor e banco, entao na
 * pratica nao se testava -- e foi assim que os tres defeitos abaixo passaram.
 *
 * [CORRECAO]: o calculo e uma funcao pura. Entrada conhecida -> saida esperada,
 * verificavel em milissegundos (tests/dre-calculo.test.js).
 * ============================================================================
 */

export interface BaseApuracao {
  receitas: {
    receita_bruta_total: number | string;
    vendas_produtos: number | string;
    servicos_prestados: number | string;
    total_tributos: number | string;
    qtd_notas: number | string;
    qtd_notas_com_imposto: number | string;
  };
  compras: {
    compras_insumos_periodo: number | string;
    qtd_notas: number | string;
  };
  servicosTomados: {
    despesas_servicos_pj: number | string;
    qtd_notas: number | string;
  };
  tarifas: {
    despesas_bancarias: number | string;
    qtd_lancamentos: number | string;
  };
  despesasPorCategoria: Array<{
    categoria_financeira: string;
    total: number | string;
    quantidade?: number | string;
  }>;
  /** Medicao do risco de dupla contagem entre pagamento e NF-e recebida. */
  duplicidade: {
    valor_pareado: number | string;
    qtd_pareada: number | string;
    qtd_sem_documento: number | string;
  };
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const pct = (parte: number, base: number): number | null =>
  base > 0 ? Number(((parte / base) * 100).toFixed(1)) : null;

export function calcularDre(base: BaseApuracao, p: Periodo) {
  // -------------------------------------------------------------------------
  // Receita e deducoes -- ambas em COMPETENCIA, vindas das notas emitidas
  // -------------------------------------------------------------------------
  const receitaBruta = num(base.receitas.receita_bruta_total);
  const tributosDestacados = num(base.receitas.total_tributos);
  const qtdNotas = num(base.receitas.qtd_notas);
  const qtdComImposto = num(base.receitas.qtd_notas_com_imposto);

  // Deducao so existe se houver imposto destacado. Nada de aliquota presumida.
  const temBaseTributaria = tributosDestacados > 0;
  const deducoes = temBaseTributaria ? tributosDestacados : 0;
  const receitaLiquida = receitaBruta - deducoes;

  /**
   * [ERRO ANTERIOR - 0.3]: a soma das NF-e recebidas no periodo era rotulada
   * 'cmv_insumos' e subtraida como Custo da Mercadoria Vendida. Mas isso e
   * COMPRA, nao custo de venda.
   *
   *     CMV = Estoque inicial + Compras - Estoque final
   *
   * Sem controle de estoque nao ha como calcular. Num mes em que se compra 500
   * celulas de litio para produzir nos quatro meses seguintes, o resultado
   * aparece como prejuizo; nos meses seguintes, com margem irreal. Para uma
   * fabrica de baterias, essa e a metrica central do negocio.
   *
   * [CORRECAO]: o campo diz o que realmente e, e 'cmv_disponivel: false'
   * sinaliza que o lucro bruto e aproximacao ate existir o modulo de estoque.
   */
  const comprasInsumos = num(base.compras.compras_insumos_periodo);
  const lucroBrutoAprox = receitaLiquida - comprasInsumos;

  // -------------------------------------------------------------------------
  // Despesas operacionais
  // -------------------------------------------------------------------------
  const mapa: Record<string, number> = {};
  for (const d of base.despesasPorCategoria) {
    mapa[d.categoria_financeira] = num(d.total);
  }

  const despesasPj = num(base.servicosTomados.despesas_servicos_pj);
  const despesasBancarias = num(base.tarifas.despesas_bancarias);
  const outrasDespesas = mapa['OUTRAS_DESPESAS_OPERACIONAIS'] || 0;
  const repassesSocios = mapa['REPASSES_SOCIOS_DIRETORIA'] || 0;
  const tributosPagos = mapa['IMPOSTOS_E_TRIBUTOS'] || 0;

  /**
   * [ERRO ANTERIOR - 0.1]: 'FORNECEDORES_OPERACIONAIS' era buscado no banco e
   * silenciosamente descartado -- o controller lia apenas tres das quatro
   * chaves do mapa. Todo pagamento a fornecedor que passou pelo banco sem NF-e
   * vinculada sumia do resultado.
   *
   * Medido na base em 2026: R$ 464.487,63 em 127 lancamentos, dos quais apenas
   * R$ 2.000,00 (1 lancamento) tem NF-e correspondente. Ou seja, R$ 462.487,63
   * -- 25,6% da receita bruta -- desapareciam da despesa, inflando o EBITDA.
   *
   * [CORRECAO]: entra na despesa operacional, com o risco de dupla contagem
   * medido e exposto em 'possivel_duplicidade_nfe' em vez de escondido.
   * Despesa a maior e erro mais seguro que despesa a menos -- e agora esta
   * marcada.
   */
  const fornecedores = mapa['FORNECEDORES_OPERACIONAIS'] || 0;

  // Repasses a socios sao distribuicao de resultado, nao custo de operar.
  const despesasOperacionais = despesasPj + despesasBancarias + outrasDespesas + fornecedores;
  const ebitda = lucroBrutoAprox - despesasOperacionais;

  /**
   * [ERRO ANTERIOR - 0.2]: 'lucroLiquido = ebitda - tributosPagos'.
   *
   * Os tributos destacados nas notas ja foram subtraidos como deducao da
   * receita (competencia). As guias DAS/DARF/GARE pagas pelo banco sao a
   * LIQUIDACAO desses mesmos tributos -- estavam sendo descontadas duas vezes.
   * Pior: a deducao e competencia (mes da emissao) e a guia e caixa (mes
   * seguinte), entao nem coincidiam no tempo e a distorcao variava mes a mes.
   *
   * [CORRECAO]: separar tributo SOBRE A RECEITA (ICMS/PIS/COFINS/ISS -> deducao)
   * de tributo SOBRE O RESULTADO (IRPJ/CSLL -> abaixo do EBITDA).
   *
   * A categoria 'IMPOSTOS_E_TRIBUTOS' do extrato mistura os dois e nao ha como
   * separa-los sem provisionamento contabil. Entao o lucro liquido NAO e
   * calculado: vem null com o motivo. O EBITDA continua sendo um numero solido.
   *
   * Nao repetir o erro oposto -- na versao anterior a esta havia
   * 'const lucroLiquido = ebitda' com o comentario "provisao simplificada".
   * EBITDA nao e lucro liquido; devolver null e mais honesto que renomear.
   */
  const lucroLiquidoDisponivel = false;
  const lucroLiquido: number | null = null;

  const semDados = qtdNotas === 0 && base.despesasPorCategoria.length === 0;

  return {
    periodo: { inicio: p.inicio, fim: p.fim, dias: p.dias, rotulo: p.rotulo },
    sem_dados: semDados,

    // Eixo do calculo, explicito. Confundir competencia com caixa e a origem da
    // maior parte das divergencias em fechamento.
    regime_do_calculo: 'COMPETENCIA' as const,
    regime_observacao:
      'Receita, deducoes e compras vem das notas fiscais (competencia). ' +
      'Despesas de servico e banco vem do extrato (caixa) ate existir partida dobrada.',

    dre: {
      receita_bruta: {
        total: receitaBruta,
        vendas_produtos: num(base.receitas.vendas_produtos),
        servicos_prestados: num(base.receitas.servicos_prestados),
        qtd_notas: qtdNotas
      },

      deducoes: {
        total: deducoes,
        base_tributaria_disponivel: temBaseTributaria,
        notas_com_imposto_destacado: qtdComImposto,
        notas_sem_imposto_destacado: qtdNotas - qtdComImposto,
        descricao: temBaseTributaria
          ? 'ICMS / PIS / COFINS / ISS destacados nas notas emitidas'
          : 'Nenhuma nota do periodo traz imposto destacado. A deducao nao foi estimada.'
      },

      receita_liquida: receitaLiquida,

      custos_operacionais: {
        compras_insumos_periodo: comprasInsumos,
        qtd_notas_compra: num(base.compras.qtd_notas),
        cmv_disponivel: false,
        cmv_observacao:
          'Isto e COMPRA do periodo, nao Custo da Mercadoria Vendida. ' +
          'CMV = estoque inicial + compras - estoque final, e exige o modulo de estoque.',
        descricao: 'Insumos industriais, celulas de litio e embalagens (NF-e recebidas)'
      },

      lucro_bruto: lucroBrutoAprox,
      lucro_bruto_aproximado: true,
      margem_bruta_pct: pct(lucroBrutoAprox, receitaLiquida),

      despesas_operacionais: {
        total: despesasOperacionais,
        servicos_terceiros_pj: despesasPj,
        despesas_bancarias_tarifas: despesasBancarias,
        fornecedores_operacionais: fornecedores,
        outras_despesas: outrasDespesas,
        possivel_duplicidade_nfe: {
          valor: num(base.duplicidade.valor_pareado),
          qtd_lancamentos: num(base.duplicidade.qtd_pareada),
          qtd_sem_cnpj_para_parear: num(base.duplicidade.qtd_sem_documento),
          observacao:
            'Pagamentos a fornecedor com NF-e de mesmo CNPJ e valor no periodo. ' +
            'Podem estar contados tambem em compras. Lancamentos sem CNPJ no memo ' +
            'nao puderam ser pareados. Resolve-se com a conciliacao documento x extrato.'
        }
      },

      ebitda,
      margem_ebitda_pct: pct(ebitda, receitaLiquida),

      resultado_financeiro: {
        tributos_pagos_periodo: tributosPagos,
        repasses_socios: repassesSocios,
        observacao:
          'Informacao de CAIXA, fora do calculo do resultado. As guias pagas liquidam ' +
          'tributos ja deduzidos da receita; repasses a socios sao distribuicao de lucro.'
      },

      lucro_liquido: lucroLiquido,
      lucro_liquido_disponivel: lucroLiquidoDisponivel,
      margem_liquida_pct: null,
      lucro_liquido_observacao:
        'Nao calculado. Exige (a) separar tributo sobre a receita de tributo sobre o ' +
        'lucro (IRPJ/CSLL), o que depende de provisionamento contabil, e (b) depreciacao, ' +
        'que depende do modulo de ativo imobilizado. O EBITDA acima e o resultado apuravel hoje.'
    }
  };
}
