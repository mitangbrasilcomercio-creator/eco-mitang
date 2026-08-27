---
name: battery-budget-lifecycle-intelligence
description: Guia avançado de engenharia comercial e ciclo de vida de orçamentos de baterias na holding Eco-Mitang (Mitang Brasil e Arandu). Ensina a IA a interpretar orçamentos multi-item, aprovações parciais, pedidos de compra com múltiplas notas fiscais, retiradas emergenciais antes de PO/pagamento, pendências físicas de remanufatura e cálculo de conversão no nível de item.
---

# Inteligência de Ciclo de Vida e Orçamentos de Baterias (Eco-Mitang)

> **Documento Mandatório de Negócio e Engenharia Comercial**  
> **Aplica-se a:** Mitang Brasil Comércio e Serviços LTDA (`44.221.348/0001-84`) e Arandu Comércio e Serviços LTDA (`61.349.982/0001-16`).

---

## 1. Princípio Fundamental: Granularidade por Linha de Item (Line-Item Granularity)

Um dos maiores erros em sistemas simplistas de ERP é tratar uma proposta comercial / orçamento como uma entidade indivisível do tipo "tudo ou nada" (tudo aprovado ou tudo perdido).

Na realidade industrial e offshore da Eco-Mitang:
* **Um mesmo orçamento (ex: `#050526` para a Fugro ou `#050725` para a Ecco Engenharia)** pode conter múltiplos itens distintos (diferentes packs, químicas, conectores ou serviços).
* **Cada linha possui seu próprio ciclo de vida fiscal, operacional e financeiro independente.**

```
+------+--------------------------------+------+------------+-------------+--------------+
| Item | Modelo / Especificação         | Qtd  | Status     | NF Vinculada| Situação     |
+------+--------------------------------+------+------------+-------------+--------------+
| 1    | Aquadopp 14,4v / 26,3Ah        | 6 un | Aprovado   | 00.000.035  | Finalizado   |
| 2    | Transponder 8242SX - 9v        | 18 un| Aprovado   | 00.000.035  | Finalizado   |
| 3    | Pilhas Li-SOCL2 ER14505        | 24 un| Cancelado  | SEM_NF      | Cancelado    |
| 4    | Conector Submarino Wet-Mate    | 24 un| Cancelado  | SEM_NF      | Cancelado    |
+------+--------------------------------+------+------------+-------------+--------------+
```

> [!IMPORTANT]
> **Regra Mandatória para a IA:**  
> O Faturamento Real Aprovado e o Volume em Negociação **NUNCA** devem ser calculados somando o `valor_total` bruto do cabeçalho sem filtrar os itens. A IA deve somar exclusivamente o valor dos itens com status aprovado/faturado.

---

## 2. Nuances Operacionais & Casos de Borda do Mundo Real

### Caso 2.1: Aprovação Parcial / Cancelamento de Itens no Pedido de Compra (Split PO)
* **Cenário:** O cliente solicita cotação para 4 modelos de bateria diferentes. Na hora de gerar a Ordem de Compra (PO - Purchase Order), o departamento de compras do cliente aprova apenas os itens críticos imediatos (itens 1 e 2) e cancela ou posterga os itens complementares (itens 3 e 4).
* **Tratamento no Sistema:**
  * Os itens 1 e 2 recebem status `Compra Finalizada`, com o número da NF-e emitida gravado no item.
  * Os itens 3 e 4 recebem status `Pedido Cancelado` ou `Compra Não Finalizada`, sem número de nota fiscal.
  * O cálculo de faturamento reconhece apenas o valor dos itens 1 e 2.

### Caso 2.2: Um Mesmo Orçamento / PO Gerando Múltiplas Notas Fiscais (Multi-Invoice)
* **Cenário:** O cliente fecha um pedido de compra grande (ex: R$ 250.000,00) que é entregue em fases (lote 1 imediato de estoque, lote 2 após montagem, lote 3 após importação de células de lítio).
* **Tratamento no Sistema:**
  * O orçamento receberá múltiplos números de NF-e (ex: NF-e `170`, NF-e `171`, NF-e `175`), onde cada item ou parcela de quantidade aponta para sua respectiva chave/número de NF-e.
  * As duplicatas financeiras e vencimentos serão atrelados a cada emissão parcial.

### Caso 2.3: Retirada Emergencial Antes de PO Oficial ou Pagamento (Emergent Vessel Release)
* **Cenário:** No setor marítimo/offshore, navios de apoio (PSVs/AHTSs) ou sondas de perfuração não podem ficar parados aguardando a burocracia do departamento de compras. O engenheiro ou comandante solicita retirada imediata de um pack de bateria submarino na base da Mitang/Arandu.
* **Tratamento no Sistema:**
  * O status da proposta entra como `Compra Aprovada (Retirada Emergencial)`.
  * A bateria sai fisicamente do estoque com controle de lote/número de série.
  * A NF-e e o faturamento oficial são emitidos dias após, assim que o cliente emite o número do PO oficial de regularização.
  * A IA deve rastrear esse título como "Faturamento Pendente de Regularização de PO".

