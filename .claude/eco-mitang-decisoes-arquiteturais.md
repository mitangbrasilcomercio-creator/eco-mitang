# Eco-Mitang — Decisões Arquiteturais

**Documento 2 de 2.** Complementa o diagnóstico técnico.
**Contexto:** sistema como cérebro operacional da holding, multi-setorial, com auditoria total, autonomia fiscal e controle de aptidão de pessoal.

---

## 1. As três decisões — respondidas

### Decisão 1: Competência ou caixa? → **Competência como regime oficial, caixa derivado do mesmo lançamento**

A pergunta tem uma resposta melhor que "escolher um": **registrar as duas datas em todo lançamento** e deixar o relatório escolher qual eixo usar.

```sql
lancamentos_contabeis (
  id, empresa_id,
  data_competencia  DATE NOT NULL,   -- quando o fato gerou direito/obrigação
  data_caixa        DATE,            -- quando o dinheiro efetivamente moveu (NULL = ainda não moveu)
  ...
)
```

Com isso:

- **DRE** lê `data_competencia` → mostra o resultado econômico do mês.
- **Fluxo de caixa** lê `data_caixa` → mostra o dinheiro real.
- **A diferença entre os dois é o capital de giro** — e passa a ser mensurável, não um mistério.
- **`data_caixa IS NULL`** é a definição de contas a receber/pagar em aberto. Você não precisa de duas tabelas paralelas; é o mesmo lançamento em estado diferente.

**Por que competência é o regime oficial e não o contrário:** seu negócio tem ciclo longo (cotação → projeto offshore → execução → faturamento → recebimento pode levar meses). Em regime de caixa, um projeto de R$ 800 mil executado em março e recebido em junho faz março parecer catastrófico e junho excepcional. Nenhuma decisão gerencial boa sai disso. Competência mostra o mês em que a empresa realmente produziu resultado.

E o inverso não funciona: **de competência você deriva caixa; de caixa você não deriva competência**, porque a informação de quando o fato ocorreu foi perdida.

**Consequência prática:** toda tela do sistema precisa dizer, de forma visível, qual eixo está usando. Confundir os dois é a origem da maior parte das discussões inúteis em reunião de fechamento.

---

### Decisão 2: Fiscal próprio ou integrado? → **Você está certo, com uma fronteira precisa**

Sua intuição está correta e vou defendê-la — mas ela precisa de uma linha bem desenhada, porque "fiscal" são quatro coisas diferentes com riscos completamente diferentes.

| Camada | Recomendação | Motivo |
|---|---|---|
| **1. Emissão** de NF-e / NFS-e | **Terceirizar** (como você já decidiu) | Exige certificado A1/A3 gerenciado, homologação SEFAZ, contingência (EPEC/FS-DA), acompanhar mudanças de layout, SLA de disponibilidade. É infraestrutura, não inteligência. Zero valor competitivo em construir. |
| **2. Leitura e interpretação** do XML | **Construir — e a fundo** | **É aqui que está todo o valor.** É o que transforma documento fiscal em inteligência de negócio. Nenhum fornecedor vai fazer isso do jeito que a sua operação precisa. |
| **3. Apuração** tributária (ICMS/PIS/COFINS/ISS/IRPJ) | **Construir com trava de conferência** | Viável, mas com a arquitetura da seção 3.3 — regras versionadas + reconciliação obrigatória contra o contador. |
| **4. Transmissão** de obrigações (SPED, EFD, DCTF, eSocial, Reinf) | **Terceirizar ou deixar com a contabilidade** | Layout muda todo ano, validador é rígido, erro gera multa e retificação. Custo altíssimo de manutenção, valor gerencial zero — ninguém toma decisão olhando SPED. |

**A distinção que importa:** terceirizar *transporte* de dado (emissão, transmissão) é diferente de terceirizar *entendimento* de dado (leitura, análise, decisão). Você quer autonomia sobre o segundo — e é exatamente o que dá vantagem. O primeiro é encanamento regulatório: quem opera não ganha nada, quem erra perde.

Detalhe importante: **mesmo terceirizando a emissão, o XML é seu.** Ele é arquivado no seu banco, íntegro, e toda a inteligência roda em cima dele. Você não fica refém — se trocar de emissor amanhã, sua base de conhecimento permanece intacta. Essa é a arquitetura certa.

