# 09 — Aplicação: DRE Didática, Razão Contábil & Auditoria de Números

> **Destinatário Principal:** Claude Code Opus (Backend & Database Architect) e Diego (Liderança do Produto)  
> **Autor:** Antigravity / Gemini (Frontend & UX Architect)  
> **Objetivo:** Projetar a experiência mais clara, didática e transparente possível para que qualquer gestor (mesmo sem formação em contabilidade) entenda perfeitamente cada linha da DRE, de onde o dinheiro veio, para onde foi, como foi calculada a margem e como auditar a veracidade dos lançamentos contábeis.

---

## 1. O Problema da DRE Tradicional na Experiência do Usuário

Demonstrações de Resultados contábeis convencionais são áridas e hostis:
* Textos como *"Custo dos Produtos Vendidos"*, *"Deduções da Receita Bruta"* ou *"Partidas Dobradas"* parecem jargões incompreensíveis para quem opera no chão de fábrica ou no comercial.
* O usuário olha um número consolidado (ex: *R$ 142.100 em Despesas Administrativas*) e **não sabe o que está dentro dele**, gerando insegurança e desconfiança.
* Falta de clareza temporal: o usuário não sabe se o valor reflete a data em que o serviço foi prestado (**Competência**) ou a data em que o dinheiro saiu do banco (**Caixa**).

---

## 2. A DRE Didática e Visual do Eco-Mitang

A nova interface da DRE é estruturada como uma **Cascata Financeira Intuitiva (Waterfall Flow)**, onde cada linha explica em linguagem humana o seu papel no resultado da holding:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE) — AGOSTO/2026                 [Alternar Comp./Caixa] [XLS]│
│ Entidade: Arandu Indústria  |  Período: 🟢 Aberto  |  Integridade: 🟢 Partidas Balanceadas (100%)       │
├───────────────────────────────────────────────────────┬──────────────┬───────────────┬─────────────────┤
│ CONCEITO / O QUE SIGNIFICA NA PRÁTICA                 │ VALOR (R$)   │ IMPACTO (%)   │ EXPLICAÇÃO & ID │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ 🟢 TUDO QUE A EMPRESA FATUROU (Receita Bruta)        │ R$ 850.000,00│ 100,0%        │ [?] [Ver 11 NF] │
│    • Baterias montadas e entregues aos clientes       │ R$ 520.000,00│  61,2%        │ [?] [8 NF-e]    │
│    • Serviços técnicos de operação offshore           │ R$ 330.000,00│  38,8%        │ [?] [3 NFS-e]   │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ 🔻 IMPOSTOS RETIRADOS NA EMISSÃO DA NOTA (Deduções)   │(R$ 114.750,00)│ -13,5%        │ [?] [Ver Guias] │
│    • ICMS, PIS, COFINS e ISS destacados nas faturas   │              │               │                 │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ 🟦 O QUE REALMENTE ENTROU NA EMPRESA (Receita Líquida)│ R$ 735.250,00│  86,5%        │ [?] [Fórmula =] │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ 🔻 O QUE GASTAMOS PARA PRODUZIR E PRESTAR (CMV / CSP) │(R$ 312.400,00)│ -36,8%        │ [?] [Ver OPs/MO]│
│    • Células de lítio consumidas nas baterias (Custo) │(R$ 198.000,00)│ -23,3%        │ [?] [12 OPs]    │
│    • Diárias pagas aos técnicos no mar (Mão de Obra)  │(R$ 114.400,00)│ -13,5%        │ [?] [Apontam.]  │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ 🟩 SOBRA DA PRODUÇÃO (Lucro Bruto Operacional)        │ R$ 422.850,00│  49,7%        │ [?] [Margem OK] │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ 🔻 PARA MANTER A EMPRESA FUNCIONANDO (Despesas Fixas) │(R$ 142.100,00)│ -16,7%        │ [?] [Ver Razão] │
│    • Salários adm, aluguel, luz, sistemas e escritório│              │               │                 │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ ⚡ O CAIXA OPERACIONAL GERADO NO MÊS (EBITDA / LAJIDA)│ R$ 280.750,00│  33,0%        │ [?] [Explicar]  │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ ⚠️ DESGASTE DE MÁQUINAS E EQUIPAMENTOS (Depreciação)  │      ——      │   0,0%        │ 🟡 MÓDULO PEND. │
├───────────────────────────────────────────────────────┼──────────────┼───────────────┼─────────────────┤
│ 🎯 RESULTADO LÍQUIDO FINAL (Lucro Líquido Real)       │      ——      │    ——         │ 🟡 NÃO APURÁVEL │
└───────────────────────────────────────────────────────┴──────────────┴───────────────┴─────────────────┘
(*) AVISO TRANSPARENTE: O Lucro Líquido exibe um traço (——) porque o valor NÃO É APURÁVEL HOJE.
    Falta o módulo de Ativo Imobilizado (depreciação de R$ 2,53 mi em equipamentos oceanográficos e bancadas)
    e a provisão de tributos sobre o lucro (IRPJ/CSLL). O EBITDA acima é o resultado operacional real apurável hoje.
