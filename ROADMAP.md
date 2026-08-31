# Roadmap — estado real e todos os próximos passos

> Ponto único de entrada para "o que fazer agora". Substitui a leitura dos
> quatro documentos onde essa resposta estava espalhada.
> **Verificado contra produção em 01/09/2026.**

---

## 1. Onde o sistema está, hoje

**Verificado, não estimado** — os números abaixo saíram de consulta ao banco de
produção no momento em que este arquivo foi escrito.

```
66 testes · 13/13 provas de integridade · 7/7 de schema
25 migrations · 24 aplicadas em produção · 1 pendente (a 30)

4 empresas com CNPJ real e validado
3 contas bancárias com agência e conta separadas
220 orçamentos · R$ 6.093.359,93 · 220 com procedência gravada
1.324 linhas de extrato, das quais 464 são movimento de verdade
172 notas fiscais · 298 itens · 282 com CFOP
9 rotas de API · 10 tabelas ainda vazias
1 de 9 módulos de frontend implementado de fato
```

**O que existe com profundidade:** autenticação, isolamento por RLS, extrato
bancário, clientes, catálogo, dashboard, orçamentos (leitura).

**O que não existe:** pessoal, aptidão, embarques, estoque, produção, compras,
razão contábil, conciliação, ingestão pela interface.

### O que já foi corrigido e está em produção

| | |
|---|---|
| DRE com três defeitos de cálculo | corrigido na Fase 0 |
| Permissão declarada em todas as 30 rotas | com teste que quebra o build |
| CNPJ inventado em duas empresas | substituído, com `CHECK` que impede voltar |
| Agência e conta grudadas no campo do OFX | separadas, conferidas contra PDF |
| `valor_total` de 5 orçamentos com valor de um item | corrigido, R$ 138.438,40 |
| Exposição pública do projeto Supabase legado | fechada |

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

## 2. O que depende de você, e não de código

| Pendência | Trava o quê | Quando |
|---|---|---|
| **Rotacionar a senha do banco** — ficou no histórico do git | segurança, hoje | agora |
| Aplicar a migration 30 em produção | as pendências societárias | agora |
| **Conversa com o contador sobre o plano de contas** | a Fase 1B inteira | começar já: é a única dependência de terceiro |
| Responder as 3 pendências societárias abertas | a DRE ficar honesta | quando puder |
| Preencher a coluna B da planilha nos 12 orçamentos de agosto | rastreabilidade desses negócios | quando puder |
| Corrigir `393` no lugar do número (FEST, L271/272) | idem | quando puder |
| Conferir a agência da conta Bradesco | exibição correta | quando puder |

```bash
npm run db:migrate:prod    # aplica a 30
```

---

## 3. Fase 1A — Fundação transversal · semanas 1-2

**Por que primeiro:** nenhum módulo pode ser entregue conforme o Contrato de
Módulo sem trilha de auditoria. E há prova de que trilha por chamada de
aplicação não funciona: a tabela `clientes_historico_alteracoes` existe, o
código que escreve nela existe, e ela está **vazia**. Alguém esqueceu de chamar.

### Entregas

1. **Trigger genérico de auditoria** em toda tabela multi-tenant. Captura
   `tabela`, `registro_id`, `operacao`, `dados_antes`, `dados_depois`,
   `campos_alterados`, `usuario_id`, `motivo`, `ip_origem`, `ocorrido_em`.
2. **`set_config` de contexto no middleware** — `app.usuario_id`, `app.motivo`,
   `app.ip`. Sem isso o trigger registra a mutação sem saber quem a fez.
3. **`auditoria_acessos`** — registro de leitura de dado sensível, com o
   `concessao_id` que autorizou (o campo nasce nulo até a Fase 2 existir).
4. **Máquina de estados de workflow** genérica: `workflows_definicao`,
   `workflows_estados`, `workflows_transicoes`, `workflows_instancias`.
   A API devolve `transicoes_disponiveis`, e a tela deriva o botão disso.
5. **Centro de custo** e vínculo com projeto/OS.

### Aceite

- Nenhuma escrita em nenhuma tabela sem evento de auditoria — verificado por
  teste que faz `UPDATE` e confere que o evento apareceu.
- A trilha de `clientes` deixa de estar vazia.
- Uma transição de workflow inválida é recusada pelo banco, não pela aplicação.

---

## 4. Fase 1A.5 — CFOP como tabela de decisão · semana 3

**Inserido depois do que a conversa de 31/08 revelou.** São 3 a 5 dias e
sozinho resolve R$ 696 mil de distorção — a melhor relação entre esforço e
correção do projeto inteiro.

### Entregas

1. **`cfop_referencia`** com as flags que o agente de frontend especificou no
   doc 06: `gera_estoque`, `sinal_estoque`, `gera_resultado`, `gera_titulo`,
   `descricao_humana`.
2. **Carga só dos CFOPs que a base realmente usa** — são 15 distintos, não a
   tabela completa. O plano de execução manda começar pelo que existe.
3. **DRE passa a filtrar por `gera_resultado`** em vez de somar toda nota.
4. **Nota com CFOP desconhecido não entra em silêncio** — vira pendência de
   classificação, no mesmo mecanismo das societárias.

### Aceite

- Nenhum CFOP presente na base sem classificação na tabela de decisão.
- A DRE de 2026 exclui os R$ 255.270 de nota emitida que não é venda e os
  R$ 441.000 de nota recebida que não é compra.
- O novo número aparece com a diferença explicada, não substituído em silêncio.

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
