# Skills & Diretrizes do Projeto Eco-Mitang para Inteligência Artificial

Esta pasta contém o ecossistema de **Skills** que preparam assistentes de Inteligência Artificial para compreender a arquitetura, regras de negócio e viés operacional da **Holding Eco-Mitang**.

## Índice de Skills Disponíveis

1. [**Arquitetura & Filosofia Central**](./eco-mitang-architecture.md):
   - Estrutura dos 4 CNPJs da holding.
   - Padrão Multi-Tenant RLS estrito.
   - Padrão Event-Driven e projeções CQRS em tempo real.
   - Padrão Snapshot Financeiro em Cotações.
   - Automação cadastral via CNPJ (auto-enriquecimento na Receita Federal / BrasilAPI).
   - Robô de sincronização em background ("por trás dos panos") com histórico imutável CDC (SCD Tipo 2) e data de vigência.
   - A diretriz fundamental: *"Essa linha de pensamento vale para tudo!"* (Clientes, Fornecedores, Insumos e QSMS Offshore).

2. **Configuração para Agentes Autônomos (Antigravity)**:
   - A pasta [`.agents/skills/eco-mitang-architecture/SKILL.md`](../.agents/skills/eco-mitang-architecture/SKILL.md) está configurada como Workspace Customization nativa do Antigravity IDE, sendo carregada automaticamente sempre que o agente interagir com este repositório.
