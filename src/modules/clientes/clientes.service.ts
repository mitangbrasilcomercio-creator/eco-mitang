import { ClientesRepository } from './clientes.repository';
import { TenantContext } from '../../core/database/supabase-pool';
import { CnpjEnrichmentGateway } from './cnpj-enrichment.gateway';
import { EventBus, globalEventBus } from '../../core/events/event-bus';
import { Cliente, ClienteHistoricoAlteracao, SituacaoCadastral } from './clientes.types';
import { CreateClienteInput, UpdateClienteInput, FilterClienteQuery, isValidCNPJ } from './clientes.schema';
import {
  ClienteCriadoPayload,
  ClienteDadosAtualizadosPayload,
  ClienteSituacaoFiscalAlteradaPayload,
  ClienteAlteracaoDetectada
} from '../../core/events/events.types';
import * as crypto from 'crypto';

export class ClientesService {
  constructor(
    private readonly repository: ClientesRepository = new ClientesRepository(),
    private readonly gateway: CnpjEnrichmentGateway = new CnpjEnrichmentGateway(),
    private readonly eventBus: EventBus = globalEventBus
  ) {}

  /**
   * Cadastra um cliente com auto-enriquecimento via Receita Federal / bases públicas.
   */
  async cadastrarCliente(ctx: TenantContext, input: CreateClienteInput): Promise<Cliente> {
    const empresaId = ctx.empresaId;
    const cleanDoc = input.cnpj_cpf.replace(/[^\d]/g, '');

    // Verifica se já existe cliente cadastrado com este documento no tenant
    const existing = await this.repository.findByCnpj(ctx, cleanDoc);
    if (existing) {
      const error: any = new Error(`Ja existe um cliente cadastrado com o documento '${input.cnpj_cpf}' nesta empresa.`);
      error.statusCode = 409;
      error.code = 'CLIENTE_ALREADY_EXISTS';
      throw error;
    }

    let dadosParaSalvar: Partial<Cliente> = {
      empresa_id: empresaId,
      cnpj_cpf: input.cnpj_cpf,
      razao_social_nome: input.razao_social_nome || `Cliente ${cleanDoc}`,
      nome_fantasia: input.nome_fantasia,
      cnae_principal: input.cnae_principal,
      cnae_descricao: input.cnae_descricao,
      situacao_cadastral: 'ATIVA',
      cep: input.cep,
      logradouro: input.logradouro,
      numero: input.numero,
      complemento: input.complemento,
      bairro: input.bairro,
      municipio: input.municipio,
      uf: input.uf,
      email: input.email,
      telefone: input.telefone,
      bloqueio_fiscal: false,
      ativo: true
    };

    // Auto-enriquecimento oficial caso seja CNPJ e a flag esteja ativa
    if (input.auto_enriquecer_receita && cleanDoc.length === 14 && isValidCNPJ(cleanDoc)) {
      try {
        const dadosOficiais = await this.gateway.consultarCnpj(cleanDoc);
        dadosParaSalvar = {
          ...dadosParaSalvar,
          razao_social_nome: input.razao_social_nome || dadosOficiais.razao_social,
          nome_fantasia: input.nome_fantasia || dadosOficiais.nome_fantasia,
          cnae_principal: dadosOficiais.cnae_principal,
          cnae_descricao: dadosOficiais.cnae_descricao,
          situacao_cadastral: dadosOficiais.situacao_cadastral,
          motivo_situacao_cadastral: dadosOficiais.motivo_situacao_cadastral,
          data_situacao_cadastral: dadosOficiais.data_situacao_cadastral,
          cep: input.cep || dadosOficiais.cep,
          logradouro: input.logradouro || dadosOficiais.logradouro,
          numero: input.numero || dadosOficiais.numero,
          complemento: input.complemento || dadosOficiais.complemento,
          bairro: input.bairro || dadosOficiais.bairro,
          municipio: input.municipio || dadosOficiais.municipio,
          uf: input.uf || dadosOficiais.uf,
          email: input.email || dadosOficiais.email,
          telefone: input.telefone || dadosOficiais.telefone,
          qsa: dadosOficiais.qsa,
          // Se a situação cadastral for irregular na Receita, bloqueia o cliente de imediato
          bloqueio_fiscal: ['INAPTA', 'BAIXADA', 'SUSPENSA', 'NULA'].includes(dadosOficiais.situacao_cadastral),
          ultima_sincronizacao_rfb: new Date().toISOString()
        };
      } catch (err: any) {
        console.warn(`[CLIENTE CADASTRO] Aviso: Falha ao auto-enriquecer CNPJ '${cleanDoc}': ${err.message}. Prosseguindo com dados manuais.`);
      }
    }

    const clienteCriado = await this.repository.create(ctx, dadosParaSalvar);

    // Publica Evento de Domínio
    await this.eventBus.publish<ClienteCriadoPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'CLIENTE.CRIADO',
      timestamp: clienteCriado.created_at,
      empresaId,
      payload: {
        cliente_id: clienteCriado.id,
        empresa_id: empresaId,
        cnpj_cpf: clienteCriado.cnpj_cpf,
        razao_social_nome: clienteCriado.razao_social_nome,
        situacao_cadastral: clienteCriado.situacao_cadastral,
        bloqueio_fiscal: clienteCriado.bloqueio_fiscal,
        criado_em: clienteCriado.created_at
      }
    });

    return clienteCriado;
  }

  async buscarPorId(ctx: TenantContext, id: string): Promise<Cliente> {
    const empresaId = ctx.empresaId;
    const cliente = await this.repository.findById(ctx, id);
    if (!cliente) {
      const error: any = new Error(`Cliente com ID '${id}' nao encontrado.`);
      error.statusCode = 404;
      error.code = 'CLIENTE_NOT_FOUND';
      throw error;
    }
    return cliente;
  }

  async listar(ctx: TenantContext, query: FilterClienteQuery): Promise<{ items: Cliente[]; total: number; page: number; limit: number }> {
    const result = await this.repository.list(ctx, query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      limit: query.limit
    };
  }

  async obterHistorico(ctx: TenantContext, clienteId: string): Promise<ClienteHistoricoAlteracao[]> {
    const empresaId = ctx.empresaId;
    await this.buscarPorId(ctx, clienteId);
    return this.repository.getHistoricoAlteracoes(ctx, clienteId);
  }

  /**
   * Atualização com gravação de histórico de auditoria campo a campo.
   */
  async atualizarCliente(
    ctx: TenantContext,
    id: string,
    novosDados: UpdateClienteInput,
    origem: 'AUTO_SYNC_RFB' | 'MANUAL' | 'WEBHOOK_RECEITA' = 'MANUAL',
    dataVigencia: Date = new Date()
  ): Promise<{ cliente: Cliente; alteracoes: ClienteAlteracaoDetectada[] }> {
    const empresaId = ctx.empresaId;
    const clienteAtual = await this.buscarPorId(ctx, id);
    const alteracoes: ClienteAlteracaoDetectada[] = [];

    // Compara campos e detecta divergências
    const camposComparaveis: (keyof UpdateClienteInput)[] = [
      'razao_social_nome',
      'nome_fantasia',
      'situacao_cadastral',
      'motivo_situacao_cadastral',
      'cep',
      'logradouro',
      'numero',
      'complemento',
      'bairro',
      'municipio',
      'uf',
      'email',
      'telefone',
      'bloqueio_fiscal',
      'ativo'
    ];

    for (const campo of camposComparaveis) {
      if (novosDados[campo] !== undefined) {
        const valAntigo = (clienteAtual as any)[campo];
        const valNovo = novosDados[campo];

        if (String(valAntigo ?? '') !== String(valNovo ?? '')) {
          alteracoes.push({
            campo: String(campo),
            valor_anterior: valAntigo,
            valor_novo: valNovo
          });

          // Grava no log histórico imutável (SCD Tipo 2)
          await this.repository.recordHistoricoAlteracao(
            ctx,
            id,
            String(campo),
            valAntigo !== null && valAntigo !== undefined ? String(valAntigo) : null,
            valNovo !== null && valNovo !== undefined ? String(valNovo) : null,
            origem,
            dataVigencia
          );
        }
      }
    }

    if (alteracoes.length === 0) {
      return { cliente: clienteAtual, alteracoes: [] };
    }

    // Se a situação cadastral mudou para algo não ATIVA, ativa o bloqueio fiscal
    if (novosDados.situacao_cadastral && novosDados.situacao_cadastral !== 'ATIVA') {
      novosDados.bloqueio_fiscal = true;
    }

    const clienteAtualizado = await this.repository.update(ctx, id, novosDados as any);
    if (!clienteAtualizado) {
      throw new Error(`Falha ao persistir atualizacoes do cliente '${id}'.`);
    }

    // Dispara eventos de domínio
    await this.eventBus.publish<ClienteDadosAtualizadosPayload>({
      eventId: crypto.randomUUID(),
      eventType: 'CLIENTE.DADOS_ATUALIZADOS_AUTOMATICAMENTE',
      timestamp: new Date().toISOString(),
      empresaId,
      payload: {
        cliente_id: id,
        empresa_id: empresaId,
        cnpj_cpf: clienteAtualizado.cnpj_cpf,
        razao_social: clienteAtualizado.razao_social_nome,
        origem,
        alteracoes,
        data_vigencia: dataVigencia.toISOString(),
        atualizado_em: clienteAtualizado.updated_at
      }
    });

    // Se houve mudança de situação cadastral, dispara evento com alerta de compliance
    const situacaoAlterada = alteracoes.find(a => a.campo === 'situacao_cadastral');
    if (situacaoAlterada) {
      await this.eventBus.publish<ClienteSituacaoFiscalAlteradaPayload>({
        eventId: crypto.randomUUID(),
        eventType: 'CLIENTE.SITUACAO_FISCAL_ALTERADA',
        timestamp: new Date().toISOString(),
        empresaId,
        payload: {
          cliente_id: id,
          empresa_id: empresaId,
          cnpj_cpf: clienteAtualizado.cnpj_cpf,
          situacao_anterior: String(situacaoAlterada.valor_anterior),
          nova_situacao: String(situacaoAlterada.valor_novo),
          bloqueio_fiscal_ativo: clienteAtualizado.bloqueio_fiscal,
          motivo: clienteAtualizado.motivo_situacao_cadastral,
          alertar_compliance: clienteAtualizado.situacao_cadastral !== 'ATIVA'
        }
      });
    }

    return { cliente: clienteAtualizado, alteracoes };
  }
}
