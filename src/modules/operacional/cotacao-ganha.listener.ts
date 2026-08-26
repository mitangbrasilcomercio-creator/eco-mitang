import { DomainEvent } from '../../core/events/domain-event';
import { CotacaoGanhaPayload } from '../../core/events/events.types';
import { InMemoryDB } from '../../core/database/db-client';
import { TipoItemCatalogo } from '../catalogo/catalogo.types';
import { TipoOrdemServico, OrdemServico } from './operacional.types';
import * as crypto from 'crypto';

const DE_PARA_TIPO_ITEM: Record<TipoItemCatalogo, TipoOrdemServico> = {
  PRODUTO: 'PRODUCAO',
  LOCACAO: 'MOBILIZACAO',
  SERVICO: 'SERVICO',
  CURSO: 'CURSO'
};

export class CotacaoGanhaOperacionalListener {
  constructor(private readonly db: InMemoryDB) {}

  async handle(event: DomainEvent<CotacaoGanhaPayload>): Promise<void> {
    const { cotacao_id, empresa_id, itens } = event.payload;

    for (const item of itens) {
      const novaOS: OrdemServico = {
        id: crypto.randomUUID(),
        empresa_id: empresa_id,
        cotacao_origem_id: cotacao_id,
        cotacao_item_origem_id: item.cotacao_item_id,
        numero_os: this.db.data.ordens_servico.length + 1,
        tipo_os: DE_PARA_TIPO_ITEM[item.tipo_item],
        status: 'AGUARDANDO_LIBERACAO',
        bloqueio_financeiro: true,
        bloqueio_qsms: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.db.data.ordens_servico.push(novaOS);
    }
  }
}
