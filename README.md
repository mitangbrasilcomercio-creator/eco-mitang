# Eco-Mitang ERP - Sistema de Gestão Multi-Tenant, Event-Driven & Inteligência Real de Dados

Arquitetura de ERP de alta performance projetada para a holding **Eco-Mitang** composta por 4 CNPJs operacionais e suas marcas industriais:
1. **Manufatura de Baterias Subsea & Hospitalares (Mitang Brasil & Arandu)**
2. **Locação de Equipamentos Oceanográficos & Metrologia DimCon (Mitang Rental)**
3. **Serviços Especializados Offshore (Mitang Services)**
4. **Cursos e Treinamentos Marítimos (Mitang Academy)**

---

## Diretrizes Arquiteturais Centrais

1. **Multi-Tenant Estrito & Consolidado**: Isolamento nativo em nível de banco de dados via **PostgreSQL Row-Level Security (RLS)** e chave `empresa_id` em todas as tabelas mestres, suportando tanto visões isoladas por empresa quanto a visão consolidada da holding (`all`).
2. **Camada de Cache em Memória com Zero Latência (< 2ms)**: Implementação em Node.js (`src/core/cache/memory-cache.ts`) com padrão *stale-while-revalidate* que garante respostas instantâneas (< 2ms) e contingência total contra oscilações de rede ou do banco na nuvem.
3. **Ingestão Fiscal Sem Perdas (172 XMLs Reais)**: Ingestão de NF-e v4.00 e NFS-e gravando integralmente todas as tags em colunas `JSONB` e estruturando tabelas relacionais de itens, duplicatas e faturas.
4. **Conciliação Bancária OFX & Motor de Tesouraria Multi-Tenant (1.386 Lançamentos Reais)**:
   - **Pipeline em 4 Camadas**: Expurgo de saldos diários injetados (`SALDO TOTAL DISPONÍVEL DIA`, `SALDO APLIC. AUT.`), neutralização contábil de contas sweep/overnight CDI (`APL APLIC AUT MAIS`, `INVEST FACIL`) em Contas Sombra (Shadow Accounts), isolamento de receitas financeiras de juros (`REND PAGO APLIC AUT`, `RENTAB.INVEST`) e extração do faturamento/despesas operacionais reais de clientes e fornecedores.
   - **Teorema Delta de Conciliação Contínua**: O saldo informado pelo banco (`<LEDGERBAL><BALAMT>`) atua como prova real matemática contínua ($\Delta = \text{Saldo Interno} - \text{Saldo Extrato} = 0,00$), com detecção inteligente de hiatos temporais.
   - **Idempotência Criptográfica SHA-256**: Assinatura única por transação com cláusula de banco de dados `ON CONFLICT (idempotency_hash) DO NOTHING`, impedindo duplicações mesmo em uploads sobrepostos por múltiplos colaboradores.
   - **Roteamento Multi-Tenant Automático**: Mapeamento de contas de Itaú e Bradesco para seus respectivos CNPJs titulares (Mitang Brasil, Arandu, Mitang Submarina, Sea House).
5. **Classificação Rigorosa de Parceiros de Negócio & Dossiê 360°**:
   - **Clientes**: Empresas compradoras de baterias e serviços offshore (rastreamento de Capital Social, Quadro Societário QSA, CNAEs e Bloqueios Fiscais).
   - **Fornecedores**: Fabricantes e distribuidores de insumos, células de lítio e embalagens (Strema, SBT, Hayamax, Ryndack).
   - **Colaboradores PJ / Prestadores**: Emissores de NFS-e de serviços contínuos (engenharia de campo, consultoria, contabilidade, TI).
   - **Dossiê 360° Interativo**: Ao clicar em qualquer parceiro, abre modal executivo com ficha cadastral RFB, QSA, notas fiscais, orçamentos, ranking de baterias e extrato de pagamentos.
   - **Classificação Automática de Verticais / Nichos**: Inferência direta pelo CNAE (Offshore/Subsea, Hospitalar, Indústria/Insumos, Serviços Técnicos, Comércio).
