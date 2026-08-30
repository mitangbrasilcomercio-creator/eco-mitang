import { Response } from 'express';
import { z } from 'zod';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { FinanceiroService } from './financeiro.service';
import { memoryCache } from '../../core/cache/memory-cache';
import { localMirror } from '../../core/database/local-mirror.service';

/**
 * ============================================================================
 * CONTROLLER FINANCEIRO
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * Este controller tinha 548 linhas com SQL cru dentro, incluindo interpolacao
 * do header do cliente direto na clausula WHERE (injecao de SQL), listas de
 * despesas fixas escritas no codigo, projecoes com valores inventados para
 * novembro e dezembro, e uma escrita que so ia para um arquivo JSON.
 *
 * [COMO FOI CORRIGIDO]:
 * O controller volta a ser o que deveria ser: valida a entrada, chama o
 * servico e responde. SQL fica no repositorio; regra de negocio, no servico.
 * ============================================================================
 */

const QueryTransacoes = z.object({
  tipo: z.enum(['ENTRADAS', 'SAIDAS']).optional(),
  banco: z.string().max(100).optional(),
  busca: z.string().max(200).optional(),
  categoria: z.string().max(100).optional(),
  somente_operacionais: z.string().optional().default('true'),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const QueryContasAPagar = z.object({
  status: z.string().max(50).optional(),
  tipo_entidade: z.string().max(50).optional(),
  macro_categoria: z.string().max(50).optional(),
  busca: z.string().max(200).optional()
});

const BodyCategorizar = z.object({
  transacao_id: z.string().uuid('transacao_id deve ser um UUID.'),
  categoria_financeira: z.string().min(3).max(100),
  cliente_id: z.string().uuid().optional(),
  nome_contraparte: z.string().max(255).optional()
});

export class FinanceiroController {
  constructor(private readonly service: FinanceiroService = new FinanceiroService()) {}

  listarTransacoes = async (req: TenantRequest, res: Response): Promise<void> => {
    const v = QueryTransacoes.safeParse(req.query);
    if (!v.success) return this.erroValidacao(res, v.error);

    const ctx = req.tenant!;
    const q = v.data;
    // A chave inclui o conjunto de CNPJs visiveis: sem isso, a resposta de um
    // tenant poderia ser servida a outro a partir do cache.
    const chave = `fin:tx:${ctx.empresaIds!.join('+')}:${JSON.stringify(q)}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const r = await this.service.listarTransacoes(ctx, {
        tipo: q.tipo,
        banco: q.banco,
        busca: q.busca,
        categoria: q.categoria,
        somenteOperacionais: q.somente_operacionais !== 'false',
        dataInicio: q.data_inicio,
        dataFim: q.data_fim,
        limit: q.limit,
        offset: q.offset
      });
      const payload = { success: true, ...r };
      memoryCache.set(chave, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      this.responderComContingencia(res, chave, err, '[TRANSACOES]', () => {
        const todas = (localMirror.getMirror<any[]>('transacoes_bancarias') || [])
          .filter((t) => !t.is_saldo_informativo && ctx.empresaIds!.includes(t.empresa_id));
        return {
          success: true,
          data: todas.slice(q.offset, q.offset + q.limit),
          total: todas.length,
          origem: 'LOCAL_MIRROR'
        };
      });
    }
  };

  getResumoCaixa = async (req: TenantRequest, res: Response): Promise<void> => {
    const ctx = req.tenant!;
    const { periodo, data_inicio, data_fim } = req.query;
    const chave = `fin:resumo:${ctx.empresaIds!.join('+')}:${periodo || ''}:${data_inicio || ''}:${data_fim || ''}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const data = await this.service.resumoCaixa(ctx, {
        periodo: periodo as string,
        dataInicio: data_inicio,
        dataFim: data_fim
      });
      const payload = { success: true, data };
      memoryCache.set(chave, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      this.responderComContingencia(res, chave, err, '[RESUMO CAIXA]');
    }
  };

  listarContasAPagar = async (req: TenantRequest, res: Response): Promise<void> => {
    const v = QueryContasAPagar.safeParse(req.query);
    if (!v.success) return this.erroValidacao(res, v.error);

    const ctx = req.tenant!;
    const q = v.data;
    const chave = `fin:pagar:${ctx.empresaIds!.join('+')}:${JSON.stringify(q)}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const r = await this.service.listarContasAPagar(ctx, {
        status: q.status,
        tipoEntidade: q.tipo_entidade,
        macroCategoria: q.macro_categoria,
        busca: q.busca
      });
      const payload = { success: true, ...r };
      memoryCache.set(chave, payload, 30);
      res.status(200).json(payload);
    } catch (err: any) {
      this.responderComContingencia(res, chave, err, '[CONTAS A PAGAR]');
    }
  };

  getProjecaoFutura = async (req: TenantRequest, res: Response): Promise<void> => {
    const ctx = req.tenant!;
    const meses = Number(req.query.meses) || 4;
    const chave = `fin:projecao:${ctx.empresaIds!.join('+')}:${meses}`;

    const cached = memoryCache.get(chave);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    try {
      const data = await this.service.projecaoFutura(ctx, meses);
      const payload = { success: true, data };
      memoryCache.set(chave, payload, 60);
      res.status(200).json(payload);
    } catch (err: any) {
      this.responderComContingencia(res, chave, err, '[PROJECAO FUTURA]');
    }
  };

  categorizarTransacao = async (req: TenantRequest, res: Response): Promise<void> => {
    const v = BodyCategorizar.safeParse(req.body);
    if (!v.success) return this.erroValidacao(res, v.error);

    const ctx = req.tenant!;
    try {
      const atualizada = await this.service.categorizarTransacao(ctx, {
        transacaoId: v.data.transacao_id,
        categoria: v.data.categoria_financeira,
        clienteId: v.data.cliente_id,
        nomeContraparte: v.data.nome_contraparte
      });

      if (!atualizada) {
        res.status(404).json({
          success: false,
          error: 'Transacao nao encontrada ou fora do CNPJ selecionado.',
          code: 'TRANSACAO_NAO_ENCONTRADA'
        });
        return;
      }

      // Invalidacao por prefixo. O codigo antigo chamava memoryCache.invalidate()
      // sem argumento, limpando o cache do processo inteiro a cada clique.
      memoryCache.invalidate('fin:');
      memoryCache.invalidate('dash:');

      res.status(200).json({
        success: true,
        message: 'Transacao categorizada e gravada no banco.',
        data: atualizada
      });
    } catch (err: any) {
      console.error('[CATEGORIZAR TRANSACAO]', err.message);
      res.status(500).json({
        success: false,
        error: 'Erro ao categorizar a transacao.',
        code: 'ERRO_CATEGORIZACAO'
      });
    }
  };

  listarCategorias = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      res.status(200).json({ success: true, data: await this.service.listarCategorias(req.tenant!) });
    } catch (err: any) {
      console.error('[CATEGORIAS]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao listar categorias.' });
    }
  };

  // -------------------------------------------------------------------------
  private erroValidacao(res: Response, error: z.ZodError): void {
    res.status(422).json({
      success: false,
      error: 'Parametros invalidos.',
      code: 'VALIDATION_ERROR',
      details: error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }))
    });
  }

  /**
   * Contingencia de leitura: cache expirado primeiro, mirror local depois.
   * Toda resposta servida por contingencia vem marcada com 'origem', para o
   * usuario nunca confundir um numero em cache com o estado atual do banco.
   */
  private responderComContingencia(
    res: Response,
    chave: string,
    err: Error,
    etiqueta: string,
    alternativa?: () => any
  ): void {
    console.warn(`${etiqueta} Falha no banco (${err.message}). Tentando contingencia...`);

    const stale = memoryCache.getStale<any>(chave);
    if (stale) {
      res.status(200).json({ ...stale, origem: 'CACHE_EXPIRADO', aviso: 'Dados podem estar desatualizados.' });
      return;
    }

    if (alternativa) {
      try {
        const dados = alternativa();
        res.status(200).json({ ...dados, aviso: 'Dados servidos do espelho local.' });
        return;
      } catch {
        /* cai para o 503 abaixo */
      }
    }

    res.status(503).json({
      success: false,
      error: 'Banco de dados indisponivel e sem dados em contingencia.',
      code: 'SERVICO_INDISPONIVEL'
    });
  }
}
