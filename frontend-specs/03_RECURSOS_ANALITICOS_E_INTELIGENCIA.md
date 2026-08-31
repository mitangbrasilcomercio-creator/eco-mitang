# 03 — Recursos Analíticos, Reconciliação & Inteligência

> **Destinatário:** Claude Code Opus (Backend & Database Architecture)  
> **Autor:** Antigravity / Gemini (Frontend, UI & UX)  
> **Finalidade:** Apresentar a especificação completa das ferramentas analíticas e painéis de inteligência operacional e financeira que serão disponibilizados aos usuários.

---

## 1. Central de Reconciliação Tripla Interativa (O Fim das Duplicidades)

### 1.1. Diagnóstico do Problema no Backend Atual
Conforme apontado no diagnóstico técnico, o sistema sofre hoje de duas distorções graves decorrentes da falta de conexão entre transações bancárias e notas fiscais:
1. **Fornecedores Descartados:** Pagamentos operacionais a fornecedores são ignorados na DRE para evitar duplicidade com as NF-e de entrada, ou acabam duplicando despesas.
2. **Dupla Contagem de Tributos:** O imposto destacado na NF-e de saída é deduzido da receita bruta (competência), e a guia paga no banco (DARF/GPS) é subtraída novamente no caixa como despesa de tributos no mês seguinte.

