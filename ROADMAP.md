# Roadmap — estado real e todos os próximos passos

> Ponto único de entrada para "o que fazer agora". Substitui a leitura dos
> quatro documentos onde essa resposta estava espalhada.
> **Verificado contra produção em 31/08/2026.**

---

## 1. Onde o sistema está, hoje

**Verificado contra o banco de produção em 31/08/2026**, não estimado. Cada
número abaixo saiu de consulta feita no momento em que este arquivo foi escrito.

```
75 testes em 9 arquivos · 13/13 provas de integridade · 18/19 da pilha
27 migrations · todas aplicadas em produção · 0 pendentes

4 empresas com CNPJ real, validado no dígito verificador
3 contas bancárias com agência e conta separadas
220 orçamentos · R$ 6.093.359,93 · procedência gravada em todos
204 obrigações · 184 ativas · 20 encerradas com prova · 8 faturas agregadoras
3 pendências societárias abertas · R$ 861.000,00
172 notas fiscais em 22 grupos de CFOP
1.324 linhas de extrato, das quais 760 são movimento de verdade
34 tabelas com trigger de auditoria · 628 eventos já gravados
33 rotas de API (4 de autenticação) · 1 de 9 módulos de frontend implementado
```

**Existe com profundidade:** autenticação, isolamento por RLS, trilha de
auditoria no banco, extrato bancário, clientes, catálogo, dashboard, orçamentos
(leitura), obrigações com vigência, pendências de classificação.

**Não existe:** pessoal, aptidão, embarques, estoque, produção, compras, razão
contábil, conciliação, ingestão pela interface.

### O que já foi corrigido e está em produção

| | |
|---|---|
| DRE com três defeitos de cálculo | corrigido na Fase 0 |
| Permissão declarada nas 30 rotas de dado | com teste que quebra o build |
| CNPJ inventado em duas empresas | substituído, com `CHECK` que impede voltar |
| Agência e conta grudadas no campo do OFX | separadas, conferidas contra PDF |
| `valor_total` de 5 orçamentos com valor de um item | corrigido, R$ 138.438,40 |
| Exposição pública do projeto Supabase legado | fechada |
| **Trilha de auditoria por trigger** | 34 tabelas, impossível escapar |
| **Obrigações com vigência e parcela com dono** | o que acaba, e quando acaba |
| **Fatura de cartão marcada como agregadora** | impede contar a compra duas vezes |
| **Rotas de governança** | obrigações, pendências e auditoria pela API |

### O que sabemos que ainda está errado

Isto é o mais importante desta seção. **A DRE não está confiável**, e agora
sabemos nomear por quê:

| Distorção | Valor | Onde se resolve |
|---|---|---|
| Nota emitida que não é venda (CFOP 5916, 5949, 5551) | R$ 255.270 | Fase 1A.5 |
| Nota recebida que não é compra (CFOP 5915) | R$ 441.000 | Fase 1A.5 |
| Movimento de sócio tratado como despesa operacional | R$ 715.000 | pendências abertas |
| "Fornecedor" atribuído por regex de memo bancário | ~R$ 294.000 inflado | Fase 4 |

O EBITDA de 2026 hoje diz **−R$ 440.715,31**. Com essas quatro correções ele
provavelmente muda de sinal. **Nenhum número financeiro deve ser tratado como
fechado até a Fase 1B.**

---

## 2. Por onde você retoma

O relatório de conferência de CFOP está pronto, e é o próximo passo. Ele agrupa
as 172 notas em 22 grupos, com emitente, destinatário, itens e natureza de cada
uma, e traz a minha hipótese por grupo — para você classificar vendo o
documento, não a minha leitura dele.

**Quatro respostas destravam a Fase 1A.5:**

1. **Os três grupos em âmbar** — `5916` retorno de conserto, `5949` nota de
   transporte, `5551` a venda do T-Cross. Na minha leitura saem da receita
   operacional. Se algum deles cobrou serviço junto, a parte cobrada é receita.
