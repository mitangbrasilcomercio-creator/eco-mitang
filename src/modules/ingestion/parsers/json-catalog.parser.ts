import { withTenantTransaction } from '../../../core/database/supabase-pool';
import { ItemCatalogo } from '../../catalogo/models/item-catalogo.model';
import { TipoItemEnum } from '../../catalogo/dtos/item-catalogo.dto';
import { PoolClient } from 'pg';

export interface RawJsonCatalogItem {
  empresa_id?: string;
  tipo_item: string;
  codigo_sku?: string | null;
  nome_comercial: string;
  preco_base: number;
  quantidade_estoque?: number;
  ficha_tecnica?: Record<string, any>;
  [key: string]: any;
}

export interface IngestionResult {
  total_processados: number;
  sucesso: boolean;
  itens_criados: ItemCatalogo[];
  erros?: Array<{ index: number; item: any; erro: string }>;
}

export class JsonCatalogParser {
  /**
   * REGRA 2 (ACID): Importação de lote com Transação de Banco de Dados.
   * Se o item 999 de 1000 falhar, executa ROLLBACK total.
   */
  async parseAndImportBatch(empresaId: string, items: RawJsonCatalogItem[]): Promise<IngestionResult> {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('O payload deve ser um array nao vazio de objetos JSON.');
    }

    const itensCriados: ItemCatalogo[] = [];

    // [CORRECAO] Antes usava pgPool.connect() com BEGIN manual e sem contexto de
    // tenant. Com a RLS valendo, o INSERT era recusado pelo WITH CHECK.
    // withTenantTransaction ja cuida de BEGIN/COMMIT/ROLLBACK/release.
    try {
      return await withTenantTransaction({ empresaId, empresaIds: [empresaId] }, async (client: PoolClient) => {

      for (let i = 0; i < items.length; i++) {
        const raw = items[i];

        // 1. Validação básica de campos obrigatórios
        const targetEmpresaId = raw.empresa_id || empresaId;
        const tipoItemValid = TipoItemEnum.safeParse(raw.tipo_item);
        if (!tipoItemValid.success) {
          throw new Error(`[Item #${i + 1}] tipo_item invalido: '${raw.tipo_item}'. Permitidos: Produto, Locacao, Servico, Curso.`);
        }

        if (!raw.nome_comercial || String(raw.nome_comercial).trim().length < 2) {
          throw new Error(`[Item #${i + 1}] 'nome_comercial' obrigatorio e invalido.`);
        }

        if (raw.preco_base === undefined || isNaN(Number(raw.preco_base)) || Number(raw.preco_base) < 0) {
          throw new Error(`[Item #${i + 1}] 'preco_base' invalido: ${raw.preco_base}`);
        }

        // 2. Extração EAV: Nós aninhados (ex: 'ficha_tecnica') e propriedades extras para 'atributos_extras'
        const knownKeys = ['empresa_id', 'tipo_item', 'codigo_sku', 'nome_comercial', 'preco_base', 'quantidade_estoque', 'atributos_extras'];
        const atributosExtras: Record<string, any> = {
          ...(typeof raw.atributos_extras === 'object' ? raw.atributos_extras : {}),
          ...(typeof raw.ficha_tecnica === 'object' ? { ficha_tecnica: raw.ficha_tecnica } : {})
        };

        for (const [k, v] of Object.entries(raw)) {
          if (!knownKeys.includes(k) && k !== 'ficha_tecnica') {
            atributosExtras[k] = v;
          }
        }

        const precoBase = Number(raw.preco_base);
        const quantidadeEstoque = raw.tipo_item === 'Produto' ? Number(raw.quantidade_estoque || 0) : 0;

        // 3. Inserção no banco dentro da transação ACID
        const insertQuery = `
          INSERT INTO itens_catalogo (
            empresa_id, tipo_item, codigo_sku, nome_comercial, preco_base,
            quantidade_estoque, atributos_extras, status_ativo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
          RETURNING *;
        `;
        const params = [
          targetEmpresaId,
          raw.tipo_item,
          raw.codigo_sku || null,
          raw.nome_comercial,
          precoBase,
          quantidadeEstoque,
          JSON.stringify(atributosExtras)
        ];

        const res = await client.query(insertQuery, params);
        itensCriados.push({
          ...res.rows[0],
          preco_base: parseFloat(res.rows[0].preco_base),
          quantidade_estoque: parseFloat(res.rows[0].quantidade_estoque),
          atributos_extras: typeof res.rows[0].atributos_extras === 'string' ? JSON.parse(res.rows[0].atributos_extras) : res.rows[0].atributos_extras
        });
      }

        return {
          total_processados: itensCriados.length,
          sucesso: true,
          itens_criados: itensCriados
        };
      });
    } catch (err: any) {
      // REGRA 2 (ACID): o rollback ja foi aplicado por withTenantTransaction.
      console.error('[ROLLBACK - Ingestao de Catalogo]', err.message);
      throw new Error(`Falha na ingestao em lote. Rollback executado. Motivo: ${err.message}`);
    }
  }
}
