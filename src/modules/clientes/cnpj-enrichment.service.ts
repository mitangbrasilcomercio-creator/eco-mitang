import * as fs from 'fs';
import * as path from 'path';
import { pgPool } from '../../core/database/supabase-pool';
import { localMirror } from '../../core/database/local-mirror.service';

export interface VerticalNicho {
  vertical: string;
  icone: string;
  cor: string;
  badgeClass: string;
}

export class CnpjEnrichmentService {
  private static localCnpjCache: Record<string, any> | null = null;

  /**
   * Carrega a base local de CNPJs consultados previamente (287 KB)
   */
  private static getLocalCnpjData(): Record<string, any> {
    if (!this.localCnpjCache) {
      try {
        const filePath = path.join(
          __dirname,
          '..',
          '..',
          '..',
          'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro',
          'Alguns de Nossos Clientes',
          'cnpj_data.json'
        );
        if (fs.existsSync(filePath)) {
          this.localCnpjCache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } else {
          this.localCnpjCache = {};
        }
      } catch (err: any) {
        this.localCnpjCache = {};
      }
    }
    return this.localCnpjCache || {};
  }

  /**
   * Classifica automaticamente o nicho / vertical da empresa com base no CNAE e Razão Social
   */
  public static inferirVertical(cnaeCode: any, cnaeDesc: any, razaoSocial: any): VerticalNicho {
    const code = String(cnaeCode || '').replace(/[^\d]/g, '');
    const desc = String(cnaeDesc || '').toUpperCase();
    const name = String(razaoSocial || '').toUpperCase();

    // 1. Setor Subsea, Offshore & Petróleo e Gás
    if (
      code.startsWith('06') || 
      code.startsWith('09') || 
      code === '7112000' || 
      desc.includes('PETRÓLEO') || 
      desc.includes('PETROLEO') || 
      desc.includes('GÁS') || 
      desc.includes('SUBSEA') || 
      desc.includes('MARÍTIM') || 
      desc.includes('MARITIM') || 
      desc.includes('OCEAN') ||
      name.includes('SUBSEA') ||
      name.includes('OFFSHORE') ||
      name.includes('FUGRO') ||
      name.includes('OCEANPACT') ||
      name.includes('C-INNOVATION') ||
      name.includes('PETROBRAS') ||
      name.includes('ENSCO') ||
      name.includes('HYDRO')
    ) {
      return {
        vertical: 'Offshore, Petróleo & Gás Subsea',
        icone: 'ph-waves',
        cor: '#06b6d4',
        badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      };
    }

    // 2. Setor Hospitalar & Clínico (Baterias Médicas)
    if (
      code.startsWith('86') || 
      code.startsWith('4773') || 
      code.startsWith('3250') || 
      code.startsWith('4645') || 
      desc.includes('MÉDICO') || 
      desc.includes('MEDIC') || 
      desc.includes('HOSPITAL') || 
      desc.includes('ORTOPÉD') || 
      desc.includes('CIRÚRG') ||
      name.includes('HOSPITAL') ||
      name.includes('MEDIC') ||
      name.includes('CLINIC') ||
      name.includes('CIRURG') ||
      name.includes('MV3')
    ) {
      return {
        vertical: 'Hospitalar & Equipamentos Médicos',
        icone: 'ph-heartbeat',
        cor: '#f43f5e',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      };
    }

    // 3. Fornecedores de Insumos Industriais & Embalagens
    if (
      code.startsWith('22') || 
      code.startsWith('17') || 
      code.startsWith('27') || 
      desc.includes('PLÁSTICO') || 
      desc.includes('PLASTICO') || 
      desc.includes('EMBALAGEM') || 
      desc.includes('PILHA') || 
      desc.includes('BATERIA') ||
      name.includes('STREMA') ||
      name.includes('SBT') ||
      name.includes('HAYAMAX') ||
      name.includes('RYNDACK')
    ) {
      return {
        vertical: 'Indústria & Insumos Manufaturados',
        icone: 'ph-factory',
        cor: '#f59e0b',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      };
    }

    // 4. Serviços Técnicos, Engenharia & Consultoria PJ
    if (
      code.startsWith('71') || 
      code.startsWith('70') || 
      code.startsWith('69') || 
      code.startsWith('62') || 
      code.startsWith('63') || 
      desc.includes('ENGENHARIA') || 
      desc.includes('CONSULTORIA') || 
      desc.includes('CONTÁBIL') || 
      desc.includes('PERÍCIA') || 
      desc.includes('SOFTWARE') ||
      name.includes('CONSULTORIA') ||
      name.includes('PERICIA') ||
      name.includes('ENGENHARIA') ||
      name.includes('SURVEY')
    ) {
      return {
        vertical: 'Serviços Técnicos & Consultoria PJ',
        icone: 'ph-briefcase',
        cor: '#a855f7',
        badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      };
    }

    // 5. Comércio Atacadista & Distribuição
    if (code.startsWith('46') || code.startsWith('47')) {
      return {
        vertical: 'Comércio & Distribuição Geral',
        icone: 'ph-shopping-cart',
        cor: '#10b981',
        badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      };
    }

    return {
      vertical: 'Corporativo & Outros Segmentos',
      icone: 'ph-buildings',
      cor: '#94a3b8',
      badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    };
  }