2. **As três notas em cinza** — duas da DOF SUBSEA com `5949` de R$ 50 e R$ 100,
   e uma de retorno de mercadoria não entregue. Classificar errado aqui ensina a
   regra errada ao sistema.
3. **O `5405` e os supermercados** — Casas Guanabara, Vianense. Entram como
   compra. Se é consumível de copa, é despesa, não custo de produção.
4. **As NFS-e emitidas** — R$ 221.280 sem CFOP, natureza de manutenção. Se
   alguma for repasse ou reembolso, não é receita.

Com essas respostas eu escrevo a tabela `cfop_referencia` com as flags
`gera_resultado` / `gera_estoque` / `gera_titulo`, e a DRE para de somar às
cegas.

```bash
python scripts/relatorios/gerar_cfop.py    # regera o relatório
```

### As três pendências societárias, abertas em produção

| Código | Envolve | Pergunta |
|---|---|---|
| `SOC-2026-SAQUES-AGOSTO` | 11 lançamentos, R$ 615.000 | Pagamento pela compra da participação, ou há retirada pessoal misturada? |
| `SOC-2026-APORTES` | 5 lançamentos, R$ 146.000 | Aporte de capital, devolução, ou mútuo? |
| `SOC-2026-SAQUES-ABR-MAI` | 2 lançamentos, R$ 100.000 | Anteriores ao acordo: parte do negócio, distribuição, ou pessoal? |

Agora dá para responder pela API, sem SQL:

```
GET  /api/v1/governanca/pendencias
POST /api/v1/governanca/pendencias/:id/resolver
```

### O que depende de você, e não de código

| Pendência | Trava o quê | Quando |
|---|---|---|
| **Rotacionar a senha do banco** — ficou no histórico do git | segurança | agora |
| **Conversa com o contador sobre o plano de contas** | a Fase 1B inteira | começar já: única dependência de terceiro |
| Responder as 4 perguntas do relatório de CFOP | a Fase 1A.5 | próxima sessão |
| Responder as 3 pendências societárias | a DRE ficar honesta | próxima sessão |
| `TRIENAL` e `SEMANAL` faltando no enum | 3 linhas do Hostgator viraram `UNICA` | junto com a 1A.5 |
| Preencher a coluna B da planilha nos 12 orçamentos de agosto | rastreabilidade | quando puder |
| Corrigir `393` no lugar do número (FEST, L271/272) | idem | quando puder |
| Conferir a agência da conta Bradesco | exibição correta | quando puder |

### Como voltar ao ambiente

```bash
npm run homolog:subir      # PostgreSQL 17 local, em Docker
npm start                  # API na porta 3000
npm run mock               # fronteira para o frontend, em outro terminal
```

`http://localhost:4000` — usuário `usuario9bb5c1@homologacao.local`, senha
`homologacao`.

Se a porta 3000 estiver presa por um processo antigo, `pkill` do git-bash não
alcança processo iniciado pelo npm no Windows. Use PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 3. Fase 1A — Fundação transversal · **3 de 5 entregues**

**Por que primeiro:** nenhum módulo pode ser entregue conforme o Contrato de
Módulo sem trilha de auditoria. E há prova de que trilha por chamada de
aplicação não funciona: a tabela `clientes_historico_alteracoes` existe, o
código que escreve nela existe, e ela estava **vazia**. Alguém esqueceu de
chamar, e nada acusou por meses.

### Entregas

1. ✅ **Trigger genérico de auditoria** — `database/31_auditoria_generica.sql`.
   Aplicado a **34 tabelas**, com `fn_auditoria()` em `SECURITY DEFINER`.
   Captura `tabela`, `registro_id`, `operacao`, `dados_antes`, `dados_depois`,
   `campos_alterados`, `usuario_id`, `usuario_email`, `motivo`, `ip_origem`,
   `origem`, `ocorrido_em`.

   Três decisões que valem lembrar:
   - `updated_at` **não conta** como campo alterado. Sem isso, todo `UPDATE`
     que não mudou nada geraria evento, e a trilha viraria ruído.
   - `auditoria_mascarar()` apaga `senha_hash`, `token` e `conteudo_xml` antes
     de gravar. Guardar segredo na auditoria criaria uma segunda cópia
     justamente do que se está protegendo.
   - `REVOKE INSERT, UPDATE, DELETE ... FROM eco_app`. Trilha que a aplicação
     pode reescrever não serve de trilha.

