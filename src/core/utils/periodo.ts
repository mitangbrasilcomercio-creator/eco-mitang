/**
 * ============================================================================
 * RESOLUCAO DE PERIODOS
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * O dashboard tinha "hoje" escrito no codigo:
 *     periodo === 'mes_atual'    -> '2026-08-01' a '2026-08-31'
 *     periodo === 'ultimos_30'   -> '2026-07-28' a '2026-08-27'
 *     const baseHoje = new Date('2026-08-27')
 * Todo indicador -- runway, inadimplencia, MoM -- media a distancia ate uma
 * data congelada. No dia seguinte ao deploy os numeros ja estavam errados, e
 * ninguem percebia porque continuavam plausiveis.
 *
 * [COMO FOI CORRIGIDO]:
 * Os periodos passam a ser calculados a partir de uma data de referencia
 * injetada. Em producao e a data real; nos testes e uma data fixa, o que torna
 * os calculos deterministicos sem congelar o sistema.
 * ============================================================================
 */

export interface Periodo {
  inicio: string; // YYYY-MM-DD
  fim: string;    // YYYY-MM-DD
  dias: number;
  rotulo: string;
}

export type PeriodoNomeado =
  | 'hoje'
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_30'
  | 'ultimos_90'
  | 'ano_atual'
  | 'all';

/** Data corrente. Sobrescrevivel nos testes para tornar o calculo deterministico. */
export function hoje(referencia?: Date): Date {
  return referencia ? new Date(referencia) : new Date();
}

