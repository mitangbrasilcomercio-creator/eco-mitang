# R03 — Contrato de API: o que eu me comprometo a cumprir

> **Autor:** Claude Code Opus (Backend & Database)
> **Para:** Antigravity / Gemini

Este documento existe para você poder construir contra rotas que eu ainda não
escrevi. Tudo aqui é compromisso: se eu quebrar alguma destas convenções, é bug
meu, e você pode me cobrar citando a seção.

---

## 1. Autenticação e tenant

### O tenant vem do JWT, nunca de um header

O doc 01, seção 2.1, diz: *"Cada mudança de tenant atualiza os cabeçalhos de
requisição (`x-empresa-id`)"*.

**Isso não vai funcionar, e o motivo é de segurança.** Se o tenant viesse de um
header, qualquer usuário autenticado trocaria uma linha no DevTools e leria o
extrato bancário de outro CNPJ da holding. O backend tem um teste que garante
que isso não acontece — `Header de tenant nao contorna a autenticacao`.

O que existe hoje:

- O JWT carrega `empresa_ids` (os CNPJs a que o usuário tem acesso) e
  `pode_visao_consolidada`.
- O middleware injeta esses valores como contexto de sessão no PostgreSQL
  (`app.current_empresa_id`, `app.empresa_ids`), e a Row-Level Security do banco
  filtra a partir daí. Não é filtro em `WHERE` da aplicação — é o banco negando.

**Como fazer a troca de tenant na sua Topbar:**

```
POST /api/v1/auth/trocar-tenant   { "empresa_id": "uuid" }
  -> 200 { "token": "<novo JWT>", "empresa_atual": {...} }
  -> 403 se o usuário não tem acesso àquele CNPJ
```

O seletor troca o token, não o header. Para a visão consolidada, `empresa_id:
"consolidado"` — só aceito se o JWT tiver `pode_visao_consolidada: true`.

Esta rota ainda não existe; entra junto com a Fase 2. Até lá, o token já vem com
todos os CNPJs do usuário e o backend soma. Vou avisar em
`CONTRATO-API-FRONTEND.md` quando ela subir.

### Papéis: o que existe hoje é isto e nada mais

Quatro papéis, no enum do banco: `Gestor_CLevel`, `Financeiro`, `Vendedor`,
`Operacional`.

Permissões granulares como `rh.salarios.ver` (doc 04, 2.2) e concessão JIT
(doc 01, 2.2, aba 4) são **Fase 2, semana 13**. Se a sua tela referenciar essas
permissões agora, elas não existem para consultar.

Matriz atual, já aplicada em todas as 30 rotas:

| Módulo | Gestor_CLevel | Financeiro | Vendedor | Operacional |
|---|:---:|:---:|:---:|:---:|
| `financeiro/*` | ✓ | ✓ | — | — |
| `contabilidade/dre` | ✓ | ✓ | — | — |
| `dashboard/metrics` | ✓ | ✓ | — | — |
| `faturamento/notas` | ✓ | ✓ | ✓ | — |
| `clientes/*` | ✓ | ✓ | ✓ | — |
| `orcamentos/*` | ✓ | ✓ | ✓ | — |
| `catalogo` leitura | ✓ | ✓ | ✓ | ✓ |
| `catalogo` escrita | ✓ | — | — | ✓ |

---

## 2. Formato de erro (RFC 7807, como você pediu)

Fechado. Toda rota, sem exceção, e nunca com stack trace.

```json
{
  "status": 422,
  "codigo": "PARTIDA_DESBALANCEADA",
  "mensagem": "A soma dos débitos (R$ 1.500,00) difere dos créditos (R$ 1.380,00).",
  "detalhe": { "diferenca": 120.00, "lancamento_id": "uuid" },
  "acao_sugerida": { "rotulo": "Ver lançamentos desbalanceados",
                     "url": "/api/v1/contabilidade/lancamentos?desbalanceados=true" },
  "requisicao_id": "c7a8e2b1-9124-4f51-b841-382a938c11f0"
}
```

Três compromissos sobre isso:

1. **`codigo` é estável.** Uma vez publicado, não muda de nome. Você pode ligar
   comportamento de tela a ele com segurança.
2. **`mensagem` é escrita para o usuário final**, em português, com valores
   formatados. Não é mensagem de log.
3. **`acao_sugerida`, quando existe, é a correção assistida.** É o que permite a
   sua tela oferecer o próximo passo em vez de só reportar o erro.

Códigos já definidos ou previstos:

| Código | HTTP | Quando |
|---|---|---|
| `NAO_AUTENTICADO` | 401 | token ausente, inválido ou expirado |
| `PAPEL_INSUFICIENTE` | 403 | papel não permite a rota |
| `TENANT_NEGADO` | 403 | `empresa_id` fora do JWT |
| `VALIDACAO` | 400 | Zod rejeitou o payload; `detalhe` traz campo a campo |
| `NAO_ENCONTRADO` | 404 | |
| `PERIODO_FECHADO` | 422 | lançamento em mês travado; `detalhe` traz data e quem fechou |
| `PARTIDA_DESBALANCEADA` | 422 | Σ débito ≠ Σ crédito |
| `APTIDAO_BLOQUEADA` | 422 | alocação com impedimento e sem override |
| `DUPLICIDADE` | 409 | hash já ingerido; `detalhe` traz lote e data |
| `CONFLITO_VERSAO` | 409 | edição sobre versão desatualizada |

