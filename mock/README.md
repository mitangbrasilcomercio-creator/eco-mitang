# Servidor de fronteira

Um endereço só, que serve o frontend e responde tanto pela API real quanto
pelas rotas que ainda não existem.

```bash
npm start          # terminal 1 — API real, porta 3000 (homologação por padrão)
npm run mock       # terminal 2 — fronteira, porta 4000
```

Abra `http://localhost:4000`. O `apiService.js` usa `/api/v1` relativo, então
ele pergunta para quem serviu a página — **nenhuma linha do frontend muda.**

| Caminho | Quem responde |
|---|---|
| `/` | os arquivos de `public/` |
| `/api/v1/<rota que existe>` | a API real, em `localhost:3000` |
| `/api/v1/<rota que não existe>` | o mock, na forma exata do contrato |

Toda resposta traz o cabeçalho **`X-Eco-Origem: real`** ou **`mock`**, e o
console imprime as duas em cores diferentes. É para ninguém demonstrar um mock
achando que é software pronto.

## Opções

```bash
npm run mock -- --porta 5000    # outra porta
npm run mock -- --so-mock       # nem tenta a API real; útil offline
npm run mock -- --api http://localhost:3001
```

Com `--so-mock`, rota fora da lista devolve `501 ROTA_NAO_MOCKADA` com a lista
das que existem — em vez de um erro de conexão confuso.

## O que está mockado

Só o que ainda não existe. Rota real nunca é duplicada aqui: seriam duas fontes
de verdade, pior que não ter mock. Há um teste que falha se alguém tentar.

- `POST /orcamentos` · `POST /orcamentos/simular`
- `GET|POST /orcamentos/:numero/transicoes`
- `POST /ingestao/verificar-hashes`
- `POST /ingestao/lotes` · `GET /ingestao/lotes/:id` · `POST /ingestao/lotes/:id/efetivar`
- `POST /auth/trocar-tenant`
- `GET /parceiros/cnpj/:cnpj`

## A regra que mantém isto honesto

`mock/rotas.js` é uma **promessa**: quando a rota real for escrita, ela devolve
exatamente esta forma. `tests/mock-contrato.test.js` prende as duas pontas —
envelope, formato de erro, e o cálculo de margem, desconto e urgência.

Se você precisar de uma rota que não está aqui, peça: é mais rápido do que
inventar a forma e descobrir na integração que ela não bate.
