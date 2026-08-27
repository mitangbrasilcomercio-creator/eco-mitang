---
name: banking-treasury-ofx-intelligence
description: Engenharia contábil e tesouraria para extratos bancários OFX na Eco-Mitang (Itaú e Bradesco). Ensina a IA a identificar práticas bancárias automáticas de overnight/CDI (APLIC AUT / INVEST FACIL), segregar liquidez interna vs fluxo de caixa operacional comercial real, e evitar distorções no cálculo de EBITDA, Runway e DRE.
---

# Inteligência de Tesouraria e Extratos Bancários OFX (Eco-Mitang)

> **Documento Mandatório de Arquitetura, Contabilidade, Tesouraria e Auditoria Financeira**  
> **Contas Analisadas e Mapeadas:**  
> 1. **Itaú Unibanco (0341):** Agência 1155, C/C 99507-7 (`ACCTID: 1155995077`) -> **Arandu Comércio e Serviços Ltda** (CNPJ `61.349.982/0001-16`)  
> 2. **Itaú Unibanco (0341):** Agência 2927, C/C 98663-4 (`ACCTID: 2927986634`) -> **Mitang Brasil Comércio e Serviços Ltda** (CNPJ `044.221.348/0001-84`)  
> 3. **Banco Bradesco (0237):** Agência 3249, C/C 0027414-3 (`ACCTID: 27414`) -> **Mitang Brasil Comércio e Serviços Ltda** (CNPJ `044.221.348/0001-84`)  

---

## 1. O Problema Estrutural do OFX no Brasil e as "Pegadinhas" Bancárias

O padrão internacional OFX (*Open Financial Exchange*) nas versões 1.02/1.03 em SGML é um formato legado onde:
1. **Não existe tag nativa de CNPJ no cabeçalho:** O arquivo contém apenas `<BANKID>` e `<ACCTID>`.
2. **Não existem tags indicando faturamento de cliente vs movimentações internas:** O OFX possui unicamente `<TRNTYPE>` (`CREDIT` ou `DEBIT`) e `<TRNAMT>`. A natureza do evento está codificada no texto da tag `<MEMO>`.
3. **Formatação de Decimais divergente:**
   - **Banco Bradesco (`0237`):** Emite valores com **vírgula** decimal (ex: `<TRNAMT>6,29` e `<TRNAMT>-5570,51`).
   - **Banco Itaú (`0341`):** Emite valores com **ponto** decimal (ex: `<TRNAMT>-2204.89`).
   - **Ação Obrigatória do Parser:** Normalizar `.replace(',', '.')` antes de converter para float/numeric.
4. **Agência embutida vs omitida:**
   - **Itaú:** Concatena os 4 dígitos da agência com os da conta no `<ACCTID>` (`1155995077` = Agência `1155` + Conta `99507-7`).
   - **Bradesco:** Emite apenas a conta no `<ACCTID>` (`27414`), omitindo a agência.

---

## 2. A Engenharia Reversa das "Pegadinhas" Bancárias (Pipeline em 4 Camadas)

Analisando os 24 extratos bancários reais da Eco-Mitang (Janeiro a Agosto de 2026), mais de **65% dos registros são ruídos bancários**. Sem segregação estrita, o faturamento da empresa é inflado em milhões de reais de forma fictícia.

