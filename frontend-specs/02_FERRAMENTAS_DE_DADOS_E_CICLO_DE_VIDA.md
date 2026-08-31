# 02 — Ferramentas de Dados, Manipulação & Ciclo de Vida

> **Destinatário:** Claude Code Opus (Backend & Database Architecture)
> **Autor:** Antigravity / Gemini (Frontend, UI & UX)
> **Finalidade:** Detalhar todas as ferramentas de interface que os usuários utilizarão no dia a dia para **adicionar, visualizar, editar, movimentar, reaproveitar, filtrar, agrupar, categorizar e auditar dados** em múltiplos formatos.

---

## 1. Ferramentas de Adição e Ingestão de Dados

A entrada de dados em um ERP corporativo é onde se originam 90% dos erros contábeis e fiscais. O frontend não permite ingestão cega.

### 1.1. Central de Ingestão de Lotes com Quarentena e Preview

* **Problema Resolvido:** Hoje, arquivos OFX e XMLs só podem ser ingeridos via terminal (`npm run db:reingest`), tornando o usuário dependente do desenvolvedor.
* **Componente de UI:**
  * Área de arrastar e soltar arquivos múltiplos (suporta simultaneamente OFX, XML NF-e modelo 55, NFS-e municipais, extratos de cartão de crédito).
  * **Etapa de Quarentena & Checagem Prévia:**
    1. O frontend gera e envia o hash SHA-256 de cada arquivo.
    2. O backend valida a idempotência antes do upload físico: se o hash já constar no banco, a interface exibe um selo `[JÁ IMPORTADO EM DD/MM/AAAA]` e bloqueia a duplicidade.
    3. O sistema abre uma **grade de pré-visualização (Preview Grid)**: lista os lançamentos identificados, total de créditos, total de débitos, fornecedores reconhecidos e notas já emitidas.
    4. O usuário confirma a ingestão. Se houver divergências, pode descartar o lote inteiro sem que nenhuma linha suje o banco principal.

### 1.2. Assistente Visual de Importação de Planilhas (Smart Column Mapper)

* **Problema Resolvido:** Muitas áreas operacionais possuem listas em Excel (previsão de compras, cadastros históricos de colaboradores, tabelas de diárias offshore) que precisam entrar no sistema sem criar scripts SQL sob medida.
* **Fluxo de Interface (Passo a Passo Guiado):**
  1. **Upload da Planilha (.xlsx, .csv):** A interface lê os cabeçalhos das colunas no cliente.
  2. **Mapeador Inteligente ("De-Para"):** A UI sugere correspondências automáticas baseadas em similaridade de texto:
     * Coluna do Excel *"CPF do Técnico"* ➔ Campo do Banco `colaboradores.cpf`.
     * Coluna do Excel *"Diária Contratada"* ➔ Campo do Banco `colaboradores_pj.valor_diaria`.
     * OBS (Diego Digitou isso a mão): Minha preocupação é que essa importação deve se adequar totalmente a necessidade do usuário, o sistema deve auxiliar o usuário a importar estes dados da forma correta para que o sistema consiga fazê-lo se adaptar ao sistema.
  3. **Relatório Visual de Rejeições e Validação Linha a Linha:**
     * Antes de salvar, o sistema roda os validadores (formato de CPF/CNPJ, checagem de vigência de datas, chaves estrangeiras inexistentes).
     * Linhas com erro aparecem em vermelho com tooltip de diagnóstico explicativo (ex: *"Linha 34: Data de admissão posterior à data de desligamento"*).
     * O usuário pode editar o valor incorreto diretamente na célula da tabela de validação e clicar em *"Reprocessar Linhas com Erro"*.

### 1.3. Enriquecimento Cadastral em Tempo Real (CNPJ Live Autofill)

