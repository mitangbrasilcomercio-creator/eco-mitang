# Arquitetura e Fluxo de Trabalho do Sistema (Eco-Mitang ERP)

> **Documento Mestre para Desenvolvedores e Agentes de Inteligência Artificial (Antigravity, Cursor, Claude, OpenAI, Gemini)**  
> **Última Atualização:** 27 de Agosto de 2026  
> **Status:** Em Produção / Carga 100% Real Ativa  

---

## 1. Visão Geral da Holding Eco-Mitang

O ERP Eco-Mitang é uma plataforma empresarial multi-tenant desenvolvida para atender às demandas de engenharia, manufatura e operações submarinas da holding composta por 4 CNPJs:

1. **Mitang Brasil Comércio e Serviços LTDA** (CNPJ `44.221.348/0001-84`):
   - Especializada na engenharia e fornecimento de packs de baterias de alta densidade (Li-SOCL2, Alcalina, Ni-MH, Li-Ion) para equipamentos oceanográficos, robótica submarina (ROVs/AUVs) e área hospitalar.
2. **Arandu Comércio e Serviços LTDA** (CNPJ `61.349.982/0001-16`):
   - Braço comercial e técnico de baterias, soluções de energia e contratos corporativos offshore.
3. **Mitang Rental** (Locação e Metrologia DimCon):
   - Locação de transponders acústicos, medidores de corrente ADCP e sistemas de metrologia dimensional subsea.
4. **Mitang Academy** (Treinamentos Marítimos):
   - Capacitação técnica e cursos de operações offshore.

---

## 2. Diagramas de Fluxo de Trabalho (Workflows Mermaid)

### 2.1. Fluxograma Global do Ecossistema Integrado

O diagrama abaixo ilustra como os dados reais fluem entre os módulos do ERP:

```mermaid
flowchart TD
    subgraph INGESTAO[Entrada e Ingestão de Dados Reais]
        XML[172 XMLs de NF-e e NFS-e<br/>Vendas e Compras]
        OFX[24 Extratos OFX<br/>1.386 Lançamentos Itaú & Bradesco]
        CNPJ[Consultas de CNPJ<br/>Receita Federal / QSA]
        CAT[117 Modelos de Baterias<br/>Especificações BOM e Químicas]
        ORC[218 Cotações Comerciais<br/>R$ 2,15M Aprovados]
    end

    subgraph MOTOR[Motor de Processamento & Regras de Negócio]
        NfeParser[NfeIngestionService<br/>Extração Integral em JSONB]
        OfxParser[OfxIngestionService<br/>Hash SHA-256 Anti-Duplicação]
        Classifier[BusinessPartnerClassifier<br/>Clientes vs Fornecedores vs Colab PJ]
        CacheLayer[MemoryCache<br/>Latência Sub-Milissegundo]
    end

    subgraph BANCO[Persistência Relacional - Supabase / PostgreSQL]
        DB_NF[(notas_fiscais<br/>itens & duplicatas)]
        DB_OFX[(transacoes_bancarias<br/>contas_bancarias)]
        DB_CLI[(clientes<br/>tipo_entidade)]
        DB_CAT[(catalogo_universal)]
        DB_ORC[(orcamentos_historico)]
    end

    subgraph SAIDA[Módulos Estratégicos de Decisão & C-Level]
        DASH[Dashboard Executivo<br/>Evolução Mensal Cronológica]
        FC[Fluxo de Caixa<br/>Saldo Real + Projetado]
        DRE[DRE Contábil<br/>Receita, CMV, EBITDA]
        CTRL[Controladoria<br/>Simulador DuPont Vivo]
        CRM[CRM 360°<br/>Grandes Contas & Fornecedores]
        PROD[Catálogo de Baterias<br/>Filtro de Químicas]
    end

    XML --> NfeParser --> DB_NF
    OFX --> OfxParser --> DB_OFX
    CNPJ --> Classifier --> DB_CLI
    CAT --> DB_CAT
    ORC --> DB_ORC

    DB_NF & DB_OFX --> CacheLayer
    DB_CLI & DB_CAT & DB_ORC --> CacheLayer

    CacheLayer --> DASH
    CacheLayer --> FC
    CacheLayer --> DRE
    CacheLayer --> CTRL
    CacheLayer --> CRM
    CacheLayer --> PROD
```

---

### 2.2. Fluxo do Motor Fiscal Sem Perdas (NF-e & NFS-e)

Garante que nenhuma tag de imposto, item ou fatura seja descartada durante o processamento de notas:

```mermaid
flowchart LR
    XML_IN[XML Assinado SEFAZ] --> Parse[FastXMLParser / xml2js]
    Parse --> JsonTree[Árvore JSON Completa]
    
    JsonTree --> ColJSONB[(dados_completos_json<br/>JSONB Indexado com GIN)]
    JsonTree --> ColXML[(conteudo_xml<br/>TEXT Original)]
    
    JsonTree --> MapMaster[Mapeamento Mestre:<br/>Chave, Número, Série, Datas, Valores]
    MapMaster --> TabMaster[(notas_fiscais)]
    
    JsonTree --> MapItens[Mapeamento Detalhado:<br/>SKU, NCM, CFOP, Quantidade, Valor Unitário]
    MapItens --> TabItens[(notas_fiscais_itens)]
    
    JsonTree --> MapDup[Mapeamento Financeiro:<br/>Duplicatas, Parcelas, Vencimento]
    MapDup --> TabDup[(notas_fiscais_duplicatas)]
```

---

### 2.3. Fluxo de Conciliação Bancária OFX com Idempotência Absoluta

