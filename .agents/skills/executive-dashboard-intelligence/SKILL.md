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

## 5. Gráfico Interativo com Granularidade Adaptativa

1. **Dois Modos de Exibição**:
   - **Barras Verticais**: Comparativo de colunas coloridas com tooltips de valores em `k`.
   - **Linhas Contínuas (SVG)**: Curvas evolutivas com marcadores pontuais.
2. **Granularidade Adaptativa por Período**:
   - **Período Longo / Ano Todo (`all` ou $> 65$ dias)**: Plota 8 slots mensais consolidados (`JAN` a `AGO/2026`).
   - **Mês Específico (`mes_atual`, `mes_anterior` ou $\le 65$ dias)**: O backend fatia dinamicamente o período em até 5 semanas reais:
     * `Sem 1 (01 a 07/MM)`
     * `Sem 2 (08 a 14/MM)`
     * `Sem 3 (15 a 21/MM)`
     * `Sem 4 (22 a 28/MM)`
     * `Sem 5 (29 a 31/MM)`
   - Calcula os somatórios semanais exatos de Faturado, Recebido, Total Pago e Em Atraso.
   - O título no frontend altera automaticamente para `Evolução Semanal no Período Selecionado`.
3. **Interatividade por Cards**:
   - Os 4 cards superiores funcionam como filtros de séries (Faturado, Recebido, À Receber, Em Atraso).
   - Clicar em um card ativa ou desativa aquela curva no gráfico sob demanda.

---

## 6. Padronização Universal de Bancos e Contas via Regex

Diferentes bancos exportam identificadores brutos distintos no arquivo OFX. A IA e o frontend devem aplicar a seguinte normalização estrita:

1. **Instituição Bancária**: Exibida em coluna própria com ícone e badge específico (ex: `Itaú Unibanco`, `Banco Bradesco`).
2. **Agência / Conta**:
   - **Itaú (10 dígitos brutos no `<ACCTID>`)**:
     * 4 primeiros dígitos: Agência
     * 5 dígitos seguintes: Conta Corrente
     * 1 último dígito: Dígito Verificador (DV)
     * *Exemplo*: `1155995077` $\rightarrow$ `Ag. 1155 • CC 99507-7`
     * *Exemplo*: `2927986634` $\rightarrow$ `Ag. 2927 • CC 98663-4`
   - **Bradesco (`<ACCTID>` curto e `<BRANCHID>`)**:
     * Normaliza conta para 7 dígitos com zeros à esquerda e DV
     * *Exemplo*: Conta `27414` e Agência `3249` $\rightarrow$ `Ag. 3249 • CC 0027414-3`
   - **Formato Canônico Nacional**: `Ag. AAAA • CC CCCCC-D`.

---

## 7. Linha de Totais e Subtotais em Tempo Real (`tfoot`)

Toda e qualquer tabela do sistema deve conter uma linha de rodapé fixo (`tfoot`) calculando em tempo real os subtotais exclusivos do recorte filtrado:
- **Quantidade de Registros Visíveis** (ex: `14 lançamentos visíveis`)
- **Total de Entradas Visíveis** (ex: `+R$ 0,00` se filtrado apenas saídas)
- **Total de Saídas Visíveis** (ex: `-R$ 403.058,75`)
- **Saldo Líquido Visível** ($\sum \text{Entradas} - \sum \text{Saídas}$)

---

## 8. Dossiê 360° de Contrapartes / Favorecidos no Extrato Bancário

Ao clicar no campo **Histórico / Memo** de qualquer lançamento bancário:
1. **Extração de Nome e Favorecido via Regex**:
   - Padrões PIX: `DES:\s*([^0-9\n\r/]+)`, `REM:\s*([^0-9\n\r/]+)`, `PIX ENVIADO\s+([A-Z\s]+)`.
   - Padrões de Documento: CPF `\d{3}\.\d{3}\.\d{3}-\d{2}` ou CNPJ `\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}`.
2. **Consulta Reversa ao Histórico Completo**:
   - Busca em `/api/v1/financeiro/transacoes?busca=${nome}&somente_operacionais=false`.
   - Retorna todas as transações bancárias (débitos e créditos) daquela pessoa/empresa no exercício.
3. **Consolidação de KPIs no Modal**:
   - **Total Pago a Ele(a)** (soma dos débitos)
   - **Total Recebido Dele(a)** (soma dos créditos)
   - **Saldo Líquido Consolidado**
   - **Quantidade Total de Lançamentos**
   - **Tabela Auditada** com data, banco de origem, agência/conta, memo oficial, valor e badge de tipo.