6. **Camada de Alta Disponibilidade Local Mirror (Zero Downtime)**:
   - Resiliência total contra limites, pausas por inatividade e latências do Supabase Free Tier através de espelho persistente em disco (`database/local_mirror/`) com fallback em `< 2ms`.
7. **Padronização Nacional Estrita de Datas (Brasil)**:
   - Todas as datas e carimbos de tempo exibidos em `DD/MM/AAAA` e `DD/MM/AAAA HH:mm:ss`, eliminando formato americano da camada do usuário.
8. **DRE & Demonstração Contábil Dinâmica**:
   - Cálculo automático de Receita Bruta, Deduções Tributárias, Custo das Mercadorias Vendidas (CMV), Margem de Contribuição, Despesas Operacionais, EBITDA e Lucro Líquido.
9. **Controladoria & Simulador DuPont Interativo**:
   - Diagnóstico em tempo real de Liquidez Corrente (meta > 1.8x) e Grau de Endividamento (< 40%).
   - Simulador interativo do Modelo DuPont: $\text{ROE} = \text{Margem Líquida} \times \text{Giro do Ativo} \times \text{Alavancagem Financeira}$.
10. **Design System "Menos é Mais" (UI/UX Segmentada em Abas)**:
    - Interface limpa e ergonômica com glassmorphism suave (tema Deep Sea), sem poluição visual, separando visões de trabalho por abas contextuais rápidas.
11. **Centro de Inteligência Executiva & Runway de 15 Dias**:
    - **Granularidade Adaptativa do Gráfico**: Comutação inteligente entre visão mensal consolidada (para o ano todo ou períodos longos) e visão semanal detalhada (`Sem 1`, `Sem 2`, ..., `Sem 5`) ao selecionar um mês específico ou recorte de até 65 dias.
    - **Alerta e Auditoria Quinquenal de Runway**: Projeção matemática do saldo de caixa com decomposição em 4 abas (Contas Bancárias Reais, Faturas a Receber 15d, Títulos a Pagar 15d e Projeção Diária acumulada).
    - **Curva ABC de Inadimplência**: Top 3 maiores devedores com dias de atraso e abertura instantânea do Dossiê 360°.
12. **Tesouraria OFX & Dossiê Financeiro de Contrapartes**:
    - **Normalização Regex Universal de Bancos e Contas**: Separação estrita de Instituição Bancária (com badge) e Agência/Conta formatada para Itaú (`Ag. AAAA • CC CCCCC-D`) e Bradesco (`Ag. AAAA • CC 00CCCC-D`).
    - **Toolbar de Filtros e Busca Rápida**: Filtros instantâneos (`Todas`, `Entradas (+119)`, `Saídas (-101)`, `Custódia CDI (80)`, `Rendimentos`) e busca dinâmica por favorecido ou valor.
    - **Linha de Subtotais Dinâmicos no Rodapé (`tfoot`)**: Cálculo em tempo real dos lançamentos visíveis, soma de entradas, soma de saídas e saldo líquido do recorte filtrado.
    - **Dossiê 360° da Contraparte / Colaborador PJ**: Clique no Histórico/Memo abre o fluxo consolidado com a pessoa física ou jurídica (Total Pago, Total Recebido, Saldo Líquido e tabela de todas as transferências bancárias no ano).
