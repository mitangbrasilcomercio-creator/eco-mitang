---
name: executive-dashboard-intelligence
description: Engenharia de métricas de tendência MoM (Month-over-Month), projeção de Runway de fluxo de caixa, Curva ABC de inadimplência e segregação estrita de custódia bancária (aplicações automáticas vs operação real) no ERP Eco-Mitang.
---

# Inteligência de Dashboard Executivo (MoM, Runway, Inadimplência e Custódia)

Este guia ensina a IA a computar, projetar e apresentar métricas financeiras de alto nível para os sócios e diretoria (C-Level) da holding Eco-Mitang (Mitang Brasil e Arandu Comércio).

---

## 1. Indicadores de Tendência Month-over-Month (MoM)

Um número isolado informa a magnitude; a taxa de variação informa a aceleração da empresa.

### 1.1. Fórmula Padrão MoM
$$\text{MoM (\%)} = \left( \frac{\text{Valor}_{\text{mês atual}} - \text{Valor}_{\text{mês anterior}}}{\text{Valor}_{\text{mês anterior}}} \right) \times 100$$

### 1.2. Regra Semântica de Cores e Sinais
| Indicador | Direção | Significado Financeiro | Cor no UI | Ícone |
| :--- | :--- | :--- | :--- | :--- |
| **Faturado** | $\Delta > 0$ | Aumento de vendas ganhas | Esmeralda (`#10b981`) | `▲ +X%` |
| **Faturado** | $\Delta < 0$ | Desaceleração comercial | Vermelho (`#f87171`) | `▼ -X%` |
| **Recebido** | $\Delta > 0$ | Maior liquidez em caixa | Esmeralda (`#10b981`) | `▲ +X%` |
| **Em Atraso** | $\Delta < 0$ | **Queda na inadimplência** (Excelente) | Esmeralda (`#10b981`) | `▼ -X%` |
| **Em Atraso** | $\Delta > 0$ | **Aumento da inadimplência** (Risco) | Vermelho (`#f87171`) | `▲ +X%` |
| **Despesas em Atraso**| $\Delta > 0$ | Contas atrasadas acumulando juros | Vermelho (`#f87171`) | `▲ +X%` |

---

## 2. Projeção de Runway e Alerta de Fluxo de Caixa (15 Dias)

Para prever a necessidade de capital de giro antes que ela se torne um problema de liquidez, o sistema projeta o saldo bancário para a próxima quinzena:

$$\text{Saldo Projetado (15d)} = \text{Saldo Bancário Atual (Operacional)} + \text{À Receber (15d)} - \text{À Pagar (15d)}$$

### 2.1. Regras de Alerta do Runway
- **Se Saldo Projetado $\ge 0$**:
  * Status: `POSITIVO (Operação Equilibrada)`
  * Badge: Verde com dias de cobertura calculados: $\frac{\text{Saldo Projetado}}{\text{Média Diária de Saídas}}$
- **Se Saldo Projetado $< 0$**:
  * Status: `DEFICIT_ALERTA`
  * Badge: Vermelho pulsante `🚨 ALERTA: NECESSIDADE DE CAPITAL DE GIRO`
  * Exibe imediatamente o montante do déficit para antecipação de recebíveis ou remanejamento de pagamentos.

---

## 3. Curva ABC de Inadimplência (Top 3 Devedores)

Saber que há montantes em atraso assusta o gestor; saber que 80% do valor está concentrado em 2 ou 3 grandes clientes corporativos direciona a cobrança de forma cirúrgica.

### 3.1. Estrutura do Ranking
1. **Razão Social do Cliente**: Identificação clara da conta.
2. **CNPJ**: Registro oficial para conciliação fiscal e jurídica.
3. **Valor Vencido (R$)**: Somatório das parcelas não liquidadas com vencimento expirado.
4. **Dias Médios de Atraso**: Idade da dívida (Aging list).
5. **Ação Rápida**: Botão para abrir instantaneamente o **Dossiê 360°** do cliente com todo o seu histórico de compras, sócios administradores e notas fiscais.

---

## 4. Segregação Estrita de Custódia Bancária (Aplicações Automáticas)

### 4.1. O Problema das Aplicações Automáticas no Itaú e Bradesco
Bancos comerciais brasileiros realizam varreduras automáticas noturnas da conta corrente para fundos de liquidez diária (`SDO APLIC AUT MAIS AP`, `APLICAÇÃO AUTOMÁTICA`, `RESGATE APLIC`).
- Se contabilizadas como despesa na saída ou receita na volta, distorcem completamente o faturamento e os custos reais.
- **Regra de Ouro**: **NUNCA APAGAR DADOS DO EXTRATO**. O histórico do extrato deve ser 100% fidedigno ao arquivo bancário OFX.

### 4.2. Padrão de Classificação do ERP Eco-Mitang
Transações que contenham os termos abaixo são classificadas estritamente como:
`tipo_classificacao = 'TRANSFERENCIA_CUSTODIA'`
- Termos rastreados:
  * `APLIC AUT`
  * `APLICAÇÃO AUTOMÁTICA`
  * `RES APLIC` / `RESGATE APLIC`
  * `SDO APLIC`
  * `REND PAGO` / `RENDIMENTO`
- **Saldo Operacional**: Calculado exclusivamente sobre entradas de clientes e saídas para fornecedores/folha, ignorando a custódia.
- **Card Separado**: Exibido no topo da Tesouraria como `Total em Aplicações / Rendimentos (Custódia)`, demonstrando o patrimônio líquido aplicado da empresa.

---

## 5. Gráfico Interativo com Filtros Reativos por Cards

1. **Dois Modos de Exibição**:
   - **Barras Verticais**: Comparativo agrupado mês a mês (Jan a Ago/2026).
   - **Linhas Contínuas (SVG)**: Curvas evolutivas com marcadores pontuais e tooltips de valores.
2. **Interatividade por Cards**:
   - Os 4 cards superiores funcionam como filtros de séries (Faturado, Recebido, À Receber, Em Atraso).
   - Clicar em um card ativa ou desativa aquela curva no gráfico, permitindo sobreposições sob demanda (ex: Faturado vs Recebido).