```

---

## 3. A Jornada de UX Didática: Da DRE ao Lançamento de Origem

### 3.1. O Ícone de Ajuda Didática (`?`) em Cada Linha
Ao clicar em qualquer interrogação, a interface não apenas exibe uma definição teórica de dicionário contábil, mas sim uma **explicação operacional viva**:
> **Exemplo: Ao clicar no `?` de "Custo das Células de Lítio (R$ 198.000,00)":**  
> • **O que é isso?** É o valor real das matérias-primas que saíram do estoque para montar as baterias entregues em agosto.  
> • **Como o sistema calculou?** Pelo custo médio ponderado móvel de cada lote no momento em que a ordem de produção foi apontada.  
> • **Por que não é o valor das compras do mês?** Porque a empresa comprou R$ 450.000 em células em agosto, mas a maior parte ainda está guardada no almoxarifado como patrimônio (estoque). Considerar a compra inteira distorceria a margem real das baterias vendidas.

### 3.2. Drill-Down com Abertura em Gaveta Lateral (Audit Drawer)
Ao clicar no valor **R$ 142.100,00 (Despesas Fixas)**:
* A tela não muda de contexto nem recarrega.
* Uma gaveta desliza suavemente da direita com a **abertura analítica das contas do Razão**:
  1. *Energia Elétrica e Infraestrutura:* R$ 14.200,00 (3 faturas enel).
  2. *Sistemas e Softwares:* R$ 8.900,00 (NFS-e de tecnologia).
  3. *Honorários Contábeis e Advocatícios:* R$ 18.500,00.
  4. *Salários e Folha Administrativa:* R$ 100.500,00.
* Ao clicar na fatura de energia elétrica de R$ 14.200,00:
  * Abre-se o espelho da transação com seu lançamento de **partida dobrada**:
    * `DÉBITO: Conta 3.1.02.04 (Despesa com Energia Elétrica)`
    * `CRÉDITO: Conta 1.1.01.02 (Banco Itaú Conta 98663-4)`
  * Botão: **`[ Ver Comprovante Bancário Original / OFX ]`**.

### 3.3. O Indicador de Honestidade Contábil (Selo Parcial)
* O rodapé da DRE destaca expressamente:
  > ⚠️ **Transparência Contábil:** O valor de Lucro Líquido está classificado como **PARCIAL** porque as bancadas de montagem e equipamentos de teste oceanográfico não tiveram suas quotas de depreciação calculadas (módulo de Ativo Imobilizado em desenvolvimento).
* Isso impede que a diretoria distribua lucros baseada em um número incompleto, cumprindo o princípio da **recusa a estimativas fictícias**.

---

## 4. Perguntas Estruturadas para o Claude Code Opus (Backend & DB)

Para viabilizarmos essa DRE analítica sem travamentos de performance, Claude, precisamos alinhar os seguintes pontos técnicos:

1. **Performance na Construção da DRE via Razão Contábil:**
   * *Pergunta:* Como você estruturará a consulta da DRE? Uma query agregada sobre `lancamentos_partidas` cruzando com `plano_contas` e filtrando por `empresa_id` e `data_competencia`? Você recomenda criar uma **View Materializada** com atualização no fechamento do dia ou do lote, ou queries dinâmicas com índices compostos em `(empresa_id, data_competencia, conta_id)` atendem em sub-100ms?
2. **Separação Nativa entre Competência e Caixa:**
   * *Pergunta:* Como o frontend solicitará a alternância de regime? Teremos um único endpoint `/api/v1/contabilidade/dre?regime=COMPETENCIA` (que agrega por `data_competencia`) vs. `?regime=CAIXA` (que agrega por `data_caixa IS NOT NULL`)? Como você tratará lançamentos que ainda não têm `data_caixa` no relatório financeiro?
3. **Payload da Ficha de Proveniência:**
   * *Pergunta:* Você concorda em fornecer, dentro do payload da DRE, um campo `explicabilidade` ou `origem_resumo` contendo a contagem de documentos que formaram aquele nó (ex: `qtd_notas: 11`, `qtd_ops: 12`, `qtd_lancamentos: 48`) para que o frontend não precise fazer 10 requisições filhas apenas para mostrar o popover didático?
4. **Mecanismo de Fechamento de Período e Bloqueio de Retroativo:**
   * *Pergunta:* Qual é a sua proposta de trigger no PostgreSQL para impedir lançamentos com `data_competencia` em mês com status `FECHADO` na tabela `periodos_contabeis`? Uma trigger `BEFORE INSERT OR UPDATE` nas tabelas `lancamentos_contabeis` e `estoque_movimentos`?
