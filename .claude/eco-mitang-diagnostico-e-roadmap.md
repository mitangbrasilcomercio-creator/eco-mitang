# Eco-Mitang ERP — Diagnóstico Técnico e Roadmap

**Base:** leitura do repositório `mitangbrasilcomercio-creator/eco-mitang` (branch `main`, 38 commits)
**Data:** 30/08/2026

---

## 0. Leitura honesta do estado atual

Antes do roadmap, uma avaliação franca — porque o plano só faz sentido se o ponto de partida estiver claro.

### O que está genuinamente bem feito

Isso não é elogio de cortesia. Três coisas nesse repositório estão acima da média do que se vê em ERP interno:

1. **Isolamento multi-tenant imposto pelo banco (RLS), não pela aplicação.** O papel `eco_app` sem `BYPASSRLS` + policies com `app_empresa_ids()` significa que uma query nova que esqueça o filtro de tenant simplesmente não retorna dados dos outros CNPJs. É a decisão de arquitetura mais importante do projeto e está correta.
2. **Idempotência real na ingestão OFX.** Hash SHA-256 composto (tenant + banco + conta + FITID + data + valor + memo normalizado) em vez de confiar no FITID — com o comentário explicando que o Bradesco reaproveita FITID. Isso é conhecimento de campo, não teoria.
3. **A regra "quando não há dado, o valor é zero e o payload diz que não há base".** Campos como `base_tributaria_disponivel`, `lucro_liquido_parcial`, `baseado_em_dados`. Um ERP financeiro que se recusa a inventar número plausível é raro. Preserve isso a todo custo — é o princípio que deve governar tudo que for construído daqui pra frente.

### O que é fachada

O front-end tem **28 arquivos em `public/`**, mas o backend tem **7 módulos**. A distância entre os dois é o problema central do projeto hoje:

| Página no front | Backend correspondente | Status real |
|---|---|---|
| `dashboard.html` | `modules/dashboard` | Funcional |
| `financeiro.html` | `modules/financeiro` | Funcional |
| `contabilidade.html` | `modules/contabilidade` (DRE) | Funcional (com ressalvas — seção 1) |
| `notas_fiscais.html` | `modules/faturamento` | Funcional |
| `crm.html` | `modules/clientes` | Parcial |
| `orcamento_master.html` | `modules/orcamentos` | Parcial |
| `produtos.html` | `modules/catalogo` | Parcial |
| **`colaboradores.html`** | **nenhum** | Card HTML fixo com seu nome escrito no código |
| **`compras.html`** | **nenhum** | `console.log('Inicializado')` — 6 linhas |
| **`compliance.html`** | **nenhum** | Casca |
| **`controladoria.html`** | **nenhum** | Casca |
| **`operacoes.html`** | **nenhum** | Casca |
| **`relatorios.html`** | **nenhum** | Casca |
| **`arquivos.html`** | **nenhum** | Casca |
| **`planilha.html`** | **nenhum** | Casca |
| **`automacoes.html`** | **nenhum** | Casca (100 linhas de HTML) |
| **`parametros.html`** | **nenhum** | Casca |
| **`analises.html`** | **nenhum** | Casca |

Verificação direta: `colaboradores.js` renderiza um card com "Diego Ribeiro Da Silva / Diretoria • C-Level" **escrito literalmente no JavaScript**. `compras.js` inteiro tem 6 linhas e só imprime no console.

**Conclusão:** o sistema hoje é um **módulo financeiro competente com um shell de ERP em volta**. Não é um ERP multi-setorial. A boa notícia é que a fundação (RLS, tenant, ingestão, padrão de camadas) é sólida o bastante para sustentar o resto — o trabalho é construir, não refazer.

### Sobre "resultados exatos e perfeitos, sem margem para falhas"

Preciso ser direto: **isso não é atingível só por software.** Nenhum ERP produz número exato a partir de dado que entra sujo ou incompleto. O que se pode construir é:

