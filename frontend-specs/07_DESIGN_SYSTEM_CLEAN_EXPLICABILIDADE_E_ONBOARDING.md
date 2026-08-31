# 07 — Design System Clean, Explicabilidade dos Dados & Onboarding Sem Sobrecarga

> **Destinatário:** Diego (Liderança do Produto), Claude Code Opus (Backend & DB Architect) e Antigravity (Frontend & UX)  
> **Inspiração e Referência:** Filosofia de Design da **Google** (Material 3 / Google Workspace / Google Cloud Console) e **Apple** (Human Interface Guidelines / macOS & iOS).  
> **Objetivo:** Eliminar poluição visual, enfeites desnecessários e labirintos de informação. Transformar o Eco-Mitang em um sistema elegante, límpido, intuitivo para qualquer colaborador, autoexplicativo em cada botão e com **100% de explicabilidade em gráficos e números**.

---

## 1. O Diagnóstico: Por que Sistemas ERP Enfeitados Fracassam?

Quando adicionamos muitas funcionalidades sem disciplina visual, o sistema se torna um "painel de avião dos anos 70":
* Centenas de botões coloridos brigando pela atenção do usuário.
* Gradientes chamativos, bordas luminosas e cards sem respiro visual geram cansaço mental imediato.
* O usuário abre uma tela nova e **fica paralisado, sem saber por onde começar**.
* Gráficos exibem números bonitos, mas ninguém sabe de onde vieram, qual cálculo gerou o resultado ou se a informação é confiável.

### A Lição da Apple e da Google
A Apple e a Google administram ecossistemas absurdamente complexos (bilhões de linhas de código, faturamento trilionário, operações globais). Como elas evitam que o usuário se perca?
1. **Espaço Negativo (White Space / Respiro):** O espaço vazio não é "desperdício de tela"; é o que permite ao olho humano focar no que realmente importa.
2. **Cores Funcionais (Não Decorativas):** O cinza e o branco predominam. A cor só entra em cena para sinalizar status ou chamar atenção para a **única** ação prioritária da tela.
3. **Tipografia que Fala por Si:** Hierarquia clara com tamanhos e pesos sutis, em vez de molduras e caixas berrantes.
4. **Autoexplicação Ubíqua e Discreta:** Cada elemento complexo tem uma interrogação (`?`) ou dica sutil que ensina o usuário sem tratá-lo com condescendência.
5. **Explicabilidade Aberta dos Dados (Explainable UI):** Nenhum gráfico é um mistério fechado; com um clique, ele revela sua fórmula, suas fontes e sua prova documental.

---

