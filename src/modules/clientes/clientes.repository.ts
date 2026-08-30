import { withTenantQuery, withTenantTransaction, TenantContext } from '../../core/database/supabase-pool';
import { localMirror } from '../../core/database/local-mirror.service';
import { Cliente, ClienteHistoricoAlteracao } from './clientes.types';
import { FilterClienteQuery } from './clientes.schema';

/**
 * ============================================================================
 * REPOSITORIO DE CLIENTES E PARCEIROS
 * ============================================================================
 *
 * [ERRO ANTERIOR]:
 * Todas as consultas usavam 'pgPool.query(...)' direto, sem contexto de tenant.
 * Isso funcionava porque a aplicacao conectava como 'postgres' (BYPASSRLS) e o
 * isolamento era feito a mao, repetindo 'empresa_id = $1' em cada consulta --
 * bastava esquecer uma vez para vazar dados entre CNPJs.
 *
 * [COMO FOI CORRIGIDO]:
 * Tudo passa por withTenantQuery/withTenantTransaction. O isolamento e imposto
 * pela RLS: se alguem escrever uma consulta nova e esquecer o filtro, o banco
 * simplesmente nao devolve as linhas dos outros CNPJs.
 * ============================================================================
 */

/** Colunas gravaveis. Barreira contra atualizacao de coluna arbitraria. */
const COLUNAS_ATUALIZAVEIS = new Set([
  'razao_social_nome', 'nome_fantasia', 'cnpj_cpf', 'email', 'telefone', 'ativo',
  'cnae_principal', 'cnae_descricao', 'situacao_cadastral', 'motivo_situacao_cadastral',
  'data_situacao_cadastral', 'cep', 'logradouro', 'numero', 'complemento', 'bairro',
  'municipio', 'uf', 'qsa', 'bloqueio_fiscal', 'ultima_sincronizacao_rfb',
  'capital_social', 'porte', 'natureza_juridica', 'opcao_pelo_simples', 'opcao_pelo_mei',
  'cnaes_secundarios', 'dados_receita_brutos', 'email_fiscal', 'telefone_fiscal',
  'tipo_entidade'
]);

