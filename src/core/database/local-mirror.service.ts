import * as fs from 'fs';
import * as path from 'path';
import { withTenantQuery, contextoTodosTenants } from './supabase-pool';
import { memoryCache } from '../cache/memory-cache';

const MIRROR_DIR = path.join(__dirname, '..', '..', '..', 'database', 'local_mirror');

/**
 * ============================================================================
 * ESPELHO LOCAL (ALTA DISPONIBILIDADE DE LEITURA)
 * ============================================================================
 *
 * O QUE ESTA CAMADA E:
 * Um cache de LEITURA em disco, para o painel continuar respondendo quando o
 * Supabase Free Tier pausa por inatividade ou fica lento.
 *
 * O QUE ELA NAO E:
 * Um destino de escrita. Esta distincao custou dados reais: o endpoint
 * 'POST /financeiro/categorizar-transacao' gravava a categorizacao do usuario
 * apenas no JSON daqui, e o worker diario abaixo sobrescreve esses arquivos a
 * partir do Postgres -- entao toda categorizacao feita pelo usuario era
 * silenciosamente perdida em ate 24 horas. Escrita agora vai para o banco.
 *
 * [OUTRO ERRO CORRIGIDO]:
 * 'syncAllTables' fazia 'SELECT * FROM notas_fiscais', trazendo 'conteudo_xml'
 * e 'dados_completos_json' -- varios KB por nota. O arquivo de espelho passava
 * de 3,8 MB e era relido e desserializado inteiro a cada fallback, longe dos
 * "< 2ms" que o README prometia. As colunas pesadas ficaram de fora.
 * ============================================================================
 */
export class LocalMirrorService {
  private static instance: LocalMirrorService;

  private constructor() {
    if (!fs.existsSync(MIRROR_DIR)) {
      fs.mkdirSync(MIRROR_DIR, { recursive: true });
    }
  }

  public static getInstance(): LocalMirrorService {
    if (!LocalMirrorService.instance) {
      LocalMirrorService.instance = new LocalMirrorService();
    }
    return LocalMirrorService.instance;
  }

  public saveMirror(key: string, data: any): void {
    try {
      fs.writeFileSync(path.join(MIRROR_DIR, `${key}.json`), JSON.stringify(data), 'utf8');
      memoryCache.set(`mirror_${key}`, data, 300);
    } catch (err: any) {
      console.warn(`[LOCAL MIRROR] Falha ao gravar '${key}':`, err.message);
    }
  }

