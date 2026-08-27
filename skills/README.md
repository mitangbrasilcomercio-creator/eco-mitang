# Skills & Diretrizes do Projeto Eco-Mitang para Inteligência Artificial

Esta pasta contém o ecossistema de **Skills** que preparam assistentes de Inteligência Artificial para compreender a arquitetura, regras de negócio e viés operacional da **Holding Eco-Mitang**.

## Índice de Skills Disponíveis

1. [**Arquitetura & Filosofia Central**](./eco-mitang-architecture.md):
   - Estrutura dos 4 CNPJs da holding, Multi-Tenant RLS, Event-Driven e filosofia central.
2. [**Inteligência de Clientes via CNPJ ("Conhecimento é Poder")**](./cnpj-client-intelligence.md):
   - Extração governamental profunda, Capital Social, QSA, CNAEs e bloqueio fiscal preventivo.
3. [**Processador Universal de NF-e & NFS-e**](./nfe-nfse-xml-processor.md):
   - Ingestão sem perda de dados, conversão de qualquer XML em JSONB e normalização de itens e duplicatas.
4. [**Ecossistema Financeiro Unificado**](./unified-financial-ecosystem.md):
   - Ciclo integrado: CNPJ -> Faturamento/Compras XML -> Extratos OFX -> Conciliação Bancária.
5. [**Catálogo Especializado de Baterias Submarinas & Hospitalares**](./battery-product-catalog.md):
   - 117 produtos estruturados, químicas (Li-SOCL2, Alcalina, Li-Ion, Ni-MH), tensões, fabricantes OEM e normas de segurança.
6. [**Inteligência em Orçamentos e Cotações Comerciais**](./battery-quotation-intelligence.md):
   - Elaboração de propostas simples (1 página) e cotações avançadas técnicas (7 páginas), condições comerciais Mitang/Arandu, prazos escalonados e regras de aprovação.
7. [**Classificação de Parceiros de Negócio**](./business-partner-intelligence.md):
   - Categorização tripartite estrita: Clientes (compradores) vs Fornecedores (insumos/células) vs Colaboradores PJ (NFS-e de serviços contínuos).
8. [**Controladoria, DRE & Engenharia Financeira**](./financial-controladoria-dre.md):
   - Apuração estruturada de DRE, liquidez corrente, grau de endividamento e Modelo DuPont com simulação de ROE.

## Configuração para Agentes Autônomos (Antigravity & IDEs de IA)
As skills nativas residem na pasta [`.agents/skills/`](../.agents/skills/), sendo descobertas e carregadas automaticamente pelo Antigravity IDE e outros agentes baseados em Claude, Gemini e OpenAI.
