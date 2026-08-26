---
name: eco-mitang-architecture
description: >-
  Guia arquitetural mandatório do ERP Eco-Mitang para desenvolvimento, auditoria de código,
  regras de negócio multi-tenant, event-driven, automação cadastral e monitoramento contínuo em background.
---

# Eco-Mitang ERP: Guia de Arquitetura, Diretrizes & Padrões para IAs

Este documento é a referência técnica e conceitual mandatória para qualquer agente de Inteligência Artificial ou desenvolvedor atuando no repositório **eco-mitang**. Ele sintetiza as diretrizes arquiteturais, as regras de negócio da holding e os padrões que devem orientar qualquer nova funcionalidade ou refatoração.

---

## 1. Contexto de Negócio da Holding

A **Eco-Mitang Holding** opera no ecossistema industrial e marítimo offshore através de 4 pessoas jurídicas (CNPJs) integradas:

1. **Mitang Power (Baterias Industriais & Subsea)**: Manufatura de baterias seladas de alta capacidade (lítio/níquel) para operação em águas profundas (Pré-Sal).
2. **Mitang Rental (Locações Offshore)**: Locação de guinchos hidráulicos de grande porte, contêineres e equipamentos pesados de convés.
3. **Mitang Services (Serviços Subsea Especializados)**: Manutenção e operação técnica offshore, demandando alocação de técnicos com emissão de ART e homologação.
4. **Mitang Academy (Cursos & Treinamentos)**: Capacitação técnica com certificações marítimas homologadas pela Marinha do Brasil/DPC e órgãos reguladores.

---

## 2. Princípios Arquiteturais Inegociáveis

Qualquer alteração ou novo código DEVE respeitar rigorosamente os 7 pilares arquiteturais:

### 2.1 Multi-Tenant Estrito (Row-Level Security)
- Todas as tabelas transacionais e cadastrais possuem a coluna `empresa_id UUID NOT NULL`.
- O isolamento é forçado no PostgreSQL através de políticas de **Row-Level Security (RLS)**:
  ```sql
  CREATE POLICY tenant_isolation_policy ON <tabela>
      AS RESTRICTIVE
      USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::uuid);
  ```
- **Segurança contra Injeção SQL**: Nunca interpolação de strings em variáveis de sessão. Sempre utilizar:
  ```ts
  await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [empresaId]);
  ```
- Todas as rotas de API devem passar pelo `tenantMiddleware`, com validação regex estrita de formato UUID (RFC 4122).

### 2.2 Arquitetura Orientada a Eventos (Event-Driven)
- Transições de estado operacionais, comerciais, financeiras e cadastrais **NUNCA** devem ser silenciosas para o sistema.
- Todas as transições publicam eventos de domínio no `globalEventBus`:
  * `TICKET.QUALIFICADO`
  * `COTACAO.GANHA`
  * `FINANCEIRO.PARCELA_LIBERACAO_QUITADA`
  * `ORDEM_SERVICO.STATUS_ATUALIZADO`
  * `ORDEM_SERVICO.CONCLUIDA`
  * `QSMS.AUDITORIA_APROVADA` / `QSMS.AUDITORIA_REPROVADA`
  * `CLIENTE.CRIADO`
  * `CLIENTE.DADOS_ATUALIZADOS_AUTOMATICAMENTE`
  * `CLIENTE.SITUACAO_FISCAL_ALTERADA`
- Todos os tipos de payload de eventos devem ser centralizados em `src/core/events/events.types.ts`.

### 2.3 Padrão Snapshot Financeiro
- Preços, alíquotas e descrições do catálogo são dinâmicos, mas cotações comerciais e ordens de serviço congelam valores unitários na tabela `cotacoes_itens` (`valor_unitario_congelado`).
- Reajustes futuros no catálogo nunca alteram retroativamente propostas já enviadas, ganhas ou faturadas.

### 2.4 CQRS & Dashboards sem Locks
- Métricas executivas dos dashboards operacionais e financeiros são mantidas em tabelas de projeção (`analytics_vendas_mensal`, `analytics_operacao_qualidade`).
- Atualizações ocorrem de forma incremental atômica (UPSERT) orientadas pelos eventos recebidos no barramento.

### 2.5 Governança ABAC & Travas de Segurança Operacional
- **Trava de Desconto**: Descontos acima de 10% exigem alçada de Diretor Comercial (`aprovado_por`).
- **Trava de Apontamento de Horas**: Nenhuma OS pode ser concluída se houver apontamento de horas aberto (`data_fim IS NULL`).
- **Trava de QSMS & Criptografia**: Auditorias de conformidade geram hash SHA-256 imutável de assinatura digital do auditor técnico.
- **Segurança de Webhooks**: Endpoints de integração externa devem exigir assinatura/token de segurança (`x-webhook-secret`).

---

## 3. Filosofia Central: "Essa Linha de Pensamento Vale para Tudo!"

