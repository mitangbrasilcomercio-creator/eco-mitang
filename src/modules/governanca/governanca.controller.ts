import { Response } from 'express';
import { TenantRequest } from '../../core/middlewares/tenant.middleware';
import { GovernancaRepository } from './governanca.repository';

/**
 * Governanca: obrigacoes, pendencias e trilha de auditoria.
 *
 * Erro devolvido no formato RFC 7807 acordado com o agente de frontend
 * (frontend-specs/respostas-claude/R03), com 'codigo' estavel -- a tela liga
 * comportamento ao codigo, nao ao texto.
 */
export class GovernancaController {
  constructor(private readonly repo: GovernancaRepository = new GovernancaRepository()) {}

  private erro(res: Response, status: number, codigo: string, mensagem: string, detalhe?: unknown) {
    res.status(status).json({
      status, codigo, mensagem,
      detalhe: detalhe ?? null,
      acao_sugerida: null,
      requisicao_id: `req-${Date.now().toString(16)}`
    });
  }

  listarObrigacoes = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const { de, ate, categoria, limite } = req.query;
      const r = await this.repo.listarObrigacoes(req.tenant!, {
        de: de ? String(de) : undefined,
        ate: ate ? String(ate) : undefined,
        categoria: categoria ? String(categoria) : undefined,
        limite: limite ? Number(limite) : undefined
      });
      res.json({
        data: r.data,
        total: r.data.length,
        por_competencia: r.por_competencia,
        encerrando: r.encerrando,
        completude: { estado: 'PARCIAL', observacao: r.observacao }
      });
    } catch (e: any) {
      this.erro(res, 500, 'ERRO_INTERNO', 'Nao foi possivel listar as obrigacoes.', e.message);
    }
  };

  listarPendencias = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
      const linhas = await this.repo.listarPendencias(req.tenant!, status);
      const abertas = linhas.filter((p: any) => p.status === 'ABERTA');
      res.json({
        data: linhas,
        total: linhas.length,
        abertas: abertas.length,
        valor_em_aberto: abertas.reduce((a: number, p: any) => a + Number(p.valor_envolvido || 0), 0),
        completude: {
          estado: abertas.length > 0 ? 'DIVERGENTE' : 'AUDITADO',
          observacao: abertas.length > 0
            ? `${abertas.length} pergunta(s) sem resposta. Enquanto abertas, os valores ` +
              'envolvidos nao devem ser tratados como classificados.'
            : null
        }
      });
    } catch (e: any) {
      this.erro(res, 500, 'ERRO_INTERNO', 'Nao foi possivel listar as pendencias.', e.message);
    }
  };

  resolverPendencia = async (req: TenantRequest, res: Response): Promise<void> => {
    const { resolucao, natureza_movimentos } = req.body ?? {};
    const autor = req.tenant?.usuarioEmail || req.tenant?.userId;

    if (!resolucao || String(resolucao).trim().length < 15) {
      return this.erro(res, 422, 'VALIDACAO',
        'A resolucao precisa de pelo menos 15 caracteres: e ela que explica a decisao meses depois.',
        { campo: 'resolucao', minimo: 15 });
    }
    if (!autor) {
      return this.erro(res, 401, 'NAO_AUTENTICADO', 'Sem identificacao do autor da decisao.');
    }

    try {
      const r = await this.repo.resolverPendencia(req.tenant!, String(req.params.id), {
        resolucao: String(resolucao).trim(),
        resolvidoPor: String(autor),
        naturezaMovimentos: natureza_movimentos ? String(natureza_movimentos) : undefined
      });
      if (!r) {
        return this.erro(res, 404, 'NAO_ENCONTRADO',
          'Pendencia nao encontrada, ou ja resolvida. Pendencia resolvida nao e resolvida de novo.');
      }
      res.json(r);
    } catch (e: any) {
      if (/natureza_movimento_socio/.test(e.message)) {
        return this.erro(res, 422, 'VALIDACAO',
          'Natureza invalida para movimento de socio.',
          { validas: ['APORTE_CAPITAL','DISTRIBUICAO_LUCRO','PAGAMENTO_PARTICIPACAO',
                      'ADIANTAMENTO','REEMBOLSO_DESPESA','MUTUO'] });
      }
      this.erro(res, 500, 'ERRO_INTERNO', 'Nao foi possivel resolver a pendencia.', e.message);
    }
  };

  trilhaDoRegistro = async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const tabela = String(req.params.tabela);
      const id = String(req.params.id);
      // So nome de tabela: o valor entra numa consulta parametrizada, mas
      // aceitar qualquer texto aqui convida a tentativa.
      if (!/^[a-z_]+$/.test(tabela)) {
        return this.erro(res, 400, 'VALIDACAO', 'Nome de tabela invalido.', { tabela });
      }
      res.json(await this.repo.trilhaDoRegistro(req.tenant!, tabela, id));
    } catch (e: any) {
      this.erro(res, 500, 'ERRO_INTERNO', 'Nao foi possivel ler a trilha.', e.message);
    }
  };
}