**Uma capacidade que vale considerar:** com um certificado digital A1 próprio, dá para consultar a **Distribuição de DF-e** na SEFAZ e baixar automaticamente toda NF-e emitida *contra* o seu CNPJ, mesmo as que o fornecedor não te enviou. Isso elimina a dependência de alguém lembrar de mandar o XML — o sistema busca sozinho. É autonomia real, e o certificado fica com você.

---

### Decisão 3: Partida dobrada? → **Sim, e no seu caso ela é obrigatória**

Antes das suas últimas mensagens eu diria "sim, fortemente recomendado". Agora é categórico, por um motivo específico:

**Você pediu auditoria total.** Partida dobrada *é* o mecanismo de auditoria aplicado a dinheiro. A equação débito = crédito é uma verificação de consistência que roda em cima de **todo** valor do sistema, o tempo todo. Sem ela, você teria auditoria completa das ações dos usuários e nenhuma verificação sobre os números que essas ações produzem — auditaria o gesto e não o resultado.

Ela também é o que torna possível o fechamento mensal que você descreveu. Uma apresentação de fechamento confiável precisa que os números tenham três propriedades: **fecham entre si**, **rastreiam até a origem** e **não mudam depois**. Partida dobrada + período fechado entrega as três. `SUM` com `WHERE` categoria não entrega nenhuma.

Custo honesto: é a mudança mais cara do roadmap, cerca de 3-4 semanas de trabalho concentrado. Mas é a única que, se ficar para depois, obriga a reescrever tudo que for construído em cima. Todo módulo novo (RH, estoque, compras) vai gerar valor financeiro — e cada um deles feito antes da partida dobrada é um módulo que precisará ser refeito.

**Faça primeiro. É a decisão de sequenciamento mais importante do projeto.**

---

## 2. A espinha dorsal: três livros imutáveis

Sua descrição — "tudo tem início, meio e fim, e deve ser registrado" — descreve uma arquitetura específica: **append-only**. Nada é sobrescrito, nada é apagado; correção é um novo registro que referencia o anterior.

O sistema inteiro se organiza em três livros com essa propriedade:

| Livro | Registra | Invariante |
|---|---|---|
| **Contábil** (`lancamentos_contabeis` + `partidas`) | Todo movimento de valor | Σ débitos = Σ créditos, por lançamento |
| **Auditoria** (`auditoria_eventos`) | Toda ação de todo usuário | Nenhuma mutação sem evento correspondente |
| **Movimento** (`estoque_movimentos`, `alocacoes`, `embarques`) | Todo movimento físico de coisa ou pessoa | Saldo = soma dos movimentos, nunca campo editável |

Tudo o mais no sistema — telas, relatórios, dashboards, saldos — é **projeção** desses três livros. Um saldo nunca é um número guardado que alguém atualiza; é sempre uma soma dos movimentos, ou um snapshot com carimbo de quando foi calculado e a partir de qual movimento.

Essa é a propriedade que efetivamente entrega o que você chamou de "à prova de falhas". Não porque impede erro — impedir erro humano é impossível — mas porque torna **erro silencioso impossível**. Todo erro deixa rastro, todo número tem procedência, toda divergência aparece na conferência em vez de se dissolver na média. É a diferença entre um sistema confiável e um sistema que parece confiável.

---

## 3. Motor fiscal: da estrutura ao significado

Seu ponto central: *"basta entender a estrutura de dados dentro do documento, e se houverem códigos, devemos saber o que cada código representa"*. Exato. Vou detalhar como isso vira arquitetura.

### 3.1 Três camadas de armazenamento do XML

```
documentos_fiscais_xml     -- XML bruto, íntegro, imutável, com hash SHA-256
  ↓ parser
documentos_fiscais         -- modelo normalizado (cabeçalho, participantes, totais)
documentos_fiscais_itens   -- um registro por item, com todos os campos e códigos
documentos_fiscais_impostos-- imposto por item, por tributo (ICMS, IPI, PIS, COFINS, ST, FCP...)
documentos_fiscais_duplicatas -- parcelas de cobrança
  ↓ regras de contabilização
lancamentos_contabeis + estoque_movimentos + titulos
```

**O XML bruto nunca é descartado.** Se amanhã você descobrir um campo que precisa e não extraiu, reprocessa a base inteira sem pedir nada a ninguém. Essa é a garantia concreta de autonomia sobre os próprios dados — e o motivo de o hash importar: você consegue provar que o arquivo não foi alterado desde a emissão.

### 3.2 O que extrair de uma NF-e (modelo 55, layout 4.00)

