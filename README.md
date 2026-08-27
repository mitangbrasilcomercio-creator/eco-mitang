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

---

## Estrutura do Repositório

```
├── .agents/                               # Workspace Customization para IAs (Antigravity)
│   ├── rules/                             # Regras arquiteturais mandatórias
│   └── skills/                            # Skills de engenharia e regras de negócio
│       ├── battery-product-catalog/       # Engenharia de 117 baterias e químicas
│       ├── battery-quotation-intelligence/# Propostas técnicas de 1 a 7 páginas
│       ├── business-partner-intelligence/ # Classificação de Clientes vs Fornecedores vs Colaboradores PJ
│       ├── cnpj-client-intelligence/      # Inteligência cadastral, QSA, verticais e Dossiê 360°
│       ├── database-resilience-mirror/    # Alta disponibilidade com mirror local (< 2ms)
│       ├── eco-mitang-architecture/       # Padrões multi-tenant e event-driven
│       ├── executive-dashboard-intelligence/# Métricas MoM, Runway 15d, Curva ABC e Custódia OFX
│       ├── financial-controladoria-dre/   # DRE, fluxo de caixa e modelo DuPont
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
