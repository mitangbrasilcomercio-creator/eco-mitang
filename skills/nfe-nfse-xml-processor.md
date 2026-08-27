# NF-e & NFS-e Universal XML Processor: Guia Técnico

Processador universal de documentos fiscais eletrônicos (NF-e v4.00 e NFS-e Padrão Nacional/Municipal).
Garante ingestão sem perdas, conversão integral de tags em JSONB, e integração com Catálogo e Contas a Pagar/Receber.

## Destaques da Arquitetura
1. **Tripla Representação**:
   - Cabeçalho relacional indexado (chave de acesso, número, emitente, destinatário, valores).
   - `conteudo_xml` preservado na íntegra (XML original assinado).
   - `dados_completos_json` em JSONB (árvore de tags completa com índice GIN).
2. **Suporte Amplo**:
   - NF-e SEFAZ v4.00 (Produtos).
   - NFS-e Padrão Nacional SPED / Receita Federal e Padrão Municipal / ABRASF (Serviços).
3. **Idempotência**:
   - Re-importação do mesmo XML não duplica dados no banco.
