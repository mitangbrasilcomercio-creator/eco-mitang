import { Response } from 'express';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { DashboardService } from './dashboard.service';
import { memoryCache } from '../../core/cache/memory-cache';

/**
 * ============================================================================
 * CONTROLLER DO DASHBOARD EXECUTIVO
 * ============================================================================
 *
 * [ERRO ANTERIOR]: 666 linhas onde conviviam SQL cru com interpolacao do header
 * do cliente, filtragem em memoria de tabelas inteiras, datas de 2026 fixas no
 * codigo e cerca de uma duzia de constantes inventadas apresentadas como
 * indicadores apurados.
 *
 * [CORRECAO]: SQL no repositorio, regra no servico, e aqui apenas o transporte.
 * ============================================================================
 */
export class DashboardController {
  constructor(private readonly service: DashboardService = new DashboardService()) {}

  getMetrics = async (req: TenantRequest, res: Response): Promise<void> => {
    const ctx = req.tenant!;
    const { periodo, visao, data_inicio, data_fim } = req.query;

    const chave =
      `dash:metrics:${ctx.empresaIds!.join('+')}:${periodo || ''}:` +
      `${data_inicio || ''}:${data_fim || ''}:${visao || ''}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const data = await this.service.metricas(ctx, {
        periodo: periodo as string,
        dataInicio: data_inicio,
        dataFim: data_fim,
        visao: visao as string
      });
      const payload = { success: true, data };
      memoryCache.set(chave, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      console.error('[DASHBOARD]', err.message);

      // Contingencia: cache expirado explicitamente marcado como tal.
      const stale = memoryCache.getStale<any>(chave);
      if (stale) {
        res.status(200).json({
          ...stale,
          origem: 'CACHE_EXPIRADO',
          aviso: 'Banco indisponivel. Os numeros podem estar desatualizados.'
        });
        return;
      }

      // Sem dado, o painel diz que nao sabe -- nao inventa um estado saudavel.
      res.status(503).json({
        success: false,
        error: 'Nao foi possivel montar o painel executivo no momento.',
        code: 'SERVICO_INDISPONIVEL'
      });
    }
  };
}
