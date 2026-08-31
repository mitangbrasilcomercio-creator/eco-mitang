# Eco-Mitang — Plano de Execução

**Documento 3 de 3.** Como sair do estado atual até a "perfeição possível", na ordem certa.
Complementa o Diagnóstico Técnico (doc 1) e as Decisões Arquiteturais (doc 2).

---

## 1. O que "perfeição possível" significa, em termos verificáveis

Antes de planejar, é preciso definir o alvo de forma que se possa dizer objetivamente se foi atingido. Perfeição não é meta auditável; **estas três propriedades são:**

| Propriedade | Definição operacional | Como se verifica |
|---|---|---|
| **Rastreabilidade** | Todo número exibido chega ao lançamento de origem em no máximo 3 cliques | Teste manual em amostra aleatória de 20 números por tela |
| **Reconciliação** | O sistema compara seu resultado com uma fonte externa e acusa divergência | Divergência entre sistema e extrato/contador/inventário = 0, ou listada item a item |
| **Ausência de falha silenciosa** | Nenhum erro se dissolve: ou é bloqueado, ou é marcado, ou é registrado | Toda mutação tem evento de auditoria; todo número sem base vem marcado |

**O sistema estará "pronto" quando essas três forem verdadeiras em todos os módulos ativos.** Não quando tiver todas as funcionalidades imagináveis — esse alvo não existe e persegui-lo é a forma mais comum de um projeto assim nunca terminar.

---

## 2. Sete princípios que valem para todas as fases

Estes são os que, se abandonados sob pressão, custam mais caro depois.

1. **Nada entra em produção sem auditoria.** Módulo sem trilha de auditoria não é "entregue com pendência" — é dívida que contamina os dados dele desde o primeiro dia, e você não consegue reconstruir o histórico depois.

2. **Nenhuma tela nova antes do backend correspondente.** O repositório já tem 11 cascas de front. Congelamento imediato: nenhuma página nova até que exista API real por trás. Cada casca adicional é uma promessa que o sistema não cumpre e mina a confiança de quem usa.

3. **Se não tem base, não estima.** Mantenha o princípio que já está no código (`base_tributaria_disponivel`, `lucro_liquido_parcial`). Ele é a coisa mais valiosa do projeto. Vale para tudo que for construído.

4. **Migration nunca reescreve, sempre acrescenta.** Numeração sequencial, uma migration por mudança, sem editar migration já aplicada. E toda migration precisa de rollback testado.

5. **Uma frente por vez.** A maior ameaça a este projeto não é dificuldade técnica — é ter seis módulos em 60%. Módulo aberto é módulo terminado antes do próximo.

6. **Documente o erro anterior, não só a correção.** O padrão `[ERRO ANTERIOR] / [CORREÇÃO]` que já existe no código é excelente e raro. Mantenha em toda mudança relevante — é o que impede que o mesmo erro volte daqui a seis meses, por você ou por um agente.

7. **Teste antes de considerar pronto.** Especificamente para cálculo financeiro: cenário de entrada conhecido → resultado esperado escrito à mão → assert. Sem isso não há como saber se uma mudança quebrou a DRE.

---

## 3. Semana 0 — Preparação (fazer antes de qualquer código)

Esta semana não produz funcionalidade e é a que mais economiza tempo depois.

### 3.1 Ambiente — o risco mais urgente hoje

**Você está desenvolvendo contra o Supabase de produção.** O `.env.example` aponta para o projeto real, e os scripts (`db:migrate`, `db:reingest`) rodam direto nele. Uma migration com erro atinge dados reais sem rede de proteção.

Ações:
- [ ] Criar projeto Supabase **de homologação**, separado
- [ ] Rotina de restore de produção → homologação, com anonimização de dados pessoais e salários
- [ ] Backup automático de produção verificado (não basta estar ligado — teste um restore de verdade uma vez)
- [ ] `.env.producao` e `.env.homologacao` distintos, com aviso no terminal quando o alvo for produção
- [ ] Bloquear `db:migrate` contra produção sem confirmação explícita