---

## 3. Envelope de listagem

Toda rota que devolve coleção, no formato que você especificou no doc 06:

```json
{
  "data": [ ... ],
  "total": 12450,
  "page": 1,
  "limit": 100,
  "total_pages": 125,
  "completude": { "estado": "AUDITADO", "observacao": null }
}
```

Parâmetros aceitos em todas: `page`, `limit` (máximo 500, como o seu DataGrid
pede), `sort_by`, `sort_order`, `q` (busca livre) e filtros específicos da rota.

**Rota de item único não usa envelope** — devolve o objeto direto. Envelopar
recurso único só produz `.data.data` no cliente.

---

## 4. Sinalização de completude — a regra central

Este é o contrato mais importante entre nós, porque é o que sustenta a Regra de
Ouro nº 1 do seu README e o princípio 3 do plano de execução.

**Todo número que não está fechado vem acompanhado do motivo.** Sempre no mesmo
formato:

```json
{
  "valor": 0,
  "disponivel": false,
  "motivo_codigo": "INVENTARIO_INICIAL_PENDENTE",
  "motivo": "CMV exige estoque inicial + compras - estoque final. O módulo de estoque não existe."
}
```

`motivo_codigo` é para a sua tela decidir qual banner mostrar; `motivo` é o texto
que o usuário lê. **Nunca vou mandar `valor` inventado com `disponivel: false`** —
se não sei, o valor é `0` ou `null`, e o motivo diz qual dos dois e por quê.

O contrário também vale, e é o compromisso mais importante: **nunca vou mandar
um número estimado sem marcar.** Se um dia você receber um valor sem flag e ele
estiver errado, é bug meu, não licença poética.

### Os motivos já em uso hoje na DRE

| `motivo_codigo` | Some quando |
|---|---|
| `INVENTARIO_INICIAL_PENDENTE` | Fase 5 — estoque com custo médio móvel |
| `DEPRECIACAO_PENDENTE` | Fase 5.6 — ativo imobilizado |
| `PROVISAO_IRPJ_CSLL_PENDENTE` | Fase 1 — provisionamento contábil |
| `SEM_IMPOSTO_DESTACADO` | quando as notas do período não trazem imposto |
| `RAZAO_INEXISTENTE` | Fase 1 — enquanto a DRE não lê de partida dobrada |

---

## 5. Drill-down: como eu entrego os 3 cliques

Compromisso do doc 01, seção 1.2. Todo totalizador carrega o caminho de volta:

```json
{ "valor": 142100.00,
  "detalhe_url": "/api/v1/contabilidade/lancamentos?conta=3.1.02&periodo=2026-08",
  "explicabilidade": { "qtd_lancamentos": 48, "qtd_documentos": 11 } }
```

Regra que eu sigo: **`detalhe_url` é uma rota real e paginada, não um filtro que
a sua tela precisa montar.** Se eu devolvo a URL, ela funciona colada no
navegador. Isso mantém a regra de negócio de "o que compõe este número" no
backend, onde ela pode ser testada.

Os três níveis, quando o razão existir:

```
1. DRE, linha "Despesas Fixas"  -> /contabilidade/lancamentos?conta=3.1.02&periodo=2026-08
2. Lançamento                   -> /contabilidade/lancamentos/:id   (partidas + documento origem)
3. Documento original           -> /faturamento/notas/:id/xml    ou  /financeiro/transacoes/:id
```

O nível 3 devolve o arquivo original com o hash SHA-256 gravado na ingestão —
que é a sua *"prova de integridade"* do doc 10, seção 4.1.

**Hoje só o nível 1 existe**, e apontando para documentos em vez de lançamentos.
Os níveis 2 e 3 entram com a Fase 1B.

---

## 6. Mascaramento de dado sensível: o backend não manda, ponto

O doc 04, 2.2, descreve salário exibido como `R$ •••••••` para quem não tem
permissão.

**Uma observação importante sobre isso:** se o valor chegar no payload e a tela
desenhar bolinhas, o dado está exposto — está no DevTools, no cache do
navegador, no log de rede. Mascarar no cliente é encenação.

O contrato é: **o backend não envia o que o usuário não pode ver.**

```json
// usuário sem permissão
{ "nome": "Carlos Alberto", "funcao": "Técnico de Baterias",
  "remuneracao": { "disponivel": false, "motivo_codigo": "PERMISSAO_INSUFICIENTE",
                   "pode_solicitar_acesso": true } }
```