## 2. A Filosofia Estética "Clean & Purposeful" do Eco-Mitang

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ARQUETIPO VISUAL APPLE / GOOGLE WORKSPACE                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Fundo Neutro: Superfície limpa (#F8F9FA no modo claro / #0F1115 no modo escuro).         │
│ • Tipografia: Fonte límpida de alta legibilidade (Inter ou SF Pro Display / Roboto).        │
│ • Sombras Quase Invisíveis: Elevação suave de 1px a 4px, sem contornos pesados.            │
│ • Uma Única Cor de Ação Primária: Azul profissional contido (#1A73E8 ou #0071E3).           │
│ • Cores Semânticas Restritas:                                                               │
│   🟢 Verde Suave (#0D8A4E / #E6F4EA): Auditado / Validado / Em conformidade                │
│   🟡 Âmbar Discreto (#B06000 / #FEF7E0): Pendência / Em andamento                           │
│   🔴 Vermelho Contido (#C5221F / #FCE8E6): Bloqueio rígido / Inconsistência                 │
│   ⚪ Cinza Neutro (#5F6368 / #F1F3F4): Dados neutros, apoios, divisões sutis                │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Regras Mandatórias de Higiene Visual
1. **Proibido o uso de enfeites cosméticos:** Sem fundos com gradientes roxos/neon, sem efeitos de reflexo exagerados, sem cards flutuantes com brilhos que não agreguem significado operacional.
2. **Proibido mais de 1 botão primário por viewport:** Se a tela tem 5 botões, 1 é o botão sólido de ação principal (o próximo passo do trabalho); os outros 4 são botões de contorno suave (*outline*) ou links em texto neutro.
3. **Labels e Valores Alinhados:** Valores numéricos financeiros sempre alinhados à direita com tipografia tabular (onde os dígitos 0 a 9 têm a mesma largura, alinhando centavos perfeitamente).

---

## 3. O Sistema de Ajuda Ubíqua ("?" por Todos os Cantos)

Para que qualquer usuário novato ou operador saiba exatamente o que cada campo, tabela ou botão faz sem precisar consultar um manual externo, o sistema adota **4 Níveis de Ajuda Integrada**:

```
[ Nome da Métrica / Rótulo do Botão ] ──▶ [ ? ] (Ícone cinza sutil ao lado)
                                            │
   ┌────────────────────────────────────────┴────────────────────────────────────────┐
   │ HOVER (NÍVEL 1): Micro-Tooltip de 1 Frase                                       │
   │ "EBITDA: Lucro antes de juros, impostos, depreciação e amortização."             │
   ├─────────────────────────────────────────────────────────────────────────────────┤
   │ CLIQUE NO '?' (NÍVEL 2): Popover Didático Rico                                  │
   │ • O que é: Mede a geração operacional de caixa puramente pelo negócio.          │
   │ • Como o sistema calcula: Receita Líquida - CMV - Despesas Operacionais.        │
   │ • O que este número NÃO inclui: Tributos sobre lucro (IRPJ/CSLL) e empréstimos. │
   │ • Link: [Ver Lançamentos do Razão que compõem este número ↗]                   │
   └─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Ícones de Ajuda Sutis (`?`) Padronizados
* Ao lado de cada termo técnico (*EBITDA*, *CMV*, *CFOP 5915*, *CST 010*, *ASO*, *HUET/CBSP*, *Runway*, *Partida Dobrada*), existe um pequeno ícone `?` em cinza claro discreto.
* Ele não polui a tela porque sua cor se funde suavemente ao fundo até que o mouse passe por perto.

### 3.2. Botões com Verbos Claros e Micro-Copy de Efeito
* **Erro Comum:** Botões com textos vagos como *"Executar"*, *"Processar"*, *"Salvar"*, *"OK"*.
* **Padrão Apple/Google no Eco-Mitang:**
  * O botão sempre descreve a ação precisa:
    * Em vez de *"OK"*, usamos: **`[Conciliar 3 Transações com Duplicatas]`**.
    * Em vez de *"Enviar"*, usamos: **`[Autorizar Alocação de Embarque]`**.
    * Em vez de *"Salvar"*, usamos: **`[Efetivar Lançamento no Razão]`**.
  * **Micro-Copy Explicativa Abaixo do Botão:** Logo abaixo do botão principal, uma linha sutil em tipografia pequena (11px) informa a consequência direta do clique:
    > *ℹ️ "Ao confirmar, 3 duplicatas a pagar serão baixadas e um lançamento de partida dobrada será gerado no Caixa."*

---

## 4. Explicabilidade Total de Gráficos e Indicadores (Explainable Data)

Você levantou a exigência mais importante para a liderança e auditoria:
> *"Ao olhar um gráfico, o usuário deve entender de onde os dados vieram, o que compõe estes dados, qual é a lógica usada pra chegar naquele resultado, o que significa este resultado e como verificar a veracidade."*

Para atender a isso, **todo KPI, gráfico e card analítico** no Eco-Mitang possui um gatilho de inspeção: o botão discreto **`[ Como este número foi calculado? ]`** ou o ícone `[ ℹ️ Origem e Lógica ]`.

Ao clicar, abre-se a **Ficha de Proveniência do Dado (Data Lineage & Logic Card)** dividida em 5 blocos transparentes:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FICHA DE PROVENIÊNCIA E LÓGICA DO DADO — EBITDA: R$ 280.750,00 (AGOSTO/2026)                        │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. O QUE SIGNIFICA ESTE RESULTADO? (Interpretação Gerencial)                                        │
│ Representa o resultado financeiro gerado puramente pela atividade operacional da holding (venda de   │
│ baterias e serviços offshore), antes de descontar impostos sobre o lucro e custos financeiros.      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. QUAL FOI A LÓGICA E A FÓRMULA UTILIZADA?                                                         │
│   EBITDA = Receita Operacional Líquida (R$ 735.250,00)                                              │
│          - Custo dos Produtos e Serviços / CMV (R$ 312.400,00)                                       │
│          - Despesas Operacionais Gerais (R$ 142.100,00)                                             │
│          = R$ 280.750,00 (Margem EBITDA: 33,0% sobre a receita bruta)                               │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. O QUE COMPÕE ESTE NÚMERO? (Decomposição Analítica)                                               │
│ • [+] R$ 850.000,00 em 11 Notas Fiscais Emitidas (8 NF-e de Baterias + 3 NFS-e Offshore)            │
│ • [-] R$ 114.750,00 em Deduções Tributárias destacadas nas próprias notas (ICMS, PIS, COFINS, ISS)  │
│ • [-] R$ 198.000,00 em Consumo Físico de Células de Lítio (12 Ordens de Produção finalizadas)      │
│ • [-] R$ 114.400,00 em Diárias Técnicas Offshore apontadas em 4 Embarques regulamentares            │
│ • [-] R$ 142.100,00 em Despesas Administrativas registradas em partidas dobradas no Razão           │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. DE ONDE ESSES DADOS VIERAM? (Rastreabilidade das Fontes Brutas)                                  │
│ • 11 Arquivos XML de NF-e autorizados na SEFAZ (com hash SHA-256 e chaves de 44 dígitos).          │
│ • 2 Arquivos OFX de Extrato Bancário (Itaú e Bradesco) conciliados no mês.                         │
│ • 12 Ordens de Produção com lotes apontados no almoxarifado de baterias.                            │
│ • 14 Contratos e NFS-e de prestadores PJ auditados pelo RH.                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. PROVA DE VERACIDADE E AUDITORIA (Como saber que não é falso?)                                    │
│ • Status do Período Contábil: 🟢 ABERTO — Verificado contra razão contábil.                         │
│ • Integridade das Partidas: 🟢 Balanceadas (Σ Débitos R$ 2.450.120 = Σ Créditos R$ 2.450.120).     │
│ • Aviso de Transparência: 🟡 CMV calculado com base nas compras e OPs; módulo de depreciação ainda  │
│   não incorporado (lucro líquido parcial).                                                          │
│ ─────────────────────────────────────────────────────────────────────────────────────────────────── │
│ [ ↗ Ver Lançamentos no Razão ]   [ ⬇ Exportar Relatório com Memória de Cálculo em Excel ]           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Arquitetura de Onboarding: Como o Usuário Sabe por Onde Começar?

O maior medo de quem opera um sistema complexo é abrir a tela e pensar: *"E agora? O que eu faço primeiro?"*.

Para resolver isso, o Eco-Mitang adota **dois mecanismos de navegação assistida inspirados no Google Workspace e Linear**:

### 5.1. Barra de Fluxo Guiado Mensal (The Monthly Workflow Stepper)
No topo de cada grande área (Controladoria, Operações Offshore, Ingestão Fiscal), a tela apresenta uma barra horizontal minimalista com o **Caminho das Pedras**:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ FLUXO DO MÊS DE AGOSTO/2026 — ETAPA 2 DE 4: CONCILIAÇÃO PENDENTE                                      │
├───────────────────┬───────────────────────────┬───────────────────────────┬───────────────────────────┤
│ 🟢 1. Ingestão    │ 🟡 2. Conciliação Tripla  │ ⚪ 3. Conferência Balancete│ 🔒 4. Fechamento Período  │
│ 28 XMLs e 2 OFX   │ Faltam 3 transações a     │ Comparar com o contador   │ Bloquear lançamentos      │
│ ingeridos sem erro│ conciliar com notas fiscais│ Aguarda conciliação       │ Aguarda etapa 3           │
│ [Ver Lote]        │ [👉 Iniciar Agora]        │ [Ver Modelo]              │ [Bloqueado]               │
└───────────────────┴───────────────────────────┴───────────────────────────┴───────────────────────────┘
```
* **Efeito no Usuário:** Não há dúvida sobre o que fazer. A etapa ativa fica com fundo sutil destacado e traz um botão claro: `[👉 Iniciar Agora]`. As etapas futuras ficam em cinza neutro com explicação do porquê estão aguardando.

### 5.2. Estados Vazios com Guia de Primeiros Passos (Actionable Empty States)
Quando uma tela estiver vazia (ex: o usuário entrou no módulo de compras pela primeira vez no mês):
* **O que NÃO fazer:** Exibir uma tabela cinza vazia com *"Nenhum registro encontrado"*.
* **O que o Eco-Mitang faz:** Exibe uma ilustração límpida acompanhada de um passo a passo curto:
  > **Nenhum Pedido de Compra Registrado em Setembro/2026**  
  > Para iniciar o fluxo de compras e garantir alçadas de aprovação:  
  > 1. Clique em **`[+ Nova Requisição de Insumos]`** para apontar as células de lítio ou insumos necessários.  
  > 2. Anexe pelo menos 3 cotações de fornecedores homologados para atender à governança.  
  > 3. O sistema encaminhará automaticamente para a alçada de aprovação da diretoria.  
  > `[ + Iniciar Primeira Requisição ]`

---

## 6. O Contrato para o Backend Alimentar a Explicabilidade dos Dados

Para que o frontend possa renderizar a **Ficha de Proveniência** e os popovers didáticos sem gerar lentidão, o backend do Claude Code Opus precisa fornecer um objeto padronizado de metadados em endpoints de agregação.

### Padrão de Payload Enriquecido com Explicabilidade (Exemplo: DRE ou Gráfico)
```json
{
  "metrica": "EBITDA",
  "valor": 280750.00,
  "unidade": "BRL",
  "periodo": "2026-08",
  "regime": "COMPETENCIA",
  "explicabilidade": {
    "definicao": "Geração operacional de caixa da holding antes de impostos sobre o lucro e custos financeiros.",
    "formula_texto": "Receita Líquida (R$ 735.250) - CMV (R$ 312.400) - Despesas Operacionais (R$ 142.100)",
    "variaveis": {
      "receita_liquida": 735250.00,
      "cmv": 312400.00,
      "despesas_operacionais": 142100.00
    },
    "fontes": [
      { "tipo": "NFE_SAIDA", "quantidade": 11, "total": 850000.00, "hash_lote": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
      { "tipo": "ORDENS_PRODUCAO", "quantidade": 12, "total": 198000.00 },
      { "tipo": "LANCAMENTOS_RAZAO", "quantidade": 48, "total": 142100.00 }
    ],
    "grau_confianca": "AUDITADO_PARTIDAS_BALANCEADAS",
    "avisos_transparencia": [
      "CMV calculado por custo médio de insumos consumidos nas OPs do mês.",
      "Não inclui cota de depreciação do ativo imobilizado (módulo em implementação)."
    ],
    "drill_down_url": "/api/v1/contabilidade/razao?grupo=EBITDA&periodo=2026-08"
  }
}
```

---

## 7. Síntese Visual: Menos É Mais, Porém com Explicação Infinita

Com essa diretriz, o Eco-Mitang atinge o equilíbrio perfeito que você buscou nas referências da Apple e da Google:
1. **Visualmente:** A tela é limpa, tranquila, arejada, sem caixas coloridas desnecessárias e sem poluição. Apenas dados essenciais e um caminho claro a seguir.
2. **Funcionalmente:** Nenhuma dúvida fica sem resposta. Cada botão diz exatamente o que faz e avisa sua consequência; cada termo técnico tem um `?` explicando seu significado; e cada número pode ter sua fórmula, fontes e notas fiscais abertas em segundos.
