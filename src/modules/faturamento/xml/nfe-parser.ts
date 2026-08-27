import { XMLParser } from 'fast-xml-parser';

export interface ParsedXmlItem {
  numeroItem: number;
  codigoProduto?: string;
  descricaoProduto: string;
  ncm?: string;
  cfop?: string;
  unidadeComercial?: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  valorDesconto?: number;
  impostosItem?: Record<string, any>;
}

export interface ParsedXmlDuplicata {
  numeroDuplicata?: string;
  dataVencimento: string; // YYYY-MM-DD
  valorDuplicata: number;
}

export interface ParsedNotaFiscal {
  tipoDocumento: 'NFE_PRODUTO' | 'NFSE_SERVICO';
  direcao: 'EMITIDA' | 'RECEBIDA';
  modelo: string;
  chaveAcesso: string;
  numeroNota: string;
  serie: string;
  naturezaOperacao?: string;
  dataEmissao: string;
  dataCompetencia?: string;

  emitenteCnpjCpf: string;
  emitenteNome: string;
  emitenteUf?: string;
  emitenteMunicipio?: string;

  destinatarioCnpjCpf?: string;
  destinatarioNome?: string;
  destinatarioUf?: string;
  destinatarioMunicipio?: string;

  valorTotal: number;
  valorProdutosServicos: number;
  valorDescontos: number;
  valorFrete: number;
  valorSeguro: number;
  valorImpostosTotal: number;
  valorLiquido: number;

  itens: ParsedXmlItem[];
  duplicatas: ParsedXmlDuplicata[];
  dadosCompletosJson: Record<string, any>;
}