export function paraISO(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function somarDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

export function diffDias(inicio: string, fim: string): number {
  const a = new Date(`${inicio}T12:00:00Z`).getTime();
  const b = new Date(`${fim}T12:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function ehDataISOValida(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const v = s.trim();
  if (!ISO_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().substring(0, 10) === v;
}

/**
 * Resolve o periodo pedido. Datas explicitas ganham do periodo nomeado.
 */
export function resolverPeriodo(
  opcoes: { periodo?: string; dataInicio?: unknown; dataFim?: unknown },
  referencia?: Date
): Periodo {
  const { dataInicio, dataFim } = opcoes;

  if (ehDataISOValida(dataInicio) && ehDataISOValida(dataFim)) {
    const a = String(dataInicio).trim();
    const b = String(dataFim).trim();
    // Intervalo invertido: corrige em vez de devolver conjunto vazio em silencio.
    const [inicio, fim] = a <= b ? [a, b] : [b, a];
    return { inicio, fim, dias: diffDias(inicio, fim), rotulo: 'Periodo personalizado' };
  }

  const ref = hoje(referencia);
  const nome = (opcoes.periodo || 'mes_atual') as PeriodoNomeado;

  const construir = (inicio: Date, fim: Date, rotulo: string): Periodo => {
    const i = paraISO(inicio);
    const f = paraISO(fim);
    return { inicio: i, fim: f, dias: diffDias(i, f), rotulo };
  };

  switch (nome) {
    case 'hoje':
      return construir(ref, ref, 'Hoje');

    case 'mes_atual': {
      const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0); // dia 0 = ultimo dia do mes
      return construir(inicio, fim, 'Mes atual');
    }

    case 'mes_anterior': {
      const inicio = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      const fim = new Date(ref.getFullYear(), ref.getMonth(), 0);
      return construir(inicio, fim, 'Mes anterior');
    }

    case 'ultimos_30':
      return construir(somarDias(ref, -29), ref, 'Ultimos 30 dias');

    case 'ultimos_90':
      return construir(somarDias(ref, -89), ref, 'Ultimos 90 dias');

    case 'ano_atual':
    case 'all':
    default: {
      const inicio = new Date(ref.getFullYear(), 0, 1);
      return construir(inicio, ref, 'Ano corrente');
    }
  }
}

/**
 * Periodo imediatamente anterior, de mesma duracao. Base da comparacao MoM.
 */
export function periodoAnterior(p: Periodo): Periodo {
  const inicioAtual = new Date(`${p.inicio}T12:00:00Z`);
  const fimAnterior = new Date(inicioAtual.getTime() - 86400000);
  const inicioAnterior = new Date(fimAnterior.getTime() - (p.dias - 1) * 86400000);
  return {
    inicio: inicioAnterior.toISOString().substring(0, 10),
    fim: fimAnterior.toISOString().substring(0, 10),
    dias: p.dias,
    rotulo: 'Periodo anterior'
  };
}

export interface FaixaGrafico {
  chave: string;
  rotulo: string;
  inicio: string;
  fim: string;
}

/**
 * Divide o periodo em faixas para o grafico.
 *
 * [ERRO ANTERIOR]: o laco semanal avancava com
 *     curD.setDate(actualEndD.getDate() + 1)
 * usando o DIA DO MES do fim aplicado ao mes do inicio. Quando a faixa cruzava
 * a virada de mes (ex.: inicio 28/08, fim 03/09), setDate(4) jogava o cursor
 * para 04/08 -- para TRAS -- e o 'while (curD <= endD)' nunca terminava.
 * Um travamento do processo esperando o periodo certo para acontecer.
 *
 * [CORRECAO]: o avanco e sempre em milissegundos a partir do fim real da faixa.
 * Nunca mistura o dia-do-mes de uma data com o mes de outra.
 */
export function dividirEmFaixas(
  p: Periodo,
  granularidade?: 'SEMANAL' | 'MENSAL'
): { faixas: FaixaGrafico[]; granularidade: 'SEMANAL' | 'MENSAL' } {
  const modo = granularidade || (p.dias <= 65 ? 'SEMANAL' : 'MENSAL');

  if (modo === 'SEMANAL') {
    const faixas: FaixaGrafico[] = [];
    const fim = new Date(`${p.fim}T12:00:00Z`);
    let cursor = new Date(`${p.inicio}T12:00:00Z`);
    let indice = 1;

    while (cursor <= fim && indice <= 12) {
      const fimFaixa = new Date(cursor.getTime() + 6 * 86400000);
      const fimReal = fimFaixa > fim ? fim : fimFaixa;

      const ini = cursor.toISOString().substring(0, 10);
      const f = fimReal.toISOString().substring(0, 10);
      const dd = (s: string) => `${s.substring(8, 10)}/${s.substring(5, 7)}`;

      faixas.push({
        chave: `sem_${indice}`,
        rotulo: `Sem ${indice} (${dd(ini)} a ${dd(f)})`,
        inicio: ini,
        fim: f
      });

      cursor = new Date(fimReal.getTime() + 86400000);
      indice++;
    }
    return { faixas, granularidade: 'SEMANAL' };
  }

  // Mensal: percorre os meses de fato contidos no periodo.
  const faixas: FaixaGrafico[] = [];
  const inicio = new Date(`${p.inicio}T12:00:00Z`);
  const fim = new Date(`${p.fim}T12:00:00Z`);
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  let ano = inicio.getUTCFullYear();
  let mes = inicio.getUTCMonth();

  while (ano < fim.getUTCFullYear() || (ano === fim.getUTCFullYear() && mes <= fim.getUTCMonth())) {
    const primeiro = new Date(Date.UTC(ano, mes, 1));
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0));
    const ini = primeiro < inicio ? p.inicio : primeiro.toISOString().substring(0, 10);
    const f = ultimo > fim ? p.fim : ultimo.toISOString().substring(0, 10);

    faixas.push({
      chave: `${ano}-${String(mes + 1).padStart(2, '0')}`,
      rotulo: meses[mes],
      inicio: ini,
      fim: f
    });

    mes++;
    if (mes > 11) {
      mes = 0;
      ano++;
    }
  }

  return { faixas, granularidade: 'MENSAL' };
}

/** Variacao percentual entre dois valores, para os indicadores MoM. */
export function variacaoPercentual(
  atual: number,
  anterior: number
): { pct: number; direcao: 'UP' | 'DOWN' | 'ESTAVEL'; comparavel: boolean } {
  // Sem base de comparacao nao existe variacao. O codigo antigo devolvia
  // "+100%" nesse caso, inventando um crescimento que ninguem mediu.
  if (!anterior || anterior === 0) {
    return { pct: 0, direcao: 'ESTAVEL', comparavel: false };
  }
  const pct = Number((((atual - anterior) / Math.abs(anterior)) * 100).toFixed(1));
  return { pct, direcao: pct > 0 ? 'UP' : pct < 0 ? 'DOWN' : 'ESTAVEL', comparavel: true };
}
