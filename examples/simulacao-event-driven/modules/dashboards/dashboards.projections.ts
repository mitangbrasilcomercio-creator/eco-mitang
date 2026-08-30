import { DomainEvent } from '../../../../src/core/events/domain-event';
import { InMemoryDB } from '../../core/db-client';
import { CotacaoGanhaPayload, OrdemServicoConcluidaPayload, QsmsAuditoriaReprovadaPayload } from '../../../../src/core/events/events.types';

export class DashboardProjectionService {
  constructor(private readonly db: InMemoryDB) {}

  async handleCotacaoGanha(event: DomainEvent<CotacaoGanhaPayload>): Promise<void> {
    const { empresa_id, valor_total_liquido } = event.payload;
    const anoMes = event.timestamp.substring(0, 7);

    let registro = this.db.data.analytics_vendas_mensal.find(r => r.empresa_id === empresa_id && r.ano_mes === anoMes);
    if (!registro) {
      registro = {
        empresa_id: empresa_id,
        ano_mes: anoMes,
        total_cotacoes_ganhas: 0,
        valor_total_convertido: 0,
        ultima_atualizacao: event.timestamp
      };
      this.db.data.analytics_vendas_mensal.push(registro);
    }
    registro.total_cotacoes_ganhas += 1;
    registro.valor_total_convertido += valor_total_liquido;
    registro.ultima_atualizacao = event.timestamp;
  }

  async handleOrdemServicoConcluida(event: DomainEvent<OrdemServicoConcluidaPayload>): Promise<void> {
    const { empresa_id } = event.payload;

    let registro = this.db.data.analytics_operacao_qualidade.find(r => r.empresa_id === empresa_id);
    if (!registro) {
      registro = {
        empresa_id: empresa_id,
        total_os_concluidas: 0,
        total_rncs_geradas: 0,
        ultima_atualizacao: event.timestamp
      };
      this.db.data.analytics_operacao_qualidade.push(registro);
    }
    registro.total_os_concluidas += 1;
    registro.ultima_atualizacao = event.timestamp;
  }

  async handleAuditoriaReprovada(event: DomainEvent<QsmsAuditoriaReprovadaPayload>): Promise<void> {
    const { empresa_id } = event.payload;

    let registro = this.db.data.analytics_operacao_qualidade.find(r => r.empresa_id === empresa_id);
    if (!registro) {
      registro = {
        empresa_id: empresa_id,
        total_os_concluidas: 0,
        total_rncs_geradas: 0,
        ultima_atualizacao: event.timestamp
      };
      this.db.data.analytics_operacao_qualidade.push(registro);
    }
    registro.total_rncs_geradas += 1;
    registro.ultima_atualizacao = event.timestamp;
  }
}
