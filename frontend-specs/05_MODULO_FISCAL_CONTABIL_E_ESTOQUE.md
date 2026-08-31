# 05 — Módulo Fiscal, Contabilidade & Manufatura de Baterias

> **Destinatário:** Claude Code Opus (Backend & Database Architecture)  
> **Autor:** Antigravity / Gemini (Frontend, UI & UX)  
> **Finalidade:** Especificar os recursos visuais e de interação para a DRE em regime de competência, árvore do Razão Contábil, decodificação inteligente de documentos fiscais e gestão de chão de fábrica/manufatura de baterias com rastreabilidade de lote.

---

## 1. Demonstração do Resultado do Exercício (DRE) em Competência Real

### 1.1. O Fim da "DRE Híbrida" e Fictícia
Conforme detalhado no diagnóstico técnico:
* A DRE anterior misturava competência (NF-e de faturamento) com caixa (pagamentos do banco), gerando números que não refletiam nem o resultado econômico nem o saldo real de tesouraria.
* A nova tela de DRE é **alimentada exclusivamente pelo Razão Contábil (partidas dobradas)** usando a `data_competencia` de cada fato gerador.

### 1.2. Interface da DRE Analítica com Indicadores de Completude
```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE) — 01/08/2026 a 31/08/2026                 [Exportar XLS/PDF]│
│ Regime Oficial: COMPETÊNCIA  |  Tenant: Arandu Indústria  |  Período Contábil: 🟢 Aberto                │
├───────────────────────────────────────────────────────┬───────────────┬───────────────┬─────────────────┤
│ CONTA / GRUPO CONTÁBIL                                │ VALOR (R$)    │ % REC. BRUTA  │ STATUS BASE     │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 1. RECEITA BRUTA DE VENDAS E SERVIÇOS                 │ R$ 850.000,00 │ 100,0%        │ 🟢 100% NF-e    │
│    1.1 Venda de Baterias Industriais (Manufatura)     │ R$ 520.000,00 │ 61,2%         │ [Ver 8 Notas]   │
│    1.2 Prestação de Serviços Técnicos Offshore        │ R$ 330.000,00 │ 38,8%         │ [Ver 3 NFS-e]   │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 2. (-) DEDUÇÕES DA RECEITA BRUTA                      │(R$ 114.750,00)│ -13,5%        │ 🟢 Destacado NF │
│    2.1 ICMS sobre Produtos                            │(R$  62.400,00)│  -7,3%        │                 │
│    2.2 PIS / COFINS sobre Faturamento                 │(R$  31.025,00)│  -3,7%        │                 │
│    2.3 ISS sobre Serviços Offshore                    │(R$  21.325,00)│  -2,5%        │                 │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 3. (=) RECEITA OPERACIONAL LÍQUIDA                    │ R$ 735.250,00 │  86,5%        │                 │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 4. (-) CUSTO DAS MERCADORIAS E SERVIÇOS (CMV/CSP)     │(R$ 312.400,00)│ -36,8%        │ 🟡 Parcial (*)  │
│    4.1 Custo Médio Ponderado das Células Consumidas   │(R$ 198.000,00)│ -23,3%        │ [12 OPs Fech.]  │
│    4.2 Diárias de Mão de Obra Técnica Offshore        │(R$ 114.400,00)│ -13,5%        │ [Apontamentos]  │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 5. (=) LUCRO BRUTO OPERACIONAL                        │ R$ 422.850,00 │  49,7%        │                 │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 6. (-) DESPESAS OPERACIONAIS GERAIS E ADM.            │(R$ 142.100,00)│ -16,7%        │ 🟢 100% Razão   │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 7. (=) EBITDA (LAJIDA)                                │ R$ 280.750,00 │  33,0%        │                 │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 8. (-) Depreciação e Amortização de Ativos            │ R$       0,00 │   0,0%        │ ⚠️ MÓDULO AUS. │
├───────────────────────────────────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ 9. (=) RESULTADO LÍQUIDO DO EXERCÍCIO                 │ R$ 280.750,00 │  33,0%        │ 🟡 PARCIAL      │
└───────────────────────────────────────────────────────┴───────────────┴───────────────┴─────────────────┘
(*) AVISO TRANSPARENTE: O Lucro Líquido está rotulado como PARCIAL porque o módulo de Ativo Imobilizado
    ainda não computou a cota de depreciação mensal das bancadas de teste e equipamentos oceanográficos.
```

### 1.3. Capacidades de Drill-Down na DRE
* Ao clicar na linha **4.1 (Custo Médio Ponderado das Células Consumidas)**, a DRE abre um drawer lateral exibindo as Ordens de Produção (OP) que consumiram os insumos no mês, com seus lotes e valores unitários médios ponderados.
* O usuário pode baixar o relatório com **fórmulas nativas do Excel**, garantindo que quem receber a planilha possa auditá-la fora do sistema.