- **Rastreabilidade** — todo número exibido consegue provar de onde veio, até o lançamento de origem.
- **Conciliação** — o sistema compara o próprio resultado contra uma fonte externa (extrato do banco, apuração do contador, inventário físico) e **acusa a divergência** em vez de escondê-la.
- **Recusa de estimativa** — o princípio que já existe no código.

Exatidão vem da combinação dos três, mais disciplina de processo. Um sistema que promete perfeição está mentindo; um que expõe a própria incerteza é confiável. Todo o roadmap abaixo segue essa premissa.

---

## 1. Correções de cálculo (prioridade máxima — o sistema hoje reporta números errados)

Encontrei problemas concretos lendo `dre.controller.ts` e `dre.repository.ts`. Não são hipóteses.

### 1.1 Pagamentos a fornecedores são consultados e descartados — BUG

Em `dre.repository.ts`, linha ~88, a query busca:

```sql
AND categoria_financeira IN ('IMPOSTOS_E_TRIBUTOS', 'FORNECEDORES_OPERACIONAIS',
                             'OUTRAS_DESPESAS_OPERACIONAIS', 'REPASSES_SOCIOS_DIRETORIA')
```

Mas em `dre.controller.ts` o `mapaDespesas` só lê três chaves:

```ts
const tributosPagos   = mapaDespesas['IMPOSTOS_E_TRIBUTOS'] || 0;
const outrasDespesas  = mapaDespesas['OUTRAS_DESPESAS_OPERACIONAIS'] || 0;
const repassesSocios  = mapaDespesas['REPASSES_SOCIOS_DIRETORIA'] || 0;
```

`FORNECEDORES_OPERACIONAIS` é trazido do banco e **silenciosamente jogado fora**. Todo pagamento a fornecedor que passou pelo banco sem NF-e vinculada sai da DRE. **Efeito: EBITDA e lucro líquido superestimados.**

Pode ser intencional (para evitar duplicidade com as NF-e recebidas do CMV) — mas se for, precisa estar escrito e a query não deveria buscar a categoria. Do jeito que está, ninguém sabe qual das duas hipóteses é verdade.

> **Ação:** decidir e documentar. Se for para evitar duplicidade, remover da query e comentar o motivo. Se não, somar em `despesasOperacionais` e resolver a duplicidade pelo vínculo transação↔nota (seção 2.3).

### 1.2 Tributos contados duas vezes

Fluxo atual:

1. `deducoes = tributosDestacados` — ICMS/PIS/COFINS/ISS destacados nas notas **emitidas**, subtraídos da receita bruta.
2. `lucroLiquido = ebitda - tributosPagos` — onde `tributosPagos` são as saídas bancárias categorizadas como `IMPOSTOS_E_TRIBUTOS`.

Só que o DARF de PIS/COFINS e a guia de ICMS **são exatamente o pagamento dos tributos destacados no passo 1**. Estão sendo subtraídos nos dois lugares.

Agrava: o passo 1 é **competência** (mês da emissão) e o passo 2 é **caixa** (mês do pagamento, tipicamente o mês seguinte). Então nem batem no tempo — a distorção varia mês a mês de forma imprevisível.

> **Ação:** separar tributos **sobre a receita** (dedução, competência, vem da nota) de tributos **sobre o resultado** (IRPJ/CSLL, abaixo do EBITDA). Guias pagas devem baixar a *obrigação tributária provisionada*, não virar despesa nova.

### 1.3 CMV é compra, não custo de venda

```sql
-- rotulado como "cmv_insumos"
SELECT SUM(valor_produtos_servicos) FROM notas_fiscais
 WHERE direcao = 'RECEBIDA' AND tipo_documento = 'NFE_PRODUTO'
   AND data_emissao BETWEEN $1 AND $2
```

Isso é **compras do período**, não CMV. CMV = Estoque inicial + Compras − Estoque final. Sem controle de estoque, um mês em que você compra 500 células de lítio para produzir nos próximos 4 meses aparece como prejuízo operacional; os meses seguintes aparecem com margem irreal.

