import { pgPool } from '../../core/database/supabase-pool';
import { localMirror } from '../../core/database/local-mirror.service';
import { Cliente, ClienteHistoricoAlteracao, SituacaoCadastral } from './clientes.types';
import { FilterClienteQuery } from './clientes.schema';

export class ClientesRepository {
  async create(empresaId: string, dados: Partial<Cliente>): Promise<Cliente> {
    const query = `
      INSERT INTO clientes (
        empresa_id,
        razao_social_nome,
        nome_fantasia,
        cnpj_cpf,
        cnae_principal,
        cnae_descricao,
        situacao_cadastral,
        motivo_situacao_cadastral,
        data_situacao_cadastral,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        municipio,
        uf,
        email,
        telefone,
        qsa,
        bloqueio_fiscal,
        ultima_sincronizacao_rfb,
        ativo
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *;
    `;

    const params = [
      empresaId,
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
    ];

    const res = await pgPool.query(query, params);
    return res.rows[0];
  }

  async findById(empresaId: string, id: string): Promise<Cliente | null> {
    const query = `SELECT * FROM clientes WHERE id = $1 AND empresa_id = $2;`;
    const res = await pgPool.query(query, [id, empresaId]);
    return res.rows[0] || null;
  }

  async findByCnpj(empresaId: string, cnpj: string): Promise<Cliente | null> {
    const cleanCnpj = cnpj.replace(/[^\d]/g, '');
    const query = `SELECT * FROM clientes WHERE empresa_id = $1 AND regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') = $2;`;
    const res = await pgPool.query(query, [empresaId, cleanCnpj]);
    return res.rows[0] || null;
  }

  async list(empresaId: string, filters: FilterClienteQuery): Promise<{ items: Cliente[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (empresaId && empresaId !== 'all') {
      conditions.push(`empresa_id = $${paramIndex++}`);
      params.push(empresaId);
    }

    if (filters.tipo_entidade) {
      conditions.push(`tipo_entidade = $${paramIndex++}`);
      params.push(filters.tipo_entidade);
    }

    if (filters.situacao_cadastral) {
      conditions.push(`situacao_cadastral = $${paramIndex++}`);
      params.push(filters.situacao_cadastral);
    }

    if (filters.bloqueio_fiscal !== undefined) {
      conditions.push(`bloqueio_fiscal = $${paramIndex++}`);
      params.push(filters.bloqueio_fiscal);
    }

    if (filters.ativo !== undefined) {
      conditions.push(`ativo = $${paramIndex++}`);
      params.push(filters.ativo);
    }

    if (filters.busca) {
      conditions.push(`(razao_social_nome ILIKE $${paramIndex} OR nome_fantasia ILIKE $${paramIndex} OR cnpj_cpf ILIKE $${paramIndex})`);
      params.push(`%${filters.busca}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const countQuery = `SELECT COUNT(*)::int as total FROM clientes WHERE ${whereClause};`;
    const countParams = [...params];

    const offset = (filters.page - 1) * filters.limit;
    const dataQuery = `
      SELECT * FROM clientes
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    params.push(filters.limit, offset);

    try {
      const client = await pgPool.connect();
      try {
        const [countRes, dataRes] = await Promise.all([
          client.query(countQuery, countParams),
          client.query(dataQuery, params)
        ]);
        const result = {
          items: dataRes.rows,
          total: countRes.rows[0]?.total || 0
        };
        // Grava no mirror assincronamente apenas se for varredura completa sem filtros restritivos
        if ((!empresaId || empresaId === 'all') && !filters.tipo_entidade && !filters.busca && dataRes.rows.length >= 100) {
          setImmediate(() => localMirror.saveMirror('clientes', dataRes.rows));
        }
        return result;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn(`[CLIENTES REPOSITORY]: Falha na nuvem Supabase (${err.message}). Servindo com contingência do Local Mirror em <2ms...`);
      const all = localMirror.getMirror<any[]>('clientes') || [];
      let filtered = all;
      if (filters.tipo_entidade) {
        filtered = filtered.filter(c => c.tipo_entidade === filters.tipo_entidade);
      }
      if (filters.busca) {
        const b = filters.busca.toLowerCase();
        filtered = filtered.filter(c => 
          (c.razao_social_nome || '').toLowerCase().includes(b) ||
          (c.nome_fantasia || '').toLowerCase().includes(b) ||
          (c.cnpj_cpf || '').includes(b)
        );
      }
      const total = filtered.length;
      const offset = (filters.page - 1) * filters.limit;
      const items = filtered.slice(offset, offset + filters.limit);
      return { items, total };
    }
  }

  async listAllForSync(empresaId: string): Promise<Cliente[]> {
    const query = `SELECT * FROM clientes WHERE empresa_id = $1 AND ativo = TRUE ORDER BY updated_at ASC;`;
    const res = await pgPool.query(query, [empresaId]);
    return res.rows;
  }

  async update(empresaId: string, id: string, dados: Partial<Cliente>): Promise<Cliente | null> {
    const fields: string[] = [];
    const params: any[] = [id, empresaId];
    let paramIndex = 3;

    Object.entries(dados).forEach(([key, value]) => {
      if (['id', 'empresa_id', 'created_at'].includes(key)) return;
      if (value !== undefined) {
        if (key === 'qsa' && typeof value === 'object') {
          fields.push(`${key} = $${paramIndex++}`);
          params.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = $${paramIndex++}`);
          params.push(value);
        }
      }
    });

    fields.push(`updated_at = NOW()`);

    const query = `
      UPDATE clientes
      SET ${fields.join(', ')}
      WHERE id = $1 AND empresa_id = $2
      RETURNING *;
    `;

    const res = await pgPool.query(query, params);
    return res.rows[0] || null;
  }

  /**
   * Gravação atômica no histórico de alterações (SCD Tipo 2 / Audit Log)
   */
  async recordHistoricoAlteracao(
    empresaId: string,
    clienteId: string,
    campo: string,
    valorAnterior: string | null,
    valorNovo: string | null,
    origem: 'AUTO_SYNC_RFB' | 'MANUAL' | 'WEBHOOK_RECEITA' = 'AUTO_SYNC_RFB',
    dataVigencia: Date = new Date()
  ): Promise<ClienteHistoricoAlteracao> {
    const query = `
      INSERT INTO clientes_historico_alteracoes (
        empresa_id,
        cliente_id,
        campo_alterado,
        valor_anterior,
        valor_novo,
        origem_alteracao,
        data_vigencia,
        registrado_em
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;

    const res = await pgPool.query(query, [
      empresaId,
      clienteId,
      campo,
      valorAnterior,
      valorNovo,
      origem,
      dataVigencia
    ]);
    return res.rows[0];
  }

  async getHistoricoAlteracoes(empresaId: string, clienteId: string): Promise<ClienteHistoricoAlteracao[]> {
    const query = `
      SELECT * FROM clientes_historico_alteracoes
      WHERE empresa_id = $1 AND cliente_id = $2
      ORDER BY registrado_em DESC;
    `;
    const res = await pgPool.query(query, [empresaId, clienteId]);
    return res.rows;
  }
}