* **Comportamento no Formulário:**
  * Ao preencher o campo `CNPJ` (em clientes, parceiros, fornecedores ou prestadores PJ), o frontend dispara a busca contra a cadeia de serviços integrados.
  * O formulário bloqueia micro-interações enquanto exibe uma barra de progresso suave (*"Consultando Receita Federal e bases fiscais..."*).
  * Preenchimento automático de: Razão Social, Nome Fantasia, CNAE Principal e Secundários, Quadro Societário (QSA), Capital Social, Natureza Jurídica, Situação Cadastral e Endereço Completo com código IBGE.
  * A interface adiciona um badge dinâmico: 🟢 `ATIVA` ou 🔴 `INAPTA / SUSPENSA` com link para a certidão correspondente.

---

## 2. Ferramentas de Visualização e Compreensão de Dados

Para interpretar o grande volume de transações industriais e financeiras, o sistema conta com ferramentas especializadas de exibição:

### 2.1. DataGrid Corporativo de Alta Performance (Virtual Scrolling)

* **Capacidades Operacionais:**
  * **Virtualização de Linhas:** Renderização fluida de 50.000+ linhas sem engasgos de memória no navegador.
  * **Fixação de Colunas (Freeze Columns):** Fixação de identificadores (Nome do Colaborador, Chave da NF-e, Conta Contábil) à esquerda, permitindo rolagem horizontal dos valores analíticos.
  * **Controle de Densidade:** Botão de alternância entre modo *Compacto* (para operadores financeiros analisando dezenas de transações por tela) e modo *Confortável* (com avatares, badges e tags de status).
  * **Cálculo Dinâmico no Rodapé:** Ao selecionar múltiplas células ou linhas (com `Shift` ou `Ctrl`), o rodapé exibe automaticamente: `Soma: R$ X`, `Média: R$ Y`, `Contagem: N linhas`.

### 2.2. Inspetor Dividido em Duas Abas (Split-Screen Document Inspector)

* **Aplicação Principal:** Módulos Fiscal e Financeiro.
* **Layout da Ferramenta:**
  * **Painel Esquerdo (50% da tela):** Exibição fiel do documento original — DANFE estilizada da NF-e gerada a partir do XML integral, ou espelho do extrato OFX original com marcadores bancários.
  * **Painel Direito (50% da tela):** Decisões e apropriações tomadas pelo sistema:
    * Itens individuais desmembrados com NCM, CFOP e CST.
    * Impostos calculados por item (ICMS, PIS, COFINS, IPI, ST).
    * Lançamentos contábeis correspondentes com partidas dobradas (Débito em Fornecedores, Crédito em Banco).
    * Título gerado em Contas a Pagar/Receber com data de vencimento.

### 2.3. Árvore Sanfonada do Plano de Contas e DRE

* **Comportamento da Interface:**
  * Exibição em cascata expansível (`[+] 1. ATIVO` ➔ `[+] 1.1 ATIVO CIRCULANTE` ➔ `1.1.01 DISPONIBILIDADES`).
  * Cada linha exibe o saldo de débito, crédito e saldo final, com um badge de consistência:
    * 🟢 Partida Balanceada (`Σ Débito = Σ Crédito`).
    * 🔴 Desbalanceamento detectado com link direto para os lançamentos causadores.

### 2.4. Decodificador Humano de Códigos Fiscais (Human Code Translator)

* **Objetivo:** Códigos como `CFOP 5915`, `CST 010` ou `CEST 01.001.00` são incompreensíveis para quem não é contador.
* **Solução de UX:** Ao passar o mouse sobre qualquer código fiscal em tabelas ou formulários, um popover contextual renderiza uma tradução prática em linguagem clara:
  * Exemplo para `CFOP 5915`:
    > **CFOP 5915 — Remessa de mercadoria ou bem para conserto ou reparo**
    > • **Impacto no Estoque:** Saída física do item (reduz saldo local).
    > • **Impacto na DRE:** Neutro (NÃO é faturamento / NÃO é despesa).
    > • **Títulos:** Não gera contas a receber.
    > • **Regra:** Exige retorno documentado (CFOP 1916) dentro do prazo regulamentar.
    >

---

## 3. Ferramentas de Edição, Manipulação e Ações em Massa

### 3.1. Estorno Assistido (A Fim do Botão "Deletar")