Para uma empresa de **manufatura de baterias**, isso não é detalhe — é a métrica central do negócio.

> **Ação:** módulo de estoque com custo médio ponderado móvel (seção 3.2). Enquanto não existir, renomear o campo para `compras_insumos_periodo` e marcar `cmv_disponivel: false` — coerente com o princípio já adotado no resto do código.

### 1.4 Regime contábil misturado

| Componente | Regime | Fonte |
|---|---|---|
| Receita bruta | Competência | `notas_fiscais` emitidas |
| Deduções | Competência | imposto destacado |
| CMV | Competência (parcial) | NF-e recebidas |
| Serviços PJ | Competência | NFS-e recebidas |
| Tarifas bancárias | Caixa | `transacoes_bancarias` |
| Outras despesas | Caixa | `transacoes_bancarias` |
| Tributos | Caixa | `transacoes_bancarias` |

Metade competência, metade caixa. **O resultado não é nem uma coisa nem outra** — e não bate com a apuração do contador em nenhum dos dois regimes.

> **Ação (a mais importante do documento):** eleger **competência** como regime oficial da DRE e derivar caixa dela. Isso exige a mudança estrutural da seção 2.

### 1.5 Sem partida dobrada

Não há plano de contas nem lançamentos com débito/crédito. A DRE é montada por `SUM` com `WHERE` categoria. Consequências:

- Não existe validação de fechamento (débitos = créditos).
- Não é possível gerar Balanço Patrimonial — logo, não há como validar a DRE contra o patrimônio.
- Reclassificar uma categoria muda o histórico retroativamente, sem trilha.

Enquanto não houver partida dobrada, **não existe forma de provar que a DRE está certa.** É a diferença entre "o número parece plausível" e "o número está provado".

---

## 2. Fundação contábil (o que precisa existir antes de qualquer módulo novo)

### 2.1 Plano de contas + razão com partida dobrada

```
plano_contas          (codigo, descricao, tipo, natureza, conta_pai, aceita_lancamento)
lancamentos_contabeis (id, empresa_id, data_competencia, data_caixa, historico,
                       documento_origem_tipo, documento_origem_id, estornado_por)
lancamentos_partidas  (lancamento_id, conta_id, debito, credito, centro_custo_id)
```

Com trigger que rejeita lançamento onde `SUM(debito) <> SUM(credito)`. Estorno gera lançamento inverso — nunca `UPDATE`/`DELETE`.

**Todo** documento (NF-e, NFS-e, transação bancária, folha, depreciação) passa a gerar lançamento contábil automático a partir de uma **regra de contabilização** configurável. A DRE deixa de ser `SUM` sobre transações e passa a ser leitura do razão. É aí que "exatidão" começa a ser demonstrável.

### 2.2 Centro de custo e projeto/OS

Você tem 4 CNPJs com naturezas diferentes (manufatura, locação, serviços offshore, cursos). Sem centro de custo, é impossível saber qual linha de negócio dá lucro. Toda partida contábil deve carregar `centro_custo_id` e, quando aplicável, `ordem_servico_id`.

Isso desbloqueia: rentabilidade por OS, margem por linha, custeio de projeto offshore.

### 2.3 Conciliação documento ↔ transação bancária

Hoje nota fiscal e transação bancária vivem em silos separados. É a raiz das duplicidades das seções 1.1 e 1.2.

```
conciliacoes (transacao_bancaria_id, documento_tipo, documento_id,
              valor_conciliado, conciliado_por, conciliado_em, automatica)
```

Motor de sugestão automática (valor + data ± tolerância + CNPJ da contraparte) com aprovação humana para os casos ambíguos. Uma transação conciliada não gera despesa nova — ela **baixa o título** que a nota já criou.

### 2.4 Fechamento de período

`periodos_contabeis (empresa_id, ano, mes, status, fechado_por, fechado_em)`.

