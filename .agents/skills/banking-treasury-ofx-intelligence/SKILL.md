---
name: banking-treasury-ofx-intelligence
description: Engenharia contábil e tesouraria para extratos bancários OFX na Eco-Mitang (Itaú e Bradesco). Ensina a IA a identificar práticas bancárias automáticas de overnight/CDI (APLIC AUT / INVEST FACIL), segregar liquidez interna vs fluxo de caixa operacional comercial real, e evitar distorções no cálculo de EBITDA, Runway e DRE.
---

# Inteligência de Tesouraria e Extratos Bancários OFX (Eco-Mitang)

> **Documento Mandatório de Contabilidade, Tesouraria e Auditoria Financeira**  
> **Contas Analisadas:** Itaú Unibanco (Ag 1155 CC 99507-7, Ag 2927 CC 98663-4) e Banco Bradesco (Ag 2608 CC 205354).

---

## 1. O Problema da "Aplicação Automática" (Overnight CDI) no Brasil

Contas correntes de pessoas jurídicas (PJ) em bancos como Itaú e Bradesco contam com o recurso de aplicação automática de saldo diário.

### Como o Banco Opera:
1. Ao final do dia ou assim que um cliente deposita (TED/PIX/Boleto), o banco gera um débito na conta-corrente com o memo `APL APLIC AUT MAIS` ou `INVEST FACIL`.
2. Quando a empresa precisa pagar boletos, fornecedores ou tributos, o banco gera um crédito de resgate com o memo `RES APLIC AUT MAIS` ou `RESG.INVEST FACIL`.
3. O rendimento diário dos juros entra com o memo `RENDIMENTOS REND PAGO APLIC AUT MAIS`.
4. Linhas de controle são registradas no OFX como `SALDO APLIC. AUT.` ou `SALDO TOTAL DISPONÍVEL DIA`.

```
+--------------------------+-----------------------------+-------------------------------+
| Memo no Arquivo OFX      | Natureza Contábil           | Impacto em Receita/Despesa    |
+--------------------------+-----------------------------+-------------------------------+
| APL APLIC AUT MAIS       | Varredura de Liquidez       | ZERO (Não é Despesa!)         |
| RES APLIC AUT MAIS       | Resgate de Liquidez         | ZERO (Não é Receita!)         |
| SALDO TOTAL DISPONÍVEL   | Informativo de Saldo        | ZERO (Linha de Fechamento)    |
| SALDO APLIC. AUT.        | Informativo de Saldo        | ZERO (Saldo em Custódia)      |
| SAÍDA BOLETO INSETISAN   | Despesa Operacional         | DÉBITO OPERACIONAL REAL       |
| RECEBIMENTOS DOF SUBSEA  | Faturamento Comercial       | CRÉDITO OPERACIONAL REAL      |
| REND PAGO APLIC AUT      | Receita Financeira (Juros)  | RECEITA FINANCEIRA REAL       |
+--------------------------+-----------------------------+-------------------------------+
```

> [!CAUTION]
> **Erro Crítico da Implementação Anterior:**  
> Somar todos os débitos (<0) como despesas e todos os créditos (>0) como receitas gerou uma distorção de **R$ 1.475.928,48 em receitas infladas** e **R$ 1.262.968,32 em despesas fictícias**.  
> **Regra Mandatória:** Transações com `categoria_financeira = 'APLICACAO_RESGATE_AUTOMATICO'` e `is_saldo_informativo = true` **DEVEM SER EXCLUÍDAS** do fluxo de caixa operacional.

---

## 2. Fórmulas Matemáticas Oficiais de Tesouraria

### 2.1. Entradas Operacionais Reais (Recebimentos de Clientes):
$$\text{Entradas Reais} = \sum \{ \text{valor} \mid \text{valor} > 0 \land \text{categoria} \neq \text{'APLICACAO\_RESGATE\_AUTOMATICO'} \land \text{is\_saldo\_informativo} = \text{false} \}$$

### 2.2. Saídas Operacionais Reais (Custos, Despesas, Salários e Tributos):
$$\text{Saídas Reais} = \sum \{ |\text{valor}| \mid \text{valor} < 0 \land \text{categoria} \neq \text{'APLICACAO\_RESGATE\_AUTOMATICO'} \land \text{is\_saldo\_informativo} = \text{false} \}$$

### 2.3. Saldo Operacional Real do Negócio:
$$\text{Saldo Operacional Líquido} = \text{Entradas Reais} - \text{Saídas Reais}$$

### 2.4. Saldo Total em Custódia (Overnight + Conta Corrente):
$$\text{Liquidez Total Disponível} = \text{Saldo Conta Corrente} + \text{Saldo Aplicado Overnight}$$

---

## 3. Diretrizes para a Inteligência Artificial

1. **Auditoria de DRE:** Ao apurar DRE, apenas tributos, tarifas bancárias reais (IOF, manutenção de conta, taxas de cobrança) e despesas com fornecedores entram nas linhas de deduções/despesas operacionais.
2. **Projeção de Runway:** O cálculo de dias de cobertura de caixa deve usar o **Saldo Operacional Real + Contas a Receber a Curto Prazo (15d)** versus **Contas a Pagar a Curto Prazo (15d)**.
3. **Idempotência Criptográfica:** Sempre verificar a chave SHA-256 (`empresa|banco|conta|fitid|data|valor|memo`) para prevenir duplicações de lançamentos ao reimportar extratos mensais sobrepostos.
