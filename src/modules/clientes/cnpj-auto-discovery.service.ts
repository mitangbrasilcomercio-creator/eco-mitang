import { withTenantQuery, contextoTodosTenants } from '../../core/database/supabase-pool';
import { CnpjEnrichmentService } from './cnpj-enrichment.service';
import { localMirror } from '../../core/database/local-mirror.service';

export class CnpjAutoDiscoveryService {
  private static instance: CnpjAutoDiscoveryService;

  public static getInstance(): CnpjAutoDiscoveryService {
    if (!CnpjAutoDiscoveryService.instance) {
      CnpjAutoDiscoveryService.instance = new CnpjAutoDiscoveryService();
    }
    return CnpjAutoDiscoveryService.instance;
  }

  /**
   * Varre extratos bancários e orçamentos procurando CNPJs ainda não cadastrados em 'clientes'.
   * Ao encontrar, consulta os dados oficiais na Receita Federal / BrasilAPI, infere a vertical por CNAE,
   * classifica a entidade (Cliente vs Fornecedor vs Colaborador PJ), cadastra no Supabase e atualiza os vínculos.
   */
  public async executarVarreduraEAutoCadastro(empresaIdPadrao: string = '29ea0857-7cf7-44e1-ba36-a3f323c4670c'): Promise<{ novosCadastrados: number; vinculados: number }> {
    console.log('[CNPJ AUTO-DISCOVERY] Iniciando varredura inteligente de CNPJs em transações e orçamentos...');

    let novosCadastrados = 0;
    let vinculados = 0;

    // [CORRECAO] Rodava com pgPool.connect() sem contexto de tenant. Com a RLS
    // valendo, toda consulta voltava vazia e a varredura "nao encontrava" nada.
    // E uma rotina de manutencao: enxerga a holding inteira, de proposito.
    const ctxManutencao = await contextoTodosTenants();
    return withTenantQuery(ctxManutencao, async (client) => {
      // 1. Obter todos os CNPJs já conhecidos
      const cliRes = await client.query("SELECT DISTINCT regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') as cnpj FROM clientes WHERE cnpj_cpf IS NOT NULL;");
      const knownCnpjs = new Set<string>(cliRes.rows.map(r => r.cnpj));

      // 2. Extrair CNPJs de orçamentos pendentes de cadastro
      const orcRes = await client.query(`
        SELECT DISTINCT regexp_replace(cliente_cnpj_cpf, '[^0-9]', '', 'g') as cnpj, cliente_nome, empresa_id
        FROM orcamentos_historico 
        WHERE cliente_cnpj_cpf IS NOT NULL AND length(regexp_replace(cliente_cnpj_cpf, '[^0-9]', '', 'g')) = 14;
      `);

      const cnpjsParaCadastrar = new Map<string, { sugestaoNome: string; tipoSugerido: string; empresaId: string }>();

      for (const r of orcRes.rows) {
        if (!knownCnpjs.has(r.cnpj)) {
          cnpjsParaCadastrar.set(r.cnpj, {
            sugestaoNome: r.cliente_nome,
            tipoSugerido: 'CLIENTE',
            empresaId: r.empresa_id || empresaIdPadrao
          });
        }
      }

      // 3. Extrair CNPJs de transações bancárias (documento contraparte)
      const txRes = await client.query(`
        SELECT DISTINCT regexp_replace(documento_contraparte, '[^0-9]', '', 'g') as cnpj, nome_contraparte, valor, empresa_id
        FROM transacoes_bancarias
        WHERE documento_contraparte IS NOT NULL AND length(regexp_replace(documento_contraparte, '[^0-9]', '', 'g')) = 14;
      `);

      for (const r of txRes.rows) {
        if (!knownCnpjs.has(r.cnpj) && !cnpjsParaCadastrar.has(r.cnpj)) {
          // Se for saída (valor < 0), é fornecedor de insumos ou prestador de serviço PJ. Se entrada (> 0), é cliente comprador
          const tipo = Number(r.valor) < 0 ? 'FORNECEDOR' : 'CLIENTE';
          cnpjsParaCadastrar.set(r.cnpj, {
            sugestaoNome: r.nome_contraparte || 'Fornecedor Identificado em Extrato',
            tipoSugerido: tipo,
            empresaId: r.empresa_id || empresaIdPadrao
          });
        }
      }

      console.log(`[CNPJ AUTO-DISCOVERY] ${cnpjsParaCadastrar.size} novos CNPJs identificados para enriquecimento oficial.`);

      // 4. Para cada CNPJ novo, consulta dados oficiais, infere vertical e grava no DB
      for (const [cnpj, meta] of cnpjsParaCadastrar.entries()) {
        try {
          console.log(`[AUTO-ENRICH] Consultando CNPJ ${cnpj} (${meta.sugestaoNome})...`);
          
          let rfData: any = null;
          try {
            const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (resp.ok) {
              rfData = await resp.json();
            }
          } catch (e: any) {
            console.warn(`[BRASILAPI] Falha de rede para CNPJ ${cnpj}: ${e.message}`);
          }

          const razaoSocial = (rfData?.razao_social || meta.sugestaoNome || 'Parceiro Cadastrado').toUpperCase();
          const nomeFantasia = rfData?.nome_fantasia || null;
          const cnaePrincipal = rfData?.cnae_fiscal ? String(rfData.cnae_fiscal) : null;
          const cnaeDesc = rfData?.cnae_fiscal_descricao || null;
          const situacao = rfData?.descricao_situacao_cadastral || 'ATIVA';
          const motivo = rfData?.descricao_motivo_situacao_cadastral || null;
          const dataSituacao = rfData?.data_situacao_cadastral ? new Date(rfData.data_situacao_cadastral) : null;
          const cep = rfData?.cep ? String(rfData.cep).replace(/\D/g, '') : null;
          const logradouro = rfData?.logradouro || null;
          const numero = rfData?.numero || null;
          const complemento = rfData?.complemento || null;
          const bairro = rfData?.bairro || null;
          const municipio = rfData?.municipio || null;
          const uf = rfData?.uf || null;
          const capitalSocial = Number(rfData?.capital_social || 0);
          const porte = rfData?.porte || null;
          const naturezaJuridica = rfData?.natureza_juridica || null;
          const simples = rfData?.opcao_pelo_simples === true;
          const mei = rfData?.opcao_pelo_mei === true;
          const qsa = Array.isArray(rfData?.qsa) ? rfData.qsa : [];
          const cnaesSecundarios = Array.isArray(rfData?.cnaes_secundarios) ? rfData.cnaes_secundarios : [];

          // Inferir Vertical de Mercado
          const vertical = CnpjEnrichmentService.inferirVertical(cnaePrincipal, cnaeDesc, razaoSocial);

          // Ajustar tipo_entidade se for claramente serviço contínuo
          let tipoEntidade = meta.tipoSugerido;
          if (vertical.vertical === 'Serviços Técnicos & Consultoria PJ' && tipoEntidade === 'FORNECEDOR') {
            tipoEntidade = 'COLABORADOR_PJ';
          }

          const rawDataToSave = {
            ...rfData,
            vertical
          };

          const isBloqueado = situacao === 'BAIXADA' || situacao === 'INAPTA' || situacao === 'SUSPENSA';

          const insertRes = await client.query(`
            INSERT INTO clientes (
              empresa_id, razao_social_nome, nome_fantasia, cnpj_cpf,
              cnae_principal, cnae_descricao, situacao_cadastral, motivo_situacao_cadastral,
              data_situacao_cadastral, cep, logradouro, numero, complemento, bairro, municipio, uf,
              capital_social, porte, natureza_juridica, opcao_pelo_simples, opcao_pelo_mei,
              qsa, cnaes_secundarios, dados_receita_brutos, tipo_entidade, bloqueio_fiscal,
              ultima_sincronizacao_rfb
            ) VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16,
              $17, $18, $19, $20, $21,
              $22, $23, $24, $25, $26,
              NOW()
            )
            ON CONFLICT (empresa_id, cnpj_cpf) DO UPDATE SET
              razao_social_nome = EXCLUDED.razao_social_nome,
              dados_receita_brutos = EXCLUDED.dados_receita_brutos,
              ultima_sincronizacao_rfb = NOW()
            RETURNING id;
          `, [
            meta.empresaId, razaoSocial, nomeFantasia, cnpj,
            cnaePrincipal, cnaeDesc, situacao, motivo,
            dataSituacao, cep, logradouro, numero, complemento, bairro, municipio, uf,
            capitalSocial, porte, naturezaJuridica, simples, mei,
            JSON.stringify(qsa), JSON.stringify(cnaesSecundarios), JSON.stringify(rawDataToSave),
            tipoEntidade, isBloqueado
          ]);

          const novoClienteId = insertRes.rows[0]?.id;
          novosCadastrados++;
          console.log(`[AUTO-CADASTRADO] ${razaoSocial} cadastrado com sucesso! Vertical: ${vertical.vertical}`);

          // Re-vincular no extrato bancário
          if (novoClienteId) {
            const updateTx = await client.query(`
              UPDATE transacoes_bancarias
              SET cliente_id = $1
              WHERE regexp_replace(documento_contraparte, '[^0-9]', '', 'g') = $2;
            `, [novoClienteId, cnpj]);
            vinculados += updateTx.rowCount || 0;
          }

          // Delay de segurança entre consultas (2s)
          await new Promise(r => setTimeout(r, 1500));

        } catch (itemErr: any) {
          console.warn(`[AUTO-ENRICH] Erro ao processar CNPJ ${cnpj}:`, itemErr.message);
        }
      }

      // Sincroniza espelho local em disco
      if (novosCadastrados > 0) {
        console.log('[CNPJ AUTO-DISCOVERY] Atualizando mirror local de alta disponibilidade...');
        await localMirror.syncAllTables();
      }

      console.log(`[CNPJ AUTO-DISCOVERY FINALIZADO] ${novosCadastrados} novos parceiros cadastrados | ${vinculados} transações re-vinculadas.`);
      return { novosCadastrados, vinculados };
    });
  }
}

export const cnpjAutoDiscovery = CnpjAutoDiscoveryService.getInstance();
