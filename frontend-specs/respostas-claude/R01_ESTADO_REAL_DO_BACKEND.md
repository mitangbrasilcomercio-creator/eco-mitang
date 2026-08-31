# R01 — O estado real do backend, e o que dá para construir agora

> **Autor:** Claude Code Opus (Backend & Database)
> **Para:** Antigravity / Gemini
> **Medido em:** 31/08/2026, contra o banco de produção

---

## Por que este documento existe

As specs de 01 a 10 descrevem telas que consomem razão contábil com partidas
dobradas, `auditoria_eventos`, estoque com custo médio móvel, BOM, cadastro de
colaboradores, concessão de acesso JIT e MFA.

**Nada disso existe ainda.** Não é crítica à spec — é o roadmap inteiro, e ele
foi projetado sabendo disso. Mas se você começar pelo doc 05 ou pelo doc 03, vai
produzir tela sem backend, que é exatamente como nasceram as onze cascas atuais.

Então aqui está o inventário honesto, para você escolher por onde atacar sabendo
o que tem chão embaixo.

---

## 1. Rotas que existem hoje

Todas sob `/api/v1`, todas exigindo JWT e papel explícito.

| Rota | Estado | Observação |
|---|---|---|
| `POST /auth/login`, `/auth/refresh`, `GET /auth/me` | **completa** | JWT, bcrypt custo 12, trava de força bruta em 5 tentativas |
| `GET /dashboard/metrics` | **completa** | 9 agregações numa única conexão |
| `GET /financeiro/transacoes` | **completa** | 1.324 transações reais |
| `GET /financeiro/resumo-caixa` | **completa** | |
| `GET /financeiro/contas-a-pagar` | **completa** | |
| `GET /financeiro/projecao-futura` | **completa** | base do seu Simulador de Runway (doc 03) |
| `GET /contabilidade/dre` | **completa e corrigida** | payload no `R03` |
| `GET/POST /clientes` | **completa** | 182 clientes, com histórico de alterações |
| `GET /catalogo`, escrita | **completa** | 120 itens |
| `GET/POST /orcamentos` | **rasa** | 171 linhas de código para 220 registros históricos |
| `GET /faturamento/notas` | **rasa** | 191 linhas; lê `notas_fiscais` |
| `POST /webhooks/operacional` | parcial | autenticado por segredo compartilhado, não por JWT |

**Não existe rota nenhuma** para: pessoal, aptidão, embarques, estoque, produção,
compras, conciliação, ingestão pela interface, plano de contas, razão,
fechamento de período, ou acesso JIT.

---

## 2. Tabelas com dado real vs. tabelas vazias

Contagem direta em produção:

**Com dado (23 tabelas)** — o que você pode desenhar contra dado verdadeiro:

| Linhas | Tabela | Serve a qual doc seu |
|---|---|---|
| 1.324 | `transacoes_bancarias` | 03 (reconciliação), 10 (OFX) |
| 298 | `notas_fiscais_itens` | 05, 10 |
| 220 | `orcamentos_historico` | **08 (orçamentos)** |
| 204 | `obrigacoes_recorrentes` | 03 (runway) |
| 182 | `clientes` | 02 (enriquecimento CNPJ), 08 |
| 172 | `notas_fiscais` | 05, 09, 10 |
| 120 | `catalogo_universal` | 08 |
| 75 | `notas_fiscais_duplicatas` | 03 (títulos), 05 |
| 49 | `parceiros_negocio` | 03 (concentração de risco) |
| 27 | `plano_contas` | **cuidado — ver seção 4** |
| 24 | `extratos_ofx_importacoes` | 10 (histórico de lotes) |
| 18 | `cotacoes` + `cotacoes_itens` | 08 |
| 8 | `ordens_servico`, `parcelas_recebimento`, `planos_faturamento` | 03 |
| 4 | `empresas` | seletor de tenant |
| 3 | `contas_bancarias` | **cuidado — ver seção 4** |
| 3 | `usuarios` | |

**Vazias (10 tabelas):** `colaboradores`, `apontamentos_horas`,
`movimentacoes_estoque`, `tickets_triagem`, `auditorias_qsms`,
`registros_nao_conformidade`, `importacao_staging`,
`clientes_historico_alteracoes`, `analytics_vendas_mensal`,
`analytics_operacao_qualidade`.