  public getMirror<T>(key: string): T | null {
    try {
      const cached = memoryCache.get<T>(`mirror_${key}`);
      if (cached) return cached;

      const filePath = path.join(MIRROR_DIR, `${key}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
        memoryCache.set(`mirror_${key}`, data, 300);
        return data;
      }
    } catch (err: any) {
      console.warn(`[LOCAL MIRROR] Falha ao ler '${key}':`, err.message);
    }
    return null;
  }

  /**
   * Executa a consulta com prazo maximo e cai para o espelho se estourar.
   *
   * [OBSERVACAO]: este metodo existia desde o inicio e NUNCA era chamado --
   * cada controller reimplementava a propria logica de fallback no catch.
   */
  public async executeWithFallback<T>(
    mirrorKey: string,
    queryFn: () => Promise<T>,
    timeoutMs: number = 2500
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const prazo = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT_BANCO')), timeoutMs);
    });

    try {
      const resultado = await Promise.race([queryFn(), prazo]);
      setImmediate(() => this.saveMirror(mirrorKey, resultado));
      return resultado;
    } catch (err: any) {
      console.warn(`[LOCAL MIRROR] Banco indisponivel (${err.message}). Contingencia para '${mirrorKey}'.`);
      const fallback = this.getMirror<T>(mirrorKey);
      if (fallback) return fallback;
      throw err;
    } finally {
      // O timer precisa ser limpo mesmo no caminho de sucesso, senao o processo
      // fica com handles pendentes e nao encerra sozinho.
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Sincroniza as tabelas mestres para o espelho em disco.
   * Roda com o contexto amplo de manutencao: o espelho cobre a holding inteira.
   */
  public async syncAllTables(): Promise<void> {
    console.log('[LOCAL MIRROR] Sincronizando tabelas para a camada de contingencia...');

    const ctx = await contextoTodosTenants();

    // Colunas explicitas. Nada de 'SELECT *' em tabelas que carregam XML e
    // JSON completos.
    const tabelas = [
      {
        key: 'clientes',
        sql: `SELECT id, empresa_id, razao_social_nome, nome_fantasia, cnpj_cpf, email, telefone,
                     cnae_principal, cnae_descricao, situacao_cadastral, municipio, uf,
                     bloqueio_fiscal, tipo_entidade, ativo, created_at
                FROM clientes ORDER BY created_at DESC;`
      },
      {
        key: 'catalogo_universal',
        sql: `SELECT id, empresa_id, tipo_item, nome, descricao_tecnica, detalhes,
                     quantidade_estoque_atual, ativo, created_at
                FROM catalogo_universal ORDER BY created_at DESC;`
      },
      {
        key: 'orcamentos_historico',
        sql: `SELECT id, empresa_id, numero_orcamento, vendido_por, data_emissao, cliente_nome,
                     cliente_cnpj_cpf, cliente_contato, status_aprovacao, situacao_geral,
                     valor_total, itens_json, created_at
                FROM orcamentos_historico ORDER BY data_emissao DESC NULLS LAST;`
      },
      {
        key: 'transacoes_bancarias',
        sql: `SELECT t.id, t.empresa_id, t.data_lancamento, t.valor, t.memo, t.tipo_operacao,
                     t.documento_contraparte, t.nome_contraparte, t.categoria_financeira,
                     t.is_saldo_informativo, t.status_conciliacao,
                     c.banco_nome, c.conta_numero, c.agencia
                FROM transacoes_bancarias t
                JOIN contas_bancarias c ON c.id = t.conta_bancaria_id
               ORDER BY t.data_lancamento DESC;`
      },
      {
        key: 'notas_fiscais',
        // Sem conteudo_xml nem dados_completos_json: sao os campos que faziam o
        // espelho passar de 3,8 MB.
        sql: `SELECT id, empresa_id, chave_acesso, numero_nota, serie, tipo_documento, direcao,
                     emitente_nome, emitente_cnpj_cpf, destinatario_nome, destinatario_cnpj_cpf,
                     data_emissao, valor_total, valor_impostos_total, status_processamento
                FROM notas_fiscais ORDER BY data_emissao DESC;`
      },
      {
        key: 'contas_bancarias',
        sql: `SELECT id, empresa_id, banco_codigo, banco_nome, agencia, conta_numero,
                     saldo_atual, data_ultimo_saldo, ativo
                FROM contas_bancarias WHERE ativo = TRUE;`
      },
      {
        key: 'obrigacoes_recorrentes',
        sql: `SELECT * FROM vw_obrigacoes_recorrentes ORDER BY data_vencimento DESC;`
      }
    ];

    for (const t of tabelas) {
      try {
        const linhas = await withTenantQuery(ctx, async (client) => (await client.query(t.sql)).rows);
        this.saveMirror(t.key, linhas);
        const tamanho = (fs.statSync(path.join(MIRROR_DIR, `${t.key}.json`)).size / 1024).toFixed(0);
        console.log(`  -> ${t.key}: ${linhas.length} registros (${tamanho} KB)`);
      } catch (e: any) {
        console.warn(`  -> Falha ao espelhar '${t.key}':`, e.message);
      }
    }
    console.log('[LOCAL MIRROR] Sincronizacao concluida.');
  }
}

export const localMirror = LocalMirrorService.getInstance();
