# 08 — Aplicação: Orçamentos & Propostas Comerciais de Baterias

> **Destinatário Principal:** Claude Code Opus (Backend & Database Architect) e Diego (Liderança do Produto)  
> **Autor:** Antigravity / Gemini (Frontend & UX Architect)  
> **Contexto:** Baseado no histórico consolidado de 218 propostas da holding Eco-Mitang (R$ 2,15 milhões aprovados), atendendo tanto a vendas rápidas de reposição quanto a licitações e contratos multinacionais de óleo e gás (Exail, Fugro, Petrobras, Modec).

---

## 1. Visão Geral da Experiência (UI & UX)

A elaboração de uma proposta comercial de baterias não pode ser um formulário monótono nem uma planilha solta que gera erros de cálculo ou concessão de descontos inadvertidos.

A interface foi concebida com **três objetivos primordiais**:
1. **Zero Fricção no Básico (Agilidade Máxima):** Montar uma cotação simples de reposição em menos de 2 minutos, com cálculo automático de impostos e condições bancárias pré-carregadas.
2. **Potência Máxima no Complexo (Governança e Rigor Técnico):** Construir uma proposta técnica multinacional de 7 páginas com escalonamento por volume (1 un, 25 un, 50 un), termos de garantia e conformidade de transporte de mercadorias perigosas (*Dangerous Goods*).
3. **Blindagem de Rentabilidade:** A interface avisa e bloqueia propostas com margem abaixo da política comercial antes que o PDF chegue ao cliente.

---

## 2. Layout do Construtor de Orçamentos (Quotation Studio)