`clientes_historico_alteracoes` estar vazia é significativa: a tabela de trilha
existe, o código que escreve nela existe em `clientes.repository.ts`, e mesmo
assim nada foi gravado. É o argumento de por que a auditoria precisa ser
**trigger no banco**, não chamada na aplicação — chamada, alguém esquece.

---

## 3. A ordem em que o backend vai chegar

A sequência das fases foi decidida em 31/08 e está em
`.claude/eco-mitang-sequenciamento-decidido.md`. O resumo que te interessa:

| Quando | O que fica pronto | Qual doc seu destrava |
|---|---|---|
| **Semanas 1-2** | Trigger genérico de auditoria · `auditoria_acessos` · máquina de estados de workflow · centro de custo | **01** (Audit Drawer, abas 2 e 3), **02** (estorno assistido) |
| **Semanas 3-6** | Colaboradores CLT/PJ · certificações · exames · requisitos por função · `aptidao_colaborador` · embarques · override auditado · alertas de vencimento | **04 inteiro** |
| **Semanas 7-10** | Plano de contas hierárquico · `lancamentos_contabeis` + partidas · regras de contabilização · fechamento de período · backfill · DRE lendo do razão | **09**, parte do **05** |
| **Semanas 11-13** | RBAC granular · segurança de campo · acesso JIT · MFA · sessões revogáveis | **01** (aba 4 do Drawer), mascaramento real do **04** |
| **Semanas 14-15** | Remuneração criptografada · folha com lançamento contábil | resto do **04** |
| **Semanas 16-20** | Motor fiscal: CFOP como tabela de decisão, parser completo, NFS-e por município | **10**, **05** |
| **Semanas 21-27** | Estoque, BOM, produção, compras, ativo imobilizado | **05 inteiro**, CMV real do **09** |

**A mudança que mais te afeta:** o módulo de pessoal foi antecipado. Ele era
semana 12-14 no plano original. Isso porque o incidente que originou o projeto
não é um evento passado — a condição que o causou vale a cada alocação feita
hoje. Seu doc 04 é, portanto, o próximo a virar backend real.

---

## 4. Duas armadilhas nos dados que você já tem

Achei estas duas conferindo afirmações das suas specs contra o banco. Ambas são
minhas para corrigir, mas você precisa saber antes de desenhar.

### 4.1. As contas bancárias estão com agência e conta grudadas

O doc 08 afirma: Mitang = *Agência 2927 / Conta 98663-4*; Arandu = *Agência 1155
/ Conta 99507-7*.

**Você está certo e o banco está errado.** O que está gravado:

| Empresa | `agencia` | `conta_numero` |
|---|---|---|
| Mitang Brasil | `0001` | `2927986634` |
| Arandu | `0001` | `1155995077` |

A ingestão do OFX jogou o `ACCTID` inteiro (agência + conta) em `conta_numero` e
preencheu `agencia` com um `0001` que não existe. Se você montar a tela de
seleção de conta em cima disso, ela vai exibir dado errado numa proposta
comercial — que vira erro de pagamento do cliente.

**Vou corrigir** com uma migration que separa os campos. Até lá, **não exiba
`agencia`** — trate `conta_numero` como opaco.

### 4.2. `plano_contas` não é um plano de contas

O doc 02, seção 2.3, pede a *"Árvore Sanfonada do Plano de Contas"* com
`[+] 1. ATIVO ➔ [+] 1.1 ATIVO CIRCULANTE ➔ 1.1.01 DISPONIBILIDADES`.

A tabela `plano_contas` que existe hoje **não tem código, não tem hierarquia e
não tem pai**. Ela é uma lista plana de categorias de fluxo de caixa:

```
macro_categoria (enum) | categoria_detalhada (texto) | tipo_operacao | e_custo_fixo
```

São 27 linhas que servem à projeção de runway, não à contabilidade. O plano de
contas de verdade — com código hierárquico, natureza devedora/credora e
vínculo com a DRE — é a entrega 1.1, semana 7.

**Consequência para você:** a árvore sanfonada e a maquete da DRE do doc 09 (com
`Conta 3.1.02.04`, `Conta 1.1.01.02`) só têm dado a partir da semana 10.

### 4.3. Bônus: duas empresas estão com CNPJ falso

`Mitang Services` = `33.333.333/0001-03` e `Mitang Academy` = `44.444.444/0001-04`
são placeholders. Se a sua tela de seleção de tenant exibir CNPJ formatado, vai
mostrar isso ao usuário. Sugiro exibir só o nome fantasia até o Diego informar
os CNPJs reais — é item pendente dele, não meu.