13. **Inteligência de Ciclo de Vida de Orçamentos, POs, Notas Fiscais e Curva ABC Auditada**:
    - **Parser Determinístico Ancorado por 5-Tupla Monetária**: Extração com 100% de precisão de todos os 325 itens de propostas da planilha mestre da holding (Mitang Brasil e Arandu), eliminando o bug de deslocamento de colunas (*column shift*) em células vazias.
    - **Engenharia Multi-Item & Multi-NF por Cotação**: Tratamento estruturado de orçamentos com múltiplos itens de baterias onde cada linha pode possuir seu próprio Pedido de Compra (PO), prazo de pagamento, vencimento e nota fiscal própria (ex: entregas parciais ou emissão fracionada entre itens de produtos e serviços).
    - **Curva ABC Real de Inadimplência vs Títulos em Aberto (Sem Mocks)**:
      * **Isolamento de Atrasos Reais**: Identificação precisa de títulos vencidos e não quitados (ex: Viva Rio com 33 dias de atraso e Fugro com 27 dias de atraso), eliminando a distorção anterior que somava notas fiscais já pagas (como DOF Subsea e Sea Survey) como dívida pendente.
      * **Segregação de Títulos a Vencer Legítimos**: Faturamento a prazo com vencimento futuro (ex: WAMS, Fugro e UFPA/CNPq) classificados corretamente como `À Receber (Em Dia)`.
    - **Visualizador Executivo Multi-Item (Modal Interativo)**:
      * Cabeçalho executivo com status (`Compra Aprovada`, `À Vencer`, `Em Atraso`), empresa emissora (Mitang ou Arandu), cliente, CNPJ, contato e botão direto para o Dossiê 360°.
      * Tabela item a item com Pack/Modelo, SKU, Química, Quantidade, Preço Unitário, Desconto (%), Frete, PO vinculada, Tipo e Nº da Nota Fiscal, Vencimento, Método de Pagamento e Observações auditadas (ex: pagamento em atraso via PIX, retenção física de bateria para remanufatura, faturamento parcial 50/50 e boleto em CPF para pesquisadores de universidades federais/CNPq).
14. **Inteligência de Parceiros (CNPJ/CPF), Plano de Contas Real e Motor de Contas a Pagar / Projeção Futura (Runway 30 a 120 dias)**:
    - **Taxonomia Corporativa em 8 Categorias Reais**:
      * `CLIENTE`: Quem compra baterias e contrata serviços subsea (103 parceiros corporativos).
      * `COLABORADOR_PJ`: Equipe técnica interna contratada como PJ (Marcelo Ferreira, Jandson Pereira, Tom Alves, Allan Lourenço, Andrielly Britto e VR Benefícios). Recebem mensalmente e integram a folha operacional.
      * `SOCIO_DIRETORIA`: Diego Ribeiro e Paulo Cesar do Rego (rateio 50%/50% de despesas/receitas). Distinção de retiradas (Pró-Labore vs Dividendos) e entradas (Aporte de Mútuo para liquidez temporária, isento de tributos).
      * `FORNECEDOR_INSUMO`: Fornecedores industriais de matéria-prima (Strema Indústria, Hayamax Distribuidora, SBT Embalagens).
      * `PRESTADOR_CONTINUO`: Serviços administrativos contínuos (WPME Contabilidade, Certibrasil, C4 Treinamentos, Karina Faxineira, OMIE ERP, Hostgator).
      * `INFRAESTRUTURA_FIXA`: Locações das sedes operacionais (Salas 206/207 via Prima Imobiliária e Sala 216 via Cristiana Britto) e concessionárias de consumo (Light Energia, Vivo Fibra, Claro Móvel).
      * `GOVERNO_TRIBUTO`: Obrigações fiscais da Receita Federal (Simples Nacional DAS, DARF INSS e FGTS) com vencimento unificado no dia 20.
      * `INSTITUICAO_FINANCEIRA`: Amortização de capital de giro (PRONAMPE Banco Bradesco em 42 parcelas) e tarifas bancárias.
    - **Módulo de Contas a Pagar & Recorrências (204 Itens Reais)**:
      * 4 Cards executivos de síntese: Total Programado / A Pagar (R$ 99.962,04), Folha Colaboradores PJ & VR (R$ 89.547,79), Matéria-Prima & Insumos (R$ 122.469,49), PRONAMPE Capital de Giro (R$ 22.167,89).
      * Filtros instantâneos por Status (`TODAS`, `A_PAGAR`, `PAGO`, `EM_ATRASO`, `PROGRAMADO`) e por Tipo de Entidade, com busca dinâmica e totalizador dinâmico no rodapé (`tfoot`).
      * Coluna com taxa de rateio de sócios transparente (`50% DR / 50% PC` ou `100% Mitang`).
    - **Projeção Futura de Caixa & Análise de Runway (30 a 120 Dias)**:
      * Banner executivo com taxa de cobertura e aviso de superávit confortável.
      * Evolução mensal comparativa de Setembro a Dezembro de 2026 confrontando recebíveis confirmados (R$ 474.183,70) com custo fixo operacional mensal (R$ 46.753,04) e parcelamentos de insumos.
      * Painel duplo: Estrutura detalhada de custos fixos recorrentes da holding vs Faturas auditadas a receber da carteira de clientes (WAMS, Fugro, CLS, Martell, UFPA).