* O princípio *append-only* impõe que nada seja apagado. No lugar de uma lixeira genérica, o frontend adota o **Estorno Guiado**:
  * Ao clicar em "Estornar Transação" ou "Cancelar Documento", abre-se um modal obrigatório.
  * **Campos Obrigatórios:**
    * Motivo do Estorno (seleção de motivos padronizados + justificativa textual livre).
    * Data de Eficácia do Estorno (mantendo a separação entre competência e caixa).
  * A confirmação gera um lançamento inverso no Razão Contábil, marca o registro original como `ESTORNADO` e insere o evento com detalhes de IP e usuário em `auditoria_eventos`.

### 3.2. Aprendizado por Confirmação na Classificação de Transações

* **Problema:** A regex do backend classifica a maioria dos memos conhecidos, mas descrições novas caem em *"Outras Despesas Operacionais"*.
* **Interação no Frontend:**
  1. Quando o usuário clica em uma transação com memo desconhecido (ex: *"PIX PAG ELETRIC RECIFE"*) e a altera manualmente para *"Energia Elétrica / Infraestrutura"*;
  2. O frontend exibe uma caixa de confirmação inteligente:
     > *"Deseja criar uma regra automática para transações com a descrição contendo 'ELETRIC RECIFE' nesta conta bancária?"*
     >
  3. Ao confirmar, o frontend salva a regra em `regras_classificacao_ofx` vinculada ao CNPJ do tenant, garantindo que futuras importações façam a categorização de forma determinística e sem necessidade de inteligência artificial opaca.

### 3.3. Barra Flutuante de Ações em Massa (Batch Action Toolbar)

* Ao marcar a caixa de seleção de duas ou mais linhas de uma tabela:
  * Uma barra escura flutua na base da tela com o resumo: `[5 registros selecionados | Total: R$ 84.300,00]`.
  * **Ações Disponíveis:**
    * *Conciliar em Lote* (com validação prévia de soma).
    * *Aprovar Alçadas de Compra*.
    * *Exportar Seleção (.xlsx / .pdf)*.
    * *Reclassificar Centro de Custo*.

### 3.4. Staging de Alterações (Rascunho de Impacto)

* Para alterações estruturais (como edição de lista de materiais/BOM de baterias, alocação de equipe offshore para períodos de 28 dias ou reestruturação de contas):
  * A interface entra em modo de **Edição em Rascunho (Staging Mode)**.
  * As linhas alteradas ficam com borda amarela pulsante.
  * Um painel de impacto exibe antes da gravação:
    * *"Esta alteração recalculou o custo de 8 ordens de produção em andamento."*
    * *"A alteração gerou 1 impedimento de aptidão para o técnico Fábio no dia 12/09."*
  * O usuário revisa o impacto antes de clicar em *"Efetivar e Gravar Lote"*.

---

## 4. Ferramentas de Movimentação, Encadeamento e Reaproveitamento

### 4.1. Entity Breadcrumbs (A Linha da Vida do Negócio)

Todo registro no sistema faz parte de uma cadeia contínua de fatos operacionais. O topo da tela exibe um componente visual de encadeamento clicável:

```
[ Cotação #4401 ] ──▶ [ Pedido de Venda #102 ] ──▶ [ OS Offshore #88 ] ──▶ [ Alocação Pessoal ] ──▶ [ NF-e #5492 ] ──▶ [ Título a Receber ] ──▶ [ Transação Bancária ]
  (Comercial)           (Aprovado R$ 800k)           (Em Execução)           (4 Técnicos Aprov.)        (Emitida)              (Conciliado 100%)         (Extrato Itaú)
```

* Clicar em qualquer etapa transporta o usuário diretamente para o módulo correspondente, mantendo o filtro de contexto ativo.

### 4.2. Rastreabilidade Genealógica Reversa de Baterias (Lote & Série)

