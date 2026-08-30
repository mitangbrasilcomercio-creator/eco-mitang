import { InMemoryDB } from '../../core/db-client';
import { EventBus } from '../../../../src/core/events/event-bus';
import { PlanoFaturamento, ParcelaRecebimento } from './financeiro.types';
import { ParcelaQuitadaPayload } from '../../../../src/core/events/events.types';
import * as crypto from 'crypto';

export class FinanceiroService {
  constructor(
    private readonly db: InMemoryDB,
    private readonly eventBus: EventBus
  ) {}

  private validarSomaParcelas(totalDevido: number, parcelas: { valor_parcela: number }[]): void {
    const soma = parcelas.reduce((acc, p) => acc + Number(p.valor_parcela), 0);
    if (Math.abs(Math.round(soma * 100) - Math.round(totalDevido * 100)) !== 0) {
      throw new Error(`REGRA 1 (SOMA): A soma das parcelas (R$ ${soma.toFixed(2)}) difere do total devido (R$ ${totalDevido.toFixed(2)}).`);
    }
  }

  async criarPlanoFaturamento(empresaId: string, cotacaoOrigemId: string, valorTotal: number, parcelasInput: Array<{ numero_parcela: number; valor_parcela: number; data_vencimento: string; exige_quitacao_para_liberar_os?: boolean }>): Promise<PlanoFaturamento> {
    this.validarSomaParcelas(valorTotal, parcelasInput);

    const planoId = crypto.randomUUID();
    const parcelasSalvas: ParcelaRecebimento[] = [];

    for (const p of parcelasInput) {
      const parc: ParcelaRecebimento = {
        id: crypto.randomUUID(),
        plano_id: planoId,
        numero_parcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        data_vencimento: p.data_vencimento,
        status_pagamento: 'A_VENCER',
        exige_quitacao_para_liberar_os: p.exige_quitacao_para_liberar_os || false
      };
      this.db.data.parcelas_recebimento.push(parc);
      parcelasSalvas.push(parc);
    }

    const plano: PlanoFaturamento = {
      id: planoId,
      empresa_id: empresaId,
      cotacao_origem_id: cotacaoOrigemId,
      valor_total_devido: valorTotal,
      status_credito: 'APROVADO',
      parcelas: parcelasSalvas
    };
    this.db.data.planos_faturamento.push(plano);
    return plano;
  }

  async registrarPagamento(parcelaId: string): Promise<ParcelaRecebimento> {
    const parcela = this.db.data.parcelas_recebimento.find(p => p.id === parcelaId);
    if (!parcela) throw new Error('Parcela nao encontrada.');
    if (parcela.status_pagamento === 'RENEGOCIADA') throw new Error('Impossivel quitar parcela renegociada.');

    parcela.status_pagamento = 'PAGO';
    parcela.data_pagamento = new Date().toISOString();

    if (parcela.exige_quitacao_para_liberar_os) {
      const plano = this.db.data.planos_faturamento.find(pl => pl.id === parcela.plano_id);
      if (plano) {
        await this.eventBus.publish<ParcelaQuitadaPayload>({
          eventId: crypto.randomUUID(),
          eventType: 'FINANCEIRO.PARCELA_LIBERACAO_QUITADA',
          timestamp: parcela.data_pagamento,
          empresaId: plano.empresa_id,
          payload: {
            parcela_id: parcela.id,
            plano_id: plano.id,
            cotacao_origem_id: plano.cotacao_origem_id,
            empresa_id: plano.empresa_id,
            data_pagamento: parcela.data_pagamento
          }
        });
      }
    }
    return parcela;
  }
}