### 1.2. A Interface de Reconciliação Tripla (Tela Dividida em 3 Colunas)
Para resolver isso com intervenção humana assistida, a tela de reconciliação apresenta:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PAINEL DE RECONCILIAÇÃO TRIPLA — AGOSTO/2026                                                         │
├──────────────────────────────┬──────────────────────────────┬────────────────────────────────────────┤
│ COLUNA 1: EXTRATO BANCÁRIO   │ COLUNA 2: MOTOR DE MATCH     │ COLUNA 3: NOTAS FISCAIS & TÍTULOS      │
│ (Transações OFX não baixadas)│ (Sugestões Automatizadas)    │ (Contas a Pagar / Receber em Aberto)   │
├──────────────────────────────┼──────────────────────────────┼────────────────────────────────────────┤
│ 14/08/2026 — Saída: R$ 42.500│ ⚡ Correspondência: 99%      │ NF-e 8841 — Fornecedor CATL Células    │
│ Memo: TED PAG 09841 CATL BR  │ • Valor idêntico (R$ 42.500) │ Duplicata 01/01 com vencimento 15/08   │
│ FITID: 20260814-12948-ITAU   │ • CNPJ da contraparte bate   │ Título a Pagar #1092                   │
│ [Selecionar]                 │ • Data com desvio de 1 dia   │ [Selecionar]                           │
│                              │ ──▶ [Confirmar Conciliação]  │                                        │
├──────────────────────────────┼──────────────────────────────┼────────────────────────────────────────┤
│ 20/08/2026 — Saída: R$ 8.920 │ ⚡ Correspondência: 95%      │ Guia DARF PIS/COFINS Apuração 07/2026  │
│ Memo: DÉBITO GUIA DARF PIS   │ • Reconhecido como tributo   │ Valor provisionado: R$ 8.920           │
│ [Selecionar]                 │ • Baixa obrigação da nota    │ [Confirmar Baixa de Provisão]          │
└──────────────────────────────┴──────────────────────────────┴────────────────────────────────────────┘
```

### 1.3. Efeito da Ação na Interface e Requisito para o Backend
* Ao clicar em **[Confirmar Conciliação]**, o frontend envia uma requisição `POST /api/v1/conciliacoes` com os IDs da transação e do título/documento.
* **Comportamento Contábil:**
  * A transação bancária **NÃO gera uma despesa nova** na DRE.
  * O sistema executa a **baixa da conta de Duplicatas a Pagar** (contrapartida no Caixa/Bancos).
  * O DARF pago **baixa a provisão de impostos a recolher** provisionada na emissão da NF-e, eliminando a dupla dedução.
* **Painel de Exceções & Divergências:** Transações bancárias sem correspondência em até 30 dias ganham destaque com botão: `[Classificar como Despesa Direta sem NF-e]` ou `[Vincular a Adiantamento de Fornecedor]`.

---

## 2. Reconciliação Externa (ERP Eco-Mitang vs. Apuração do Contador)

### 2.1. O Princípio da Desconfiança Saudável
Um ERP não deve se declarar "perfeito" por autorreferência. A maior prova de exatidão contábil é comparar os números gerados internamente com a apuração fiscal e o balancete emitido mensalmente pelo escritório contábil terceirizado.

### 2.2. Interface do Comparador de Balancetes
1. **Área de Carga do Balancete Externo:** O usuário sobe a planilha ou arquivo digital de fechamento enviado pelo contador.
2. **Grade Comparativa Lado a Lado:**
   * Coluna A: Conta Contábil (ex: *Receita Bruta de Locação*, *ICMS a Recolher*, *Folha de Pagamento*).
   * Coluna B: Valor Calculado pelo ERP Eco-Mitang.
   * Coluna C: Valor Apurado pelo Escritório de Contabilidade.
   * Coluna D: Diferença (Delta em R$ e em %).
3. **Destaque Visual de Divergências:**
   * 🟢 Delta = R$ 0,00 (Conferido e validado).
   * 🔴 Delta ≠ R$ 0,00 (Linha destacada em vermelho com link para detalhamento).
4. **Relatório de Fechamento de Mês com Checklist:**
   * A interface só permite acionar a trava de **Fechamento de Período** se todas as divergências tiverem sido justificadas formalmente pelo gestor financeiro em campo auditado.

---

## 3. Simulador de Fluxo de Caixa Futuro & Runway (30 a 120 Dias)

### 3.1. Visão Temporal Dinâmica
Diferente da DRE (que mede o resultado econômico por competência), os gestores da holding precisam enxergar a curva de liquidez para honrar compras de insumos internacionais, folha PJ e investimentos em ativos imobilizados.

### 3.2. Componentes de Interface do Painel de Caixa Futuro
1. **Gráfico de Curva de Caixa Diária:**
   * Linha contínua azul: Saldo disponível consolidado nas contas Itaú e Bradesco.
   * Linha pontilhada: Projeção de saldo para os próximos 30, 60, 90 e 120 dias.
   * Faixa de Alerta Vermelha: Nível de Saldo Mínimo de Segurança (Reserva Operacional).
2. **Fontes de Dados Integradas na Projeção:**
   * **Entradas Previstas:** Duplicatas a receber das NF-e emitidas (ponderadas pela taxa histórica de atraso do cliente).
   * **Saídas Confirmadas:** Duplicatas de compras de insumos, ordens de compra autorizadas e guias de tributos provisionadas.
   * **Compromissos Recorrentes Contratuais:** Diárias médias de colaboradores PJ offshore, parcelas de financiamentos (PRONAMPE), aluguéis de galpões e softwares.
3. **Simulador Interativo de Cenários ("What-If"):**
   * Controles deslizantes (sliders) na tela:
     * *"E se o cliente Petrobras atrasar o pagamento da OS #88 em 20 dias?"* ➔ A curva de projeção recalcula instantaneamente na interface sem alterar o banco de dados.
     * *"E se anteciparmos a compra de 1.000 células de lítio com pagamento à vista para obter 12% de desconto?"* ➔ O gráfico mostra exatamente em qual dia o caixa atingiria o piso de segurança.
   * Cálculo de **Runway em Meses**: Indicador em destaque no topo: `[Runway Atual: 4,8 meses de operação sem novas vendas]`.

---

## 4. Análise de Margem Real por Ordem de Serviço (OS) e Projeto

### 4.1. Fechando o Elo entre Comercial, Operações e Finanças
Hoje, as cotações comerciais são feitas em `orcamento_master.html`, as operações ocorrem nas migrations de OS, e as notas são emitidas no faturamento — sem que haja uma visão consolidada de rentabilidade real.

### 4.2. Painel da OS: Rentabilidade Orçada vs. Rentabilidade Executada
Ao abrir uma Ordem de Serviço ou Projeto de Locação, a interface exibe o comparativo analítico:

| Elemento de Custo / Receita | Previsto no Orçamento Comercial | Realizado / Apurado pelo Sistema | Desvio (Delta) | Fonte Auditada |
|---|---|---|---|---|
| **Receita Bruta Faturada** | R$ 380.000,00 | R$ 380.000,00 | 0,0% | NF-e 4491 (Série 1) |
| **Deduções Tributárias** | R$ 42.560,00 | R$ 42.560,00 | 0,0% | Impostos Destacados na NF-e |
| **Mão de Obra Offshore (Diárias)** | R$ 68.000,00 (20 dias) | R$ 81.600,00 (24 dias) | 🔴 +20,0% | Apontamentos de Embarque |
| **Consumo de Baterias / Peças** | R$ 45.000,00 | R$ 41.200,00 | 🟢 -8,4% | Movimentos de Estoque (Custo Médio) |
| **Logística, Embarcação e Frete** | R$ 18.000,00 | R$ 22.400,00 | 🔴 +24,4% | NFS-e Recebidas de Terceiros |
| **Margem de Contribuição Líquida** | **R$ 206.440,00 (54,3%)** | **R$ 192.240,00 (50,5%)** | **-3,8 p.p.** | **Razão Contábil (Centro de Custo OS)** |

* **Recurso de Análise de Desvio:** Clicar na linha vermelha da mão de obra abre o detalhamento dos 4 dias extras de embarque, mostrando quais técnicos permaneceram a bordo e quem autorizou o prolongamento da operação marítima.

---

## 5. Monitor de Concentração e Risco da Cadeia de Suprimentos

### 5.1. Risco de Clientes e Fornecedores
Em indústrias especializadas, a dependência de poucos clientes ou fornecedores de componentes raros (como células de fosfato de ferro-lítio ou componentes subsea) representa risco existencial.

### 5.2. Métricas Exibidas no Painel de Inteligência de Risco:
1. **Curva ABC de Faturamento e Inadimplência:**
   * Gráfico de Pareto demonstrando os clientes que concentram 80% do faturamento da holding.
   * Índice de pontualidade de pagamento por cliente e por CNPJ da holding.
2. **Índice de Dependência de Fornecedores de Insumos Críticos:**
   * Percentual de compras de insumos concentradas em cada fornecedor internacional nos últimos 12 meses.
   * Alerta visual quando um fornecedor de componente estratégico ultrapassa 60% de concentração sem fornecedor secundário homologado no catálogo.
3. **Radar de Conformidade de Parceiros:**
   * Monitoramento contínuo da situação cadastral na Receita Federal (Ativa/Inapta/Baixada) e certidões negativas (CND).
   * Se um fornecedor cadastrado tem sua inscrição suspensa na SEFAZ, o sistema marca o registro com alerta vermelho e bloqueia a emissão de novos pedidos de compra no módulo de suprimentos.