Período fechado bloqueia lançamento retroativo. Sem isso, o relatório de janeiro muda em março e ninguém sabe por quê — o problema que mais destrói confiança em ERP.

---

## 3. Módulos por setor

Ordenados por dependência técnica, não por urgência percebida.

### 3.1 RH / Departamento Pessoal — *o que você pediu explicitamente*

**Tabelas:**

```
colaboradores        (empresa_id, nome, cpf, matricula, tipo_vinculo[CLT|PJ|Estagio|Terceiro],
                      cargo_id, departamento_id, gestor_id, data_admissao, data_desligamento,
                      centro_custo_id, usuario_id → usuarios(id) NULLABLE)
cargos               (titulo, nivel, faixa_salarial_min, faixa_salarial_max, cbo)
departamentos        (nome, gestor_id, centro_custo_id)
historico_cargos     (colaborador_id, cargo_id, salario, motivo, vigencia_inicio, vigencia_fim)
documentos_colaborador (colaborador_id, tipo, arquivo_ref, emissao, validade, obrigatorio)
folha_pagamento      (competencia, colaborador_id, proventos_json, descontos_json,
                      liquido, status)
ponto_registros      (colaborador_id, data, entrada, saida, saldo_banco_horas)
ferias_periodos      (colaborador_id, aquisitivo_inicio, aquisitivo_fim, gozo_inicio,
                      gozo_fim, dias, status)
treinamentos_colaborador (colaborador_id, treinamento_id, conclusao, validade, certificado_ref)
```

**Pontos críticos para o seu negócio:**

- **`colaborador` ≠ `usuario`.** Um colaborador pode não ter login (operador de fábrica); um usuário pode não ser colaborador (auditor externo, contador). O vínculo é opcional, com FK anulável. Muito ERP erra isso e depois não consegue desligar alguém sem apagar o histórico.
- **Salário é dado sensível — precisa de tratamento diferenciado.** Não basta esconder no front. Recomendo: coluna criptografada (`pgcrypto`), RLS específica que só libera para RH e C-Level, e log de **toda leitura** (não só escrita) na tabela de auditoria. LGPD trata folha como dado pessoal sensível e a multa é real.
- **Validade de certificação offshore é bloqueante.** Setores de operação offshore exigem NR-37, HUET/CBSP, ASO periódico. O sistema deve **impedir alocação** de colaborador com certificação vencida em OS offshore, não apenas alertar. Isso é onde o ERP para de ser planilha e vira controle operacional real.
- **Histórico versionado, nunca sobrescrito.** `historico_cargos` com vigência permite responder "qual era o salário dele em março de 2025?" — pergunta que trabalhista faz.

**Integração contábil:** fechamento da folha gera lançamento automático (despesa por centro de custo, provisão de férias e 13º, encargos). Isso resolve parte do problema da seção 1.1 — folha PJ hoje entra na DRE como saída bancária genérica.

### 3.2 Estoque e Produção (manufatura de baterias)

```
produtos            (sku, descricao, tipo[MP|PA|EMB|SERV], unidade, controla_lote,
                     controla_serie, estoque_minimo)
estoque_saldos      (produto_id, deposito_id, lote, quantidade, custo_medio)
estoque_movimentos  (produto_id, tipo, quantidade, custo_unitario, documento_origem,
                     data, saldo_apos)
estrutura_produto   (produto_pai, produto_filho, quantidade)   -- BOM
ordens_producao     (produto_id, quantidade, status, custo_previsto, custo_real)
apontamentos_producao (op_id, insumo_id, quantidade_consumida, colaborador_id, horas)
```

- **Custo médio ponderado móvel** recalculado a cada entrada. É o método que a Receita aceita e o que resolve a seção 1.3.
- **Rastreabilidade por lote/série é obrigatória** para bateria subsea e hospitalar. Se um lote de células apresenta defeito, você precisa saber em segundos quais baterias o consumiram e para quais clientes foram. Isso é responsabilidade civil, não conveniência.
- Entrada de NF-e já ingerida deve **alimentar o estoque automaticamente** — hoje o XML entra e morre no `dados_completos_json`.

