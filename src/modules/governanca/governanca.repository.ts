import { PoolClient } from 'pg';
import { TenantContext, withTenantQuery, withTenantTransaction } from '../../core/database/supabase-pool';

/**
 * ============================================================================
 * GOVERNANCA — o que o sistema sabe, o que ele nao sabe, e quem mexeu
 * ============================================================================
 *
 * [O PROBLEMA QUE ISTO RESOLVE]
 * Tres coisas foram construidas no banco e nao tinham nenhuma superficie:
 * obrigacoes com vigencia, pendencias de classificacao, e a trilha de
 * auditoria. Para responder "quais sao minhas despesas mensais?" era preciso
 * eu rodar SQL e traduzir -- o que faz de mim um interprete do banco em vez de
 * uma ferramenta.
 *
 * Construir profundidade sem superficie e como escrever a auditoria por
 * chamada de aplicacao: parece pronto e nao serve a ninguem.
 * ============================================================================
 */
export class GovernancaRepository {
  // -------------------------------------------------------------------------
  // OBRIGACOES: o que ainda vai ser pago
  // -------------------------------------------------------------------------
  /**
   * Le da view 'vw_obrigacoes_do_mes', que ja exclui o que encerrou e as
   * faturas de cartao.
   *
   * A fatura e agregadora: a despesa foi reconhecida na compra, e a fatura e a
   * liquidacao dela. Somar as duas conta o mesmo dinheiro duas vezes -- a
   * fatura do Itau de julho fechou em R$ 20.011,80, e as compras que a compoem
   * ja estao lancadas uma a uma.
   */
  async listarObrigacoes(
    ctx: TenantContext,
    f: { de?: string; ate?: string; categoria?: string; limite?: number }
  ) {
    return withTenantQuery(ctx, async (client: PoolClient) => {
      const where: string[] = [];
      const params: unknown[] = [];

      if (f.de) {
        params.push(f.de);
        where.push(`data_vencimento >= $${params.length}`);
      }
      if (f.ate) {
        params.push(f.ate);
        where.push(`data_vencimento <= $${params.length}`);
      }
      if (f.categoria) {
        params.push(`%${f.categoria}%`);
        where.push(`categoria_detalhada ILIKE $${params.length}`);
      }
      params.push(Math.min(f.limite ?? 200, 500));

      const clausula = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const linhas = await client.query(
        `SELECT empresa, favorecido_nome, categoria_detalhada, recorrencia,
                valor, data_vencimento, parcela_numero, parcela_total,
                documento_numero, vigencia_fim, aviso
           FROM vw_obrigacoes_do_mes
           ${clausula}
          ORDER BY data_vencimento, valor DESC
          LIMIT $${params.length};`,
        params
      );

      // Total por mes de vencimento: e a pergunta que a tela faz primeiro.
      const porMes = await client.query(
        `SELECT to_char(data_vencimento, 'YYYY-MM') AS competencia,
                SUM(valor)::numeric(14,2)           AS total,
                COUNT(*)::int                       AS quantidade
           FROM vw_obrigacoes_do_mes
           ${clausula ? clausula.replace(/\$\d+/g, (m) => m) : ''}
          GROUP BY 1 ORDER BY 1;`,
        params.slice(0, params.length - 1)
      );

      // O que encerra: informacao que media historica nunca da.
      const encerrando = await client.query(
        `SELECT favorecido_nome, categoria_detalhada, valor,
                vigencia_fim, parcela_numero, parcela_total
           FROM vw_obrigacoes_do_mes
          WHERE aviso IS NOT NULL
          ORDER BY vigencia_fim
          LIMIT 20;`
      );

      return {
        data: linhas.rows,
        por_competencia: porMes.rows,
        encerrando: encerrando.rows,
        observacao:
          'Faturas de cartao sao excluidas: a despesa foi reconhecida na compra, ' +
          'e a fatura e a liquidacao dela. Somar as duas conta duas vezes.'
      };
    });
  }

  // -------------------------------------------------------------------------
  // PENDENCIAS: o que o sistema nao pode decidir sozinho
  // -------------------------------------------------------------------------
  async listarPendencias(ctx: TenantContext, status?: string) {
    return withTenantQuery(ctx, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT id, codigo, titulo, pergunta, dominio, status,
                valor_envolvido, qtd_lancamentos, periodo_inicio, periodo_fim,
                hipotese, impacto, evidencia,
                resolucao, resolvido_por, resolvido_em, created_at
           FROM pendencias_classificacao
          WHERE ($1::text IS NULL OR status = $1)
          ORDER BY (status = 'ABERTA') DESC, valor_envolvido DESC NULLS LAST;`,
        [status ?? null]
      );
      return res.rows;
    });
  }

  /**
   * Resolver e ato registrado: exige quem decidiu e o que foi decidido.
   * O CHECK 'chk_resolucao_completa' recusa no banco se faltar qualquer um --
   * a validacao aqui existe para devolver erro legivel, nao para substituir a
   * do banco.
   */
  async resolverPendencia(
    ctx: TenantContext,
    id: string,
    dados: { resolucao: string; resolvidoPor: string; naturezaMovimentos?: string }
  ) {
    return withTenantTransaction(ctx, async (client: PoolClient) => {
      const pend = await client.query(
        `UPDATE pendencias_classificacao
            SET status = 'RESOLVIDA', resolucao = $2, resolvido_por = $3,
                resolvido_em = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'ABERTA'
          RETURNING id, codigo, titulo, valor_envolvido;`,
        [id, dados.resolucao, dados.resolvidoPor]
      );

      if (pend.rows.length === 0) return null;

      // Quando a decisao define a natureza, os movimentos saem de INDEFINIDO
      // junto -- carregando quem decidiu e por que, como o CHECK exige.
      let movimentos = 0;
      if (dados.naturezaMovimentos) {
        const mov = await client.query(
          `UPDATE socios_movimentos
              SET natureza = $2::natureza_movimento_socio,
                  justificativa = $3, definido_por = $4, definido_em = NOW(),
                  updated_at = NOW()
            WHERE pendencia_id = $1 AND natureza = 'INDEFINIDO'
            RETURNING 1;`,
          [id, dados.naturezaMovimentos, dados.resolucao, dados.resolvidoPor]
        );
        movimentos = mov.rowCount ?? 0;
      }

      return { ...pend.rows[0], movimentos_classificados: movimentos };
    });
  }

  // -------------------------------------------------------------------------
  // AUDITORIA: a trilha de um registro
  // -------------------------------------------------------------------------
  async trilhaDoRegistro(ctx: TenantContext, tabela: string, registroId: string) {
    return withTenantQuery(ctx, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT id, operacao, campos_alterados, dados_antes, dados_depois,
                usuario_id, usuario_email, motivo, ip_origem, origem, ocorrido_em
           FROM auditoria_eventos
          WHERE tabela = $1 AND registro_id = $2
          ORDER BY ocorrido_em DESC, id DESC
          LIMIT 200;`,
        [tabela, registroId]
      );

      return {
        tabela,
        registro_id: registroId,
        eventos: res.rows,
        observacao:
          res.rows.length === 0
            ? 'Nenhuma alteracao registrada. A trilha comeca em 01/09/2026, ' +
              'quando o trigger passou a existir -- o que aconteceu antes nao foi capturado.'
            : null
      };
    });
  }
}