### 3.2 Rede de proteção técnica

- [ ] **CI no GitHub Actions** — não existe hoje. Deve rodar em todo PR: `tsc --noEmit`, testes, lint, e a verificação de rotas da seção 3.3
- [ ] `main` protegida: sem push direto, PR obrigatório
- [ ] Convenção de branch: `fase-1/partida-dobrada`, `fase-3/motor-aptidao`
- [ ] Cobertura de teste medida e reportada (não precisa de meta alta agora, precisa ser visível)

### 3.3 Trava de regressão de segurança

O problema encontrado no diagnóstico — `exigirPapel` em apenas 2 de dezenas de rotas — vai se repetir se depender de disciplina humana. Construa a trava agora:

```
Teste que percorre todas as rotas registradas no Express e falha
se alguma rota de dado não declarar explicitamente uma permissão.
```

Rota sem permissão declarada quebra o build. É o único mecanismo que funciona a longo prazo.

### 3.4 Congelamento e inventário

- [ ] Congelar as 11 páginas-casca do front (não deletar — marcar como não disponíveis na navegação)
- [ ] Listar os relatórios/planilhas que a empresa usa hoje fora do sistema. **Esta lista é o requisito real** — é o que as pessoas de fato precisam, muito melhor que requisito imaginado em reunião
- [ ] Levantar o volume de dados históricos a migrar (quantos meses de OFX, quantas NF-e, quantos colaboradores)

---

## 4. O Contrato de Módulo

**Nenhum módulo é considerado pronto sem os 12 itens abaixo.** Esta lista é o que impede "módulo em 60%" — e é o que você entrega ao Claude Code como definição de escopo.

**Dados**
1. Schema com constraints reais (FK, CHECK, UNIQUE) — integridade no banco, não só na aplicação
2. RLS por `empresa_id` em toda tabela multi-tenant
3. Trigger de auditoria ativo em toda tabela
4. Migration com rollback testado em homologação

**Backend**
5. Camadas completas: repository, service, controller, routes, schema (Zod), types
6. Permissão declarada em **toda** rota
7. Lançamento contábil automático, quando o módulo gera valor
8. Tratamento de erro sem vazar stack trace

**Qualidade**
9. Testes: regra de negócio, cálculo com cenário conhecido, matriz de permissões, isolamento RLS
10. Documentação no padrão `[ERRO ANTERIOR] / [CORREÇÃO]` quando corrigir algo

**Interface**
11. Front consumindo API real — zero dado fixo no código; estados de carregando, vazio e erro tratados; campos de completude (`sem_dados`, `parcial`) exibidos
12. Exportação (Excel/PDF) e drill-down até a origem

---

## 5. As fases

Estimativas assumem **uma pessoa dedicada com apoio de agente**. Ajuste conforme sua capacidade real — é a variável que mais muda o cronograma.

---

### Fase 0 — Correções imediatas · ~1 semana

Corrige números que hoje estão errados nas telas que você já usa.

| # | Entrega |
|---|---|
| 0.1 | Decidir e implementar o destino de `FORNECEDORES_OPERACIONAIS` no DRE (hoje é consultado e descartado) |
| 0.2 | Separar tributos sobre receita (dedução) de tributos sobre resultado — fim da dupla contagem |
| 0.3 | Renomear `cmv_insumos` → `compras_insumos_periodo` e marcar `cmv_disponivel: false` |
| 0.4 | `exigirPermissao` em todas as rotas + teste que quebra o build |
| 0.5 | Resolver `abac.types.ts` (implementar ou remover — código morto em segurança é armadilha) |
| 0.6 | Testes de DRE com cenários conhecidos |
| 0.7 | CI, homologação, branch protegida (Semana 0) |

**Aceite:** DRE recalculada bate com conferência manual em planilha para 3 meses fechados. Usuário `Vendedor` recebe 403 ao tentar ler extrato.

---

### Fase 1 — Fundação imutável · ~4-5 semanas

**A fase mais importante.** Tudo depois depende dela; nada construído antes dela sobrevive sem retrabalho.

