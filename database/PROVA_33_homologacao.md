# Prova da migration 33 — livro de eventos

**Quando:** 06/09/2026 · **Quem:** Claude, na sessao do Diego · **Onde:** Postgres limpo, fora de producao.

## O que foi provado

Um Postgres vazio recebeu **as 33 migrations em ordem**, do zero. A 33 aplicou sem erro:

```
NOTICE:  Livro de eventos pronto. 36 transicoes permitidas em 7 entidades.
```

Depois, a suite `tests/eventos-negocio.test.js` rodou contra esse banco: **11 de 11 passaram.**

| # | O que prova |
|---|---|
| 1 | O estado atual e o ultimo evento, e as duas datas ficam separadas (defasagem de 6 dias medida) |
| 2 | Transicao fora da tabela de regras nao acontece |
| 3 | Nao se registra o futuro como fato |
| 4 | Dar baixa sem o comprovante e recusado; com ele, entra |
| 5 | Retroagir muito exige motivo; pouco, nao |
| 6 | Justificativa obrigatoria quando a regra pede |
| 7 | Conflito de estado: quem mudou antes ganha |
| 8 | Importador rodando duas vezes nao duplica (duas travas: maquina de estados e indice de idempotencia) |
| 9 | Evento nao se altera nem se apaga -- nem em teste |
| 10 | Estorno e evento inverso: o original permanece no livro |
| 11 | A aplicacao (eco_app) nao tem privilegio de alterar nem apagar o livro |

`npm run test:unit` continuou em **50 de 50**, e `npx tsc --noEmit` compila sem erro apos a correcao
do write path.

## Duas coisas que a prova encontrou (e que a migration ja corrige)

**[1] Faltava a porta de entrada.** Como uma entidade entra no livro pela primeira vez? Sem uma
transicao a partir de `INEXISTENTE`, so daria para comecar declarando o estado de origem -- e o
comeco de cada historia ficaria sem autor nem data. Foram acrescentadas 7 transicoes de abertura
(`ITEM_COTADO`, `PARCELA_PREVISTA`, `NF_IMPORTADA`, `PENDENCIA_ABERTA`, `OBRIGACAO_LANCADA`,
`BOM_PROPOSTA`, `SERIAL_CRIADO`). As duas portas continuam valendo: a carga inicial declara de
onde parte (a linha da planilha ja esta 'COTADO' ha meses), e o que nasce agora passa pela abertura.

**[2] A "segunda tranca" nao existia.** O texto dizia que eco_app nao recebia UPDATE nem DELETE
por nao terem sido concedidos. Conferido no banco: o papel vinha com os quatro privilegios, por
causa do `ALTER DEFAULT PRIVILEGES IN SCHEMA public` da migration 21. Nao conceder nao basta --
a 33 agora **revoga explicitamente**, e o teste 11 quebra o build se alguem reconceder.

## Diferenca entre o banco da prova e o de producao

| | prova | producao |
|---|---|---|
| Postgres | 16.13 | 17.6 |
| Dados | vazio (2 empresas de teste) | 4 empresas, 220 orcamentos, 172 notas, 1.324 lancamentos |

Nada na 33 depende de recurso exclusivo do 17: colunas geradas (12+), RLS (9+), `security_invoker`
em view (15+). Ainda assim, a aplicacao em producao continua sendo uma decisao do Diego.

## Aplicar e desfazer

A migration e **puramente aditiva**: cria duas tabelas novas, tres funcoes, dois triggers e uma
view. Nao altera, nao renomeia e nao remove nada do que ja existe -- conferido antes no banco de
producao: zero colisao de nome.

Para desfazer, se um dia for preciso, basta remover exatamente o que ela criou (as duas tabelas
com seus triggers, a view, as tres funcoes) e apagar a linha correspondente em `schema_migrations`.
Como nada existente foi tocado, nao ha dado a restaurar.

## Estado

- [x] escrita, com o porque de cada invariante no cabecalho
- [x] provada em banco limpo com as 32 anteriores
- [x] 11 testes, registrados em `npm run test:db`
- [x] correcao do write path (`withTenantQuery` -> `withTenantTransaction`) em
      `catalogo.repository.ts` (4 escritas) e `cnpj-auto-discovery.service.ts`
- [ ] **aplicada em producao** -- aguardando o Diego autorizar
- [ ] entrada no `homologado.json` -- so depois de passar pela homologacao dele