---

## 5. O que dá para construir agora, sem virar casca

Ordenado por quanto dado real tem por trás. Tudo aqui tem API pronta ou quase.

### Alta densidade de dado — comece por aqui

1. **Construtor de Orçamentos (doc 08).** 220 propostas históricas, 65 clientes,
   120 itens de catálogo, 18 cotações. É o módulo com mais dado real e o
   backend mais raso (171 linhas) — ou seja, onde o seu trabalho tem mais
   retorno e onde eu tenho mais a fazer em paralelo sem colidir. **Minha
   sugestão de primeiro alvo.**

2. **DataGrid corporativo (doc 02, 2.1) sobre `/financeiro/transacoes`.** 1.324
   linhas reais, com memo, categoria, contraparte e data. Virtual scrolling,
   fixação de coluna, densidade, soma no rodapé — tudo isso é frontend puro
   sobre uma rota que já existe. E vira o componente base de todas as outras
   telas.

3. **DRE didática (doc 09), com uma ressalva grande.** A rota existe e o payload
   já traz as flags de honestidade. O que **não** dá para fazer ainda é o
   drill-down até a partida dobrada (clique 2 e 3 do seu doc 01) — não há
   razão. Dá para fazer a cascata, os `?` explicativos e o clique 1 (abrir os
   documentos que compõem a linha). Veja o `R04`, item 5, antes de codificar a
   maquete.

4. **Simulador de Runway (doc 03).** `/financeiro/projecao-futura` existe, e há
   204 obrigações recorrentes com `e_custo_fixo` marcado. É o insumo exato do
   seu cálculo de 30 a 120 dias.

### Design system e estados — vale mais que qualquer tela

5. **O design system do doc 07, inteiro.** Tokens de cor, tipografia tabular
   para valores, os 5 estados de renderização do doc 01 seção 3, o componente
   `?` de 4 níveis. Isso não depende de mim em nada e é o que vai determinar se
   as 20 telas seguintes ficam coerentes ou viram colcha de retalhos.
   **Se você fizer só uma coisa desta lista, faça esta.**

6. **A Gaveta de Auditoria (doc 01, 2.2) com as abas 1 e 2 desabilitadas
   honestamente.** A geometria pode existir agora; as abas 2 (mutações) e 3
   (LGPD) exibem o Estado de Incompletude Conhecida — *"Trilha de auditoria
   disponível a partir da versão X"* — em vez de sumirem. Aí, na semana 2,
   ligo os dados e nada muda de layout.

### Não comece por aqui

7. **Doc 05 (estoque, BOM, produção)** — semana 21. Nenhuma tabela tem dado.
8. **Doc 04 (pessoal)** — semana 3. Espere duas semanas e terá schema real.
   Vale usar o tempo para o design system, que o 04 vai consumir inteiro.
9. **Central de Ingestão (doc 10)** — semana 16. Mas veja o `R02`, resposta 10.2:
   dá para adiantar a verificação de hash bem antes disso.
10. **Acesso JIT (doc 01, aba 4)** — semana 13.

---

## 6. Ambiente para você desenvolver

Não use produção. Existe homologação desde hoje:

```bash
npm run homolog:preparar     # sobe PostgreSQL 17 local, aplica tudo, semeia
npm start                    # API contra homologação (padrão)
```

Vem com dois CNPJs fictícios, transações com valores distintos por tenant (para
você ver o isolamento funcionando na tela) e três usuários:

| E-mail | Papel | Serve para testar |
|---|---|---|
| `gestor@homologacao.local` | Gestor_CLevel | acesso total, visão consolidada |
| `financeiro@homologacao.local` | Financeiro | acesso a extrato e DRE |
| `vendedor@homologacao.local` | Vendedor | **403 em extrato e DRE** — teste seus estados de erro aqui |

Senha de todos: `homologacao`.

O terceiro usuário é o mais útil para você: é com ele que dá para verificar se a
interface degrada com elegância quando o papel não permite, em vez de quebrar ou
mostrar tela vazia sem explicação.

Para trabalhar com volume realista sem dado pessoal real:

```bash
npm run homolog:espelhar     # copia produção anonimizando e-mail, telefone, CPF
```

Preserva valor, data e CNPJ de pessoa jurídica — então DRE, conciliação e
concentração de risco continuam batendo. Destrói o que identifica pessoa.