O XML tem muito mais do que valor total. Mapa dos blocos que interessam:

| Bloco | Conteúdo | Uso no sistema |
|---|---|---|
| `ide` | `natOp`, `mod`, `serie`, `nNF`, `dhEmi`, `dhSaiEnt`, `tpNF` (0=entrada, 1=saída), `finNFe` (1=normal, 2=complementar, 3=ajuste, 4=devolução), `idDest`, `indPres` | Direção, natureza e finalidade da operação |
| `emit` / `dest` | CNPJ/CPF, IE, razão social, endereço completo, CRT (regime tributário) | Identificação das partes e enriquecimento cadastral |
| `det/prod` | `cProd`, `cEAN`, `xProd`, **`NCM`**, **`CEST`**, **`CFOP`**, `uCom`, `qCom`, `vUnCom`, `vProd`, `vFrete`, `vSeg`, `vDesc`, `vOutro`, `indTot` | Item, classificação fiscal e composição de custo |
| `det/prod/DI` | Declaração de importação, adição, país de origem | **Rastreio de origem internacional** |
| `det/imposto` | ICMS (`orig`, `CST`/`CSOSN`, `vBC`, `pICMS`, `vICMS`, `vICMSST`, `vFCP`), IPI, PIS, COFINS, II | **Imposto por item** — o que você pediu |
| `total/ICMSTot` | Totalizadores | Conferência: soma dos itens deve bater com o total |
| `cobr/dup` | Duplicatas: número, vencimento, valor | **Gera contas a pagar/receber automaticamente** |
| `transp` | Transportadora, volumes, peso, modalidade do frete | Custo logístico e rastreio |
| `infAdic` | Informações complementares (texto livre) | Frequentemente traz nº do pedido, OS, contrato |
| `protNFe` | Chave de acesso (44 dígitos), protocolo, data de autorização | Identidade única e prova de autorização |

Nota sobre eventos: **autorização não é o fim da vida de uma nota.** Cancelamento, carta de correção e manifestação do destinatário chegam depois, como eventos separados. O sistema precisa de uma tabela `documentos_fiscais_eventos` — senão uma nota cancelada continua contando na sua receita indefinidamente.

### 3.3 Tabelas de código como **tabelas de decisão** — a ideia central

Aqui está a virada de chave. CFOP não deve ser uma string guardada no item. Deve ser uma linha em uma tabela que **decide o que o sistema faz**:

```sql
cfop_referencia (
  codigo          CHAR(4) PRIMARY KEY,      -- '1102'
  descricao       TEXT,
  -- Estrutura embutida no próprio código:
  direcao         TEXT,   -- ENTRADA (1,2,3) | SAIDA (5,6,7)
  abrangencia     TEXT,   -- ESTADUAL (1,5) | INTERESTADUAL (2,6) | EXTERIOR (3,7)
  -- Semântica da operação:
  natureza        TEXT,   -- COMPRA | VENDA | DEVOLUCAO | REMESSA | RETORNO |
                          -- TRANSFERENCIA | INDUSTRIALIZACAO | CONSERTO |
                          -- COMODATO | BONIFICACAO | AMOSTRA | ATIVO_IMOBILIZADO
  -- O que o sistema deve FAZER ao encontrar este CFOP:
  gera_estoque         BOOLEAN,   -- movimenta saldo físico?
  sinal_estoque        SMALLINT,  -- +1 entrada, -1 saída, 0 neutro
  gera_resultado       BOOLEAN,   -- entra na DRE? (remessa/retorno: NÃO)
  gera_titulo          BOOLEAN,   -- gera contas a pagar/receber?
  conta_debito_padrao  TEXT,      -- regra de contabilização
  conta_credito_padrao TEXT,
  vigencia_inicio DATE, vigencia_fim DATE
)
```

**Por que isso muda tudo:** uma remessa para conserto (CFOP 5915) e uma venda (5102) são ambas "saída de mercadoria". Se o sistema tratar as duas igual, sua receita fica inflada e seu estoque fica errado. Com a tabela de decisão, o sistema **sabe** que 5915 tira do estoque mas não gera receita nem título — e o retorno (1916) devolve. Sem ela, alguém precisa lembrar disso manualmente todo mês. É precisamente o tipo de erro que some numa planilha e aparece na auditoria.

E quando surgir um CFOP novo, você adiciona **uma linha** — não altera código, não faz deploy.

**Mesma lógica para as demais tabelas:**