### Caso 2.4: Dependência Física de Envio da Carcaça para Reparo / Remanufatura
* **Cenário:** Em baterias médicas hospitalares (ex: Orçamento `#100125` - Hospital Di Camp para Desfibrilador M-Series) ou packs submarinos customizados, o hospital ou clínica aprova a cotação de serviço/troca de células, porém **a equipe de engenharia clínica demora semanas ou meses para enviar fisicamente a bateria gasta até o laboratório da Mitang**.
* **Tratamento no Sistema:**
  * Status da proposta: `Compra Aprovada`.
  * Status fiscal: `Sem NFe/NFSe` (A nota fiscal de prestação de serviço ou remessa de reparo NÃO pode ser emitida legalmente até que o equipamento físico dê entrada na bancada).
  * Observação obrigatória: *"A bateria não foi enviada para reparo até hoje"*.

### Caso 2.5: Amostra / Lote Piloto vs. Lote de Escala
* **Cenário:** O cliente compra 1 ou 2 unidades para testes de homologação em bancada/mar (ex: Orçamento `#050725` - Ecco Engenharia, Item 1 de 1 un faturado na NF-e `00.000.198`), enquanto o Item 2 de 270 unidades fica pendente de decisão futura.
* **Tratamento no Sistema:**
  * Segregação estrita entre receita realizada (1 un) e pipeline comercial em aberto (270 un).

---

## 3. Modelo de Dados JSON Recomendado para Cada Linha de Item

Cada elemento do array `itens_json` na tabela `orcamentos_historico` deve seguir a seguinte estrutura rica:

```json
{
  "item_index": 1,
  "codigo_sku": "220051",
  "nome": "Signature - 18v / 100Ah / 1800Wh",
  "quimica": "Li-SOCL2",
  "setor": "Subsea & Oceanografia",
  "quantidade_cotada": 8,
  "quantidade_atendida": 8,
  "valor_unitario": 8769.00,
  "desconto_percentual": 0.0,
  "valor_total_item": 70152.00,
  "status_item": "Compra Aprovada",
  "situacao_entrega": "Compra Finalizada",
  "tipo_documento_fiscal": "NFe - Venda",
  "numero_nfe": "00.000.170",
  "data_envio_nf": "2025-01-14",
  "condicao_pagamento": "28 Dias",
  "data_vencimento": "2025-02-16",
  "status_pagamento": "Pago",
  "observacoes_item": "Lote entregue com certificado de teste de descarga"
}
```

---

## 4. Diretrizes de Auditoria para a Inteligência Artificial

Ao processar relatórios, gráficos de conversão ou análises executivas:
1. **Taxa de Conversão Real:** Deve ser apurada como `(Valor dos Itens Efetivamente Faturados) / (Valor Total dos Itens Cotados)`.
2. **Identificação de Inconsistências:** Se uma proposta possui status "Compra Aprovada" mas o valor somado das notas fiscais vinculadas for inferior ao total da proposta, a IA deve apontar automaticamente:
   * (A) Houve cancelamento parcial de itens; OU
   * (B) Houve entrega/faturamento fracionado em lote pendente; OU
   * (C) Trata-se de serviço de bancada aguardando recebimento físico do equipamento.

---

## 5. Parser Determinístico por 5-Tupla Monetária & Curva ABC Auditada

### 5.1 O Problema do Deslocamento de Colunas (*Column Shift*) em Células Vazias
Ao extrair textos brutos de PDFs de orçamentos, células vazias ou com traço (`-`) costumam fundir linhas adjacentes. Para garantir 100% de integridade em todas as 325 linhas de itens (220 cotações únicas), a IA deve utilizar a âncora determinística de 5 valores financeiros:
`[Valor Unitário R$, Valor Total Qtd R$, Desconto %, Frete R$, Valor Final do Item R$]`

* **Antes da Âncora:** Vencimento (`DD/MM/AAAA`), Prazo (`30d`), Tipo e Número de NF-e (`00.000.xxx`), Pedido de Compra (`PO`) e Data de Aprovação.
* **Depois da Âncora:** Pagamento (`Ok`, `Pendente`, `Extornado`), Situação (`Compra Finalizada`, `Aguardando Pagamento`, `Pedido Cancelado`), Observação da Linha e Sequencial (`N°`).

### 5.2 Curva ABC Real de Atrasos vs Faturamento a Vencer
A IA nunca deve tratar notas fiscais emitidas como atraso se elas já foram liquidadas no banco.
* **Atraso Real:** Somente itens/propostas com `status_financeiro == 'Em Atraso'` OU `vencimento < hoje` com status pendente (ex: Viva Rio com 33 dias e Fugro com 27 dias).
* **À Receber em Dia:** Itens com faturamento formalizado cujo vencimento é futuro (ex: WAMS, Fugro e UFPA/CNPq).
* **Observações Críticas:** Informações da coluna de observação (como pagamentos via PIX em atraso, 50% após coleta ou boletos em CPF de pesquisadores) devem ser sempre exibidas no detalhamento da proposta.