### 3.3 Compras e Suprimentos

Ciclo: `requisicao → cotacao (≥3 fornecedores) → pedido → recebimento → NF → pagamento`.

Cada etapa com aprovação por alçada (valor × cargo). O recebimento confere quantidade contra o pedido e gera divergência quando não bate. **Isso fecha o ciclo com a seção 2.3**: o pedido de compra é o documento que vincula a NF-e à saída bancária, eliminando a duplicidade da DRE.

### 3.4 Comercial / CRM

Você já tem `clientes` e `orcamentos` parciais. Falta: funil com estágios, atividades e follow-up, conversão orçamento → pedido → OS → NF-e (hoje esse encadeamento não existe), comissionamento e metas.

### 3.5 Operações / Field Service (offshore e locação)

Existem migrations (`05_ordens_servico`, `06_execucao_operacional`) mas **nenhum módulo TypeScript** as consome. O schema está lá, órfão.

Precisa: agenda e alocação de equipe (validando certificação — seção 3.1), controle de ativos locados com calendário de disponibilidade, apontamento de horas por OS, checklist de campo com evidência fotográfica, e cálculo de rentabilidade por OS (receita − mão de obra − materiais − deslocamento).

### 3.6 Fiscal

Hoje o XML é armazenado mas não apurado. Falta: apuração de ICMS/PIS/COFINS/ISS por período, controle do regime tributário por CNPJ (Simples/Presumido/Real muda tudo), SPED, e obrigações acessórias com calendário.

**Ponto honesto:** apuração fiscal brasileira é onde projetos internos mais quebram. Considere seriamente integrar um serviço fiscal especializado (Tecnospeed, Nuvem Fiscal, PlugNotas) em vez de implementar do zero. O custo de errar aqui é multa.

### 3.7 Ativo Imobilizado

O próprio código admite a lacuna: *"não inclui depreciação nem amortização: o sistema ainda não possui módulo de ativo imobilizado"*. Para uma empresa de **locação de equipamentos oceanográficos**, o imobilizado é o ativo gerador de receita — e sem depreciação o lucro está estruturalmente inflado.

### 3.8 QSMS / Compliance

Migration `08_qsms_auditoria` existe, sem módulo. Para offshore: incidentes e quase-acidentes, não-conformidades com plano de ação, auditorias, matriz de risco, gestão de EPI. Setor com exigência regulatória — não é opcional.

---

## 4. Controle de acesso (o que você pediu — e o estado atual é frágil)

### 4.1 O problema concreto

Rodei a verificação: `exigirPapel` está definido e é usado em **exatamente 2 rotas** de todo o sistema:

```
auth.routes.ts:31         → POST /usuarios          (Gestor_CLevel)
financeiro.routes.ts:17   → POST /categorizar-transacao (Gestor_CLevel, Financeiro)
```

Todo o resto — `GET /financeiro/transacoes`, `GET /financeiro/resumo-caixa`, `GET /contabilidade/dre`, `GET /dashboard` — está protegido apenas por `authMiddleware + tenantMiddleware`.

**Traduzindo:** um usuário com papel `Vendedor` autenticado consegue ler o extrato bancário completo, o resumo de caixa e a DRE da holding. O tenant está isolado; a **função** não está.

### 4.2 Inconsistência de papéis entre camadas

Dois conjuntos de papéis diferentes convivem no código:

| `database/20_auth_usuarios.sql` (enum real) | `src/core/security/abac.types.ts` (não usado) |
|---|---|
| Gestor_CLevel | Gestor_CLevel |
| Financeiro | Gerente_Comercial |
| Vendedor | Gerente_Operacional |
| Operacional | Vendedor |
| | Auditor_QSMS |
| | Admin_Sistema |

`abac.types.ts` parece ser vestígio de um design ABAC que não foi implementado. Ou se implementa, ou se remove — código morto em camada de segurança é armadilha para quem for mexer depois.

