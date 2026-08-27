---
name: financial-controladoria-dre
description: Guia de engenharia financeira, cálculo estruturado de DRE, tesouraria, conciliação bancária OFX e modelo de análise DuPont para a holding Eco-Mitang.
---

# Controladoria, DRE & Engenharia Financeira (Eco-Mitang)

Este documento instrui o agente e os desenvolvedores sobre a arquitetura contábil e de controladoria aplicada ao ERP Eco-Mitang.

---

## 1. Estrutura Padrão da DRE (Demonstração do Resultado do Exercício)

A DRE deve ser apurada dinamicamente a partir dos documentos fiscais e transações bancárias:

$$\begin{aligned}
& (+) \text{ Receita Operacional Bruta} && \text{(NF-e Vendas Baterias + NFS-e Serviços Prestados)} \\
& (-) \text{ Deduções e Tributos sobre Vendas} && \text{(ICMS, PIS, COFINS, ISS calculados)} \\
& (=) \text{ Receita Operacional Líquida (ROL)} \\
& (-) \text{ Custo das Mercadorias Vendidas (CMV)} && \text{(NF-e Insumos Recebidas: Strema, SBT, células)} \\
& (=) \text{ Lucro Bruto / Margem de Contribuição} \\
& (-) \text{ Despesas Operacionais} && \text{(NFS-e Terceiros/PJ + Tarifas Bancárias OFX)} \\
& (=) \text{ EBITDA / LAJIDA} && \text{(Resultado Operacional)} \\
& (=) \text{ Lucro Líquido do Exercício}
\end{aligned}$$

---

## 2. Índices de Controladoria e Governança

### 2.1. Índice de Liquidez Corrente
$$\text{Liquidez Corrente} = \frac{\text{Ativo Circulante (Saldo Bancário + Contas a Receber)}}{\text{Passivo Circulante (Contas a Pagar + Fornecedores)}}$$
- **Meta Eco-Mitang**: $> 1.8x$. Índices superiores a $2.0x$ conferem margem segura de manobra para contratos offshore de longo ciclo.

### 2.2. Grau de Endividamento
$$\text{Grau de Endividamento} = \frac{\text{Passivo Total (Obrigações e Compras)}}{\text{Ativo Total}} \times 100$$
- **Meta Eco-Mitang**: $< 40\%$.

---

## 3. Modelo de Análise DuPont (Simulador de Retorno ao Acionista)

O modelo decompõe o **Retorno sobre o Patrimônio Líquido (ROE)** em três vetores gerenciais fundamentais:

$$\text{ROE} = \text{Margem Líquida (\%)} \times \text{Giro do Ativo (vezes)} \times \text{Alavancagem Financeira (vezes)}$$

1. **Margem Líquida ($\frac{\text{Lucro Líquido}}{\text{Receita}}$)**: Mede a eficiência na precificação e controle de custos industriais de baterias.
2. **Giro do Ativo ($\frac{\text{Receita}}{\text{Ativo Total}}$)**: Mede a eficiência no aproveitamento dos estoques e maquinários.
3. **Alavancagem ($\frac{\text{Ativo Total}}{\text{Patrimônio Líquido}}$)**: Mede o multiplicador de recursos de terceiros investidos na holding.

---

## 4. Requisitos para o Frontend de Controladoria

- **Interatividade Total**: Nunca exibir gráficos vazios ou marcadores de posição de texto como "Área do Gráfico".
- **Simulador Vivo**: Fornecer controles deslizantes (*sliders*) para que os diretores possam simular impactos de margem e giro sobre o ROE instantaneamente.
