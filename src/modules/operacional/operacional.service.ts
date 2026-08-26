import { InMemoryDB } from '../../core/database/db-client';
import { OrdemServico, podeExecutarOS } from './operacional.types';

export class OrdemServicoService {
  constructor(private readonly db: InMemoryDB) {}

  async liberarBloqueio(osId: string, tipo: 'FINANCEIRO' | 'QSMS'): Promise<OrdemServico> {
    const os = this.db.data.ordens_servico.find(o => o.id === osId);
    if (!os) throw new Error('OS nao encontrada.');

    if (tipo === 'FINANCEIRO') os.bloqueio_financeiro = false;
    if (tipo === 'QSMS') os.bloqueio_qsms = false;

    if (podeExecutarOS(os) && os.status === 'AGUARDANDO_LIBERACAO') {
      os.status = 'NA_FILA';
    }
    os.updated_at = new Date().toISOString();
    return os;
  }
}
