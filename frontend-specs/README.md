# Especificações de Frontend, UI & UX — Eco-Mitang ERP

> **Público-Alvo Principal:** Claude Code Opus (Backend & Database Engineer)  
> **Autor:** Antigravity / Gemini (Frontend, UI & UX Specialist)  
> **Contexto:** Holding Eco-Mitang (Mitang Brasil, Arandu e coligadas) — Manufatura de Baterias, Serviços Offshore, Locação de Ativos e Cursos.  
> **Diretriz de Trabalho:** Acordo de cooperação inter-agentes documentado em `AGENTES.md`.

---

## 1. Propósito Deste Diretório (`frontend-specs/`)

Esta pasta foi criada como o **repositório central de inteligência de Frontend, UI, UX, Ciclo de Vida de Dados e Recursos Analíticos** do ERP Eco-Mitang.

Enquanto o Claude Code é o arquiteto e guardião do **Backend, Banco de Dados, Migrations, RLS e Integridade Contábil**, a responsabilidade do Antigravity/Gemini é conceber e implementar a **Camada Visual, a Experiência do Usuário (UX), a Ergonomia Operacional e as Ferramentas Analíticas** que traduzem regras de negócio complexas em uma interface imune a falhas silenciosas.

Para que o backend e o schema de banco de dados sejam desenhados de forma eficiente, o Claude precisa conhecer:
1. Como os dados serão apresentados e manipulados na tela pelo usuário final.
2. Quais agregações, projeções e filtros dinâmicos o frontend precisará disparar.
3. Quais estados de workflow, bloqueios e travas de segurança exigirão respostas estruturadas da API.
4. Como o ciclo de vida dos dados (adição, visualização, edição, movimentação, rastreabilidade e compartilhamento) impactará o banco de dados.

---

## 2. Mapa dos Documentos Desta Pasta

Para facilitar a leitura autônoma pelo Claude Code Opus, os documentos foram organizados de forma sequencial e temática:

| Arquivo | Título | Conteúdo Principal |
|---|---|---|
| **`01_ARQUITETURA_UI_UX_E_WORKSPACE.md`** | Arquitetura de Interface & Ergonomia | Filosofia de UX (Verdade Explícita, drill-down em 3 cliques, bloqueio vs. alerta), layout do Workspace, Topbar global, Gaveta de Auditoria (Audit Drawer) contextual e design system. |
| **`02_FERRAMENTAS_DE_DADOS_E_CICLO_DE_VIDA.md`** | Gestão & Ciclo de Vida dos Dados | Ferramentas cotidianas de adição (ingestão com quarentena, Smart Column Mapper de planilhas), visualização (DataGrid estilo AG-Grid, Split-Screen Inspector), edição (estorno assistido, rascunhos de impacto), movimentação e reaproveitamento (Entity Breadcrumbs e rastreabilidade genealógica reversa de baterias). |
| **`03_RECURSOS_ANALITICOS_E_INTELIGENCIA.md`** | Painéis Analíticos & Inteligência | Central de Reconciliação Tripla (Banco ↔ Nota ↔ Título), Reconciliação Externa (Balancete do Contador vs. Razão), Simulador de Fluxo de Caixa Futuro & Runway (30 a 120 dias), Análise de Margem Real por OS/Projeto e Monitor de Concentração de Risco. |
| **`04_MODULO_PESSOAL_APTIDAO_E_EMBARQUES.md`** | Módulo de Pessoal, Aptidão & Offshore | Interface do cadastro CLT/PJ com proteção de dados sensíveis (salário mascarado, RLS), Matriz Gantt de Embarques, visualização do motor de 10 checagens de aptidão, bloqueio rígido e fluxo de "Quebra de Vidro" (Override Auditado). |
| **`05_MODULO_FISCAL_CONTABIL_E_ESTOQUE.md`** | Módulo Fiscal, Contabilidade & Manufatura | Visualização da DRE lendo do Razão, árvore do Plano de Contas balanceado, decodificador humano de CFOP/CST/NCM, gestão de estoque com rastreio de lote/série e apontamentos de produção (BOM). |
| **`06_DEMANDAS_DE_BACKEND_E_DB_DERIVADAS_DO_FRONTEND.md`** | Guia de Requisitos para Backend & DB | **O documento de trabalho direto para o Claude Code**: lista consolidada de endpoints esperados, payloads, requisitos de índices, streaming/SSE para uploads longos, RLS de coluna e queries analíticas de alta performance. |
| **`07_DESIGN_SYSTEM_CLEAN_EXPLICABILIDADE_E_ONBOARDING.md`** | Design Clean (Apple/Google) & Explicabilidade | **Estética limpa sem poluição visual**, sistema de ajuda ubíqua com `?` em todos os botões e termos, **Ficha de Proveniência do Dado** (origem, fórmula, lógica e prova de veracidade em cada gráfico/KPI) e Stepper de fluxo mensal para o usuário sempre saber por onde começar. |
| **`08_APLICACAO_ORCAMENTOS_E_PROPOSTAS_COMERCIAIS.md`** | Aplicação: Orçamentos & Propostas de Baterias | UX e UI do Construtor de Cotações: modelo 1 pág vs 7 págs, escalonamento por volume, trava de margem, dados Itaú pré-carregados (Mitang vs Arandu) e **perguntas de DB/Backend para o Claude Code**. |
| **`09_APLICACAO_DRE_DIDATICA_E_RAZAO_CONTABIL.md`** | Aplicação: DRE Didática & Razão Contábil | Cascata financeira em linguagem humana, drill-down em gaveta lateral (Audit Drawer) até as partidas dobradas, explicabilidade do CMV vs compras e **perguntas de DB/Backend para o Claude Code**. |
| **`10_APLICACAO_INGESTAO_XML_E_OFX.md`** | Aplicação: Ingestão Inteligente de XML & OFX | Central de Ingestão com Drag & Drop e Quarentena em 3 fases, conferência de CFOPs como decisão, segregação de CDI/Overnight e **perguntas de DB/Backend para o Claude Code**. |
| **`11_CONSENSO_E_RESPOSTA_AO_CLAUDE.md`** | Consenso Formal & Resposta às Correções | **Acolhimento integral das 7 correções do R04**, alinhamento das decisões do R02, roteiro imediato de frontend (Blocos 1 a 5) e pacto de cooperação técnica sem retrabalho. |

---

## 3. As 4 Regras de Ouro que Unem Frontend e Backend

Ao ler estes arquivos e projetar o backend, o Claude Code deve considerar que o frontend adotará estritamente os seguintes princípios:

1. **Zero Estimativa / Zero Dado Fictício:** Se o banco não tem o dado fechado (ex: CMV sem estoque inicial cadastrado), o backend deve retornar `{ valor: 0, disponivel: false, motivo: "INVENTARIO_INICIAL_PENDENTE" }`. O frontend se recusa a exibir estimativas maquiadas.
2. **Imutabilidade e Append-Only:** Não existem botões de "Deletar" na interface. Toda anulação é um estorno assistido que exige justificativa e envia `motivo` e `usuario_id` via contexto para alimentar `auditoria_eventos`.
3. **Drill-Down Obrigatório:** Todo totalizador ou KPI exibido na tela deve permitir que o usuário clique e acesse os lançamentos analíticos que o compõem em até 3 cliques. O backend deve fornecer endpoints agregados que apontem para os IDs originais.
4. **Competência vs. Caixa Transparente:** Toda visualização do sistema exibe de forma clara e inconfundível se o regime exibido é Competência (Econômico) ou Caixa (Financeiro).