  /**
   * Consulta dados públicos de um CNPJ com inteligência multi-provedor em cascata (BrasilAPI -> MinhaReceita -> ReceitaWS -> Cache)
   * 
   * [ERRO ANTERIOR]: Timeout de 2.5s abortava e retornava { razao_social: null }.
   * [CORREÇÃO]: Delegação para CnpjEnrichmentGateway com timeout de 8s, retentativas em 429 e fallback triplo.
   */
  public static async consultarCnpj(cnpjRaw: string): Promise<any> {
    const cleanCnpj = String(cnpjRaw || '').replace(/[^\d]/g, '');
    if (cleanCnpj.length !== 14) {
      throw new Error(`CNPJ inválido: ${cnpjRaw}`);
    }

    const { CnpjEnrichmentGateway } = await import('./cnpj-enrichment.gateway');
    const gateway = new CnpjEnrichmentGateway();
    
    try {
      const dados = await gateway.consultarCnpj(cleanCnpj);
      return {
        ...dados,
        cnae_fiscal: dados.cnae_principal,
        cnae_fiscal_descricao: dados.cnae_descricao,
        descricao_situacao_cadastral: dados.situacao_cadastral,
        descricao_motivo_situacao_cadastral: dados.motivo_situacao_cadastral,
        ddd_telefone_1: dados.telefone,
        _consultadoExterno: true
      };
    } catch (err: any) {
      // Verifica se existe no cache local bruto
      const localData = this.getLocalCnpjData();
      if (localData[cleanCnpj] && !localData[cleanCnpj].error) {
        return localData[cleanCnpj];
      }
      throw err;
    }
  }


