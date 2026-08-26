# Eco-Mitang ERP - Sistema de Gestão Multi-Tenant & Orientado a Eventos

Arquitetura de ERP de alta performance projetada para a holding **Eco-Mitang** composta por 4 CNPJs operacionais:
1. **Manufatura de Baterias Subsea**
2. **Locação de Equipamentos Offshore**
3. **Serviços Especializados Offshore**
4. **Cursos e Treinamentos Marítimos**

---

## Diretrizes Arquiteturais Centrais

1. **Multi-Tenant Estrito**: Isolamento nativo em nível de banco de dados via **PostgreSQL Row-Level Security (RLS)** e chave `empresa_id` em todas as tabelas mestres.
2. **Arquitetura Orientada a Eventos (Event-Driven)**: Transições de estado publicam eventos de domínio assíncronos no `EventBus`, desacoplando módulos comerciais, operacionais, financeiros e de qualidade.
3. **Padrão Snapshot Financeiro**: Preços e condições contratuais são congelados no instante da criação de Cotações e Planos de Faturamento, blindando o histórico contra alterações dinâmicas nas tabelas do catálogo.
4. **CQRS & Agregação em Tempo Real**: Métricas dos Dashboards Executivos são incrementadas atomicamente (`UPSERT`) via projeções de eventos, eliminando lock e consultas pesadas de agregação (`COUNT/SUM`) no banco transacional OLTP.
5. **Governança ABAC & Gatekeepers**: Controle rigoroso de alçadas de desconto (> 10%), travas de apontamento por cronômetros abertos, validação matemática de somas de parcelas e imutabilidade criptográfica (SHA-256) em auditorias de QSMS.

---

## Estrutura do Repositório

```
├── database/                    # Scripts DDL SQL (PostgreSQL) com RLS e Triggers
│   ├── 01_schema_multi_tenant.sql
│   ├── 02_catalogo_universal.sql
│   ├── 03_tickets_triagem.sql
│   ├── 04_cotacoes.sql
│   ├── 05_ordens_servico.sql
│   ├── 06_execucao_operacional.sql
│   ├── 07_financeiro_receber.sql
│   ├── 08_qsms_auditoria.sql
│   ├── 09_analytics_cqrs.sql
│   └── 00_init_all.sql         # Script consolidado de bootstrap
└── src/
    ├── core/                   # Barramento de Eventos, Abstrações e Segurança
    │   ├── events/
    │   ├── database/
    │   └── security/
    ├── modules/                # 7 Módulos de Domínio
    │   ├── catalogo/
    │   ├── triagem/
    │   ├── cotacao/
    │   ├── operacional/
    │   ├── execucao/
    │   ├── financeiro/
    │   ├── qsms/
    │   └── dashboards/
    └── index.ts                # Runner da simulação ponta a ponta
```

---

## Como Executar a Demonstração

### Requisitos
- Node.js >= 18.x
- TypeScript / ts-node

### Execução
```bash
# Instalar dependências
npm install

# Executar a simulação completa do ciclo de vida
npm run demo
```