* **Contexto:** Baterias de lítio submarinas e hospitalares exigem rastreabilidade estrita para conformidade com a Marinha e responsabilidade civil em caso de falha.
* **Ferramenta de Interface:**
  * O usuário insere o Número de Série da Bateria (ex: `BAT-SUB-2026-0042`).
  * A tela renderiza uma árvore genealógica completa:
    * **Insumos Utilizados:** Lista de células de lítio consumidas com seu respectivo Lote de Compra e NF-e de entrada do fornecedor internacional.
    * **Mão de Obra e Apontamento:** Técnico que executou a montagem, data, estação de solda e testes de bancada aprovados.
    * **Destino Comercial:** Número da OS, Cliente, Embarcação/Navio de destino e data de embarque.
  * Permite a busca inversa (Recall Search): *"Qualquer bateria produzida com o lote de células X da fabricante CATL"*, gerando a lista imediata de todos os clientes que precisam ser notificados.

---

## 5. Ferramentas de Compartilhamento, Governança e Acesso JIT

### 5.1. Modal de Solicitação de Acesso Just-in-Time (JIT)

* Quando um operador comercial ou de compras necessita visualizar dados sensíveis protegidos por RLS (ex: custo real de fabricação de uma bateria ou margem de contribuição líquida):
  * Os campos aparecem mascarados com cadeado: `[•••••• Solicitado pelo Usuário]`.
  * Ao clicar no cadeado, abre-se o modal de solicitação:
    * Recurso pretendido: `catalogo.custo_producao`.
    * Escopo: Vinculado à Cotação Comercial `#4471` (escopo restrito aos itens da cotação).
    * Justificativa formal: *"Preciso validar margem mínima para negociação com cliente offshore"*.
    * Validade pretendida: `4 horas`.
  * O gestor responsável recebe notificação em tempo real na topbar e aprova com um clique.
  * O acesso é liberado no frontend com um cronômetro regressivo na tela. Ao expirar, a visualização volta a ser mascarada automaticamente.

### 5.2. Botão de "Quebra de Vidro" (Emergency Override)

* Aplicável a operações offshore em finais de semana ou madrugadas:
  * Se um técnico precisa ser substituído emergencialmente a bordo e há um impedimento burocrático contornável (ex: certificado emitido fisicamente mas não anexado formalmente ao sistema), o gestor de operações aciona o botão de emergência.
  * O modal exige a digitação da senha/MFA e justificativa circunstanciada.
  * O sistema efetiva a alocação, mas destaca o registro com tarja vermelha piscante e dispara alertas imediatos à Diretoria e ao setor de QSMS para ratificação obrigatória em até 24 horas.

---

## 6. Ferramentas Cotidianas de Organização e Produtividade

### 6.1. Construtor de Visões Personalizadas Salvas (Saved Views)

* Cada usuário ou departamento pode salvar combinações de colunas, ordenações e filtros:
  * Exemplo de Visão Salva pelo RH: *"Técnicos Offshore com Certificação Vencendo em < 45 dias"*.
  * Exemplo de Visão Salva pelo Financeiro: *"Contas a Pagar Desta Semana sem NF-e Anexada"*.
* As visões podem ser privadas ou compartilhadas com a organização.

### 6.2. Construtor Visual de Filtros Compostos No-Code

* Barra de filtros sem necessidade de conhecimento técnico:
  * `[Adicionar Filtro]` ➔ `[Campo]` `[Operador]` `[Valor]`.
  * Suporte a blocos lógicos `E` / `OU`:
    * Exemplo: *(Status = 'Apto' E Função = 'Técnico de Baterias') OU (Status = 'Em Folga' E Horas_Descanso > 48)*.
  * Suporte a filtros de datas dinâmicas: `Hoje`, `Ontem`, `Últimos 7 dias`, `Mês Atual`, `Próximos 30 dias`.

### 6.3. Agrupamento Dinâmico em Camadas (Multi-Level Grouping)

* O usuário pode arrastar qualquer cabeçalho de coluna para a barra de agrupamento:
  * Exemplo: Arrastar `[Empresa/Tenant]` ➔ depois `[Centro de Custo]` ➔ depois `[Fornecedor]`.
  * A tabela se transforma em árvore de acordes com subtotais calculados dinamicamente para cada nó e nível de agrupamento.