2. ✅ **Contexto de auditoria no middleware** — `tenant.middleware.ts` preenche
   `usuarioEmail`, `ipOrigem` e `origem`; o pool aplica com `set_config(...,
   true)`, transaction-local.

   **Este item quase passou como pronto sem estar.** O contexto tinha sido
   adicionado ao pool mas o middleware não o preenchia, e o `fallback` do
   trigger gravava `origem = 'API'` mesmo assim — o que fazia parecer que
   funcionava. Só apareceu porque um processo antigo segurava a porta 3000.
   `tests/auditoria.test.js` agora exercita o pool direto, sem servidor.

3. ⬜ **`auditoria_acessos`** — a tabela existe (migration 31), mas nada
   escreve nela ainda. Registro de *leitura* de dado sensível espera a Fase 2,
   quando existir o `concessao_id` que autorizou.

4. ⬜ **Máquina de estados de workflow** — `workflows_definicao`,
   `workflows_estados`, `workflows_transicoes`, `workflows_instancias`. A API
   devolve `transicoes_disponiveis` e a tela deriva o botão disso.

5. ⬜ **Centro de custo** — **deliberadamente parado.** Você foi explícito:
   nada de inventar centro de custo sem contexto. A taxonomia tem que sair das
   categorias reais da planilha de receitas e despesas, cruzada com a descrição
   de cada gasto. Isso é conversa, não código.

### Aceite

- ✅ Nenhuma escrita sem evento de auditoria — há teste que percorre
  `pg_class` e falha se **qualquer** tabela de negócio ficar sem o trigger.
- ✅ A trilha deixou de estar vazia: **628 eventos** em produção.
- ⬜ Transição de workflow inválida recusada pelo banco.

---

## 4. Fase 1A.5 — CFOP como tabela de decisão · **relatório pronto, aguardando você**

São 3 a 5 dias de trabalho e sozinho resolve **R$ 696 mil** de distorção — a
melhor relação entre esforço e correção do projeto inteiro.

**Estado:** o relatório de conferência está gerado
(`scripts/relatorios/gerar_cfop.py`), com as 172 notas em 22 grupos, cada uma
com emitente, destinatário, itens e natureza. O que falta é a sua
classificação — as quatro perguntas da seção 2.

**Por que o relatório precisou existir:** o CFOP de uma nota *recebida* é o
código do **fornecedor**, não o seu. Foi assim que apareceu o caso mais caro —
a DOF SUBSEA emitiu `5915` para vocês, mandando equipamento para conserto. São
R$ 441.000 que hoje entram como compra de insumo e derrubam o lucro bruto.

### Entregas

1. **`cfop_referencia`** com as flags do doc 06: `gera_estoque`,
   `sinal_estoque`, `gera_resultado`, `gera_titulo`, `descricao_humana`.
2. **Carga só dos CFOPs que a base usa** — são 15 distintos, não a tabela
   completa. Começar pelo que existe.
3. **DRE filtra por `gera_resultado`** em vez de somar toda nota.
4. **CFOP desconhecido não entra em silêncio** — vira pendência de
   classificação, no mesmo mecanismo das societárias.
5. **`TRIENAL` e `SEMANAL` no enum `recorrencia_obrigacao`** — carona nesta
   migration. Hoje as 3 linhas do Hostgator (plano trienal, vence em 2028)
   caíram em `UNICA` e perderam a informação de recorrência.

### Aceite

- Nenhum CFOP presente na base sem classificação na tabela de decisão.
- A DRE de 2026 exclui os R$ 255.270 de nota emitida que não é venda e os
  R$ 441.000 de nota recebida que não é compra.
- O novo número aparece **com a diferença explicada**, não substituído em
  silêncio.

---

## 5. Fase 3A — Pessoal e aptidão · semanas 3-7