export class UniversalXmlParser {
  private static parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: true,
    trimValues: true
  });

  /**
   * Converte qualquer XML de NF-e ou NFS-e em representação canônica do ERP.
   */
  static parse(xmlContent: string, empresaCnpj: string): ParsedNotaFiscal {
    const rawJson = this.parser.parse(xmlContent);

    // 1. Detecta NF-e (Produto SEFAZ v4.00)
    if (rawJson.nfeProc || rawJson.NFe || rawJson['?xml'] && (xmlContent.includes('<infNFe') || xmlContent.includes('<NFe'))) {
      return this.parseNFeProduto(rawJson, xmlContent, empresaCnpj);
    }

    // 2. Detecta NFS-e (Serviço Padrão Nacional SPED ou Municipal)
    if (rawJson.NFSe || rawJson.CompNfse || xmlContent.includes('<infNFSe') || xmlContent.includes('<NFSe')) {
      return this.parseNFSeServico(rawJson, xmlContent, empresaCnpj);
    }

    throw new Error('Formato XML não reconhecido como NF-e ou NFS-e válida.');
  }

  private static parseNFeProduto(rawJson: any, xmlContent: string, empresaCnpj: string): ParsedNotaFiscal {
    const nfe = rawJson.nfeProc?.NFe?.infNFe || rawJson.NFe?.infNFe || rawJson.infNFe;
    if (!nfe) {
      throw new Error('Estrutura infNFe não encontrada no XML da NF-e.');
    }

    const ide = nfe.ide || {};
    const emit = nfe.emit || {};
    const dest = nfe.dest || {};
    const total = nfe.total?.ICMSTot || {};
    const cobr = nfe.cobr || {};

    const chaveMatch = xmlContent.match(/Id="NFe(\d{44})"/);
    const chaveAcesso = chaveMatch ? chaveMatch[1] : (ide.cNF ? `${ide.cUF}${ide.cNF}` : `NFE-${ide.nNF}`);

    const emitenteCnpjCpf = String(emit.CNPJ || emit.CPF || '').replace(/\D/g, '');
    const emitenteNome = emit.xNome || 'Emitente Desconhecido';
    const emitenteUf = emit.enderEmit?.UF;
    const emitenteMunicipio = emit.enderEmit?.xMun;

    const destinatarioCnpjCpf = String(dest.CNPJ || dest.CPF || '').replace(/\D/g, '');
    const destinatarioNome = dest.xNome || 'Destinatário Desconhecido';
    const destinatarioUf = dest.enderDest?.UF;
    const destinatarioMunicipio = dest.enderDest?.xMun;

    const cleanEmpresaCnpj = empresaCnpj.replace(/\D/g, '');
    const direcao: 'EMITIDA' | 'RECEBIDA' = emitenteCnpjCpf === cleanEmpresaCnpj ? 'EMITIDA' : 'RECEBIDA';

    // Itens
    const rawDets = Array.isArray(nfe.det) ? nfe.det : (nfe.det ? [nfe.det] : []);
    const itens: ParsedXmlItem[] = rawDets.map((d: any, index: number) => {
      const prod = d.prod || {};
      const imposto = d.imposto || {};
      return {
        numeroItem: Number(d['@_nItem'] || index + 1),
        codigoProduto: String(prod.cProd || ''),
        descricaoProduto: String(prod.xProd || ''),
        ncm: String(prod.NCM || ''),
        cfop: String(prod.CFOP || ''),
        unidadeComercial: String(prod.uCom || ''),
        quantidade: Number(prod.qCom || 0),
        valorUnitario: Number(prod.vUnCom || 0),
        valorTotal: Number(prod.vProd || 0),
        valorDesconto: Number(prod.vDesc || 0),
        impostosItem: imposto
      };
    });

    // Duplicatas
    const rawDups = cobr.dup ? (Array.isArray(cobr.dup) ? cobr.dup : [cobr.dup]) : [];
    const duplicatas: ParsedXmlDuplicata[] = rawDups.map((dup: any) => ({
      numeroDuplicata: String(dup.nDup || ''),
      dataVencimento: String(dup.dVenc || ''),
      valorDuplicata: Number(dup.vDup || 0)
    }));

    const valorTotal = Number(total.vNF || 0);
    const valorProdutosServicos = Number(total.vProd || 0);
    const valorDescontos = Number(total.vDesc || 0);
    const valorFrete = Number(total.vFrete || 0);
    const valorSeguro = Number(total.vSeg || 0);
    const valorImpostosTotal = Number(total.vICMS || 0) + Number(total.vIPI || 0) + Number(total.vPIS || 0) + Number(total.vCOFINS || 0);

    return {
      tipoDocumento: 'NFE_PRODUTO',
      direcao,
      modelo: String(ide.mod || '55'),
      chaveAcesso,
      numeroNota: String(ide.nNF || ''),
      serie: String(ide.serie || '1'),
      naturezaOperacao: ide.natOp,
      dataEmissao: ide.dhEmi || ide.dEmi || new Date().toISOString(),
      emitenteCnpjCpf,
      emitenteNome,
      emitenteUf,
      emitenteMunicipio,
      destinatarioCnpjCpf,
      destinatarioNome,
      destinatarioUf,
      destinatarioMunicipio,
      valorTotal,
      valorProdutosServicos,
      valorDescontos,
      valorFrete,
      valorSeguro,
      valorImpostosTotal,
      valorLiquido: valorTotal,
      itens,
      duplicatas,
      dadosCompletosJson: rawJson
    };
  }

  private static parseNFSeServico(rawJson: any, xmlContent: string, empresaCnpj: string): ParsedNotaFiscal {
    // Suporta NFS-e Padrão Nacional (SPED) e Municipal
    const nfse = rawJson.NFSe?.infNFSe || rawJson.CompNfse?.Nfse?.InfNfse || rawJson.InfNfse;
    if (!nfse) {
      throw new Error('Estrutura infNFSe não encontrada no XML da NFS-e.');
    }

    const chaveMatch = xmlContent.match(/Id="(NFS[A-Za-z0-9]+)"/);
    const chaveAcesso = chaveMatch ? chaveMatch[1] : (nfse.nNFSe ? `NFSE-${nfse.nNFSe}` : `NFSE-${Date.now()}`);

    const emit = nfse.emit || nfse.PrestadorServico || nfse.DPS?.infDPS?.prest || {};
    const toma = nfse.DPS?.infDPS?.toma || nfse.TomadorServico || nfse.toma || {};
    const serv = nfse.DPS?.infDPS?.serv || nfse.Servico || nfse.serv || {};
    const valores = nfse.valores || nfse.DPS?.infDPS?.valores || nfse.Servico?.Valores || {};

    const emitenteCnpjCpf = String(emit.CNPJ || emit.IdentificacaoPrestador?.CpfCnpj?.Cnpj || '').replace(/\D/g, '');
    const emitenteNome = emit.xNome || emit.RazaoSocial || 'Emitente Prestador';
    const emitenteUf = emit.enderNac?.UF || emit.Endereco?.Uf;
    const emitenteMunicipio = emit.xLocEmi || emit.Endereco?.Municipio;

    const destinatarioCnpjCpf = String(toma.CNPJ || toma.IdentificacaoTomador?.CpfCnpj?.Cnpj || toma.CPF || '').replace(/\D/g, '');
    const destinatarioNome = toma.xNome || toma.RazaoSocial || 'Tomador Desconhecido';
    const destinatarioUf = toma.end?.endNac?.UF || toma.Endereco?.Uf;
    const destinatarioMunicipio = toma.end?.endNac?.xMun || toma.Endereco?.Municipio;

    const cleanEmpresaCnpj = empresaCnpj.replace(/\D/g, '');
    const direcao: 'EMITIDA' | 'RECEBIDA' = emitenteCnpjCpf === cleanEmpresaCnpj ? 'EMITIDA' : 'RECEBIDA';

    const valorTotal = Number(valores.vLiq || valores.vServPrest?.vServ || valores.ValorServicos || 0);
    const valorProdutosServicos = Number(valores.vServPrest?.vServ || valores.ValorServicos || valorTotal);
    const valorLiquido = Number(valores.vLiq || valores.ValorLiquidoNfse || valorTotal);
    const valorImpostosTotal = Number(valores.trib?.totTrib?.vTotTrib?.vTotTribFed || valores.ValorIss || 0);

    const descServ = serv.cServ?.xDescServ || serv.Discriminacao || 'Prestação de Serviços Especializados';

    const itens: ParsedXmlItem[] = [{
      numeroItem: 1,
      descricaoProduto: descServ,
      quantidade: 1,
      valorUnitario: valorProdutosServicos,
      valorTotal: valorProdutosServicos,
      impostosItem: valores.trib || {}
    }];

    return {
      tipoDocumento: 'NFSE_SERVICO',
      direcao,
      modelo: 'NFS-e Nacional',
      chaveAcesso,
      numeroNota: String(nfse.nNFSe || nfse.Numero || ''),
      serie: String(nfse.DPS?.infDPS?.serie || '900'),
      naturezaOperacao: nfse.xTribNac || 'Serviços Especializados',
      dataEmissao: nfse.dhProc || nfse.DataEmissao || new Date().toISOString(),
      dataCompetencia: nfse.DPS?.infDPS?.dCompet,
      emitenteCnpjCpf,
      emitenteNome,
      emitenteUf,
      emitenteMunicipio,
      destinatarioCnpjCpf,
      destinatarioNome,
      destinatarioUf,
      destinatarioMunicipio,
      valorTotal,
      valorProdutosServicos,
      valorDescontos: 0,
      valorFrete: 0,
      valorSeguro: 0,
      valorImpostosTotal,
      valorLiquido,
      itens,
      duplicatas: [],
      dadosCompletosJson: rawJson
    };
  }
}
