import { ClientesRepository } from './clientes.repository';
import { TenantContext } from '../../core/database/supabase-pool';
import { ClientesService } from './clientes.service';
import { CnpjEnrichmentGateway } from './cnpj-enrichment.gateway';
import { isValidCNPJ } from './clientes.schema';
import { Cliente, ClienteHistoricoAlteracao } from './clientes.types';

export interface SyncReportItem {
  cliente_id: string;
  cnpj: string;
  razao_social: string;
  teve_alteracao: boolean;
  campos_alterados: string[];
  situacao_atual: string;
  bloqueio_fiscal_aplicado: boolean;
  data_vigencia: string;
  mensagem: string;
}

export interface TenantSyncSummary {
  empresa_id: string;
  total_clientes_analisados: number;
  total_atualizados_automaticamente: number;
  total_alertas_fiscais_criticos: number;
  detalhes: SyncReportItem[];
}

export class ClienteSyncBackgroundService {
  constructor(
    private readonly repository: ClientesRepository = new ClientesRepository(),
    private readonly service: ClientesService = new ClientesService(),
    private readonly gateway: CnpjEnrichmentGateway = new CnpjEnrichmentGateway()
  ) {}

  /**
   * Executa a sincronização em background ("por trás dos panos") de um único cliente.
   * Consulta a base oficial, detecta alterações, atualiza o DB e gera histórico com data de vigência.
   */
  async sincronizarCliente(ctx: TenantContext, clienteId: string): Promise<SyncReportItem> {
    const empresaId = ctx.empresaId;
    const cliente = await this.service.buscarPorId(ctx, clienteId);
    const cleanDoc = cliente.cnpj_cpf.replace(/[^\d]/g, '');

    if (cleanDoc.length !== 14 || !isValidCNPJ(cleanDoc)) {
      return {
        cliente_id: cliente.id,
        cnpj: cliente.cnpj_cpf,
        razao_social: cliente.razao_social_nome,
        teve_alteracao: false,
        campos_alterados: [],
        situacao_atual: cliente.situacao_cadastral,
        bloqueio_fiscal_aplicado: cliente.bloqueio_fiscal,
        data_vigencia: new Date().toISOString(),
        mensagem: 'Cliente possui CPF ou documento nao compativel com CNPJ. Sincronizacao automatica da RFB ignorada.'
      };
    }

    // Consulta os dados atualizados vigentes na base oficial
    const dadosOficiais = await this.gateway.consultarCnpj(cleanDoc);

    // Constrói objeto com os dados mais recentes
    const novosDados: any = {
      razao_social_nome: dadosOficiais.razao_social,
      nome_fantasia: dadosOficiais.nome_fantasia,
      situacao_cadastral: dadosOficiais.situacao_cadastral,
      motivo_situacao_cadastral: dadosOficiais.motivo_situacao_cadastral,
      cep: dadosOficiais.cep,
      logradouro: dadosOficiais.logradouro,
      numero: dadosOficiais.numero,
      complemento: dadosOficiais.complemento,
      bairro: dadosOficiais.bairro,
      municipio: dadosOficiais.municipio,
      uf: dadosOficiais.uf,
      email: dadosOficiais.email || cliente.email,
      telefone: dadosOficiais.telefone || cliente.telefone,
      bloqueio_fiscal: ['INAPTA', 'BAIXADA', 'SUSPENSA', 'NULA'].includes(dadosOficiais.situacao_cadastral)
    };

    // Determina a data de vigência (se houver data de situação cadastral oficial, usa ela; senão usa a data atual)
    const dataVigencia = dadosOficiais.data_situacao_cadastral
      ? new Date(dadosOficiais.data_situacao_cadastral)
      : new Date();

    // Executa a atualização com registro de histórico
    const { alteracoes } = await this.service.atualizarCliente(
      ctx,
      cliente.id,
      novosDados,
      'AUTO_SYNC_RFB',
      dataVigencia
    );

    // Atualiza a data da última sincronização
    await this.repository.update(ctx, cliente.id, {
      ultima_sincronizacao_rfb: new Date().toISOString()
    } as any);

    const teveAlteracao = alteracoes.length > 0;
    const camposAlterados = alteracoes.map(a => a.campo);
    const bloqueioAplicado = novosDados.bloqueio_fiscal && !cliente.bloqueio_fiscal;

    let mensagem = 'Nenhuma alteracao cadastral detectada. Dados permanecem 100% compativeis com a RFB.';
    if (teveAlteracao) {
      mensagem = `[ALTERACAO DETECTADA] ${alteracoes.length} campo(s) atualizado(s) no DB a partir de ${dataVigencia.toISOString().substring(0, 10)}.`;
      if (bloqueioAplicado) {
        mensagem += ` [ALERTA CRITICO]: Situacao alterada para ${dadosOficiais.situacao_cadastral}. Cliente bloqueado fiscalmente!`;
      }
    }

    return {
      cliente_id: cliente.id,
      cnpj: cliente.cnpj_cpf,
      razao_social: dadosOficiais.razao_social,
      teve_alteracao: teveAlteracao,
      campos_alterados: camposAlterados,
      situacao_atual: dadosOficiais.situacao_cadastral,
      bloqueio_fiscal_aplicado: novosDados.bloqueio_fiscal,
      data_vigencia: dataVigencia.toISOString(),
      mensagem
    };
  }

  /**
   * Executa a varredura e sincronização em lote de todos os clientes ativos de uma empresa/holding.
   */
  async sincronizarTodosClientesTenant(ctx: TenantContext): Promise<TenantSyncSummary> {
    const empresaId = ctx.empresaId;
    const clientes = await this.repository.listAllForSync(ctx);
    const relatorios: SyncReportItem[] = [];

    let totalAtualizados = 0;
    let totalCriticos = 0;

    for (const cli of clientes) {
      try {
        const item = await this.sincronizarCliente(ctx, cli.id);
        relatorios.push(item);
        if (item.teve_alteracao) totalAtualizados++;
        if (item.bloqueio_fiscal_aplicado && item.situacao_atual !== 'ATIVA') totalCriticos++;
      } catch (err: any) {
        console.error(`[SYNC WORKER ERROR] Falha ao sincronizar cliente '${cli.id}':`, err.message);
      }
    }

    return {
      empresa_id: empresaId,
      total_clientes_analisados: clientes.length,
      total_atualizados_automaticamente: totalAtualizados,
      total_alertas_fiscais_criticos: totalCriticos,
      detalhes: relatorios
    };
  }
}