### 4.3 Modelo alvo: RBAC com permissões granulares

Papel como enum não escala. Quatro papéis não descrevem uma empresa com RH, compras, produção, QSMS e comercial — e cada papel novo exigirá migration.

```
permissoes        (codigo, modulo, acao, descricao)
                  -- 'financeiro.extrato.ler', 'rh.salario.ler',
                  --   'compras.pedido.aprovar', 'contabilidade.periodo.fechar'
perfis            (empresa_id, nome, descricao, sistema BOOLEAN)
perfis_permissoes (perfil_id, permissao_id)
usuarios_perfis   (usuario_id, perfil_id, empresa_id)  -- perfil por CNPJ
```

Middleware: `exigirPermissao('financeiro.extrato.ler')` — **aplicado em toda rota**, com teste automatizado que falha o build se alguma rota de dado ficar sem declaração explícita de permissão. Essa última parte é o que impede a regressão silenciosa que aconteceu aqui.

### 4.4 Segurança em nível de campo

Papel controla acesso a rota. **Salário exige mais**: dentro do mesmo endpoint `/rh/colaboradores`, o gestor de departamento vê a equipe sem salário, o RH vê com salário. Implementar como projeção condicional no serviço + RLS de coluna no banco.

### 4.5 Auditoria de leitura, não só de escrita

`usuarios_log_acesso` registra login. Falta registrar **acesso a dado sensível**: quem consultou qual folha, quando, de qual IP. Exigência prática de LGPD e o que permite responder a um incidente.

### 4.6 Itens de higiene de segurança

- **Sem refresh token nem revogação.** JWT emitido é válido até expirar. Demitir alguém não invalida o token dele. Precisa de tabela de sessões com revogação.
- **Sem MFA.** Para C-Level com acesso a folha e caixa consolidado, TOTP deveria ser obrigatório.
- **Sem fluxo de troca/reset de senha.** Senha só nasce pelo script CLI e não há como o usuário trocá-la.
- **Sem política de expiração nem histórico de senha.**

---

## 5. Importação e análise de dados

### 5.1 O que já funciona bem

Pipeline OFX de 4 camadas, precedência correta entre rendimento e varredura de liquidez, hash de idempotência, trigger de roteamento por titularidade da conta. Está bom. Mantenha.

### 5.2 O que falta

**Ingestão hoje é CLI-only.** `npm run db:reingest` roda no terminal, pelo desenvolvedor. Enquanto for assim, o sistema depende de você. Precisa de: upload pela interface, fila de processamento com status visível, preview antes de commitar, e desfazer de lote.

**Classificação OFX é regex sobre memo.** Funciona para o padrão conhecido, mas todo memo novo cai em `OUTRAS_DESPESAS_OPERACIONAIS`. Evolução: camada de aprendizado por confirmação — quando o usuário reclassifica, o sistema guarda a regra (`padrao_memo → categoria`, por tenant) e sugere depois. Determinístico e auditável, sem depender de ML.

**Falta importação genérica de planilha.** Você tem `planilha.html` como casca e seeds em `.txt`. Um importador com mapeamento de colunas, validação linha a linha e relatório de rejeição resolve metade das necessidades operacionais dos outros setores.

**Falta conciliação bancária como tela.** É o controle que efetivamente pega erro: sistema propõe o pareamento, humano confirma, divergências ficam em aberto e visíveis.

**Falta reconciliação de fechamento.** O maior ganho de confiabilidade possível: uma tela que compara o resultado do sistema com a apuração do contador e lista as divergências item a item. É assim que se descobre que a DRE está errada — não olhando a DRE, mas comparando-a com outra fonte.

### 5.3 Sobre a cobertura de testes

Três arquivos de teste: `ofx-classificador`, `periodo`, `rls-isolamento`. As escolhas são boas (são as partes de maior risco), mas para um sistema que decide número financeiro é pouco.

