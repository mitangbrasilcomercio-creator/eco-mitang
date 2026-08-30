import { InMemoryDB } from '../../core/db-client';
import { EventBus } from '../../../../src/core/events/event-bus';
import { podeExecutarOS, OrdemServico } from '../operacional/operacional.types';
import { ApontamentoHoras, MovimentacaoEstoque } from './execucao.types';
import { OrdemServicoConcluidaPayload } from '../../../../src/core/events/events.types';
import * as crypto from 'crypto';

export class ExecucaoOperacionalService {
  constructor(
    private readonly db: InMemoryDB,
    private readonly eventBus: EventBus
  ) {}

  async consumirEstoque(empresaId: string, osId: string, itemCatalogoId: string, quantidade: number): Promise<MovimentacaoEstoque> {
    const os = this.db.data.ordens_servico.find(o => o.id === osId && o.empresa_id === empresaId);
    if (!os) throw new Error('OS nao encontrada.');
    if (!podeExecutarOS(os)) throw new Error('Execucao bloqueada: OS possui travas ativas.');

    const itemCat = this.db.data.catalogo_universal.find(i => i.id === itemCatalogoId && i.empresa_id === empresaId);
    if (!itemCat) throw new Error('Item do catalogo nao encontrado.');

    const saldoAtual = Number(itemCat.quantidade_estoque_atual || 0);
    const novoSaldo = saldoAtual - quantidade;
    if (novoSaldo < 0) {
      throw new Error(`REGRA 1 (ESTOQUE INSUFICIENTE): Saldo insuficiente (${saldoAtual}) para consumir ${quantidade}.`);
    }

    itemCat.quantidade_estoque_atual = novoSaldo;

    const mov: MovimentacaoEstoque = {
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      os_id: osId,
      item_catalogo_id: itemCatalogoId,
      quantidade: quantidade,
      created_at: new Date().toISOString()
    };
    this.db.data.movimentacoes_estoque.push(mov);
    return mov;
  }

  async iniciarApontamentoHH(empresaId: string, osId: string, colaboradorId: string, descricao: string): Promise<ApontamentoHoras> {
    const os = this.db.data.ordens_servico.find(o => o.id === osId && o.empresa_id === empresaId);
    if (!os || !podeExecutarOS(os)) throw new Error('OS travada ou inexistente.');

    const apt: ApontamentoHoras = {
      id: crypto.randomUUID(),
      empresa_id: empresaId,
      os_id: osId,
      colaborador_id: colaboradorId,
      data_hora_inicio: new Date().toISOString(),
      data_hora_fim: null,
      descricao: descricao,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.db.data.apontamentos_horas.push(apt);
    return apt;
  }

  async finalizarApontamentoHH(apontamentoId: string): Promise<ApontamentoHoras> {
    const apt = this.db.data.apontamentos_horas.find(a => a.id === apontamentoId);
    if (!apt) throw new Error('Apontamento nao encontrado.');
    apt.data_hora_fim = new Date().toISOString();
    apt.updated_at = new Date().toISOString();
    return apt;
  }

  async concluirOrdemServico(empresaId: string, osId: string, usuarioId: string): Promise<OrdemServico> {
    const os = this.db.data.ordens_servico.find(o => o.id === osId && o.empresa_id === empresaId);
    if (!os) throw new Error('OS nao encontrada.');

    const abertos = this.db.data.apontamentos_horas.filter(a => a.os_id === osId && !a.data_hora_fim);
    if (abertos.length > 0) {
      throw new Error(`REGRA 2: Impossivel concluir OS #${os.numero_os}. Existem ${abertos.length} cronometro(s) em aberto.`);
    }

    os.status = 'CONCLUIDA';
    os.updated_at = new Date().toISOString();

    await this.eventBus.publish<OrdemServicoConcluidaPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'ORDEM_SERVICO.CONCLUIDA',
      timestamp: os.updated_at,
      empresaId: os.empresa_id,
      payload: {
        os_id: os.id,
        empresa_id: os.empresa_id,
        numero_os: os.numero_os,
        tipo_os: os.tipo_os,
        cotacao_origem_id: os.cotacao_origem_id,
        concluida_em: os.updated_at,
        concluida_por: usuarioId
      }
    });

    return os;
  }
}