| Tabela | Chave | O que decide |
|---|---|---|
| `ncm_referencia` | NCM (8 díg.) | Alíquota de II/IPI, se tem ST, descrição oficial |
| `cest_referencia` | CEST + NCM | Se o item está sujeito a substituição tributária |
| `cfop_referencia` | CFOP | Estoque, resultado, título, contabilização *(acima)* |
| `cst_icms_referencia` | CST/CSOSN | Tributado, isento, ST, diferido, suspenso |
| `origem_mercadoria` | 0–8 | **Nacional / importado direto / importado mercado interno / conteúdo de importação** |
| `cnae_referencia` | CNAE | Setor do parceiro, atividade principal vs. secundária |
| `municipios_ibge` | Código IBGE | Endereço, alíquota de ISS por município |

A tabela `origem_mercadoria` responde diretamente ao que você levantou: `orig=1` é importação direta, `orig=2` é estrangeira adquirida no mercado interno, `orig=3`/`5`/`8` indicam conteúdo de importação em percentuais distintos. Cruzando com a DI do XML, você tem rastreabilidade de origem por item, com país e número de declaração.

**Todas essas tabelas precisam de vigência** (`vigencia_inicio`/`vigencia_fim`). Alíquota muda, CFOP é criado, NCM é reclassificado. Reapurar um período antigo tem que usar a regra que valia **naquela data**, não a de hoje. Sem versionamento, a DRE de 2025 muda quando a legislação de 2026 entra — e você perde a capacidade de explicar seus próprios números.

### 3.4 Enriquecimento automático de CNPJ

Você já tem `cnpj-enrichment.service.ts` e `cnpj-auto-discovery.service.ts`. A evolução:

- Todo CNPJ que aparecer em qualquer XML (emitente ou destinatário) entra automaticamente em `parceiros`
- Enriquecimento com: razão social, nome fantasia, situação cadastral, CNAE principal e secundários, porte, regime tributário (o CRT vem no próprio XML), endereço, sócios, data de abertura
- **Reconsulta periódica** com histórico versionado — situação cadastral muda, e um fornecedor que virou "inapto" precisa disparar alerta antes de você emitir a próxima ordem de compra
- Classificação automática por CNAE: fornecedor de insumo, prestador de serviço, cliente, transportadora
- Score de concentração: % de compras nesse fornecedor, % de receita nesse cliente — risco de dependência, informação de decisão pura

### 3.5 NFS-e — o aviso honesto

NF-e tem padrão nacional único e bem documentado. **NFS-e não.** É competência municipal, com dezenas de layouts diferentes; existe o padrão ABRASF, adotado por muitos municípios com variações próprias, e um esforço de padronização nacional em curso — mas convivência de formatos é a realidade prática.

**Arquitetura para lidar com isso:** parser com estratégia por município (`nfse-parser.factory.ts` → implementação por layout), normalizando tudo para um modelo interno único. Implemente primeiro os municípios onde a holding efetivamente opera e adicione os outros sob demanda. Não tente cobrir o Brasil inteiro — não vale o esforço e nunca fica pronto.

Como o padrão nacional pode ter evoluído desde então, vale confirmar o estado atual antes de definir o parser — isso muda o esforço da camada consideravelmente.

---

## 4. Auditoria total — como implementar de verdade

Você foi explícito: *"quem fez, quando fez, porque fez, quem autorizou, quando autorizou, quem viu, que horas viu, não aprovou, precisa de revisão, foi cancelado"*.

Isso são **três mecanismos distintos**. Tentar resolver com um só é o erro clássico.

### 4.1 Mecanismo 1 — Trilha de mutação (automática, por trigger)

Trigger genérico em PostgreSQL, aplicado a **toda** tabela de negócio:

```sql
CREATE TABLE auditoria_eventos (
  id             BIGSERIAL PRIMARY KEY,
  empresa_id     UUID,
  tabela         TEXT NOT NULL,
  registro_id    TEXT NOT NULL,
  operacao       TEXT NOT NULL,        -- INSERT | UPDATE | DELETE
  dados_antes    JSONB,
  dados_depois   JSONB,
  campos_alterados TEXT[],             -- só o que mudou, para leitura rápida
  usuario_id     UUID,
  motivo         TEXT,                 -- justificativa quando exigida
  ip_origem      INET,
  user_agent     TEXT,
  requisicao_id  UUID,                 -- correlaciona ações da mesma requisição
  ocorrido_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**A peça que faz funcionar:** o trigger roda no banco e não conhece o usuário HTTP. A solução usa o mecanismo que o seu `tenantMiddleware` **já implementa** para o RLS — `set_config()` na sessão. Basta estender:

```ts
await client.query("SELECT set_config('app.usuario_id', $1, true)", [userId]);
await client.query("SELECT set_config('app.motivo', $1, true)", [motivo]);
await client.query("SELECT set_config('app.requisicao_id', $1, true)", [reqId]);
```

O trigger lê com `current_setting('app.usuario_id', true)`. Vantagem decisiva: **é impossível escrever no banco sem gerar evento de auditoria**, mesmo que alguém rode SQL direto ou esqueça de chamar a camada de serviço. Auditoria implementada na aplicação sempre tem furo; implementada no banco, não tem.

Garantias adicionais:
- `REVOKE UPDATE, DELETE ON auditoria_eventos FROM eco_app` — nem a aplicação pode alterar a trilha
- Particionamento por mês (a tabela cresce rápido)
- Encadeamento de hash (cada evento carrega o hash do anterior) se você quiser prova de não-adulteração

### 4.2 Mecanismo 2 — Trilha de leitura (aplicação, seletiva)

Trigger não captura `SELECT`. E auditar toda leitura geraria volume inviável.

Solução: marcar recursos como sensíveis e registrar acesso apenas neles.

```sql
auditoria_acessos (
  usuario_id, recurso, recurso_id, filtros_aplicados JSONB,
  quantidade_registros, permissao_usada, concessao_id, ip, acessado_em
)
```

Recursos sensíveis por padrão: salários, folha, documentos pessoais, extrato bancário, DRE consolidada, dados de embarque, precificação. É o que responde *"quem viu, que horas viu"* — e o que a LGPD cobra numa investigação de incidente.

### 4.3 Mecanismo 3 — Máquina de estados de workflow (genérica, não por módulo)

*"não aprovou, precisa de revisão, foi cancelado"* não são campos — são **estados de um processo**. Implementar isso em cada módulo separadamente garante inconsistência.

Um mecanismo único para todo o sistema:

```sql
workflows_definicao   (codigo, entidade, versao)      -- 'ORCAMENTO_APROVACAO'
workflows_estados     (workflow_id, codigo, tipo)     -- INICIAL | INTERMEDIARIO | FINAL
workflows_transicoes  (de_estado, para_estado, acao, permissao_exigida,
                       exige_justificativa, alcada_valor_min, alcada_valor_max)

workflows_instancias  (workflow_id, entidade_tipo, entidade_id, estado_atual,
                       aberto_por, aberto_em, encerrado_em)
workflows_historico   (instancia_id, de_estado, para_estado, acao,
                       executado_por, justificativa, executado_em, prazo_sla)
```

Vale para orçamento, ordem de compra, alocação de embarque, admissão, reajuste salarial, fechamento contábil, qualquer coisa. A tabela `workflows_historico` responde *"quem autorizou, quando autorizou, por quê"* de forma uniforme — e permite medir SLA por etapa, o que revela onde os processos da empresa realmente travam. Essa métrica costuma ser mais reveladora que qualquer dashboard financeiro.

### 4.4 Correção sem apagamento

Regra geral, sem exceção: **nada é deletado.**

- Erro em lançamento contábil → lançamento de estorno + lançamento correto
- Erro em cadastro → nova versão com vigência, versão anterior preservada
- Documento cancelado → marcado como cancelado, com data, motivo e autor; permanece consultável

O botão "excluir" da interface nunca executa `DELETE`. Marca inativo, e a trilha guarda quem inativou e por quê.

---

## 5. Autorização entre setores: acesso just-in-time

Seu exemplo — comercial pede acesso a custos para precificar, alguém libera, o acesso é concedido — é um padrão conhecido e maduro. Vale muito a pena implementar direito, porque resolve o dilema real: permissão permanente ampla demais versus fricção que trava o trabalho.

```sql
solicitacoes_acesso (
  id, solicitante_id, empresa_id,
  recurso              TEXT,      -- 'catalogo.custo'
  escopo               JSONB,     -- {"produto_ids": [...]} ou {"categoria": "BATERIAS"}
  justificativa        TEXT NOT NULL,
  contexto_tipo        TEXT,      -- 'ORCAMENTO'
  contexto_id          UUID,      -- vincula à cotação específica
  validade_solicitada  INTERVAL,
  status               TEXT,      -- PENDENTE | APROVADA | NEGADA | EXPIRADA | REVOGADA
  aprovador_id, decidido_em, justificativa_decisao
)