```
+---------------------------------------------------------------------------------------------------------+
| CAMADA 1: FILTRO DE EXPURGO DE SALDOS DIÁRIOS INJETADOS                                                |
| (Descartar do somatório de receitas; armazenar como Checkpoints Diários de Auditoria)                   |
| Exemplos Itaú: SALDO ANTERIOR, SALDO TOTAL DISPONÍVEL DIA, SALDO APLIC. AUT., SALDO MOVIMENTAÇÃO CONTA  |
+---------------------------------------------------------------------------------------------------------+
                                                     │
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
| CAMADA 2: MOVIMENTAÇÕES NEUTRAS DE LIQUIDEZ (SWEEP ACCOUNTS / CDI OVERNIGHT)                           |
| (Impacto ZERO na Liquidez Total e no Faturamento; transferências internas entre gavetas do Ativo)       |
| Exemplos Itaú: APL APLIC AUT MAIS (Débito) / RES APLIC AUT MAIS (Crédito)                               |
| Exemplos Bradesco: INVEST FACIL, RESG.INVEST FACIL                                                      |
+---------------------------------------------------------------------------------------------------------+
                                                     │
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
| CAMADA 3: SEPARAÇÃO DE RECEITA FINANCEIRA (RENDIMENTOS DE JUROS CDI)                                    |
| (Dinheiro novo que aumenta o saldo, mas NÃO É FATURAMENTO COMERCIAL DE CLIENTES)                        |
| Exemplos Itaú: REND PAGO APLIC AUT MAIS, RENDIMENTOS REND PAGO APLIC AUT MAIS                           |
| Exemplos Bradesco: RENTAB.INVEST FACILCRED*                                                             |
+---------------------------------------------------------------------------------------------------------+
                                                     │
                                                     ▼
+---------------------------------------------------------------------------------------------------------+
| CAMADA 4: FLUXO DE CAIXA OPERACIONAL COMERCIAL REAL                                                     |
| Receitas Reais (Clientes): RECEBIMENTOS, TED, PIX RECEBIDO, BOLETO RECEBIDO                             |
| Despesas Reais: SAÍDA PIX ENVIADO, SAÍDA BOLETO PAGO, TRIBUTO (SIMPLES, DARF, GPS), TARIFA BANCARIA     |
+---------------------------------------------------------------------------------------------------------+
```

---

## 3. O "Saldo do Dia" a Nosso Favor: O Teorema Delta de Conciliação ($\Delta = 0$)

### 3.1. Como os Bancos Estruturam o Saldo
No Brasil, contas corporativas possuem duas gavetas de liquidez:
1. **Conta Corrente Física:** No Itaú, o saldo da C/C física é varrido ao final do expediente para R$ 1,00 ou R$ 0,00.
2. **Aplicação Automática (Overnight CDI):** O saldo excedente rende juros diariamente.

No extrato oficial em PDF e no cabeçalho do internet banking, a métrica soberana é a **Liquidez Total Disponível**:
$$\text{Liquidez Total Disponível}(D) = \text{Saldo Conta Corrente}(D) + \text{Saldo Aplicado Overnight}(D)$$

### 3.2. A Equação Fundamental da Liquidez Total
Como as movimentações de aplicação e resgate automático são transferências internas entre gavetas da mesma conta bancária, o impacto líquido na liquidez total é rigorosamente nulo:
$$+ \text{Resgate (C/C)} - \text{Resgate (Aplicação)} = 0$$
$$- \text{Aplicação (C/C)} + \text{Aplicação (Overnight)} = 0$$

Portanto, a variação de liquidez de qualquer dia $D$ em relação ao dia anterior $D-1$ obedece a uma equação matemática exata e universal (válida tanto para o Itaú quanto para o Bradesco):

$$\mathbf{Saldo(D) = Saldo(D-1) + ReceitasReais(D) - DespesasReais(D) + RendimentosFinanceiros(D)}$$

### 3.3. A Prova Real dos Nove (Teorema Delta)
Para cada dia $D$ com movimentação, o sistema computa o **Saldo Calculado Interno** e compara contra o **Saldo Total Disponível Oficial** informado pelo banco (tag `SALDO TOTAL DISPONÍVEL DIA` no Itaú ou a coluna `Saldo (R$)` do extrato):

$$\Delta = \text{SaldoCalculado}(D) - \text{SaldoOficialBanco}(D)$$

* **Se $\Delta = 0,00$**: O dia e a conta recebem a chancela de conformidade **"Auditado e Conciliado com 100% de Precisão"**.
* **Se $\Delta \neq 0,00$**: O sistema rejeita o fechamento cego e aciona imediatamente o **Detector de Gaps (Lacunas Documentais)**.

---

## 4. Resolução Multi-Tenant Automática (Identificação de Empresa e CNPJ)

Como o OFX não possui o CNPJ, o sistema utiliza uma **Tabela de Roteamento de Contas Bancárias (`contas_bancarias`)**:

```
                              [Arquivo OFX Importado]
                                         │
                   Extrai <BANKID> (0341) e <ACCTID> (1155995077)
                                         │
                                         ▼
                 Busca na Tabela `contas_bancarias` do ERP
                  (banco_codigo = '0341' AND conta_numero = '1155995077')
                                         │
                     ┌───────────────────┴───────────────────┐
                     ▼                                       ▼
            [Conta Já Mapeada]                     [Conta Nova Desconhecida]
                     │                                       │
     Resolve Automaticamente:                 Solicita ao Operador uma Única Vez:
     - Empresa: Arandu Comércio Ltda          "A qual empresa pertence a conta 0341/1155995077?"
     - CNPJ: 61.349.982/0001-16               (Arandu, Mitang Brasil, Subsea ou Sea House)
     - Agência: 1155, Conta: 99507-7                         │
     - Aplica RLS app.current_empresa_id                     ▼
                                              Cadastra no banco e memoriza para sempre!
```

---

## 5. Idempotência Criptográfica e Prevenção de Duplicidades em Uploads Sobrepostos

### O Cenário Real:
Um colaborador importa o extrato de agosto inteiro (01 a 31/08). Mais tarde, outro colaborador ou um sistema automatizado faz o upload do extrato de uma semana específica (ex: 10 a 17/08) ou de um único dia.

### A Vulnerabilidade do `<FITID>` Isolado:
Instituições como Itaú reusam sequências numéricas curtas reiniciadas diariamente (ex: `20260701001`, `20260701002`). Confiar exclusivamente no `<FITID>` gera colisões e rejeições indevidas entre meses diferentes.

### A Solução Mandatória: Assinatura Criptográfica Composta (SHA-256)
Cada lançamento recebe uma chave de unicidade imutável:
$$\text{idempotency\_hash} = \text{SHA256}(\text{empresa\_id} \parallel \text{bank\_id} \parallel \text{acct\_id} \parallel \text{fitid} \parallel \text{data\_lancamento} \parallel \text{valor} \parallel \text{memo})$$

No PostgreSQL:
```sql
INSERT INTO transacoes_bancarias (...) 
VALUES (...) 
ON CONFLICT (idempotency_hash) DO NOTHING;
```

**Resultado:**
- O sistema processa o arquivo em alta performance.
- As transações já existentes são silenciosamente ignoradas (`transacoes_duplicadas_ignoradas++`).
- Nenhuma transação duplicada é gerada.
- O saldo final permanece inalterado e matematicamente íntegro.

---

## 6. Auditoria de Continuidade e Análise de Gaps (Fita Histórica Inquebrável)

Quando um extrato é importado, o sistema executa a **Verificação de Elo da Corrente**:
$$\text{SaldoInicial(Extrato Novo)} \stackrel{?}{=} \text{SaldoFinal(Último Extrato no Sistema)}$$

Se houver discrepância ($\text{SaldoInicial} \neq \text{SaldoFinal}$):
> **🚨 ALERTA CRÍTICO DE GAP DETECTADO:**  
> *"Identificada lacuna histórica de R$ X,XX entre a data A e a data B. Faltam extratos intermediários. Por favor, importe o arquivo compreendendo o período faltante para restabelecer a fita de continuidade contábil."*

---

## 7. Apresentação em Dashboards e Gráficos Interativos

Para o acompanhamento diário com gráficos de variações de valor:
1. **Filtros do Dashboard:**
   - Seletor de Empresa / CNPJ
   - Seletor de Conta Bancária (ou visão consolidada da holding)
   - Janela temporal (Mensal, Semanal, Diário)
2. **Séries Sincronizadas no Gráfico:**
   - **Barras Verdes:** Faturamento Comercial Real Recebido (Clientes externos).
   - **Barras Vermelhas:** Despesas e Custos Operacionais Reais (Fornecedores, Tributos, Folha, Tarifas).
   - **Linha Contínua (Azul/Esmeralda):** Saldo Acumulado do Dia (Liquidez Total Disponível).
3. **Cards Executivos de Resumo:**
   - **Receitas Comerciais Reais de Clientes:** Faturamento real liquidado em caixa.
   - **Despesas Operacionais Reais:** Saídas comerciais verdadeiras.
   - **Rendimentos Financeiros (CDI):** Juros ganhos em aplicações overnight.
   - **Total em Custódia Overnight:** Saldo guardado nas aplicações automáticas.
   - **Saldo do Dia Selecionado:** Posição exata de caixa auditada.
   - **Selo de Auditoria Contábil:** Badge `✓ Matematicamente Auditado (Delta = R$ 0,00)`.