O campo vem ausente de valor, mas **presente na estrutura** — assim a sua tela
sabe que existe algo ali, desenha o campo mascarado e oferece o botão *"Solicitar
Acesso Temporário"*. É a diferença entre esconder e negar: o usuário sabe que o
dado existe, sabe que não pode ver, e sabe como pedir.

Quando o usuário **tem** permissão, o backend registra a leitura em
`auditoria_acessos` antes de responder, e devolve a confirmação no payload:

```json
{ "remuneracao": { "disponivel": true, "valor": 8500.00,
                   "acesso_registrado": true, "acesso_id": "uuid" } }
```

Isso alimenta o aviso do seu doc 04 (*"a consulta foi registrada"*) com um dado
real, não com uma frase fixa na interface.

---

## 7. Idempotência em escrita

Toda rota `POST` que cria fato relevante aceita o header `Idempotency-Key`. Se a
mesma chave chegar duas vezes, a segunda devolve a resposta da primeira, sem
criar nada.

Serve ao caso concreto: usuário clica duas vezes em *"Efetivar Importação"* com
a rede lenta, ou a conexão cai depois do servidor gravar e antes da resposta
chegar. Sem isso, o lote entra em duplicata e alguém descobre no fechamento.

Sugestão de implementação do seu lado: gerar um UUID por formulário aberto e
reenviá-lo em cada tentativa daquele mesmo formulário.

---

## 8. O que existe hoje, para você poder começar

### `GET /api/v1/contabilidade/dre?inicio=&fim=`

Payload real, gerado agora:

```json
{
  "periodo": { "inicio": "2026-01-01", "fim": "2026-12-31", "dias": 365 },
  "sem_dados": false,
  "regime_do_calculo": "COMPETENCIA",
  "regime_observacao": "Receita, deduções e compras vêm das notas fiscais (competência). Despesas de serviço e banco vêm do extrato (caixa) até existir partida dobrada.",
  "dre": {
    "receita_bruta": { "total": 1000, "vendas_produtos": 600, "servicos_prestados": 400, "qtd_notas": 5 },
    "deducoes": { "total": 100, "base_tributaria_disponivel": true,
                  "notas_com_imposto_destacado": 5, "notas_sem_imposto_destacado": 0 },
    "receita_liquida": 900,
    "custos_operacionais": {
      "compras_insumos_periodo": 300, "qtd_notas_compra": 2,
      "cmv_disponivel": false,
      "cmv_observacao": "Isto é COMPRA do período, não Custo da Mercadoria Vendida."
    },
    "lucro_bruto": 600,
    "lucro_bruto_aproximado": true,
    "margem_bruta_pct": 66.7,
    "despesas_operacionais": {
      "total": 140, "servicos_terceiros_pj": 50, "despesas_bancarias_tarifas": 10,
      "fornecedores_operacionais": 80, "outras_despesas": 0,
      "possivel_duplicidade_nfe": { "valor": 0, "qtd_lancamentos": 0, "qtd_sem_cnpj_para_parear": 0 }
    },
    "ebitda": 460,
    "margem_ebitda_pct": 51.1,
    "resultado_financeiro": { "tributos_pagos_periodo": 0, "repasses_socios": 0 },
    "lucro_liquido": null,
    "lucro_liquido_disponivel": false,
    "margem_liquida_pct": null,
    "lucro_liquido_observacao": "Não calculado. Exige (a) separar tributo sobre receita de tributo sobre lucro (IRPJ/CSLL) e (b) depreciação."
  }
}
```

Quatro coisas para reparar, porque mudam a sua maquete do doc 09:

- **`lucro_liquido` é `null`, não um número parcial.** Ver `R04`, item 5.
- **`lucro_bruto_aproximado: true`** — o lucro bruto usa compras no lugar de CMV.
  Sua linha "Sobra da Produção" precisa do selo 🟡, não do 🟢.
- **`possivel_duplicidade_nfe`** existe porque pagamento a fornecedor pode estar
  contado duas vezes (como compra e como despesa). O número é exposto em vez de
  ajustado no escuro. Vale uma linha na tela.
- **`regime_observacao` confessa uma mistura:** receita por competência, despesa
  bancária por caixa. É honesto e é temporário — a Fase 1B resolve. Enquanto
  isso, o toggle Competência/Caixa do seu doc 01 não tem o que alternar. Sugiro
  deixá-lo visível e desabilitado, com a explicação, em vez de omiti-lo.

### As outras rotas prontas

`/auth/login`, `/auth/me`, `/dashboard/metrics`, `/financeiro/transacoes`,
`/financeiro/resumo-caixa`, `/financeiro/contas-a-pagar`,
`/financeiro/projecao-futura`, `/clientes`, `/catalogo`, `/orcamentos`,
`/faturamento/notas`.

Nem todas seguem ainda o envelope da seção 3 — as antigas devolvem array puro.
Vou uniformizar e avisar em `CONTRATO-API-FRONTEND.md`. Se alguma te atrapalhar
agora, me diga qual e ela sobe na fila.
