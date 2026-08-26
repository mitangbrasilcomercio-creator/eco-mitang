# Eco-Mitang ERP - Sistema de Gestão Multi-Tenant & Orientado a Eventos

Arquitetura de ERP de alta performance projetada para a holding **Eco-Mitang** composta por 4 CNPJs operacionais:
1. **Manufatura de Baterias Subsea (Mitang Power)**
2. **Locação de Equipamentos Offshore (Mitang Rental)**
3. **Serviços Especializados Offshore (Mitang Services)**
4. **Cursos e Treinamentos Marítimos (Mitang Academy)**

---

## Diretrizes Arquiteturais Centrais

1. **Multi-Tenant Estrito**: Isolamento nativo em nível de banco de dados via **PostgreSQL Row-Level Security (RLS)** e chave `empresa_id` em todas as tabelas mestres, com queries parametrizadas (`SELECT set_config(...)`).
2. **Arquitetura Orientada a Eventos (Event-Driven)**: Transições de estado publicam eventos de domínio assíncronos no `globalEventBus`, desacoplando módulos comerciais, operacionais, financeiros, de qualidade e cadastrais.
3. **Padrão Snapshot Financeiro**: Preços e condições contratuais são congelados no instante da criação de Cotações e Planos de Faturamento, blindando o histórico contra alterações dinâmicas nas tabelas do catálogo.
4. **CQRS & Agregação em Tempo Real**: Métricas dos Dashboards Executivos são incrementadas atomicamente (`UPSERT`) via projeções de eventos, eliminando lock e consultas pesadas de agregação (`COUNT/SUM`) no banco transacional OLTP.
5. **Governança ABAC & Gatekeepers**: Controle rigoroso de alçadas de desconto (> 10%), travas de apontamento por cronômetros abertos, validação matemática de somas de parcelas, proteção de webhooks via token secreto e imutabilidade criptográfica (SHA-256) em auditorias de QSMS.
6. **Automação Cadastral & Monitoramento em Background ("Essa Linha de Pensamento Vale para Tudo!")**:
   - **Cadastro Inteligente via CNPJ**: Auto-enriquecimento instantâneo junto a bases oficiais (BrasilAPI / RFB), preenchendo Razão Social, CNAE, Endereço e QSA de sócios sem digitação manual.
   - **Gatilho de Bloqueio Fiscal Imediato**: Entidades identificadas como `INAPTA` ou `BAIXADA` na Receita Federal são criadas com `bloqueio_fiscal = true`, impedindo a emissão de propostas e notas fiscais fraudulentas.
   - **Robô Silencioso em Background**: Monitora clientes e parceiros periodicamente e detecta alterações cadastrais ocorridas sem aviso prévio.
   - **Histórico Auditável com Data de Vigência (SCD Tipo 2 / CDC)**: Gravação detalhada de cada campo alterado (`valor_anterior`, `valor_novo`, `origem_alteracao`) na tabela `clientes_historico_alteracoes` com registro da data a partir da qual a mudança passou a valer.

---

## Estrutura do Repositório

```
├── .agents/                     # Workspace Customization nativa para IAs (Antigravity)
│   ├── rules/                   # Regras mandatórias de desenvolvimento
│   └── skills/                  # Skills de arquitetura carregadas automaticamente
├── skills/                      # Documentação das Skills do projeto para IAs e Desenvolvedores
│   ├── README.md
│   └── eco-mitang-architecture.md
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
│   └── 10_clientes_historico.sql    # DDL: Enriquecimento cadastral e histórico CDC
├── src/
│   ├── core/                        # Barramento de Eventos, Banco e Segurança
│   │   ├── database/                # Pool Supabase parametrizado contra SQL Injection
│   │   ├── events/                  # Barramento global e tipagem de eventos de domínio
│   │   ├── middlewares/             # Tenant UUID e Autenticação de Webhook
│   │   └── security/                # Políticas ABAC
│   ├── modules/                     # Módulos de Domínio da Holding
│   │   ├── catalogo/                # REST CRUD com validação polimórfica estrita Zod
│   │   ├── clientes/                # Cadastro inteligente via CNPJ, histórico CDC e worker
│   │   ├── triagem/                 # Qualificação de leads
│   │   ├── cotacao/                 # Snapshot financeiro e alçadas comerciais
│   │   ├── operacional/             # Ordens de serviço e webhooks de destravamento
│   │   ├── execucao/                # Chão de fábrica e apontamentos de HH
│   │   ├── financeiro/              # Planos de faturamento e quitação de parcelas
│   │   ├── qsms/                    # Auditorias e RNCs com hash SHA-256
│   │   └── dashboards/              # Projeções em tempo real CQRS
│   ├── app.ts                       # App Express com rotas REST e Webhooks
│   ├── server.ts                    # Servidor HTTP
│   └── index.ts                     # Runner da simulação ponta a ponta
└── scripts/
    ├── migrate.js                   # Migrations DDL no Supabase
    ├── seed_holding.js              # Seed inicial das 4 empresas
    ├── test_catalogo_api.js         # Teste automatizado do Catálogo Universal
    ├── test_webhook_travas.js       # Teste automatizado de Webhooks e Travas de OS
    └── test_adversarial_e_clientes.js # Suíte adversarial completa (8 provas de estresse)
```

---

## Como Executar

### Requisitos
- Node.js >= 18.x
- TypeScript / ts-node
- PostgreSQL / Supabase conectado via variáveis de ambiente no `.env`

### Instalação e Compilação
```bash
# Instalar dependências
npm install

# Compilar TypeScript
npm run build
```

### Executar a Simulação Ponta a Ponta
```bash
# Executa a simulação completa do ciclo de vida dos 4 CNPJs
npm run demo
```

### Suíte de Testes Automatizados
```bash
# Executar TODOS os testes de forma consolidada
npm run test:all

# Ou executar individualmente:
npm run test:catalogo      # Teste dos endpoints do Catálogo e trava de integridade referencial
npm run test:travas        # Teste das travas operacionais, webhook financeiro e QSMS
npm run test:adversarial   # 8 provas de segurança, auto-enriquecimento de clientes e sync background
```