A tela é dividida em um fluxo horizontal contínuo com pré-visualização em tempo real (*Split Screen* ou *Live PDF Preview*):

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [← Orçamentos] Nova Proposta Comercial  |  Ref: MB-2026/042  |  Status: 🟡 Rascunho    [Pré-visualizar] │
├───────────────────────────────────────────────────────┬────────────────────────────────────────────────┤
│ PAINEL DE CONFIGURAÇÃO E DADOS (ESQUERDA - 55%)       │ ESPELHO DA PROPOSTA EM TEMPO REAL (DIR. - 45%) │
├───────────────────────────────────────────────────────┤                                                │
│ 1. EMISSORA & TIPO DE PROPOSTA                        │ ┌────────────────────────────────────────────┐ │
│    Empresa Fornecedora:                               │ │ [LOGO MITANG]   PROPOSTA TÉCNICA MB-2026/42│ │
│    (o) Mitang Brasil Comércio  ( ) Arandu Comércio    │ │                                            │ │
│    Padrão de Documento:                               │ │ Cliente: Fugro Brasil Serviços Subsea      │ │
│    [ Modelo 1: Cotação Simples (1 Página) ]           │ │ CNPJ: 00.123.456/0001-89                   │ │
│    [ Modelo 2: Proposta Técnica Avançada (7 Págs) ]*  │ │ Contato: Eng. Marcos Pontes                │ │
│                                                       │ │                                            │ │
│ 2. DADOS DO CLIENTE & COMPRADOR                       │ │ ITENS:                                     │ │
│    CNPJ: [ 00.123.456/0001-89 ] 🔍 [Auto-Preenchido]   │ │ 001 | Bateria Subsea LiFePO4 48V 200Ah     │ │
│    Razão Social: Fugro Brasil Serviços Subsea LTDA    │ │       1 un: R$ 42.800,00 (Prazo: 5 dias)   │ │
│    Capital Social: R$ 12.500.000 (🟢 Baixo Risco)      │ │      25 un: R$ 38.520,00 (Prazo: 15 dias)  │ │
│    Prazo Sugerido: 30 DDL (Liberado para este porte)  │ │      50 un: R$ 36.380,00 (Prazo: 25 dias)  │ │
│                                                       │ │                                            │ │
│ 3. COMPOSIÇÃO DE ITENS & ESCALONAMENTO                │ │ Condições: 50% Sinal + 50% Coleta          │ │
│    [+ Adicionar Produto do Catálogo]                  │ │ Frete: FOB Rio de Janeiro / Validade: 30d  │ │
│    Item 1: Bateria Subsea LiFePO4 (SKU: 220010)       │ └────────────────────────────────────────────┘ │
│    • Margem Contribuição Base: 44,2% (🟢 Saudável)    │ [ ⬇ Baixar PDF ]  [ ✉️ Enviar para o Cliente ] │
│    • Escalonamento por Volume: [X] Ativo              │                                                │
│                                                       │ Resumo Financeiro:                             │
│ 4. CONDIÇÕES COMERCIAIS & FINANCEIRAS                 │ Valor Unitário Médio: R$ 38.520,00             │
│    Forma Pgto: [ 50% Aprovação + 50% Coleta ▾ ]       │ Margem Estimada: 41,8% (Líquida)               │
│    Validade: [ 30 dias ▾ ] | Frete: [ FOB Rio ▾ ]     │ Comissões / Impostos: R$ 4.237,20              │
└───────────────────────────────────────────────────────┴────────────────────────────────────────────────┘
```

---

## 3. Experiência de UX Passo a Passo

### Passo 1: Seleção da Entidade Emissora (Mitang vs. Arandu)
* **Comportamento Visual:** Dois cartões selecionáveis limpos no topo da tela com os logotipos e detalhes fiscais.
* Ao selecionar **Mitang Brasil**: O sistema preenche automaticamente os dados bancários do Itaú (Agência 2927 / Conta 98663-4), a chave PIX de Regina Fernandes e o e-mail comercial de Diego.
* Ao selecionar **Arandu**: Preenche a conta Itaú de Arandu (Agência 1155 / Conta 99507-7), a chave PIX do CNPJ e o e-mail de orçamentos do Arandu Group.
* *Benefício UX:* Impossibilita o erro comum de faturar com CNPJ de uma empresa e indicar dados bancários da outra.

### Passo 2: Busca e Enriquecimento do Cliente com Alerta de Crédito
* O vendedor digita o CNPJ do cliente.
* O frontend consulta a base e preenche Razão Social, IE, Endereço e Contato.
* **Inteligência de Risco Integrada:** A interface exibe um card sutil de saúde cadastral:
  * Se o cliente for novo ou tiver capital social modesto: O campo de pagamento força a condição padrão: `50% no pedido + 50% na coleta`.
  * Se for cliente recorrente ou multinacional homologada: A opção `Faturado a 30 DDL` é desbloqueada com um selo verde: *"Crédito Aprovado para Faturamento a Prazo"*.

### Passo 3: Adição de Itens com Escalonamento de Preço por Volume
* Ao escolher um pack de baterias (ex: *Pack Subsea Exail AQL38*):
  * O vendedor ativa a chave: `[ Escalonamento por Volume ]`.
  * A tela abre 3 faixas automáticas de quantidade:
    * **Faixa 1 (1 a 5 unidades):** Preço de lista cheio (Margem 45%) | Prazo: 3 a 5 dias úteis.
    * **Faixa 2 (6 a 25 unidades):** Desconto automático de 10% (Margem 38%) | Prazo: 10 a 15 dias úteis.
    * **Faixa 3 (26 a 50 unidades):** Desconto automático de 15% (Margem 32%) | Prazo: 20 a 25 dias úteis.
* Os prazos de fabricação se adaptam automaticamente baseando-se no tempo de solda e montagem cadastrado na engenharia da bateria.

### Passo 4: Trava de Proteção de Margem e Modal de Justificativa
* Se o vendedor aplicar manualmente um desconto global superior a **10%**:
  * A barra de margem fica âmbar ou vermelha.
  * O botão principal muda de *"Aprovar e Emitir PDF"* para **`[ Solicitar Alçada de Desconto ]`**.
  * Abre-se o modal de justificativa:
    > *"Você está concedendo 14% de desconto, o que reduz a margem para 30,8% (limite padrão: 35%)."*  
    > • Campo de Justificativa Obrigatória: (Ex: *"Contra-proposta da Fugro para fechar lote anual de 40 baterias"*).  
    > • Notificação enviada para Diego (Diretoria) com aprovação com 1 clique via celular/painel.

### Passo 5: Geração de Proposta Simples (1 Pág) ou Proposta Avançada (7 Págs)
* O usuário escolhe o formato com um clique:
  * **Modelo 1 Página:** Gera documento enxuto, direto ao ponto, com tabela de preços, condições e dados PIX/Boleto.
  * **Modelo 7 Páginas:** O sistema compila automaticamente: Capa com numeração de controle documental, Sumário, Apresentação Executiva sobre confiabilidade em baterias marítimas, Escopo Técnico com curvas de descarga e normas de transporte perigoso, Tabela Escalonada e Termo de Garantia de 6 meses com campo de aceite formal.

### Passo 6: Conversão com 1 Clique (O Fim da Digitação Dupla)
* Quando o cliente envia a Purchase Order (P.O.):
  * O usuário clica no botão: **`[ Converter Orçamento em Pedido de Venda ]`**.
  * O sistema congela os preços e custos daquele momento (**Snapshot Financeiro**).
  * O pedido gera automaticamente:
    1. A **Ordem de Serviço (OS)** para a engenharia/produção.
    2. A reserva de células de lítio no **Estoque**.
    3. O rascunho da **NF-e de Saída** com NCM e CFOP já parametrizados.

---

## 4. Perguntas Estruturadas para o Claude Code Opus (Backend & DB)

Para que possamos implementar essa experiência sem atritos, precisamos do seu parecer técnico, Claude:

1. **Snapshot de Preços e Custos na Conversão:**
   * *Pergunta:* Como você modelará o congelamento de custos no banco? Criaremos uma tabela `cotacoes_versoes_snapshot` com colunas imutáveis (`valor_unitario_congelado`, `custo_materia_prima_congelado`, `margem_congelada`), para garantir que mesmo que o custo do lítio dobre no mês seguinte, o histórico de rentabilidade do contrato original permaneça auditável e intacto?
2. **Máquina de Estados e Alçadas de Desconto:**
   * *Pergunta:* A máquina de estados genérica proposta no doc 02 (`workflows_instancias`) conseguirá gerenciar o gatilho de `desconto_global > 10%`? Como você sugere modelar o webhook/notificação para a liderança aprovar a concessão de desconto diretamente pela API?
3. **Escalonamento Multi-Faixa de Preços:**
   * *Pergunta:* Qual é a melhor estrutura para persistir os itens escalonados? Uma tabela `cotacao_itens_faixas` com `(item_id, quantidade_minima, quantidade_maxima, valor_unitario, prazo_dias_uteis)`? Isso atende tanto à Proposta Simples quanto à de 7 páginas?
4. **Enriquecimento Assíncrono de Crédito do Cliente:**
   * *Pergunta:* Você prefere que a consulta de situação cadastral e Capital Social do cliente seja síncrona ao digitar o CNPJ, ou um job em background que armazena em cache na tabela `clientes` com expiração de 30 dias para evitar rate-limits da Receita Federal?
