import { Response } from 'express';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { ClientesService } from './clientes.service';
import { ClienteSyncBackgroundService } from './clientes.sync.worker';
import { CnpjEnrichmentGateway } from './cnpj-enrichment.gateway';
import {
  CreateClienteSchema,
  UpdateClienteSchema,
  FilterClienteQuerySchema
} from './clientes.schema';

export class ClientesController {
  constructor(
    private readonly service: ClientesService = new ClientesService(),
    private readonly syncWorker: ClienteSyncBackgroundService = new ClienteSyncBackgroundService(),
    private readonly gateway: CnpjEnrichmentGateway = new CnpjEnrichmentGateway()
  ) {}

  /**
   * Consulta prévia de dados de um CNPJ antes de cadastrar (Auto-Completar na UI)
   * GET /api/v1/clientes/consulta-cnpj/:cnpj
   */
  consultarPreviaCnpj = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const cnpj = String(req.params.cnpj);
      const dados = await this.gateway.consultarCnpj(cnpj);
      res.status(200).json({ success: true, data: dados });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  /**
   * Criação inteligente de cliente
   * POST /api/v1/clientes
   */
  criar = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const validation = CreateClienteSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(422).json({
          success: false,
          error: 'Dados invalidos para criacao do cliente.',
          code: 'VALIDATION_ERROR',
          details: validation.error.issues.map((i: any) => ({
            campo: i.path.join('.'),
            mensagem: i.message
          }))
        });
        return;
      }

      const cliente = await this.service.cadastrarCliente(empresaId, validation.data);
      res.status(201).json({
        success: true,
        message: 'Cliente cadastrado com sucesso' + (cliente.bloqueio_fiscal ? ' [ATENCAO: BLOQUEIO FISCAL ATIVADO]' : ''),
        data: cliente
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  /**
   * Listagem de clientes com filtros e paginação
   * GET /api/v1/clientes
   */
  listar = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const queryValidation = FilterClienteQuerySchema.safeParse(req.query);

      if (!queryValidation.success) {
        res.status(400).json({
          success: false,
          error: 'Parametros de consulta invalidos.',
          details: queryValidation.error.format()
        });
        return;
      }

      const result = await this.service.listar(empresaId, queryValidation.data);
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit)
        }
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  /**
   * Detalhes de um cliente
   * GET /api/v1/clientes/:id
   */
  buscarPorId = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const id = String(req.params.id);
      const cliente = await this.service.buscarPorId(empresaId, id);
      res.status(200).json({ success: true, data: cliente });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  /**
   * Atualização manual de dados cadastrais
   * PUT /api/v1/clientes/:id
   */
  atualizar = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const id = String(req.params.id);
      const validation = UpdateClienteSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Dados de atualizacao invalidos.',
          details: validation.error.format()
        });
        return;
      }

      const { cliente, alteracoes } = await this.service.atualizarCliente(
        empresaId,
        id,
        validation.data,
        'MANUAL',
        new Date()
      );

      res.status(200).json({
        success: true,
        message: 'Cliente atualizado com sucesso.',
        alteracoes_registradas: alteracoes.length,
        data: cliente
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  /**
   * Consulta do histórico de alterações e auditoria cadastral (SCD Tipo 2 / CDC)
   * GET /api/v1/clientes/:id/historico
   */
  obterHistorico = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const id = String(req.params.id);
      const historico = await this.service.obterHistorico(empresaId, id);
      res.status(200).json({
        success: true,
        total_registros: historico.length,
        data: historico
      });
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  /**
   * Disparo do robô de sincronização em background ("por trás dos panos")
   * POST /api/v1/clientes/sincronizacao-background
   */
  dispararSincronizacao = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const empresaId = req.empresaId!;
      const clienteId = req.query.cliente_id ? String(req.query.cliente_id) : undefined;

      if (clienteId) {
        const item = await this.syncWorker.sincronizarCliente(empresaId, clienteId);
        res.status(200).json({
          success: true,
          message: 'Sincronizacao individual executada com sucesso.',
          data: item
        });
      } else {
        const summary = await this.syncWorker.sincronizarTodosClientesTenant(empresaId);
        res.status(200).json({
          success: true,
          message: 'Varredura em background concluida para todos os clientes do tenant.',
          summary
        });
      }
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  /**
   * Consulta do Dossiê 360° Completo do Parceiro (Cadastral, Fiscal, Vendas, Compras, QSA e Produtos)
   * GET /api/v1/clientes/:id/dossie
   */
  obterDossieCompleto = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const client = await (await import('../../core/database/supabase-pool')).pgPool.connect();
      try {
        const cliRes = await client.query('SELECT * FROM clientes WHERE id = $1', [id]);
        if (cliRes.rows.length === 0) {
          res.status(404).json({ success: false, error: 'Cliente não encontrado' });
          return;
        }
        const cliente = cliRes.rows[0];
        const cleanCnpj = (cliente.cnpj_cpf || '').replace(/[^\d]/g, '');

        const { CnpjEnrichmentService } = await import('./cnpj-enrichment.service');
        const vertical = CnpjEnrichmentService.inferirVertical(
          cliente.cnae_principal,
          cliente.cnae_descricao,
          cliente.razao_social_nome
        );

        // Notas Fiscais emitidas e recebidas
        const nfeRes = await client.query(`
          SELECT numero_nota, serie, direcao, tipo_documento, data_emissao, valor_total, chave_acesso, status_processamento
          FROM notas_fiscais
          WHERE (destinatario_cnpj_cpf IS NOT NULL AND regexp_replace(destinatario_cnpj_cpf, '[^0-9]', '', 'g') = $1)
             OR (emitente_cnpj_cpf IS NOT NULL AND regexp_replace(emitente_cnpj_cpf, '[^0-9]', '', 'g') = $1)
             OR emitente_nome ILIKE $2 OR destinatario_nome ILIKE $2
          ORDER BY data_emissao DESC
          LIMIT 50;
        `, [cleanCnpj, `%${cliente.razao_social_nome.substring(0, 15)}%`]);

        // Orçamentos Históricos
        const orcRes = await client.query(`
          SELECT numero_orcamento, vendido_por, data_emissao, status_aprovacao, valor_total, itens_json
          FROM orcamentos_historico
          WHERE (cliente_cnpj_cpf IS NOT NULL AND regexp_replace(cliente_cnpj_cpf, '[^0-9]', '', 'g') = $1)
             OR cliente_nome ILIKE $2
          ORDER BY data_emissao DESC
          LIMIT 50;
        `, [cleanCnpj, `%${cliente.razao_social_nome.substring(0, 15)}%`]);

        // Transações Bancárias OFX
        const txRes = await client.query(`
          SELECT t.id, t.data_lancamento, t.valor, t.memo, c.banco_nome, c.conta_numero
          FROM transacoes_bancarias t
          JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
          WHERE (t.documento_contraparte IS NOT NULL AND regexp_replace(t.documento_contraparte, '[^0-9]', '', 'g') = $1)
             OR t.memo ILIKE $2
             OR t.cliente_id = $3
          ORDER BY t.data_lancamento DESC
          LIMIT 50;
        `, [cleanCnpj, `%${cliente.razao_social_nome.substring(0, 15)}%`, cliente.id]);

        // KPIs calculados
        const totalVendasNfe = nfeRes.rows.filter((n: any) => n.direcao === 'EMITIDA').reduce((acc: number, n: any) => acc + Number(n.valor_total || 0), 0);
        const totalComprasNfe = nfeRes.rows.filter((n: any) => n.direcao === 'RECEBIDA').reduce((acc: number, n: any) => acc + Number(n.valor_total || 0), 0);
        const totalCotacoes = orcRes.rows.reduce((acc: number, o: any) => acc + Number(o.valor_total || 0), 0);
        const cotacoesAprovadas = orcRes.rows.filter((o: any) => o.status_aprovacao === 'Compra Aprovada');
        const taxaConversao = orcRes.rows.length > 0 ? ((cotacoesAprovadas.length / orcRes.rows.length) * 100).toFixed(1) + '%' : '0.0%';
        const ticketMedio = orcRes.rows.length > 0 ? (totalCotacoes / orcRes.rows.length) : 0;

        // Produtos mais movimentados
        const produtosMap: Record<string, { nome: string; sku: string; qtd: number; valorTotal: number }> = {};
        for (const o of orcRes.rows) {
          const itens = Array.isArray(o.itens_json) ? o.itens_json : [];
          for (const it of itens) {
            const k = it.sku || it.nome || it.descricao || 'Item';
            if (!produtosMap[k]) {
              produtosMap[k] = { nome: it.nome || it.descricao || k, sku: it.sku || '-', qtd: 0, valorTotal: 0 };
            }
            produtosMap[k].qtd += Number(it.quantidade || it.qtd || 1);
            produtosMap[k].valorTotal += Number(it.valor_total || (Number(it.quantidade || 1) * Number(it.valor_unitario || 0)));
          }
        }
        const produtosMaisMovimentados = Object.values(produtosMap).sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 10);

        res.status(200).json({
          success: true,
          data: {
            cliente,
            vertical,
            kpis: {
              total_faturado_vendas: totalVendasNfe,
              total_compras_insumos: totalComprasNfe,
              total_cotacoes_valor: totalCotacoes,
              total_cotacoes_qtd: orcRes.rows.length,
              cotacoes_aprovadas_qtd: cotacoesAprovadas.length,
              taxa_conversao: taxaConversao,
              ticket_medio: ticketMedio,
              total_notas_fiscais: nfeRes.rows.length,
              total_transacoes_bancarias: txRes.rows.length
            },
            notas_fiscais: nfeRes.rows,
            orcamentos: orcRes.rows,
            produtos_mais_movimentados: produtosMaisMovimentados,
            transacoes_bancarias: txRes.rows
          }
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      this.handleError(res, err);
    }
  };

  private handleError(res: Response, err: any): void {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Erro interno no servidor.',
      code: err.code || 'INTERNAL_SERVER_ERROR'
    });
  }
}