---

## Estrutura do Repositório

```
├── .agents/                               # Workspace Customization para IAs (Antigravity)
│   ├── rules/                             # Regras arquiteturais mandatórias
│   └── skills/                            # Skills de engenharia e regras de negócio
│       ├── battery-budget-lifecycle-intelligence/# Ciclo multi-item, POs, NFs e Curva ABC
│       ├── battery-product-catalog/       # Engenharia de 117 baterias e químicas
│       ├── battery-quotation-intelligence/# Propostas técnicas de 1 a 7 páginas
│       ├── business-partner-intelligence/ # Classificação de 8 tipos de parceiros reais
│       ├── cnpj-client-intelligence/      # Inteligência cadastral, QSA, verticais e Dossiê 360°
│       ├── database-resilience-mirror/    # Alta disponibilidade com mirror local (< 2ms)
│       ├── eco-mitang-architecture/       # Padrões multi-tenant e event-driven
│       ├── executive-dashboard-intelligence/# Métricas MoM, Runway 15d, Curva ABC e Custódia OFX
│       ├── financial-controladoria-dre/   # DRE, fluxo de caixa e modelo DuPont
│       ├── future-cashflow-and-obligations/# Contas a pagar, custos fixos e projeção de runway
│       ├── nfe-nfse-xml-processor/        # Processador sem perdas de NF-e e NFS-e
│       └── unified-financial-ecosystem/   # Ciclo integrado CNPJ + XML + OFX + Caixa
├── database/                              # Migrações SQL e Local Mirror Persistente
│   └── local_mirror/                      # Espelho em disco com fallback automático
├── public/                                # Frontend SPA Deep Sea Glassmorphism
│   ├── index.html                         # Layout mestre com seletor multi-tenant e sidebar
│   ├── renderRealModules.js               # Renderizadores modulares, Dossiê 360° e formatadores BR
│   ├── apiService.js                      # Conector client-side com cache e cabeçalhos de tenant
│   ├── script.js                          # Roteamento SPA e motor de navegação
│   └── style.css                          # Design system e tokens visuais
├── src/
│   ├── core/                              # Banco, Cache em Memória, Mirror e Segurança
│   │   ├── cache/memory-cache.ts          # Cache de alta performance (< 2ms)
│   │   ├── database/local-mirror.service.ts # Camada de alta disponibilidade e fallback local
│   │   ├── database/supabase-pool.ts      # Pool Supabase com bypass direto de DNS
│   │   └── events/                        # Barramento global de eventos de domínio
│   └── modules/                           # Módulos de Domínio
│       ├── catalogo/                      # Catálogo universal de baterias
│       ├── clientes/                      # CRM 360°, enriquecimento e Dossiê completo
│       ├── contabilidade/                 # DRE consolidada

│       ├── dashboard/                     # Métricas executivas e histórico de vendas
│       ├── faturamento/                   # Repositório de 172 notas fiscais XML
│       ├── financeiro/                    # Tesouraria, extratos OFX e resumo de caixa
│       └── orcamentos/                    # Gestão de propostas comerciais
```

---

## Como Executar

### 1. Requisitos
- Node.js >= 18.x
- PostgreSQL / Supabase configurado no `.env`

### 2. Compilar e Iniciar Servidor
```bash
# Compilar TypeScript
npm run build

# Iniciar o servidor HTTP
node dist/server.js
```
Acesse a aplicação em `http://localhost:3000`.
