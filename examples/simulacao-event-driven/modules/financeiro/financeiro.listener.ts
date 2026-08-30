import { DomainEvent } from '../../../../src/core/events/domain-event';
import { ParcelaQuitadaPayload } from '../../../../src/core/events/events.types';
import { InMemoryDB } from '../../core/db-client';

export class FinanceiroLiberacaoOsListener {
  constructor(private readonly db: InMemoryDB) {}

  async handle(event: DomainEvent<ParcelaQuitadaPayload>): Promise<void> {
    const { cotacao_origem_id, empresa_id } = event.payload;

    const oss = this.db.data.ordens_servico.filter(
      o => o.cotacao_origem_id === cotacao_origem_id && o.empresa_id === empresa_id
    );

    for (const os of oss) {
      os.bloqueio_financeiro = false;
      os.updated_at = new Date().toISOString();
      if (!os.bloqueio_qsms && os.status === 'AGUARDANDO_LIBERACAO') {
        os.status = 'NA_FILA';
      }
    }
  }
}