---

## 2. Inspetor de Documentos Fiscais & Decodificador de Códigos

### 2.1. O Tratamento de Códigos como Regras de Decisão
Conforme definido nas decisões de arquitetura, um código fiscal (como CFOP ou CST) não é apenas um texto armazenado — ele **decide** a ação do sistema.

A interface exibe o **Inspetor Fiscal de NF-e**:
* O usuário seleciona qualquer NF-e (Emitida ou Recebida).
* A tela renderiza a grade de itens com o **Tradutor Semântico**:

| Item / Descrição | NCM | CFOP | CST | Impacto no Estoque | Impacto na DRE | Título Gerado |
|---|---|---|---|---|---|---|
| Célula LiFePO4 3.2V 100Ah | 8507.60.00 | **1102** | 000 | 🟢 **Entrada (+1)** no Almoxarifado | ⚪ Neutro (Vira Ativo/Estoque, não é despesa) | 🟢 Gera Duplicata a Pagar |
| Bateria Subsea (Remessa Reparo) | 8507.80.00 | **5915** | 041 | 🔴 **Saída (-1)** Física | ⚪ Neutro (Sem faturamento nem receita) | ⚪ Não gera cobrança |
| Manutenção Especializada | 0000.00.00 | **5933** | 000 | ⚪ Não afeta saldo físico | 🟢 Despesa Operacional de Serviço | 🟢 Gera Conta a Pagar |

* **Alerta de Inconsistência:** Se uma nota recebida traz um CFOP desconhecido ou divergente da operação real, o sistema destaca a linha em amarelo e abre o botão: `[Parametrizar Ação para o CFOP XXXX]`.

---

## 3. Gestão de Chão de Fábrica & Manufatura de Baterias

### 3.1. Estrutura de Produto (Bill of Materials - BOM)
* **Visualizador em Árvore Hierárquica:**
  * O usuário seleciona o Produto Acabado (ex: `Bateria Oceanográfica Subsea 48V 200Ah`).
  * A interface desenha a árvore de montagem com quantidades e custos médios atualizados:
    * `[PA] Bateria Subsea 48V` (Custo Total: R$ 42.800)
      * `├─ [MP] 16x Células de Lítio LiFePO4 100Ah` (Custo Médio: R$ 24.000)
      * `├─ [MP] 01x Sistema Gerenciador de Bateria (BMS Industrial)` (Custo Médio: R$ 6.500)
      * `├─ [MP] 01x Vaso de Pressão Estanque Submarino` (Custo Médio: R$ 9.800)
      * `└─ [MO] 18h Mão de Obra de Montagem e Solda Ponto` (Custo Médio: R$ 2.500)

### 3.2. Painel de Controle de Ordens de Produção (OP)
* **Ciclo de Vida Visual da OP:**
  `[Rascunho]` ➔ `[Insumos Reservados]` ➔ `[Em Montagem]` ➔ `[Em Teste de Carga/Bancada]` ➔ `[Finalizada / Estocada]`
* **Apontamento de Produção Rápido (Touch-Friendly para Fábrica):**
  * O operador lê o código de barras do lote de células de lítio com leitor ótico.
  * A tela confirma o consumo e baixa o estoque físico imediatamente, recalculando o custo médio ponderado móvel da fábrica.
  * Caso o teste de bancada aponte célula com capacidade abaixo de 95%, a interface permite o **descarte por não-conformidade com apontamento de perda técnica**, mantendo a DRE precisa.

---

## 4. Gestão de Estoque com Custo Médio Móvel & Rastreabilidade

### 4.1. Fim do "Estoque por Saldo Editável"
* Conforme definido no "Livro de Movimentos", o estoque nunca é um número em que alguém clica e digita o novo saldo.
* O saldo exibido na tela é a **soma matemática de todas as entradas e saídas imutáveis** registradas em `estoque_movimentos`.

### 4.2. Tela de Kardex Interativo por Produto
Ao clicar em qualquer SKU (ex: Célula de Lítio 18650):
* A tela exibe o histórico cronológico de cada movimento:
  1. Data e Hora.
  2. Tipo de Movimento (Entrada por NF-e de Compra, Saída para OP, Perda Técnica de Bancada, Devolução).
  3. Documento de Origem (link para a NF-e ou para o número da OP).
  4. Quantidade movimentada e Custo Unitário de Entrada.
  5. **Novo Custo Médio Ponderado Móvel recalculado.**
  6. Saldo Físico remanescente no almoxarifado após a transação.