Priorize testes de: cálculo de DRE com cenários conhecidos (dado de entrada → resultado esperado), custo médio de estoque, matriz de permissões, e idempotência de reimportação.

---

## 6. Apresentação e usabilidade

- **Drill-down obrigatório.** Todo número exibido deve ser clicável até o lançamento de origem. É o que separa "confio no sistema" de "vou conferir na planilha".
- **Indicador visual de completude.** Os campos `sem_dados` e `lucro_liquido_parcial` já existem no payload — o front precisa mostrá-los. Um card de lucro líquido sem o aviso de "não inclui depreciação" é mais perigoso que não ter o card.
- **Exportação real** (Excel/PDF) em todo relatório. Enquanto não houver, o dado volta para a planilha e o ERP vira decoração.
- **`renderRealModules.js`** sugere que existiu convivência de módulos reais e fake. Remover essa ambiguidade — nada no sistema deve renderizar dado ilustrativo.

---

## 7. Ordem de execução sugerida

Cada fase entrega valor sozinha e sustenta a seguinte.

### Fase 1 — Confiabilidade do que já existe
1. Corrigir os bugs da seção 1 (fornecedores descartados, tributos duplicados, rótulo do CMV)
2. `exigirPermissao` em todas as rotas + teste que falha o build se faltar
3. Resolver a inconsistência de papéis (`abac.types.ts`)
4. Testes de cálculo da DRE com cenários conhecidos

### Fase 2 — Fundação contábil
5. Plano de contas + razão com partida dobrada + centro de custo
6. Conciliação documento ↔ transação bancária
7. Fechamento de período
8. DRE reescrita lendo do razão

### Fase 3 — Acesso e pessoas
9. RBAC granular (perfis/permissões) + segurança de campo
10. Refresh token, revogação de sessão, reset de senha, MFA
11. Módulo RH: colaboradores, cargos, documentos, certificações bloqueantes
12. Folha com integração contábil e criptografia de salário

### Fase 4 — Operação
13. Estoque com custo médio + rastreabilidade por lote
14. Produção (BOM, ordens, apontamento) — resolve o CMV real
15. Compras com alçadas de aprovação
16. Ativo imobilizado e depreciação

### Fase 5 — Cobertura setorial
17. Operações/Field Service sobre as migrations já existentes
18. Fiscal (avaliar integração com serviço especializado)
19. QSMS/Compliance
20. CRM completo com encadeamento orçamento → OS → NF-e

### Fase 6 — Autonomia
21. Ingestão pela interface com fila e preview
22. Importador genérico de planilha
23. Tela de conciliação bancária
24. Reconciliação contra apuração do contador
25. Drill-down universal e exportação

---

## 8. Três decisões que definem o resultado

1. **Competência ou caixa?** Escolher e aplicar em todo o sistema. A mistura atual é a maior fonte de erro.
2. **Construir ou integrar o fiscal?** Apuração tributária brasileira é o item de maior risco/esforço do roadmap.
3. **Partida dobrada, sim ou não?** Sem ela, os números do sistema não são auditáveis — e "resultado exato" fica sendo aparência, não fato.

---

## 9. Observação final

O repositório mostra alguém que já corrigiu problemas sérios com rigor — os blocos `[ERRO ANTERIOR] / [CORREÇÃO]` documentam SQL injection, alíquota inventada, `%tar%` casando com "ALTAIR", EBITDA renomeado como lucro líquido. Esse padrão de trabalho é o principal ativo do projeto, mais que o código em si.

O que falta não é qualidade de execução — é **escopo**. O que está construído está bem construído; está construído cerca de 20% do que um ERP multi-setorial exige. O caminho é longo mas a fundação não precisa ser refeita, o que é a melhor posição possível para se estar.

Uma sugestão de processo: escolha um único setor além do financeiro (RH parece ser sua prioridade) e leve-o a 100% — schema, backend, permissões, front, testes, exportação. Um módulo completo ensina o padrão e vira template para os outros. Dez módulos pela metade não somam um ERP; um completo sim.