**O motivo do projeto.** O incidente que o originou não é evento passado: a
condição que o causou vale a cada alocação feita hoje.

### Entregas

1. Cadastro completo, **CLT e PJ**, com a distinção `colaborador ≠ usuario`.
2. Cargos, funções, departamentos.
3. Documentos, formação, experiências.
4. **Certificações e exames ocupacionais com validade.**
5. Requisitos configuráveis por função e por projeto/cliente.
6. Férias, afastamentos, alocações.
7. **`aptidao_colaborador`** — função de banco com as 10 verificações,
   avaliando **cada dia** do intervalo `[embarque, desembarque]`, não só o
   primeiro.
8. Embarques ligados a projeto → cotação → cliente.
9. **Bloqueio de alocação inapta**, com override auditado e justificado —
   reconfirmação de senha agora, MFA na semana 13.
10. Alertas de vencimento em 90/60/30/15 dias.
11. Tela de consulta: *"quem está apto para embarcar em [data], função [X]"*.

**Fica de fora desta fase:** remuneração e folha (3.2 e 3.11). Elas dependem de
segurança de campo, que é a Fase 2. Todo o resto não depende.

### Aceite

**Reproduzir o incidente que originou o projeto.** O sistema deve recusar a
alocação e explicar exatamente por quê. E o caso que a conferência manual nunca
pega: certificação que vence **no meio** do período deve bloquear.

---

## 6. Fase 1B — Partida dobrada · semanas 7-10

**Depende do contador.** Comece a conversa agora.

### Entregas

1. Plano de contas — estrutura e carga inicial **validada com o contador**.
2. `lancamentos_contabeis` com `data_competencia` + `data_caixa`;
   `lancamentos_partidas` com trigger de balanceamento.
3. Regras de contabilização configuráveis: documento → lançamento.
4. Fechamento de período com bloqueio de retroativo — trigger
   `BEFORE INSERT OR UPDATE OR DELETE`, por empresa.
5. **Backfill**: gerar lançamentos de todo o histórico já ingerido, com
   conferência mês a mês.
6. DRE reescrita lendo do razão; fluxo de caixa lendo `data_caixa`.

### Aceite

- Σ débitos = Σ créditos em 100% dos lançamentos.
- A DRE do razão bate com a DRE corrigida da Fase 1A.5.
- Período fechado rejeita lançamento retroativo.

---

## 7. Fase 2 — Autorização · semanas 11-13

1. RBAC granular: `permissoes`, `perfis`, `perfis_permissoes`, `usuarios_perfis`.
2. Migração dos 4 papéis atuais para perfis equivalentes.
3. **Segurança em nível de campo** — o backend não envia o que o usuário não
   pode ver; a máscara na tela é consequência, não decoração.
4. Acesso just-in-time com escopo, validade e expiração.
5. Sessões com revogação; refresh token.
6. Troca e reset de senha pelo usuário.
7. **MFA (TOTP)** obrigatório para perfis com acesso a folha e caixa.
8. Tela de administração de usuários, perfis e concessões.

**Aceite:** matriz testada automaticamente, cada perfil × cada rota. Concessão
expirada deixa de funcionar sem intervenção.

---

## 8. Fase 3B — Remuneração e folha · semanas 14-15

Depende da Fase 2 (campo protegido) e da 1B (lançamento contábil).

1. Histórico de remuneração com vigência, criptografado.
2. Diárias, horas extras, folha com lançamento contábil automático.

---

## 9. Fase 4 — Motor fiscal · semanas 16-20

1. Tabelas de referência versionadas: NCM, CEST, CST/CSOSN, origem, CNAE, IBGE.
2. **Parser NF-e completo** — todos os blocos, incluindo DI, duplicatas e
   transporte.
3. `documentos_fiscais_eventos`: cancelamento, CC-e, manifestação.
4. Conferência automática: soma dos itens × totalizadores do XML.
5. Duplicatas gerando títulos a pagar/receber.
6. **Parser NFS-e por município** — medir o acervo antes; RJ e Macaé primeiro;
   parser genérico marcando `PARCIAL` em vez de recusar município novo.