Previne que arquivos bancários importados repetidamente gerem lançamentos duplicados:

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador / Job Automático
    participant Service as OfxIngestionService
    participant Parser as Leitor OFX (Latin1/ISO-8859-1)
    participant DB as PostgreSQL (transacoes_bancarias)

    Operador->>Service: Envia arquivo OFX (Itaú ou Bradesco)
    Service->>Parser: Extrai tags STMTTRN (FITID, DTPOSTED, TRNAMT, MEMO)
    Parser-->>Service: Lista de transações normalizadas
    loop Para cada transação
        Service->>Service: Gera hash_conciliacao = SHA256(conta + FITID + data + valor)
        Service->>DB: INSERT INTO transacoes_bancarias (...) ON CONFLICT (hash_conciliacao) DO NOTHING
        DB-->>Service: Inserido (1) ou Duplicata Rejeitada (0)
    end
    Service->>DB: Atualiza saldo_atual em contas_bancarias
    Service-->>Operador: Resumo: X inseridas, Y duplicatas ignoradas
```

---

### 2.4. Classificação Rigorosa de Parceiros de Negócio

Separação obrigatória para evitar contabilidade distorcida:

```mermaid
stateDiagram-v2
    [*] --> IdentificarDocumento
    
    IdentificarDocumento --> NFeEmitida: NF-e emitida pela Mitang/Arandu
    IdentificarDocumento --> NFeRecebida: NF-e emitida por terceiro contra nós
    IdentificarDocumento --> NFSeRecebida: NFS-e tomada de terceiro
    
    NFeEmitida --> CLIENTE: Destinatário é Comprador
    NFeRecebida --> FORNECEDOR: Emitente vendeu Insumo/Produto
    NFSeRecebida --> COLABORADOR_PJ: Emitente prestou Serviço Técnico Contínuo
    
    CLIENTE --> ModuloCRM: Carteira Comercial & Limite de Crédito
    FORNECEDOR --> ModuloCompras: Custo das Mercadorias Vendidas (CMV)
    COLABORADOR_PJ --> ModuloRH_Fiscal: Despesas com Terceiros PJ
```

---

### 2.5. Arquitetura da DRE e Modelo de Análise DuPont

Demonstra a relação de causa e efeito entre vendas, compras de insumos e retorno ao acionista:

```mermaid
graph TD
    subgraph DRE[Demonstração do Resultado do Exercício]
        A[Vendas Emitidas: Baterias & Serviços] -->|Receita Bruta| B[Deduções e Impostos Fiscais]
        B -->|Receita Líquida| C[CMV: Insumos Strema/SBT]
        C -->|Lucro Bruto / Margem| D[Despesas Operacionais & Tarifas]
        D -->|EBITDA| E[Lucro Líquido do Exercício]
    end

    subgraph DUPONT[Simulador DuPont - Retorno sobre o PL]
        E --> ML[Margem Líquida %<br/>Lucro Líq / Receita]
        A --> GA[Giro do Ativo x<br/>Receita / Ativo Total]
        PL[Patrimônio Líquido] --> AF[Alavancagem Financeira x<br/>Ativo Total / PL]
        
        ML --> ROE[Retorno sobre o PL - ROE %]
        GA --> ROE
        AF --> ROE
    end
```

---

### 2.6. Camada de Cache em Memória com Fallback Instantâneo

Como a arquitetura alcança latência de **1.0ms a 4ms**:

```mermaid
flowchart TD
    Req[Requisição HTTP Client: /api/v1/...] --> CacheCheck{Chave existe no MemoryCache e não expirou?}
    CacheCheck -->|SIM - Cache Hit| InstantRes[Retorna dados da RAM em < 2ms]
    
    CacheCheck -->|NÃO - Cache Miss| DBQuery[Consulta direta no Supabase via IP da AWS]
    DBQuery --> DBSuccess{Banco respondeu em < 3s?}
    
    DBSuccess -->|SIM| SaveCache[Grava na RAM com TTL de 30s] --> ClientRes[Retorna resposta ao cliente]
    DBSuccess -->|NÃO / Erro de Rede| StaleCheck{Existe cache anterior mesmo expirado?}
    
    StaleCheck -->|SIM| ServeStale[Entrega Stale Cache de Contingência]
    StaleCheck -->|NÃO| SeedFallback[Entrega Seeds JSON locais]
```

---

## 3. Guia de Continuidade para Novas Ferramentas de IA e Desenvolvedores

Ao assumir o desenvolvimento deste repositório em qualquer IDE ou agente:

1. **Regras de Negócio Multi-Tenant**:
   - Sempre utilize o cabeçalho `x-empresa-id` nas chamadas de API.
   - Quando o valor for `all`, agregue as informações para consolidado da holding.
   - IDs Oficiais:
     * **Mitang Brasil**: `29ea0857-7cf7-44e1-ba36-a3f323c4670c`
     * **Arandu**: `0754c882-d528-4d34-8c96-6d9af7e8d322`
2. **Parceiros de Negócio**:
   - Ao criar novos endpoints de clientes, sempre filtre ou identifique `tipo_entidade` (`CLIENTE`, `FORNECEDOR`, `COLABORADOR_PJ`). Nunca misture na contagem de carteira.
3. **Catálogo de Baterias**:
   - Os modelos únicos de baterias somam 117 itens no catálogo base. Ao paginar, utilize limites de até 500 itens (`limit=500`).
4. **Performance**:
   - Utilize a classe `memoryCache` localizada em `src/core/cache/memory-cache.ts` para qualquer novo endpoint de leitura intensiva.
5. **Design System**:
   - Mantenha o padrão de **abas segmentadas** ("menos é mais") com a função global `window.switchTab(moduleName, tabId)`.
   - Evite acumular gráficos ou tabelas pesadas sem segmentação por abas na mesma viewport.
