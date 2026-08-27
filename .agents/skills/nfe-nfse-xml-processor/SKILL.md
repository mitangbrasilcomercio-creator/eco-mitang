---
name: nfe-nfse-xml-processor
description: >-
  Processador universal de documentos fiscais eletrônicos (NF-e v4.00 e NFS-e Padrão Nacional/Municipal).
  Garante ingestão sem perdas, conversão integral de tags em JSONB, e integração com Catálogo e Contas a Pagar/Receber.
---

# NF-e & NFS-e Universal XML Processor: Guia Técnico e Arquitetural

Este guia ensina o modelo de IA e desenvolvedores a manipular, analisar, ingerir e consultar notas fiscais eletrônicas de produtos (NF-e) e serviços (NFS-e) no ERP Eco-Mitang.

---

## 1. Arquitetura de Armazenamento Sem Perdas (Lossless)

A diretriz fundamental do ERP é: **Nenhum dado ou tag presente em um XML fiscal pode ser descartado**.
Para garantir isso, a tabela `notas_fiscais` adota a abordagem de tripla representação:

1. **Colunas Indexadas (Cabeçalho Relacional)**:
   - `chave_acesso`, `numero_nota`, `serie`, `data_emissao`, `emitente_cnpj_cpf`, `destinatario_cnpj_cpf`, `valor_total`, `valor_liquido`.
   - Permitem buscas instantâneas, filtros por cliente/fornecedor e conciliação bancária.
2. **`conteudo_xml` (TEXT)**:
   - Preserva o arquivo XML original na íntegra, incluindo a assinatura digital `<Signature>`, indispensável para fiscalização e auditoria jurídica.
3. **`dados_completos_json` (JSONB com Índice GIN)**:
   - Converte a árvore inteira de tags do XML em um documento JSONB navegável.
   - Permite consultas a qualquer tag exótica ou municipal via operadores PostgreSQL (`->`, `->>`, `@>`).

---

## 2. Tipos de Documentos Suportados

### 2.1 NF-e (Nota Fiscal Eletrônica de Produtos - SEFAZ v4.00)
- **Tag Raiz**: `<nfeProc>` ou `<NFe>`.
- **Estruturas Chave**:
  * `<ide>`: Tipo de operação (`tpNF`: 0=Entrada/Compra, 1=Saída/Venda), natureza da operação (`natOp`), data de emissão (`dhEmi`).
  * `<emit>` e `<dest>`: CNPJ/CPF, Razão Social, Inscrição Estadual e endereço completo.
  * `<det>`: Lista de itens com código (`cProd`), descrição (`xProd`), NCM, CFOP, quantidade (`qCom`), valor unitário (`vUnCom`), valor total (`vProd`) e tributos (`<imposto>` com ICMS, IPI, PIS, COFINS).
  * `<total>`: Totais de produtos, frete, seguro, descontos e total da nota (`vNF`).
  * `<cobr><dup>`: Faturas e duplicatas com número (`nDup`), data de vencimento (`dVenc`) e valor (`vDup`).
  * `<pag>`: Meio de pagamento utilizado (`tPag`: 01=Dinheiro, 15=Boleto, 17=PIX).

### 2.2 NFS-e (Nota Fiscal de Serviços Eletrônica)
- **Padrão Nacional (SPED / RFB)**:
  * Tag Raiz: `<NFSe versao="1.01">` contendo `<infNFSe>`.
  * `<nNFSe>`: Número sequencial da nota de serviço.
  * `<DPS>`: Declaração de Prestação de Serviços original.
  * `<prest>` e `<toma>`: Dados do prestador e do tomador do serviço.
  * `<serv>`: Código de tributação nacional (`cTribNac`), código NBS (`cNBS`) e descrição do serviço (`xDescServ`).
  * `<valores>`: Valor do serviço (`vServ`), valor líquido (`vLiq`), ISSQN e retenções federais (`PIS`, `COFINS`, `CSLL`, `IRRF`).
- **Padrão Municipal / ABRASF (Nota Carioca - Rio de Janeiro)**:
  * Tag Raiz: `<CompNfse>` ou `<Nfse>`.
  * `<IdentificacaoRps>`, `<Valores>`, `<Discriminacao>`.

---

## 3. Fluxo de Integração Automática (Workflow)

```
[Upload de Arquivo XML]
          │
          ▼
   UniversalXmlParser.parse()
          │
          ├──> Detecta se é NF-e ou NFS-e
          ├──> Determina Direção (EMITIDA pela holding ou RECEBIDA de fornecedor)
          ├──> Converte toda a árvore XML em JSONB
          │
          ▼
   NfeIngestionService.importarXml() (Transação ACID)
          │
          ├──> 1. Idempotência: Checa chave_acesso (rejeita duplicatas)
          ├──> 2. Auto-Associação: Busca cliente/fornecedor por CNPJ
          ├──> 3. Grava notas_fiscais (Cabeçalho + XML + JSONB)
          ├──> 4. Grava notas_fiscais_itens (Normalização de produtos/serviços)
          └──> 5. Grava notas_fiscais_duplicatas (Faturas a pagar ou a receber)
```

---

## 4. Consultando Tags no Banco via JSONB

Exemplo de busca de tributos ou detalhes específicos gravados no JSONB:

```sql
-- Buscar notas fiscais onde o PIS retido foi maior que zero
SELECT numero_nota, emitente_nome, valor_total,
       dados_completos_json->'nfeProc'->'NFe'->'infNFe'->'total'->'ICMSTot'->>'vPIS' as pis_valor
FROM notas_fiscais
WHERE dados_completos_json @> '{"nfeProc": {"NFe": {"infNFe": {"ide": {"mod": 55}}}}}';
```
