# Sequenciamento decidido — Fases 1 a 6

**Documento 4.** Complementa os três anteriores. Fecha a decisão que a Fase 0
deixou em aberto: partida dobrada inteira antes do módulo de pessoal, ou
fatiada para antecipar o motor de aptidão.

**Decisão: fatiar a Fase 1.** O motor de aptidão sai por volta da semana 6, e
não da 13.

---

## A pergunta

O plano original é sequencial: Fase 1 (fundação contábil, 4-5 sem) → Fase 2
(autorização, 2-3 sem) → Fase 3 (pessoal e aptidão, 4-5 sem). O motor de
aptidão — a razão pela qual o projeto existe — chega na semana 12-14.

A pergunta é se essa ordem é uma dependência técnica real ou apenas a ordem em
que os assuntos foram escritos.

---

## O que a evidência diz

### O risco que está correndo hoje

O documento de decisões arquiteturais é direto sobre o incidente que originou o
projeto:

> *"O erro não foi de atenção. Foi de arquitetura de informação: a informação
> necessária para a decisão estava espalhada e a decisão precisava ser tomada
> rápido. Nessa configuração, o erro é questão de tempo — qualquer pessoa
> cometeria."*

Isso não descreve um evento passado. Descreve uma condição que **continua
valendo a cada alocação feita**, e que só termina quando o sistema recusa a
alocação inválida. Sete semanas a mais nessa condição é o custo real de manter
a ordem original — e é um custo que se paga em risco operacional, não em
cronograma.

### A dependência técnica é menor do que parece

Dos 12 itens da Fase 3, **dez não tocam contabilidade**: cadastro, documentos,
certificações, exames, requisitos por função, férias e afastamentos, o motor de
aptidão, embarques, bloqueio com override auditado, alertas de vencimento, e a
tela de "quem está apto".

Dois tocam: **3.2 (histórico de remuneração)** e **3.11 (diárias, horas extras,
folha com lançamento contábil)**.

E são exatamente os mesmos dois que precisam da Fase 2 — segurança em nível de
campo, MFA, auditoria de leitura de salário. Os dois itens dependentes de
contabilidade e os dois itens dependentes de autorização **são o mesmo par**.
Isso não é coincidência: é a fronteira natural do módulo. Separá-los não é
gambiarra de cronograma, é reconhecer onde o módulo se divide sozinho.

### A Fase 2 vale pouco agora — e vai valer muito depois

Você é a única pessoa usando o sistema. RBAC granular, concessão de acesso
just-in-time com validade, e MFA protegem contra um modelo de ameaça
multiusuário que ainda não existe. A matriz de 4 papéis aplicada na Fase 0 é
proporcional ao que há hoje.

A Fase 2 passa a ser urgente no instante exato em que salário entra no banco.
Então ela se posiciona sozinha: imediatamente antes disso.

### O que não pode ser adiado de jeito nenhum

O princípio 1 do plano de execução: *"Módulo sem trilha de auditoria não é
entregue com pendência — é dívida que contamina os dados dele desde o primeiro
dia, e você não consegue reconstruir o histórico depois."*

O item **1.5 (trigger genérico de auditoria + contexto de sessão no middleware)**
não é parte da contabilidade. É infraestrutura de que todo módulo depende, e o
Contrato de Módulo o exige no item 3. Construir a Fase 3 sem ele produziria
exatamente a dívida que o princípio descreve.

O mesmo vale para **1.6 (auditoria de leitura)** — exame ocupacional e restrição
médica são dado de saúde, e a LGPD cobra saber quem leu — e para **1.7 (máquina
de estados)**, que é o mecanismo do override auditado do item 3.9.

Ou seja: a Fase 1 não é um bloco monolítico. Ela contém uma **fundação
transversal**, de que tudo depende, e uma **fundação contábil**, de que só o
financeiro depende. A primeira é pré-requisito de qualquer coisa; a segunda não.

---

## A ordem

| Fase | Conteúdo | Duração | Acumulado |
|---|---|---|---|
| **1A — Fundação transversal** | 1.5 auditoria de escrita · 1.6 auditoria de leitura · 1.7 máquina de estados · 1.3 centro de custo | ~2 sem | 2 sem |
| **3A — Pessoal e aptidão** | 3.1 · 3.3 · 3.4 · 3.5 · 3.6 · 3.7 · 3.8 · 3.9 · 3.10 · 3.12 | ~4 sem | **6 sem** |
| **1B — Partida dobrada** | 1.1 plano de contas · 1.2 lançamentos · 1.4 regras · 1.8 fechamento · 1.9 backfill · 1.10 DRE do razão | ~4 sem | 10 sem |
| **2 — Autorização granular** | 2.1 a 2.8 | ~3 sem | 13 sem |
| **3B — Remuneração e folha** | 3.2 histórico criptografado · 3.11 diárias, horas extras, folha | ~2 sem | 15 sem |
| **4 — Motor fiscal** | 4.1 a 4.10 | ~5 sem | 20 sem |
| **5 — Operação** | 5.1 a 5.8 | ~6 sem | 26 sem |
| **6 — Autonomia** | contínuo | — | — |

