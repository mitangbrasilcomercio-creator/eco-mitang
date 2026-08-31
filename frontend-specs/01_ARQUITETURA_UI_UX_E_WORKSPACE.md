# 01 — Arquitetura de Interface, UI/UX & Workspace

> **Destinatário:** Claude Code Opus (Backend & Database Architecture)  
> **Autor:** Antigravity / Gemini (Frontend, UI & UX)  
> **Finalidade:** Definir os padrões de experiência do usuário, navegação, componentes de layout e filosofia visual para que a API e o banco de dados ofereçam os dados e estruturas adequados.

---

## 1. Filosofia de Design e UX para ERP de Missão Crítica

O Eco-Mitang atende operações industriais (baterias de lítio submarinas e hospitalares), prestação de serviços offshore sob normas rígidas (NR-37, Marinha, Petrobras) e gestão contábil de múltiplos CNPJs. Nesse cenário, uma falha na interface não é apenas um "bug estético" — pode causar embargo de navio, perda de vidas, passivo trabalhista ou autuação fiscal por erro de DRE.

A interface segue quatro princípios fundamentais:

### 1.1. O Princípio da Verdade Explícita (Zero Estimativa Silenciosa)
* **Regra de UX:** A interface recusa-se categoricamente a inventar números ou esconder lacunas.
* **Estados Visuais de Dados:**
  * 🟢 **Auditado / Fechado:** Dado conciliado com fonte externa (extrato bancário, contabilidade oficial, inventário físico fechado) e com período contábil travado.
  * 🟡 **Parcial / Transitório:** Dado operacional verificado, mas com pendência de fechamento (ex: *Lucro antes da depreciação do imobilizado* ou *CMV marcado como compras do período por falta de estoque inicial*). A interface renderiza obrigatoriamente um banner de contexto: `[COMPRAS DO PERÍODO — ESTOQUE INICIAL NÃO FECHADO]`.
  * 🔴 **Divergente / Requer Ação:** Inconsistência detectada entre fontes (ex: NF-e recebida com duplicata diferente da saída bancária, ou lançamento contábil sem partida balanceada).

### 1.2. Mandamento do Drill-Down Universal em até 3 Cliques
O usuário nunca deve precisar abrir uma planilha externa para saber de onde veio um valor. Todo totalizador analítico deve ser interativo:
* **Clique 1:** Ao clicar no valor consolidado na DRE (ex: R$ 450.000 em Custos Operacionais), abre-se a listagem filtrada dos lançamentos contábeis no Razão.
* **Clique 2:** Ao clicar em uma linha do razão, abre-se a visualização do documento de origem (a NF-e de entrada ou a transação bancária vinculada).
* **Clique 3:** Ao clicar em "Ver Arquivo Original", abre-se o XML integral decodificado ou a linha bruta do extrato OFX com seu respectivo hash SHA-256 de auditoria.

### 1.3. Ação Bloqueante vs. Alerta Frouxo (Fail-Safe por Design)
* **Lição dos Incidentes Reais:** Alertas em caixas de diálogo amarelas (*"Atenção: ASO do colaborador vence em 3 dias"*) são ignorados sob correria operacional.
* **Comportamento Padrão:** O botão principal da ação de risco (ex: *Confirmar Alocação de Embarque*, *Fechar Período Contábil*, *Emitir Ordem de Produção*) é **desabilitado por padrão** se houver impedimento impeditivo.
* **Fluxo de Exceção (Quebra de Vidro / Override):** Caso haja real necessidade operacional, o sistema não possui um botão simples de "Prosseguir mesmo assim". Ele exige a abertura de um modal formal de **Override com Justificativa Obrigatória**, que envia para a API o motivo, o ID do aprovador de plantão e registra o ato com nível de severidade máxima na tabela de auditoria.

### 1.4. Contexto Temporal e de Regime Conspícuo
* Toda tela possui um *toggle switch* no topo indicando se os relatórios estão sendo vistos sob:
  * 🟦 **Regime de Competência (Econômico):** Foco em entrega de produto/serviço, data de emissão de NF-e, receita gerada e margem econômica.
  * 🟩 **Regime de Caixa (Financeiro):** Foco em data efetiva de movimentação bancária, liquidez, contas pagas e saldo disponível.

---

## 2. Layout do Workspace e Componentes Globais

