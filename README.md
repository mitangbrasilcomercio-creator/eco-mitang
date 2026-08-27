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
4. **Conciliação Bancária OFX com Idempotência (1.386 Lançamentos Reais)**: Leitor universal de extratos bancários (Itaú Unibanco e Banco Bradesco) com hash SHA-256 anti-duplicação e controle de saldos reais e projetados.
5. **Classificação Rigorosa de Parceiros de Negócio**:
   - **Clientes**: Empresas compradoras de baterias e serviços offshore (rastreamento de Capital Social, Quadro Societário QSA e Bloqueios Fiscais).
   - **Fornecedores**: Fabricantes e distribuidores de insumos, células de lítio e embalagens (Strema, SBT, Hayamax, Ryndack).
   - **Colaboradores PJ / Prestadores**: Emissores de NFS-e de serviços contínuos (engenharia de campo, consultoria, contabilidade, TI).
6. **DRE & Demonstração Contábil Dinâmica**:
   - Cálculo automático de Receita Bruta, Deduções Tributárias, Custo das Mercadorias Vendidas (CMV), Margem de Contribuição, Despesas Operacionais, EBITDA e Lucro Líquido.
7. **Controladoria & Simulador DuPont Interativo**:
   - Diagnóstico em tempo real de Liquidez Corrente (meta > 1.8x) e Grau de Endividamento (< 40%).
   - Simulador interativo do Modelo DuPont: $\text{ROE} = \text{Margem Líquida} \times \text{Giro do Ativo} \times \text{Alavancagem Financeira}$.
8. **Design System "Menos é Mais" (UI/UX Segmentada em Abas)**:
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
│       ├── cnpj-client-intelligence/      # Inteligência cadastral, QSA e capital social
│       ├── eco-mitang-architecture/       # Padrões multi-tenant e event-driven
│       ├── financial-controladoria-dre/   # DRE, fluxo de caixa e modelo DuPont
│       ├── nfe-nfse-xml-processor/        # Processador sem perdas de NF-e e NFS-e
│       └── unified-financial-ecosystem/   # Ciclo integrado CNPJ + XML + OFX + Caixa
├── database/                              # Migrações SQL (PostgreSQL / Supabase)
├── public/                                # Frontend SPA Deep Sea Glassmorphism
│   ├── index.html                         # Layout mestre com seletor multi-tenant e sidebar
│   ├── renderRealModules.js               # Renderizadores modulares com abas segmentadas
│   ├── apiService.js                      # Conector client-side com cache e cabeçalhos de tenant
│   ├── script.js                          # Roteamento SPA e motor de navegação
│   └── style.css                          # Design system e tokens visuais
├── src/
│   ├── core/                              # Banco, Cache em Memória, Barramento e Segurança
│   │   ├── cache/memory-cache.ts          # Cache de alta performance (< 2ms)
│   │   ├── database/supabase-pool.ts      # Pool Supabase com bypass direto de DNS
│   │   └── events/                        # Barramento global de eventos de domínio
│   └── modules/                           # Módulos de Domínio
│       ├── catalogo/                      # Catálogo universal de baterias
│       ├── clientes/                      # CRM 360° e inteligência cadastral
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