  /**
   * Salva ou atualiza um cliente com riqueza cadastral absoluta no Supabase
   */
  public static async salvarParceiroEnriquecido(empresaId: string, rawCnpjData: any, tipoEntidadeSugerido?: string): Promise<any> {
    const d = rawCnpjData;
    const cleanCnpj = (d.cnpj || d.cnpj_cpf || '').replace(/[^\d]/g, '');
    if (!cleanCnpj) return null;

    const verticalInfo = this.inferirVertical(
      d.cnae_fiscal || d.cnae_principal,
      d.cnae_fiscal_descricao || d.cnae_descricao,
      d.razao_social || d.razao_social_nome
    );

    // Normaliza QSA e CNAEs
    const qsa = Array.isArray(d.qsa) ? d.qsa : [];
    const cnaesSecundarios = Array.isArray(d.cnaes_secundarios) ? d.cnaes_secundarios : [];

    // Situação Cadastral
    const sitCadastral = (d.descricao_situacao_cadastral || d.situacao_cadastral || 'ATIVA').toUpperCase();
    const isBloqueado = sitCadastral === 'INAPTA' || sitCadastral === 'BAIXADA' || sitCadastral === 'SUSPENSA';

    // Determina tipo de entidade se não informado
    let tipoEntidade = tipoEntidadeSugerido || 'CLIENTE';
    const razaoUpper = (d.razao_social || '').toUpperCase();
    if (razaoUpper.includes('STREMA') || razaoUpper.includes('SBT') || razaoUpper.includes('HAYAMAX') || razaoUpper.includes('RYNDACK')) {
      tipoEntidade = 'FORNECEDOR';
    }

    const client = await pgPool.connect();
    try {
      const query = `
        INSERT INTO clientes (
          empresa_id, razao_social_nome, nome_fantasia, cnpj_cpf, email, telefone,
          ativo, cep, logradouro, numero, complemento, bairro, municipio, uf,
          cnae_principal, cnae_descricao, situacao_cadastral, motivo_situacao_cadastral,
          data_situacao_cadastral, capital_social, porte, natureza_juridica,
          opcao_pelo_simples, opcao_pelo_mei, qsa, cnaes_secundarios, dados_receita_brutos,
          bloqueio_fiscal, tipo_entidade, ultima_sincronizacao_rfb
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW()
        )
        ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET
          razao_social_nome = EXCLUDED.razao_social_nome,
          nome_fantasia = COALESCE(EXCLUDED.nome_fantasia, clientes.nome_fantasia),
          capital_social = COALESCE(EXCLUDED.capital_social, clientes.capital_social),
          qsa = EXCLUDED.qsa,
          cnae_principal = COALESCE(EXCLUDED.cnae_principal, clientes.cnae_principal),
          cnae_descricao = COALESCE(EXCLUDED.cnae_descricao, clientes.cnae_descricao),
          cnaes_secundarios = EXCLUDED.cnaes_secundarios,
          dados_receita_brutos = EXCLUDED.dados_receita_brutos,
          situacao_cadastral = EXCLUDED.situacao_cadastral,
          bloqueio_fiscal = EXCLUDED.bloqueio_fiscal,
          tipo_entidade = COALESCE(EXCLUDED.tipo_entidade, clientes.tipo_entidade),
          ultima_sincronizacao_rfb = NOW()
        RETURNING *;
      `;

      const params = [
        empresaId,
        d.razao_social || d.razao_social_nome || 'RAZÃO SOCIAL NÃO INFORMADA',
        d.nome_fantasia || null,
        cleanCnpj,
        d.email || null,
        d.ddd_telefone_1 || d.telefone || null,
        true,
        d.cep || null,
        d.logradouro || null,
        d.numero || null,
        d.complemento || null,
        d.bairro || null,
        d.municipio || null,
        d.uf || null,
        d.cnae_fiscal || d.cnae_principal || null,
        d.cnae_fiscal_descricao || d.cnae_descricao || null,
        sitCadastral,
        d.descricao_motivo_situacao_cadastral || d.motivo_situacao_cadastral || null,
        d.data_situacao_cadastral ? new Date(d.data_situacao_cadastral) : null,
        d.capital_social ? parseFloat(d.capital_social) : 0.00,
        d.porte || null,
        d.natureza_juridica || null,
        d.opcao_pelo_simples === true || d.opcao_pelo_simples === 'SIM',
        d.opcao_pelo_mei === true || d.opcao_pelo_mei === 'SIM',
        JSON.stringify(qsa),
        JSON.stringify(cnaesSecundarios),
        JSON.stringify({ ...d, vertical: verticalInfo }),
        isBloqueado,
        tipoEntidade
      ];

      const res = await client.query(query, params);
      return res.rows[0];
    } finally {
      client.release();
    }
  }
}

export const cnpjEnrichmentService = new CnpjEnrichmentService();