7. **Classificação de despesa pela taxonomia real**, substituindo a regex de
   memo: Prestador de Serviço, DP, Fornecedor, Infraestrutura, Benefício,
   Tributo, Taxa e Tarifa, Cartão de Crédito, Consumíveis, Empréstimo,
   Dividendo, Insumos.
8. Enriquecimento de CNPJ com histórico versionado e alerta de mudança de
   situação cadastral.

**Aceite:** reprocessar todo o acervo de XML com conferência exata contra os
totalizadores.

**Nota:** a extração de XML do portal do governo é manual e penosa (captcha,
arquivo por arquivo), então o acervo está incompleto — esperar valores novos
aparecendo. O certificado A1 resolveria, mas só depois do MFA e da auditoria de
leitura existirem: guardar certificado que assina em nome da empresa num
sistema sem essas duas coisas troca um trabalho chato por um risco sério.

---

## 10. Fase 5 — Operação · semanas 21-27

1. Estoque com custo médio ponderado móvel.
2. Rastreabilidade por lote e número de série.
3. NF-e de entrada alimentando estoque.
4. **Produção: BOM, ordens, apontamento — CMV real.**
5. Compras: requisição → cotação → pedido → recebimento, com alçadas.
6. **Ativo imobilizado e depreciação** — fecha a lacuna do lucro líquido.
7. Field service; rentabilidade por OS e por projeto.

**Aceite:** inventário físico de amostra bate com o saldo. A DRE deixa de
exibir `lucro_liquido: null`.

O projeto Supabase legado tem BOM real de 6 produtos, 17 insumos e 32 linhas de
estrutura, além de R$ 2,53 milhões em ativo imobilizado. Ver
`database/PROJETO-LEGADO.md` — é insumo desta fase, com os cuidados listados lá.

---

## 11. O que o Gemini faz em paralelo

Nada do que está acima bloqueia os dois blocos em que ele está. Detalhe em
`frontend-specs/respostas-claude/R07`.

| Bloco | Depende de | Estado |
|---|---|---|
| 1 · Design system e os 5 estados | nada | **pode agora** |
| 2 · Construtor de orçamentos | mock (`npm run mock`) | **pode agora** |
| 3 · DataGrid sobre 1.324 transações | rota que já existe | **pode agora** |
| 4 · DRE didática | rota que já existe, com ressalvas | **pode agora** |
| 5 · Simulador de runway | rota que já existe | **pode agora** |
| Fila de pendências | migration 30 | após a 30 em produção |
| Gaveta de auditoria | Fase 1A | semana 2 |
| Gantt de aptidão | Fase 3A | semana 7 |
| Árvore do plano de contas | Fase 1B | semana 10 |
| Acesso JIT e máscara real | Fase 2 | semana 13 |
| Central de ingestão | Fase 4 | semana 20 |
| Estoque e BOM | Fase 5 | semana 27 |

**Conceito de tela novo, que não estava em spec nenhuma:** a **fila de
pendências**. A migration 30 criou `pendencias_classificacao` — perguntas em
aberto com a evidência inteira. Serve muito além de sócio: memo desconhecido,
CFOP novo, divergência de data. É onde uma pessoa decide o que o sistema não
pode adivinhar.

### Dois documentos dele que ficaram para trás

`SYSTEM_WORKFLOW_ARCHITECTURE.md` e `WORKFLOW_ECOSYSTEM.md` datam de 27/08 e
afirmam *"Status: Em Produção / Carga 100% Real Ativa"*. São os primeiros
arquivos que outro agente lê ao entrar no repositório, e hoje ensinam coisas
erradas — nomes de empresa, CNPJ, contas bancárias, valores de orçamento.

Não foram editados: a regra do canal é não mexer no arquivo do outro. Cabe a
ele atualizar ou aposentar. Se o `WORKFLOW_ECOSYSTEM.md` é gerado
automaticamente, ou o gerador roda no CI, ou o arquivo sai.

---

## 12. Pendências de classificação em aberto