O total não muda — muda **quando o problema que originou o projeto deixa de
poder acontecer**: semana 6 em vez de 12-14.

### Isso não viola "uma frente por vez"

O princípio 5 proíbe seis módulos em 60%, não sequência entrelaçada. Cada fatia
aqui é **fechada antes da seguinte começar**, com o Contrato de Módulo como
critério. 1A entrega auditoria funcionando em todas as tabelas; 3A entrega o
módulo de pessoal inteiro menos remuneração; 1B entrega o razão. Nenhuma fica
pela metade esperando a outra.

---

## O que essa escolha custa

Vale dizer com clareza, porque toda escolha de ordem tem um lado que perde.

**A DRE continua aproximada por mais quatro semanas.** Hoje ela declara
`cmv_disponivel: false`, `lucro_liquido: null` e regime de competência
explícito — os números que ela dá são honestos sobre o que não sabem.

Mas note: **a Fase 1B sozinha não resolveria nenhuma dessas três lacunas.** CMV
real exige controle de estoque (5.1) e estrutura de produto (5.4); lucro líquido
exige depreciação de ativo imobilizado (5.6). O que a 1B resolve é a separação
competência/caixa e a rastreabilidade até o lançamento — importante, mas não é
o que faz o EBITDA de −R$ 440.715,31 virar um número fechado.

O custo concreto, então, é mais estreito do que parece: **a reconciliação mensal
contra a apuração do contador escorrega ~4 semanas.** É um custo real e vale
aceitar conscientemente.

**Contrapartida do outro lado:** a Fase 3A é o primeiro módulo a cumprir o
Contrato de Módulo inteiro, e por isso vira o template dos demais. Fazê-la
antes significa que a 1B, a 2 e a 4 já nascem com um padrão testado, em vez de
inventarem o padrão pelo caminho.

---

## Riscos desta ordem, e o que os contém

| Risco | Contenção |
|---|---|
| A Fase 3A cria tabelas que depois precisam de gancho contábil | Nada em 3A carrega valor financeiro. Alocação, certificação e embarque não geram lançamento. O que gera é folha e diária — e está em 3B, depois da 1B. |
| Dado pessoal sensível (exame ocupacional, documento) protegido só pela matriz de 4 papéis | 1.6 entra **antes** de 3A: toda leitura fica registrada desde o primeiro dia. Exame e documento restritos a `Gestor_CLevel`. Salário, que é o dado mais sensível, só entra em 3B — depois da Fase 2. |
| O backfill histórico (1.9) fica para mais tarde e o acervo cresce | O acervo cresce por OFX e XML, que continuam sendo ingeridos e ficam disponíveis. Backfill de 10 meses ou de 14 é o mesmo trabalho. |
| Requisitos de certificação offshore mal modelados travam a operação | `funcoes_requisitos` e `projetos_requisitos` são tabelas editáveis pelo RH, não código. Norma que muda não vira tarefa de desenvolvimento. |

---

## Convergência com o frontend

`frontend-specs/04_MODULO_PESSOAL_APTIDAO_E_EMBARQUES.md` já está escrito, e
`06_DEMANDAS_DE_BACKEND_E_DB_DERIVADAS_DO_FRONTEND.md` especifica a assinatura
de `aptidao_colaborador` como função de banco, com a exigência correta:

> *"A validação deve cobrir todos os dias do intervalo entre `p_data_inicio` e
> `p_data_fim`, e não apenas a data inicial."*

É a mesma exigência do documento de decisões — certificado que vence no meio de
um embarque de 28 dias é impedimento. Os dois lados chegaram nela de forma
independente, o que é um bom sinal sobre a modelagem.

Antecipar a Fase 3 faz os dois agentes convergirem no mesmo módulo, em vez de o
frontend ficar mais sete semanas produzindo tela sem backend — que é como as
onze cascas atuais nasceram.

---

## Marco que muda a operação da empresa

**Semana 6, fim da Fase 3A:** reproduzir o incidente que originou o projeto. O
sistema deve **recusar** a alocação e dizer exatamente por quê — incluindo o
caso da certificação que vence no meio do período, que é o que a conferência
manual nunca pega.

É o aceite da fase, e é o único que responde à pergunta que fez o projeto
existir.