O usuário e arquiteto do projeto estabeleceu o seguinte paradigma para todo o ciclo de vida de dados:
1. **Automação no Cadastro**: O ser humano não deve digitar dados que possam ser obtidos de fontes oficiais ou calculados com exatidão.
2. **Monitoramento Silencioso em Background ("Por Trás dos Panos")**: O sistema deve checar continuamente se o mundo real mudou sem avisar.
3. **Auditoria com Data de Vigência (SCD Tipo 2 / CDC)**: Gravar o histórico fiel do que mudou, quem mudou, valor anterior, valor novo e a partir de qual dia a alteração é válida.
4. **Gatilhos Imediatos de Mitigação de Risco**: Se a alteração for crítica, disparar alarme e bloquear preventivamente transações de risco.

### Exemplo 1: Cadastro e Monitoramento de Clientes / Fornecedores
- **Entrada Mínima**: O operador informa apenas o CNPJ.
- **Auto-Enriquecimento**: O `CnpjEnrichmentGateway` valida o Módulo 11 dos dígitos verificadores, consulta bases oficiais (BrasilAPI / RFB) e preenche automaticamente Razão Social, CNAE, Endereço e QSA de sócios.
- **Bloqueio Fiscal Preventivo**: Se o CNPJ for `INAPTO` ou `BAIXADO` na Receita, recebe `bloqueio_fiscal = true` imediatamente.
- **Robô em Background (`ClienteSyncBackgroundService`)**:
  * Executa periodicamente.
  * Compara os dados do banco com a base oficial mais recente.
  * Se o cliente mudou de endereço ou foi declarado inapto sem avisar, atualiza o DB e grava na tabela `clientes_historico_alteracoes` com a **data de vigência**.
  * Emite evento `CLIENTE.DADOS_ATUALIZADOS_AUTOMATICAMENTE` e notifica os gestores.

### Exemplo 2: Fornecedores & Certidões CND (Aplicação da Filosofia)
- Monitorar a validade das certidões negativas de débito da Receita Federal, FGTS e Trabalhista.
- Ao vencer uma certidão, o robô em background rebaixa o status do fornecedor para "HOMOLOGACAO_PENDENTE" e bloqueia novas ordens de compra.

### Exemplo 3: Catálogo de Peças Subsea & Custo de Matéria-Prima
- Monitorar a cotação de insumos industriais (células de lítio, níquel, ligas metálicas marítimas).
- Manter histórico de reajustes e alertar o comercial se cotações antigas em rascunho ficarem com margem de contribuição negativa.

### Exemplo 4: QSMS & Calibração de Equipamentos Offshore
- Equipamentos de locação (guinchos, cabos de aço) possuem laudos de teste de carga com validade de 12 meses.
- O robô de monitoramento detecta a expiração dos laudos e ativa a trava `bloqueio_qsms = true`, impedindo que o equipamento seja alocado em novas OSs até a re-certificação.

---

## 4. Estrutura de Código e Diretórios

```
eco-mitang/
├── database/                    # Scripts DDL em PostgreSQL com RLS
│   ├── 01_schema_multi_tenant.sql
│   ├── 02_catalogo_universal.sql
│   ├── 03_tickets_triagem.sql
│   ├── 04_cotacoes.sql
│   ├── 05_ordens_servico.sql
│   ├── 06_execucao_operacional.sql
│   ├── 07_financeiro_receber.sql
│   ├── 08_qsms_auditoria.sql
│   ├── 09_analytics_cqrs.sql
│   └── 10_clientes_historico.sql    # Novo: Histórico CDC de Clientes
├── src/
│   ├── core/                        # Núcleo compartilhado
│   │   ├── database/                # Conexão Pool Supabase com set_config seguro
│   │   ├── events/                  # Barramento global e tipos de eventos
│   │   ├── middlewares/             # Tenant UUID e Webhook Auth
│   │   └── security/                # Políticas ABAC
│   ├── modules/                     # Módulos de Domínio
│   │   ├── catalogo/                # REST CRUD com validação polimórfica estrita
│   │   ├── clientes/                # Novo: Enriquecimento, histórico e robô background
│   │   ├── triagem/                 # Qualificação de leads
│   │   ├── cotacao/                 # Snapshot financeiro e alçadas
│   │   ├── operacional/             # Ordens de serviço e webhooks de destravamento
│   │   ├── execucao/                # Chão de fábrica e apontamentos de HH
│   │   ├── financeiro/              # Planos de faturamento e quitação de parcelas
│   │   ├── qsms/                    # Auditorias e RNCs com hash SHA-256
│   │   └── dashboards/              # Projeções em tempo real CQRS
│   ├── app.ts                       # Configuração Express
│   ├── server.ts                    # Bootstrap HTTP
│   └── index.ts                     # Runner da simulação completa ponta a ponta
└── scripts/
    ├── migrate.js                   # Executor de migrations DDL
    ├── seed_holding.js              # Seed dos 4 CNPJs e dados base
    ├── test_catalogo_api.js         # Testes de catálogo e foreign key
    ├── test_webhook_travas.js       # Testes de destravamento operacional
    └── test_adversarial_e_clientes.js # Suíte adversarial completa (8 provas)
```

---

## 5. Como Testar Qualquer Alteração no Repositório

Antes de commitar ou concluir qualquer tarefa, a IA **DEVE** rodar a suíte completa de validação:

```bash
# 1. Compilação TypeScript estrita
npm run build

# 2. Execução de todos os testes automatizados
npm run test:all

# 3. Verificação da simulação de negócio ponta a ponta
npm run demo
```