O frontend é concebido como uma aplicação SPA (Single Page Application) responsiva, com visual profissional escuro/claro, baseada em densidade de informação ajustável:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO] Eco-Mitang ▾ [CNPJ: Arandu Indústria ▾]  [Comp. | Caixa]  [🔒 Mês Aberto]  🔍 Cmd+K  🔔 [3] 👤 │
├──────────────┬─────────────────────────────────────────────────────────────────────────┬───────────────┤
│ NAVEGAÇÃO    │ CABEÇALHO DA TELA ATIVA                                                 │ GAVETA        │
│              │ [Título do Módulo]  [Visões Salvas ▾]  [Filtros +]  [Exportar ▾]        │ LATERAL DE    │
│ 📊 Dashboard  ├─────────────────────────────────────────────────────────────────────────┤ AUDITORIA     │
│ 💰 Controlad. │ ÁREA DE CONTEÚDO PRINCIPAL                                              │ (Desliza qdo  │
│ 🧾 Fiscal     │ (DataGrid de Alta Performance / Split-Screen / Matriz Gantt)            │ selecionado)  │
│ 👥 Pessoal &  │                                                                         │ • Quem criou  │
│    Aptidão   │ • Linhas de Dados com status visual imediato                            │ • Alterações  │
│ 🔋 Baterias & │ • Subtotais e agregações contextuais calculadas dinamicamente           │ • Antes/Depois│
│    Estoque   │ • Linha da Vida (Breadcrumb de encadeamento: Pedido → OS → NF → Título) │ • Solicitar   │
│ 🚢 Operações │                                                                         │   Acesso JIT  │
│ ⚙️ Parâmetros │                                                                         │ • Logs LGPD   │
└──────────────┴─────────────────────────────────────────────────────────────────────────┴───────────────┘
```

### 2.1. Topbar de Comando e Contexto
1. **Seletor de Tenant (Multi-CNPJ):**
   * Alterna entre: `Mitang Brasil Comércio`, `Arandu Indústria`, demais entidades (exibindo apenas o Nome Fantasia enquanto os CNPJs oficiais são confirmados), ou `Holding Consolidada` (com eliminação contábil de transações intercompany).
   * **Segurança e Isolamento RLS:** A troca de empresa **NÃO utiliza headers HTTP inseguros** (como `x-empresa-id`, que permitiria contorno no DevTools). Ao alternar o tenant, o frontend chama `POST /api/v1/auth/trocar-tenant { "empresa_id": uuid }`, recebe um novo token JWT assinado contendo o escopo validado pelo banco e atualiza a sessão local.
2. **Indicador de Status do Período Contábil:**
   * Ícone visível: 🟢 *Período Aberto* ou 🔒 *Período Fechado*.
   * Se fechado, a UI desabilita automaticamente formulários de edição, adição e estorno para aquele intervalo de datas.
3. **Barra de Busca Global (`Cmd + K` ou `Ctrl + K`):**
   * Caixa de diálogo de comando rápido com busca instantânea assíncrona por: Chave de Acesso de NF-e (44 dígitos), Código de Rastreio de Lote de Bateria, CPF/Nome de Colaborador, CNPJ de Fornecedor/Cliente, FITID de transação bancária ou Número de OS.

### 2.2. A Gaveta Lateral de Contexto e Auditoria (Audit Drawer)
Em vez de poluir as tabelas com dezenas de colunas de metadados (*criado_por, criado_em, atualizado_por, ip, versao*), ao clicar em qualquer registro na interface:
* Uma gaveta desliza da lateral direita sem retirar o usuário do contexto de trabalho.
* **Aba 1 — Detalhes:** Dados cadastrais ou financeiros completos.
* **Aba 2 — Trilha de Mutações:** Histórico cronológico vindo de `auditoria_eventos` (*"Diego alterou o valor da diária de R$ 350 para R$ 420 em 14/08 às 10:15 — Motivo: Acordo coletivo offshore"*).
* **Aba 3 — Acessos e Visualizações (LGPD):** Para dados protegidos (como remuneração e laudos médicos), exibe quem visualizou o dado e sob qual permissão.
* **Aba 4 — Solicitação de Acesso Just-in-Time (JIT):** Se o usuário não tem permissão para visualizar campos mascarados (ex: margem de lucro ou custo unitário), ele pode clicar em *"Solicitar Acesso Temporário"*, justificando a cotação/negociação atual.

---

## 3. Estados de Interface Mandatórios (O Contrato do Frontend)

Para eliminar o problema de telas vazias ou dados fictícios fixos no código (como era em `colaboradores.js`), todo componente do frontend implementa estritamente 5 estados de renderização:

1. **Estado de Carregamento (Skeleton Loading):** Simula a geometria dos dados sem blocos cinzas genéricos que causam layout shift.
2. **Estado Vazio Construtivo (Empty State Guiado):** Quando não há dados, a tela explica o motivo e a ação recomendada:
   * Exemplo: *"Nenhuma transação bancária encontrada para agosto/2026. Arraste o arquivo OFX do Itaú para iniciar a conciliação."*
3. **Estado de Incompletude Conhecida (Data Incomplete):** Quando faltam dependências de outros setores:
   * Exemplo: *"Existem 14 NF-e de insumos recebidas sem vínculo com Pedido de Compra. Vincule-as para alimentar o estoque automaticamente."*
4. **Estado de Erro com Diagnóstico:** Exibe mensagens claras e humanas sem vazar stack trace, mas informando o código da requisição para rastreabilidade:
   * Exemplo: *"Não foi possível fechar o período contábil: a soma de débitos difere dos créditos em R$ 120,00 no dia 15/08. [Ver Lançamentos Desbalanceados]"*.
5. **Estado de Sucesso com Rastreio:** Confirmação da operação com link imediato para o documento gerado e para a entrada na auditoria.