concessoes_acesso (
  id, solicitacao_id, usuario_id, recurso, escopo JSONB,
  valido_de, valido_ate,          -- expiração automática
  usos_permitidos INT,            -- opcional: acesso de uso único
  usos_realizados INT,
  revogada_em, revogada_por
)
```

**Propriedades que fazem valer o esforço:**

1. **Escopo estreito.** Não é "acesso a custos" — é "custo dos 12 produtos da cotação #4471". Concedido com precisão, o risco é quase nulo.
2. **Expiração automática.** Acesso concedido em março não continua ativo em dezembro. É a falha mais comum em controle de acesso corporativo, e a mais fácil de evitar.
3. **Vinculado ao contexto.** A concessão morre junto com a cotação que a justificou.
4. **Cada uso registrado.** `auditoria_acessos.concessao_id` liga a leitura à autorização que a permitiu — a cadeia completa: pediu → foi aprovado por fulano → usou 3 vezes → expirou.
5. **Aprovação pelo dono do dado**, não por TI. O responsável por custos aprova acesso a custos. Quem entende o risco decide.

**Padrões de apoio que valem a pena:**

- **Auto-aprovação com registro.** Alguns dados podem ser liberados na hora, exigindo apenas justificativa, com notificação ao dono. Cobre urgência sem virar burocracia. Bom para dados de sensibilidade média.
- **Acesso de emergência ("quebra de vidro").** Concessão imediata e ampla, com alarme para gestão e revisão obrigatória depois. Em operação offshore, uma emergência às 3h da manhã não pode esperar aprovação — mas também não pode passar despercebida.
- **Visões derivadas em vez de acesso ao dado bruto.** Muitas vezes o comercial não precisa do custo: precisa saber se o preço proposto respeita a margem mínima. Uma resposta `MARGEM_OK / ABAIXO_DO_MINIMO` resolve o problema real sem expor nada. **Antes de construir o fluxo de aprovação, pergunte se uma resposta derivada não resolve** — geralmente resolve, e é melhor para os dois lados.

---

## 6. Gestão de pessoal e o motor de aptidão

Esta é a parte que originou o projeto. Vou tratá-la com o peso que tem.

### 6.1 O diagnóstico do incidente

O erro não foi de atenção. Foi de **arquitetura de informação**: a informação necessária para a decisão estava espalhada (férias em um lugar, certificação em outro, escala em um terceiro) e a decisão precisava ser tomada rápido. Nessa configuração, o erro é questão de tempo — qualquer pessoa cometeria.

Portanto a solução não é treinamento nem checklist. É **fazer o sistema responder à pergunta em vez da pessoa**, e **impedir a alocação inválida** em vez de avisar sobre ela.

### 6.2 O motor de aptidão

O coração do módulo. Uma função que responde uma pergunta:

> *"O colaborador X está apto para o embarque Y, de dd/mm a dd/mm, na função Z?"*

```sql
CREATE FUNCTION aptidao_colaborador(
  p_colaborador_id UUID,
  p_data_inicio    DATE,
  p_data_fim       DATE,
  p_funcao_id      UUID,
  p_projeto_id     UUID DEFAULT NULL
) RETURNS TABLE (
  apto            BOOLEAN,
  impedimentos    JSONB,   -- bloqueiam: [{tipo, descricao, vence_em, gravidade}]
  alertas         JSONB    -- não bloqueiam, mas precisam ser vistos
);
```

**Verificações que devem estar dentro dela:**

| # | Verificação | Fonte |
|---|---|---|
| 1 | Vínculo ativo (não desligado, não em aviso prévio) | `colaboradores` |
| 2 | ASO válido **para todo o período**, não só na data de embarque | `exames_ocupacionais` |
| 3 | Todas as certificações exigidas pela função, válidas até o retorno | `certificacoes_colaborador` × `funcoes_requisitos` |
| 4 | Sem férias, licença ou afastamento no período | `ferias_periodos`, `afastamentos` |
| 5 | Sem outra alocação sobreposta | `alocacoes` |
| 6 | Descanso mínimo cumprido desde o último desembarque | `embarques` + regra de escala |
| 7 | Limite de dias embarcados no período respeitado | `embarques` |
| 8 | Documentos obrigatórios válidos (passaporte, visto, CIR quando aplicável) | `documentos_colaborador` |
| 9 | Treinamentos obrigatórios do cliente/projeto em dia | `treinamentos_colaborador` × requisitos do projeto |
| 10 | Restrições médicas compatíveis com a função | `exames_ocupacionais` |

**Ponto crítico de projeto:** a verificação é sobre o **período inteiro**, não sobre a data de início. Um certificado que vence no meio de um embarque de 28 dias é impedimento — o profissional ficaria irregular a bordo, sem possibilidade de substituição. Este é exatamente o tipo de detalhe que passa despercebido numa conferência manual e que o motor pega sempre.

### 6.3 Bloqueio, não alerta

Diferença que define se o problema volta a acontecer:

- Alerta amarelo na tela → é ignorado sob pressão. Sempre.
- **Alocação recusada** pelo sistema → não acontece.

Fluxo de exceção, para os casos legítimos: a alocação com impedimento exige **autorização explícita** de quem tem permissão de override, com justificativa escrita, gerando evento de auditoria de alta severidade e notificação à gestão. Nunca um clique em "confirmar mesmo assim".

Isso transforma o override em decisão consciente e rastreável de uma pessoa identificada — que é o comportamento correto, porque exceções legítimas existem.

**Configure os requisitos, não os codifique.** Certificações offshore variam por função, cliente, tipo de embarcação e regulamentação aplicável. Deixe `funcoes_requisitos` e `projetos_requisitos` como tabelas editáveis pelo RH e pela operação, sem depender de deploy. As normas mudam e você não quer que cada mudança vire uma tarefa de desenvolvimento.

### 6.4 Estrutura de dados de pessoal

```sql
-- Identidade e vínculo
colaboradores          (empresa_id, nome, cpf, rg, pis, data_nascimento, tipo_vinculo,
                        cargo_id, funcao_id, departamento_id, gestor_id, centro_custo_id,
                        data_admissao, data_desligamento, usuario_id NULLABLE)