Registradas em `pendencias_classificacao` com a evidência completa — data,
valor, empresa, banco, conta e memo de cada lançamento. Nenhuma decisão foi
tomada, porque decisão societária não é do responsável pelo projeto.

| Código | Envolve | Pergunta |
|---|---|---|
| `SOC-2026-SAQUES-AGOSTO` | 11 lançamentos · R$ 615.000 | Pagamento pela compra da participação, ou há retirada pessoal misturada? |
| `SOC-2026-SAQUES-ABR-MAI` | 2 lançamentos · R$ 100.000 | Anteriores ao acordo; parte do negócio, distribuição, ou pessoal? |
| `SOC-2026-APORTES` | 5 lançamentos · R$ 146.000 | Aporte de capital, devolução, ou mútuo? |

```sql
SELECT codigo, titulo, valor_envolvido, pergunta, hipotese
  FROM pendencias_classificacao WHERE status = 'ABERTA';
```

Ou pela API, sem SQL:

```
GET  /api/v1/governanca/pendencias
POST /api/v1/governanca/pendencias/:id/resolver
```

---

## 13. Divisão de trabalho e comunicação

- **Claude Code** — `src/ database/ scripts/ tests/ mock/`
- **Antigravity/Gemini** — `public/`
- **Fronteira** — `public/apiService.js` e `CONTRATO-API-FRONTEND.md`

Os dois agentes **não se comunicam direto**: rodam em produtos diferentes, sem
canal entre eles. A comunicação é por arquivo — Gemini escreve em
`frontend-specs/`, Claude em `frontend-specs/respostas-claude/`, ninguém edita o
arquivo do outro.

O acoplamento real é o **servidor de fronteira** (`npm run mock`): serve as
rotas ainda não escritas na forma exata do contrato, e
`tests/mock-contrato.test.js` quebra o build de quem divergir.

```bash
npm run homolog:espelhar   # produção anonimizada
npm start                  # API real
npm run mock               # fronteira, outro terminal
```

`http://localhost:4000` · `gestor@homologacao.local` / `homologacao`

---

## 14. Como as regras são mantidas

**Regra que vive só em prosa é ignorada.** O que funcionou neste projeto foram
as regras que quebram alguma coisa quando violadas:

| Regra | O que a impõe |
|---|---|
| Rota nova sem permissão não sobe | `tests/rotas-permissao.test.js` |
| Migration não testada não entra em produção | `database/homologado.json` |
| CNPJ inventado não entra no banco | `chk_empresas_cnpj_valido` |
| Consulta que ignora o saldo do dia não passa | `tests/saldo-informativo.test.js` |
| Mock e backend não podem divergir | `tests/mock-contrato.test.js` |
| Lucro líquido não vira apelido do EBITDA | `tests/dre-calculo.test.js` |
| Movimento de sócio não sai de INDEFINIDO sem autor | `chk_definicao_tem_autor` |
| Escrita em produção sem confirmação e backup | `scripts/lib/ambiente.js` |

**Ao criar uma regra nova, escreva o teste antes do parágrafo.** Se não der para
testar, provavelmente é preferência, não regra.

---

## 15. A lição que este projeto já pagou para aprender

Os erros mais caros até aqui não foram de código:

1. A DRE reportava EBITDA positivo porque R$ 464 mil em pagamento a fornecedor
   era consultado e descartado.
2. O `valor_total` de 5 orçamentos guardava o valor de um item em vez da soma —
   R$ 138 mil subnotificados no funil comercial.
3. Um bug de leitura de XML fez uma célula vazia engolir a vizinha, e três
   conclusões erradas sobre a planilha foram construídas em cima disso.
4. R$ 715 mil de movimento societário estavam classificados como despesa
   operacional, rachados em duas categorias por acaso da redação do banco.

**Nenhum foi achado relendo código.** Todos saíram de conferir contra uma
segunda fonte — a planilha original, os PDFs enviados ao cliente, os CFOPs das
notas, e o Diego olhando a tela e discordando.

Por isso a regra que vale mais que qualquer processo aqui: **antes de afirmar
que um dado está certo, confira contra algo que não seja você.**
