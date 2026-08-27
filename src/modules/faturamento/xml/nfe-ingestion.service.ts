import { pgPool } from '../../../core/database/supabase-pool';
import { UniversalXmlParser, ParsedNotaFiscal } from './nfe-parser';

export interface XmlIngestionResult {
  notaFiscalId: string;
  chaveAcesso: string;
  numeroNota: string;
  tipoDocumento: string;
  direcao: string;
  emitenteNome: string;
  destinatarioNome: string;
  valorTotal: number;
  totalItens: number;
  totalDuplicatas: number;
  clienteId?: string | null;
  duplicataIgnorada: boolean;
}

export class NfeIngestionService {
  /**
   * Ingestão universal de qualquer XML (NF-e ou NFS-e) com ACID e retenção total de dados.
   */
  async importarXml(
    empresaId: string,
    empresaCnpj: string,
    xmlContent: string
  ): Promise<XmlIngestionResult> {
    const parsed: ParsedNotaFiscal = UniversalXmlParser.parse(xmlContent, empresaCnpj);

    const client = await pgPool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [empresaId]);

      // 1. Checa Idempotência por Chave de Acesso
      const checkQuery = `
        SELECT id, numero_nota FROM notas_fiscais
        WHERE empresa_id = $1 AND chave_acesso = $2;
      `;
      const checkRes = await client.query(checkQuery, [empresaId, parsed.chaveAcesso]);
      if (checkRes.rows.length > 0) {
        await client.query('COMMIT');
        return {
          notaFiscalId: checkRes.rows[0].id,
          chaveAcesso: parsed.chaveAcesso,
          numeroNota: checkRes.rows[0].numero_nota,
          tipoDocumento: parsed.tipoDocumento,
          direcao: parsed.direcao,
          emitenteNome: parsed.emitenteNome,
          destinatarioNome: parsed.destinatarioNome || '',
          valorTotal: parsed.valorTotal,
          totalItens: parsed.itens.length,
          totalDuplicatas: parsed.duplicatas.length,
          duplicataIgnorada: true
        };
      }

      // 2. Busca Cliente ou Fornecedor pelo CNPJ/CPF da contraparte
      const contraparteCnpj = parsed.direcao === 'EMITIDA' 
        ? parsed.destinatarioCnpjCpf 
        : parsed.emitenteCnpjCpf;

      let clienteId: string | null = null;
      if (contraparteCnpj) {
        const cliQuery = `
          SELECT id FROM clientes
          WHERE empresa_id = $1 AND regexp_replace(cnpj_cpf, '[^0-9]', '', 'g') = $2
          LIMIT 1;
        `;
        const cliRes = await client.query(cliQuery, [empresaId, contraparteCnpj]);
        if (cliRes.rows.length > 0) {
          clienteId = cliRes.rows[0].id;
        }
      }

      // 3. Insere Nota Fiscal com XML Bruto e JSONB Integral (ZERO perda de dados)
      const insNfQuery = `
        INSERT INTO notas_fiscais (
          empresa_id, cliente_id, tipo_documento, direcao, modelo, chave_acesso,
          numero_nota, serie, natureza_operacao, data_emissao, data_competencia,
          emitente_cnpj_cpf, emitente_nome, emitente_uf, emitente_municipio,
          destinatario_cnpj_cpf, destinatario_nome, destinatario_uf, destinatario_municipio,
          valor_total, valor_produtos_servicos, valor_descontos, valor_frete,
          valor_seguro, valor_impostos_total, valor_liquido, conteudo_xml,
          dados_completos_json, status_processamento
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
        )
        RETURNING id;
      `;

      const insNfRes = await client.query(insNfQuery, [
        empresaId,
        clienteId,
        parsed.tipoDocumento,
        parsed.direcao,
        parsed.modelo,
        parsed.chaveAcesso,
        parsed.numeroNota,
        parsed.serie,
        parsed.naturezaOperacao || null,
        parsed.dataEmissao,
        parsed.dataCompetencia || null,
        parsed.emitenteCnpjCpf,
        parsed.emitenteNome,
        parsed.emitenteUf || null,
        parsed.emitenteMunicipio || null,
        parsed.destinatarioCnpjCpf || null,
        parsed.destinatarioNome || null,
        parsed.destinatarioUf || null,
        parsed.destinatarioMunicipio || null,
        parsed.valorTotal,
        parsed.valorProdutosServicos,
        parsed.valorDescontos,
        parsed.valorFrete,
        parsed.valorSeguro,
        parsed.valorImpostosTotal,
        parsed.valorLiquido,
        xmlContent,
        JSON.stringify(parsed.dadosCompletosJson),
        'IMPORTADO'
      ]);

      const notaFiscalId = insNfRes.rows[0].id;

      // 4. Insere Itens Detalhados
      for (const item of parsed.itens) {
        const insItemQuery = `
          INSERT INTO notas_fiscais_itens (
            nota_fiscal_id, numero_item, codigo_produto, descricao_produto,
            ncm, cfop, unidade_comercial, quantidade, valor_unitario,
            valor_total, valor_desconto, impostos_item
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
        `;
        await client.query(insItemQuery, [
          notaFiscalId,
          item.numeroItem,
          item.codigoProduto || null,
          item.descricaoProduto,
          item.ncm || null,
          item.cfop || null,
          item.unidadeComercial || null,
          item.quantidade,
          item.valorUnitario,
          item.valorTotal,
          item.valorDesconto || 0.00,
          JSON.stringify(item.impostosItem || {})
        ]);
      }

      // 5. Insere Duplicatas / Faturas
      for (const dup of parsed.duplicatas) {
        const insDupQuery = `
          INSERT INTO notas_fiscais_duplicatas (
            nota_fiscal_id, numero_duplicata, data_vencimento, valor_duplicata
          ) VALUES ($1, $2, $3, $4);
        `;
        await client.query(insDupQuery, [
          notaFiscalId,
          dup.numeroDuplicata || null,
          dup.dataVencimento,
          dup.valorDuplicata
        ]);
      }

      await client.query('COMMIT');

      return {
        notaFiscalId,
        chaveAcesso: parsed.chaveAcesso,
        numeroNota: parsed.numeroNota,
        tipoDocumento: parsed.tipoDocumento,
        direcao: parsed.direcao,
        emitenteNome: parsed.emitenteNome,
        destinatarioNome: parsed.destinatarioNome || '',
        valorTotal: parsed.valorTotal,
        totalItens: parsed.itens.length,
        totalDuplicatas: parsed.duplicatas.length,
        clienteId,
        duplicataIgnorada: false
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