colaboradores_pj       (colaborador_id, cnpj, razao_social, contrato_ref,
                        vigencia_inicio, vigencia_fim, valor_diaria, valor_mensal)

-- Remuneração (dados sensíveis — ver 6.5)
historico_remuneracao  (colaborador_id, tipo, valor, moeda, motivo,
                        vigencia_inicio, vigencia_fim, aprovado_por)
diarias_tabela         (funcao_id, tipo_operacao, valor, moeda, vigencia)
apontamentos_hora      (colaborador_id, data, horas_normais, horas_extras,
                        adicional_noturno, projeto_id, aprovado_por)
folha_pagamento        (competencia, colaborador_id, proventos JSONB,
                        descontos JSONB, liquido, status)

-- Aptidão
exames_ocupacionais    (colaborador_id, tipo, realizado_em, valido_ate,
                        resultado, restricoes JSONB, medico, arquivo_ref)
certificacoes_tipos    (codigo, nome, entidade_emissora, validade_meses, obrigatoria)
certificacoes_colaborador (colaborador_id, tipo_id, numero, emitido_em, valido_ate,
                        arquivo_ref, verificado_por)
funcoes_requisitos     (funcao_id, certificacao_tipo_id, obrigatorio)
afastamentos           (colaborador_id, tipo, inicio, fim, cid_ref, documento_ref)
ferias_periodos        (colaborador_id, aquisitivo_inicio, aquisitivo_fim,
                        gozo_inicio, gozo_fim, dias, abono, status)

-- Trajetória
formacoes              (colaborador_id, nivel, curso, instituicao, conclusao)
experiencias           (colaborador_id, empresa, cargo, inicio, fim, descricao)
treinamentos_colaborador (colaborador_id, treinamento_id, concluido_em,
                        valido_ate, nota, certificado_ref)
documentos_colaborador (colaborador_id, tipo, numero, emissao, validade,
                        arquivo_ref, obrigatorio)

-- Embarque e alocação
embarques              (colaborador_id, projeto_id, cotacao_id, embarcacao,
                        funcao_id, porto_embarque, porto_desembarque,
                        data_embarque, data_desembarque, dias,
                        diaria_aplicada, valor_total, escala,
                        cliente_id, os_id, autorizado_por, status)