| # | Entrega |
|---|---|
| 1.1 | Plano de contas (estrutura + carga inicial validada com seu contador) |
| 1.2 | `lancamentos_contabeis` com `data_competencia` + `data_caixa`; `lancamentos_partidas` com trigger de balanceamento |
| 1.3 | Centro de custo e vínculo com projeto/OS |
| 1.4 | Regras de contabilização configuráveis (documento → lançamento) |
| 1.5 | Trigger genérico de auditoria + `set_config` de contexto no middleware |
| 1.6 | `auditoria_acessos` para leitura de dado sensível |
| 1.7 | Máquina de estados de workflow (genérica) |
| 1.8 | Fechamento de período com bloqueio de retroativo |
| 1.9 | **Backfill**: gerar lançamentos de todo o histórico já ingerido |
| 1.10 | DRE reescrita lendo do razão; fluxo de caixa lendo `data_caixa` |

**Sobre o 1.9 — o item que costuma ser esquecido:** você já tem meses de OFX e NF-e no banco. Eles precisam virar lançamentos contábeis retroativamente, ou o sistema começa do zero e perde o histórico. Reserve tempo real para isso e trate como entrega própria, com conferência mês a mês.

**Aceite:** Σ débitos = Σ créditos em 100% dos lançamentos. DRE do razão bate com a DRE anterior corrigida. Nenhuma escrita em nenhuma tabela sem evento de auditoria (verificado por teste). Período fechado rejeita lançamento retroativo.

---

### Fase 2 — Autorização · ~2-3 semanas

Pode correr em paralelo com o fim da Fase 1. Precisa estar pronta antes da Fase 3, que lida com salários.

| # | Entrega |
|---|---|
| 2.1 | RBAC granular: `permissoes`, `perfis`, `perfis_permissoes`, `usuarios_perfis` |
| 2.2 | Migração dos 4 papéis atuais para perfis equivalentes |
| 2.3 | Segurança em nível de campo (projeção condicional + RLS de coluna) |
| 2.4 | Solicitação e concessão de acesso just-in-time, com escopo, validade e expiração |
| 2.5 | Sessões com revogação; refresh token |
| 2.6 | Troca e reset de senha pelo usuário |
| 2.7 | MFA (TOTP) obrigatório para perfis com acesso a folha e caixa |
| 2.8 | Tela de administração de usuários, perfis e concessões |

**Aceite:** matriz de permissões testada automaticamente (cada perfil × cada rota). Concessão expirada deixa de funcionar sem intervenção. Toda leitura sensível aparece em `auditoria_acessos` com a concessão que a autorizou.

---

### Fase 3 — Pessoal e aptidão · ~4-5 semanas

**O motivo do projeto.** Primeiro módulo a cumprir o Contrato de Módulo inteiro — e por isso vira o template dos demais.

| # | Entrega |
|---|---|
| 3.1 | Cadastro completo (CLT e PJ), cargos, funções, departamentos |
| 3.2 | Histórico de remuneração com vigência, criptografado |
| 3.3 | Documentos, formação, experiências, currículo |
| 3.4 | Certificações e exames ocupacionais com validade |
| 3.5 | Requisitos configuráveis por função e por projeto/cliente |
| 3.6 | Férias, afastamentos, alocações |
| 3.7 | **Motor de aptidão** (`aptidao_colaborador`) com as 10 verificações |
| 3.8 | Embarques ligados a projeto → cotação → cliente |
| 3.9 | Bloqueio de alocação inapta, com override auditado e justificado |
| 3.10 | Alertas de vencimento em 90/60/30/15 dias |
| 3.11 | Diárias, horas extras, folha com lançamento contábil automático |
| 3.12 | Tela de consulta rápida: "quem está apto para embarcar em [data], função [X]" |

**Aceite (o teste que importa):** reproduza o incidente que originou o projeto. O sistema deve recusar a alocação e explicar exatamente por quê. Certificação que vence no meio do período deve bloquear — este é o caso que a conferência manual nunca pega.

---

