# R05 — Você não precisa mais esperar o meu backend

> **Autor:** Claude Code Opus (Backend & Database)
> **Para:** Antigravity / Gemini
> **Data:** 31/08/2026

---

## O problema que isto resolve

O seu `11_CONSENSO` congelou cinco blocos de trabalho esperando backend: pessoal
na semana 3-6, razão na 7-10, JIT na 11-13, ingestão na 16-20, BOM na 21-27.

Isso é honesto e é o certo — não construir casca. Mas o efeito colateral é ruim:
das dez telas do roadmap, **oito ficam paradas esperando por mim.**

Agora não ficam.

---

## Como usar

```bash
npm start          # terminal 1 — API real, porta 3000
npm run mock       # terminal 2 — fronteira, porta 4000
```

Abra `http://localhost:4000`. Como o `apiService.js` usa `/api/v1` relativo, ele
pergunta para quem serviu a página — **você não muda uma linha.**

| Caminho | Quem responde |
|---|---|
| `/` | `public/` |
| `/api/v1/<rota real>` | a API de verdade |
| `/api/v1/<rota futura>` | o mock, na forma do `R03` |

Cada resposta traz `X-Eco-Origem: real` ou `mock`, e o console imprime as duas
em cores diferentes. Detalhes de operação em `mock/README.md`.

---

## O que está disponível hoje

As rotas que destravam os dois blocos que o Diego mais quer usar:

**Orçamento**, incluindo o que o doc 08 não previa e ele pediu:
`POST /orcamentos`, `POST /orcamentos/simular`,
`GET|POST /orcamentos/:numero/transicoes`

**Ingestão**, o bloco inteiro:
`POST /ingestao/verificar-hashes`, `POST /ingestao/lotes`,
`GET /ingestao/lotes/:id`, `POST /ingestao/lotes/:id/efetivar`

**Mais duas do consenso:** `POST /auth/trocar-tenant` (o substituto do
`x-empresa-id`) e `GET /parceiros/cnpj/:cnpj` (cache-first, com
`atualizacao_em_andamento`).

---

## Três coisas que mudaram no orçamento depois do Diego testar

Ele mexeu no mockup e trouxe operação real que nenhum de nós dois tinha. Vale
ler, porque muda o doc 08.

### 1. O desconto é por item, não global

Um cliente pede três produtos; o vendedor dá 5% num, 10% noutro. O `POST` recebe
`itens: [{sku, quantidade, desconto_pct}]` e devolve, por item, `valor_tabela`,
`valor_final`, `valor_abatido`, `margem_pct` e `margem_base_pct`.

### 2. Existe taxa de urgência, e ela não é desconto ao contrário

Pedido em cima da hora — mobilizar equipe fora da escala, comprar fora do
estoque — leva acréscimo, tipicamente 25%.

O detalhe que importa: **a urgência aumenta o preço agora e o custo depois.**
Hora extra e compra emergencial custam, e esse custo não é medido até existir
apontamento de produção. Então o payload traz:

```json
"custo_da_urgencia": {
  "valor": null, "disponivel": false,
  "motivo_codigo": "APONTAMENTO_PRODUCAO_PENDENTE"
},
"margem": { "com_urgencia_pct": 50.4, "com_urgencia_confiavel": false }
```

Mostre `com_urgencia_pct` em cinza, como referência — nunca com selo verde.

### 3. A alçada olha a margem SEM urgência

Se ela olhasse a margem com urgência, uma taxa alta esconderia um desconto que
estourou a política, e a diretoria nunca seria consultada. Tem teste de
regressão preso nisso.

### E uma correção ao doc 08

O doc dispara alçada acima de **10% de desconto**. Acho que está errado: 12% num
item de 60% de margem é inofensivo; 12% num item de 22% machuca. A regra por
percentual pune o caso inofensivo e libera o perigoso.

O mock usa **piso de margem de 35%**. No exemplo real: 5% de desconto no pack
Aquadopp (margem base 44,2%) fica livre; 10% na pilha Duracell (margem base 28%)
dispara alçada. Mesmo produto, mesma proposta, decisões diferentes — e o motivo
é visível na tela.

---

## O painel que o Diego pediu

Ele foi específico: *"pra que nada fique oculto e seja pego de surpresa no final
das contas"*. O `totais` carrega a cascata inteira:

```json
{ "valor_tabela": 478473.60,
  "descontos_concedidos": 27699.36,
  "desconto_efetivo_pct": 5.79,
  "subtotal_com_desconto": 450774.24,
  "acrescimo_urgencia": 112693.56,
  "valor_proposta": 563467.80,
  "entraria_sem_desconto": 598092.00,
  "diferenca_do_desconto": -34624.20 }
```

As duas últimas linhas são o pedido dele: quanto entraria sem ter dado nada, e
de quanto se abriu mão. E há um `tributos` com `disponivel: false`, porque
faturamento não é o que sobra — o imposto sai na emissão da nota, e ele não deve
descobrir isso depois.

---

## O limite disto

O mock **não tem banco, não tem RLS e não tem autenticação**. Ele devolve a
forma certa, não a verdade. Serve para construir e revisar tela; não serve para
demonstrar como se fosse pronto — é para isso que existe o cabeçalho de origem.

`mock/rotas.js` é uma promessa: quando eu escrever a rota real, ela devolve
exatamente esta forma. `tests/mock-contrato.test.js` prende as duas pontas com
16 testes — envelope, erro RFC 7807, e o cálculo de margem, desconto e urgência.
Se eu quebrar o contrato do seu lado, o meu build quebra primeiro.

Precisa de uma rota que não está lá? Peça. É mais rápido que inventar a forma e
descobrir na integração que ela não bate.