alocacoes              (colaborador_id, tipo, referencia_id, inicio, fim, status)
```

**Detalhes que evitam retrabalho:**

- **`embarques` liga colaborador → projeto → cotação → cliente.** É a costura entre RH, comercial e operações que você descreveu. Com ela, três perguntas caras viram consulta simples: custo real de mão de obra por projeto, margem real da cotação, histórico de quem já trabalhou com determinado cliente.
- **Remuneração é histórico com vigência**, nunca campo atualizado. "Qual era o salário dele em março de 2025?" é pergunta de processo trabalhista, e precisa ter resposta.
- **`funcao` é separada de `cargo`.** Cargo é contratual (CLT); função é o papel a bordo, que define requisitos de certificação. A mesma pessoa pode embarcar em funções diferentes.
- **Tudo que tem validade dispara alerta antecipado.** Job diário que verifica vencimentos em 90/60/30/15 dias e notifica colaborador, gestor e RH. A maior parte dos problemas de aptidão é previsível com meses de antecedência — e portanto evitável.

### 6.5 Proteção de dados de pessoal

Salário, exame médico e documento pessoal têm exigência mais alta que o resto do sistema:

- **Criptografia em repouso** para remuneração e resultado de exame (`pgcrypto`), com chave fora do banco
- **RLS específica**: o próprio colaborador vê seus dados; o gestor vê a equipe sem remuneração; RH e C-Level veem tudo
- **Toda leitura registrada** em `auditoria_acessos` (seção 4.2)
- **Nunca em log, nunca em cache, nunca em exportação sem permissão explícita**
- **Retenção pós-desligamento** conforme prazo legal, com anonimização programada ao fim do prazo

Dado de saúde é categoria especial na LGPD. Um vazamento de resultado de ASO é incidente grave, com dever de notificação.

---

## 7. O que muda no roadmap

As decisões acima reordenam o plano anterior. Nova sequência:

**Fase 0 — Correções imediatas (1 semana)**
Bugs de cálculo do DRE; `exigirPermissao` em todas as rotas; resolver `abac.types.ts`.

**Fase 1 — Fundação imutável (4-5 semanas)** — *tudo depende disto*
Partida dobrada com `data_competencia` + `data_caixa`; plano de contas; centro de custo; trigger genérico de auditoria; `set_config` de contexto de usuário; máquina de estados de workflow; fechamento de período.

**Fase 2 — Autorização (2-3 semanas)**
RBAC granular; segurança de campo; solicitação/concessão de acesso just-in-time; auditoria de leitura; refresh token, revogação, MFA, reset de senha.

**Fase 3 — Pessoal e aptidão (4-5 semanas)** — *o motivo do projeto*
Cadastro completo; certificações e exames; motor de aptidão; bloqueio com override auditado; embarques ligados a projeto/cotação; alertas de vencimento; remuneração protegida.

**Fase 4 — Motor fiscal (4-6 semanas)**
Tabelas de referência versionadas (CFOP, NCM, CEST, CST, origem, CNAE); parser completo de NF-e com todos os blocos; eventos de documento; regras de contabilização automática; parser de NFS-e por município; enriquecimento de CNPJ com histórico; duplicatas gerando títulos.

**Fase 5 — Operação (5-7 semanas)**
Estoque com custo médio e rastreio por lote; produção; compras com alçadas; ativo imobilizado e depreciação; field service sobre as migrations existentes.

**Fase 6 — Inteligência e autonomia (contínuo)**
Ingestão pela interface; importador de planilha; conciliação bancária; reconciliação contra o contador; drill-down universal; construtor de relatório de fechamento; exportação.

---

## 8. Duas observações finais

**Sobre "à prova de falhas".** Repito o que disse antes porque agora tem uma forma concreta: o sistema não pode impedir que alguém tome uma decisão ruim. O que a arquitetura acima entrega é que **nenhuma decisão ruim passa despercebida** — a alocação inválida é recusada, o número sem base aparece marcado, o acesso indevido fica registrado, a divergência contábil aparece na conferência. É esse o padrão alcançável, e ele é suficiente para resolver o problema que originou o projeto.

**Sobre escopo.** O que você descreveu é um ERP corporativo completo. É viável e a fundação está certa, mas é trabalho de muitos meses, e a maior ameaça não é dificuldade técnica — é construir vinte módulos pela metade. Sugiro fortemente: **Fase 0 → Fase 1 → Fase 3**, entregando o módulo de pessoal 100% completo (schema, backend, permissões, front, testes, exportação, alertas) antes de abrir qualquer frente nova. É o módulo que motivou o projeto, tem o retorno mais imediato, e vira o modelo de referência para todos os outros. A Fase 2 pode ser feita em paralelo ou logo em seguida, já que a Fase 3 depende dela para proteger salários.
