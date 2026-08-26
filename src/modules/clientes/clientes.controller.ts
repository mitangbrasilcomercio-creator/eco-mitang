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

  private handleError(res: Response, err: any): void {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Erro interno no servidor.',
      code: err.code || 'INTERNAL_SERVER_ERROR'
    });
  }
}