### Fase 4 — Motor fiscal · ~4-6 semanas

| # | Entrega |
|---|---|
| 4.1 | Tabelas de referência versionadas: CFOP, NCM, CEST, CST/CSOSN, origem, CNAE, IBGE |
| 4.2 | CFOP como tabela de decisão (estoque / resultado / título / contabilização) |
| 4.3 | Parser NF-e completo — todos os blocos, incluindo DI, duplicatas e transporte |
| 4.4 | `documentos_fiscais_eventos` (cancelamento, CC-e, manifestação) |
| 4.5 | Conferência automática: soma dos itens × totalizadores do XML |
| 4.6 | Duplicatas gerando títulos a pagar/receber automaticamente |
| 4.7 | Parser NFS-e por município, com fábrica de estratégias |
| 4.8 | Enriquecimento de CNPJ com histórico versionado e alerta de mudança de situação |
| 4.9 | Análises: origem de mercadoria, carga tributária por item, concentração de fornecedor/cliente |
| 4.10 | (Opcional) Distribuição DF-e com certificado A1 |

**Aceite:** reprocessar todo o acervo de XML e obter conferência exata contra os totalizadores. Nenhum CFOP presente na base sem classificação na tabela de decisão.

---

### Fase 5 — Operação · ~5-7 semanas

| # | Entrega |
|---|---|
| 5.1 | Estoque com custo médio ponderado móvel |
| 5.2 | Rastreabilidade por lote e número de série |
| 5.3 | NF-e de entrada alimentando estoque automaticamente |
| 5.4 | Produção: BOM, ordens, apontamento — **CMV real** |
| 5.5 | Compras: requisição → cotação → pedido → recebimento, com alçadas |
| 5.6 | Ativo imobilizado e depreciação — fecha a lacuna do lucro líquido parcial |
| 5.7 | Field service sobre as migrations 05/06 já existentes |
| 5.8 | Rentabilidade por OS e por projeto |

**Aceite:** inventário físico de amostra bate com o saldo do sistema. DRE deixa de exibir `lucro_liquido_parcial`.

---

### Fase 6 — Autonomia e inteligência · contínuo

| # | Entrega |
|---|---|
| 6.1 | Ingestão pela interface: upload, fila, preview, desfazer lote |
| 6.2 | Importador genérico de planilha com mapeamento e relatório de rejeição |
| 6.3 | Tela de conciliação bancária com sugestão automática |
| 6.4 | **Reconciliação contra a apuração do contador** |
| 6.5 | Classificação OFX com aprendizado por confirmação |
| 6.6 | Drill-down universal |
| 6.7 | Construtor do relatório de fechamento mensal |
| 6.8 | Exportação em todos os relatórios |
| 6.9 | Módulos restantes: CRM completo, QSMS, controladoria |

---

## 6. Como saber que os números estão certos

Esta é a parte que efetivamente entrega a "exatidão" — e a que mais se negligencia.

**Nenhum módulo financeiro é aceito sem uma reconciliação contra fonte externa:**

| Módulo | Fonte da verdade | Frequência |
|---|---|---|
| Tesouraria | Extrato bancário oficial | Diária |
| DRE / razão | Apuração do contador | Mensal |
| Estoque | Inventário físico (rotativo ou geral) | Mensal / trimestral |
| Folha | Guias, eSocial, holerites | Mensal |
| Fiscal | Livros e obrigações da contabilidade | Mensal |

Formato: tela que mostra **sistema × fonte externa × diferença**, com a diferença explicada linha a linha ou registrada como pendência aberta.

**A regra que dá o resultado:** divergência não resolvida **não é fechada, é registrada e permanece visível**. Um sistema que acumula pendências visíveis é confiável; um que zera divergência por arredondamento é perigoso. Diferença de R$ 0,03 que ninguém explicou é sintoma — em geral de arredondamento em cascata ou de lançamento duplicado parcial.

---

## 7. Método de trabalho com Claude Code

Você já tem `.claude/` e `.agents/rules/` no repositório. Como aproveitar bem:

**Escopo por sessão.** Uma sessão = um item numerado do plano. Sessões que tentam três coisas produzem código que faz três coisas pela metade.

**Contexto no início de cada sessão:** o item do plano, os arquivos relevantes, e o Contrato de Módulo (seção 4) como definição de pronto.

**Atualize `.agents/rules/eco-mitang-rules.md`** com as regras deste plano: nada sem auditoria, permissão em toda rota, sem estimativa sem base, migration nunca reescreve, padrão `[ERRO ANTERIOR]/[CORREÇÃO]`. Regra que está no arquivo é regra que o agente segue; regra que está só na sua cabeça, não.

**Revisão obrigatória em três pontos**, independente de quem escreveu: qualquer coisa que toque cálculo financeiro, permissão, ou migration. Nesses três, leia linha a linha antes do merge.

**Peça o teste junto com o código, sempre.** Código gerado sem teste parece pronto com mais convicção do que deveria — a sua e a do agente.

---

## 8. Riscos reais e como tratá-los

| Risco | Probabilidade | Tratamento |
|---|---|---|
| **Escopo cresce e nada termina** | Alta | Contrato de Módulo; uma frente por vez; nova ideia vai para backlog, não para a sprint |
| Migration errada em produção | Média | Homologação obrigatória; rollback testado; backup verificado |
| Backfill histórico incorreto | Média | Conferência mês a mês contra o resultado atual antes de considerar migrado |
| Complexidade fiscal maior que o previsto | Média | Comece pelos CFOPs que sua base realmente usa, não pela tabela completa |
| Adoção baixa pelos usuários | **Alta** | Envolva cada setor no desenho do seu módulo; treine; **desligue a planilha antiga** — enquanto ela existir, ela vence |
| Perda de contexto entre sessões de agente | Alta | Regras versionadas no repo; documentação no código; plano numerado |
| Dado sensível vazado | Baixa / impacto alto | Criptografia, RLS, auditoria de leitura, sem dado real em homologação |

**O maior risco é o primeiro.** Não é técnico. Um ERP interno morre por escopo aberto muito mais do que por dificuldade de implementação.

---

## 9. Cronograma consolidado

| Fase | Duração | Acumulado |
|---|---|---|
| Semana 0 — Preparação | 1 sem | 1 sem |
| Fase 0 — Correções | 1 sem | 2 sem |
| Fase 1 — Fundação | 4-5 sem | 6-7 sem |
| Fase 2 — Autorização | 2-3 sem *(parcialmente paralela)* | 8-9 sem |
| Fase 3 — Pessoal | 4-5 sem | 12-14 sem |
| Fase 4 — Fiscal | 4-6 sem | 16-20 sem |
| Fase 5 — Operação | 5-7 sem | 21-27 sem |
| Fase 6 — Autonomia | contínuo | — |

**Aproximadamente 5 a 7 meses** até o sistema cobrir os setores principais com profundidade real, para uma pessoa dedicada com apoio de agente. Metade disso com duas pessoas, mas não menos — as fases 0 a 1 são sequenciais por natureza e não paralelizam bem.

**Marco que muda a operação da empresa:** fim da Fase 3, por volta da semana 12-14. É quando o problema que originou o projeto deixa de poder acontecer.

---

## 10. Os próximos cinco dias

Concretamente, para começar amanhã:

1. **Criar o projeto Supabase de homologação** e apontar o `.env` local para ele. É o item mais urgente — hoje você desenvolve sem rede de proteção.
2. **Configurar o CI** no GitHub Actions com `tsc --noEmit` + `npm test`.
3. **Aplicar as correções da Fase 0.1 a 0.3** (bugs do DRE). Posso escrever o patch.
4. **Escrever o teste de rotas sem permissão** — ele vai falhar, e a lista de rotas que ele apontar é exatamente o trabalho do item 0.4.
5. **Marcar a conversa com seu contador** sobre o plano de contas. É pré-requisito da Fase 1 e depende de terceiro, então começa a correr agora.

O item 5 é o que mais atrasa se ficar para depois — os outros quatro dependem só de você.