export class ClientesRepository {
  async create(ctx: TenantContext, dados: Partial<Cliente>): Promise<Cliente> {
    return withTenantTransaction(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO clientes (
           empresa_id, razao_social_nome, nome_fantasia, cnpj_cpf, cnae_principal,
           cnae_descricao, situacao_cadastral, motivo_situacao_cadastral,
           data_situacao_cadastral, cep, logradouro, numero, complemento, bairro,
           municipio, uf, email, telefone, qsa, bloqueio_fiscal,
           ultima_sincronizacao_rfb, ativo
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
         ) RETURNING *;`,
        [
          // Sempre o tenant do contexto. A RLS ainda confere via WITH CHECK.
          ctx.empresaId,
          dados.razao_social_nome,
          dados.nome_fantasia || null,
          dados.cnpj_cpf,
          dados.cnae_principal || null,
          dados.cnae_descricao || null,
          dados.situacao_cadastral || 'ATIVA',
          dados.motivo_situacao_cadastral || null,
          dados.data_situacao_cadastral || null,
          dados.cep || null,
          dados.logradouro || null,
          dados.numero || null,
          dados.complemento || null,
          dados.bairro || null,
          dados.municipio || null,
          dados.uf || null,
          dados.email || null,
          dados.telefone || null,
          JSON.stringify(dados.qsa || []),
          dados.bloqueio_fiscal || false,
          dados.ultima_sincronizacao_rfb || new Date(),
          dados.ativo !== undefined ? dados.ativo : true
        ]
      );
      return res.rows[0];
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<Cliente | null> {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query('SELECT * FROM clientes WHERE id = $1;', [id]);
      return res.rows[0] || null;
    });
  }

  async findByCnpj(ctx: TenantContext, cnpj: string): Promise<Cliente | null> {
    const limpo = cnpj.replace(/[^\d]/g, '');
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        `SELECT * FROM clientes
          WHERE regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') = $1
          LIMIT 1;`,
        [limpo]
      );
      return res.rows[0] || null;
    });
  }

  async list(ctx: TenantContext, filtros: FilterClienteQuery): Promise<{ items: Cliente[]; total: number }> {
    try {
      return await withTenantQuery(ctx, async (client) => {
        const where: string[] = ['1 = 1'];
        const params: any[] = [];

        if (filtros.tipo_entidade) {
          params.push(filtros.tipo_entidade);
          where.push(`tipo_entidade = $${params.length}`);
        }
        if (filtros.situacao_cadastral) {
          params.push(filtros.situacao_cadastral);
          where.push(`situacao_cadastral = $${params.length}`);
        }
        if (filtros.bloqueio_fiscal !== undefined) {
          params.push(filtros.bloqueio_fiscal);
          where.push(`bloqueio_fiscal = $${params.length}`);
        }
        if (filtros.ativo !== undefined) {
          params.push(filtros.ativo);
          where.push(`ativo = $${params.length}`);
        }
        if (filtros.busca) {
          params.push(`%${filtros.busca}%`);
          const i = params.length;
          where.push(`(razao_social_nome ILIKE $${i} OR nome_fantasia ILIKE $${i} OR cnpj_cpf ILIKE $${i})`);
        }

        const offset = (filtros.page - 1) * filtros.limit;
        params.push(filtros.limit, offset);

        // Lista e contagem na mesma varredura: nao ha como divergirem.
        const res = await client.query(
          `SELECT *, COUNT(*) OVER () AS total_geral
             FROM clientes
            WHERE ${where.join(' AND ')}
            ORDER BY created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length};`,
          params
        );

        const total = res.rows.length > 0 ? Number(res.rows[0].total_geral) : 0;
        const items = res.rows.map(({ total_geral, ...linha }: any) => linha);
        return { items, total };
      });
    } catch (err: any) {
      console.warn(`[CLIENTES] Falha no banco (${err.message}). Servindo do espelho local...`);
      const todos = (localMirror.getMirror<any[]>('clientes') || []).filter((c) =>
        (ctx.empresaIds || [ctx.empresaId]).includes(c.empresa_id)
      );
      let filtrados = todos;
      if (filtros.tipo_entidade) {
        filtrados = filtrados.filter((c) => c.tipo_entidade === filtros.tipo_entidade);
      }
      if (filtros.busca) {
        const b = filtros.busca.toLowerCase();
        filtrados = filtrados.filter(
          (c) =>
            (c.razao_social_nome || '').toLowerCase().includes(b) ||
            (c.nome_fantasia || '').toLowerCase().includes(b) ||
            (c.cnpj_cpf || '').includes(b)
        );
      }
      const offset = (filtros.page - 1) * filtros.limit;
      return { items: filtrados.slice(offset, offset + filtros.limit), total: filtrados.length };
    }
  }

  async listAllForSync(ctx: TenantContext): Promise<Cliente[]> {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        'SELECT * FROM clientes WHERE ativo = TRUE ORDER BY updated_at ASC;'
      );
      return res.rows;
    });
  }

  async update(ctx: TenantContext, id: string, dados: Partial<Cliente>): Promise<Cliente | null> {
    return withTenantTransaction(ctx, async (client) => {
      const campos: string[] = [];
      const params: any[] = [id];
      let indice = 2;

      for (const [chave, valor] of Object.entries(dados)) {
        // Lista branca de colunas: o codigo antigo montava 'SET ${key} = ...'
        // a partir de qualquer chave que chegasse no objeto.
        if (!COLUNAS_ATUALIZAVEIS.has(chave) || valor === undefined) continue;

        if (['qsa', 'cnaes_secundarios', 'dados_receita_brutos'].includes(chave) && typeof valor === 'object') {
          campos.push(`${chave} = $${indice++}`);
          params.push(JSON.stringify(valor));
        } else {
          campos.push(`${chave} = $${indice++}`);
          params.push(valor);
        }
      }

      if (campos.length === 0) {
        const atual = await client.query('SELECT * FROM clientes WHERE id = $1;', [id]);
        return atual.rows[0] || null;
      }

      campos.push('updated_at = NOW()');
      const res = await client.query(
        `UPDATE clientes SET ${campos.join(', ')} WHERE id = $1 RETURNING *;`,
        params
      );
      return res.rows[0] || null;
    });
  }

  async recordHistoricoAlteracao(
    ctx: TenantContext,
    clienteId: string,
    campo: string,
    valorAnterior: string | null,
    valorNovo: string | null,
    origem: 'AUTO_SYNC_RFB' | 'MANUAL' | 'WEBHOOK_RECEITA' = 'AUTO_SYNC_RFB',
    dataVigencia: Date = new Date()
  ): Promise<ClienteHistoricoAlteracao> {
    return withTenantTransaction(ctx, async (client) => {
      const res = await client.query(
        `INSERT INTO clientes_historico_alteracoes (
           empresa_id, cliente_id, campo_alterado, valor_anterior, valor_novo,
           origem_alteracao, data_vigencia, registrado_em
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *;`,
        [ctx.empresaId, clienteId, campo, valorAnterior, valorNovo, origem, dataVigencia]
      );
      return res.rows[0];
    });
  }

  async getHistoricoAlteracoes(ctx: TenantContext, clienteId: string): Promise<ClienteHistoricoAlteracao[]> {
    return withTenantQuery(ctx, async (client) => {
      const res = await client.query(
        `SELECT * FROM clientes_historico_alteracoes
          WHERE cliente_id = $1
          ORDER BY registrado_em DESC;`,
        [clienteId]
      );
      return res.rows;
    });
  }
}
