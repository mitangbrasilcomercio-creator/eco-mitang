import { InMemoryDB } from '../../core/db-client';
import { UserAuthContext } from '../../../../src/core/security/abac.types';
import { MetricasConsolidadasDashboard } from './dashboards.types';

export class DashboardQueryService {
  constructor(private readonly db: InMemoryDB) {}

  async getDashboardMetrics(empresaIdFiltro: string | null | undefined, user: UserAuthContext): Promise<MetricasConsolidadasDashboard> {
    const anoMes = new Date().toISOString().substring(0, 7);

    let targetEmpresaId = empresaIdFiltro;
    if (user.role !== 'Gestor_CLevel') {
      targetEmpresaId = user.empresa_id;
    }

    if (!targetEmpresaId) {
      const totalCotacoes = this.db.data.analytics_vendas_mensal.reduce((acc, r) => acc + r.total_cotacoes_ganhas, 0);
      const valorTotal = this.db.data.analytics_vendas_mensal.reduce((acc, r) => acc + r.valor_total_convertido, 0);
      const totalOS = this.db.data.analytics_operacao_qualidade.reduce((acc, r) => acc + r.total_os_concluidas, 0);
      const totalRNC = this.db.data.analytics_operacao_qualidade.reduce((acc, r) => acc + r.total_rncs_geradas, 0);

      const ticketMedio = totalCotacoes > 0 ? valorTotal / totalCotacoes : 0;
      const indice = totalOS > 0 ? Math.max(0, ((totalOS - totalRNC) / totalOS) * 100) : 100;

      return {
        visao: 'HOLDING_CONSOLIDADA',
        empresa_alvo_id: null,
        periodo_referencia: anoMes,
        comercial: {
          total_cotacoes_ganhas: totalCotacoes,
          valor_total_convertido: valorTotal,
          ticket_medio: ticketMedio
        },
        operacional_qualidade: {
          total_os_concluidas: totalOS,
          total_rncs_geradas: totalRNC,
          indice_conformidade_percentual: Number(indice.toFixed(2))
        }
      };
    }

    const vendas = this.db.data.analytics_vendas_mensal.find(r => r.empresa_id === targetEmpresaId && r.ano_mes === anoMes);
    const qualidade = this.db.data.analytics_operacao_qualidade.find(r => r.empresa_id === targetEmpresaId);

    const totalCotacoes = vendas?.total_cotacoes_ganhas || 0;
    const valorTotal = vendas?.valor_total_convertido || 0;
    const totalOS = qualidade?.total_os_concluidas || 0;
    const totalRNC = qualidade?.total_rncs_geradas || 0;

    const ticketMedio = totalCotacoes > 0 ? valorTotal / totalCotacoes : 0;
    const indice = totalOS > 0 ? Math.max(0, ((totalOS - totalRNC) / totalOS) * 100) : 100;

    return {
      visao: 'EMPRESA_INDIVIDUAL',
      empresa_alvo_id: targetEmpresaId,
      periodo_referencia: anoMes,
      comercial: {
        total_cotacoes_ganhas: totalCotacoes,
        valor_total_convertido: valorTotal,
        ticket_medio: ticketMedio
      },
      operacional_qualidade: {
        total_os_concluidas: totalOS,
        total_rncs_geradas: totalRNC,
        indice_conformidade_percentual: Number(indice.toFixed(2))
      }
    };
  }
}
