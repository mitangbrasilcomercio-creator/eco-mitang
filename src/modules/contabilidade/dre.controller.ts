import { Response } from 'express';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { DreRepository } from './dre.repository';
import { calcularDre } from './dre.calculo';
import { memoryCache } from '../../core/cache/memory-cache';
import { resolverPeriodo } from '../../core/utils/periodo';

/**
 * ============================================================================
 * DRE - DEMONSTRACAO DO RESULTADO DO EXERCICIO
 * ============================================================================
 *
 * [ERROS ANTERIORES]:
 * 1. Aliquota inventada: quando as notas nao traziam imposto destacado, o
 *    codigo aplicava
 *        receitaBruta * 0.0865   // "Aliquota media 8.65%"
 *    e apresentava o resultado como deducao apurada. Uma DRE que estima o
 *    proprio imposto e a chuta como se fosse fato.
 * 2. 'const lucroLiquido = ebitda;' com o comentario "Provisao simplificada".
 *    EBITDA e lucro liquido sao coisas diferentes -- o segundo desconta juros,
 *    depreciacao e IR. Chamar um de outro nao e simplificacao, e erro contabil.
 * 3. Despesas bancarias capturadas por 'memo ILIKE %tar%'.
 *
 * [CORRECOES]:
 * Deducao so aparece se houver imposto destacado nas notas; caso contrario vem
 * null com 'base_tributaria_disponivel: false'. EBITDA e lucro liquido sao
 * campos distintos, e o lucro liquido so e calculado quando ha base para isso.
 * ============================================================================
 */
export class DreController {
  constructor(private readonly repo: DreRepository = new DreRepository()) {}

  getDreConsolidada = async (req: TenantRequest, res: Response): Promise<void> => {
    const ctx = req.tenant!;
    const { periodo, ano, data_inicio, data_fim } = req.query;

    // 'ano=2026' continua funcionando (o front usa isso hoje).
    let opcoes: { periodo?: string; dataInicio?: unknown; dataFim?: unknown };
    if (ano && /^\d{4}$/.test(String(ano))) {
      opcoes = { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
    } else {
      opcoes = { periodo: periodo as string, dataInicio: data_inicio, dataFim: data_fim };
    }

    const p = resolverPeriodo(opcoes);
    const chave = `dre:${ctx.empresaIds!.join('+')}:${p.inicio}:${p.fim}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const base = await this.repo.apurar(ctx, p);
      const payload = { success: true, data: calcularDre(base, p) };

      memoryCache.set(chave, payload, 60);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[DRE]', err.message);
      const stale = memoryCache.getStale<any>(chave);
      if (stale) {
        res.status(200).json({ ...stale, origem: 'CACHE_EXPIRADO', aviso: 'Dados podem estar desatualizados.' });
        return;
      }
      res.status(503).json({
        success: false,
        error: 'Nao foi possivel apurar a DRE.',
        code: 'SERVICO_INDISPONIVEL'
      });
    }
  };
}
