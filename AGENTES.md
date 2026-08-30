# Dois agentes, um repositório

Claude Code (backend + banco) e Antigravity/Gemini (frontend) trabalham neste
repositório ao mesmo tempo. Este documento define quem mexe em quê, como os dois
não se atrapalham, e como verificar o resultado dos dois juntos.

---

## 1. Fronteiras de propriedade

Cada diretório tem um dono. **Não edite fora do seu território** — abra um pedido
para o outro lado.

| Caminho | Dono | Conteúdo |
|---|---|---|
| `src/` | **Claude Code** | API, regras de negócio, repositórios |
| `database/` | **Claude Code** | Migrations, RLS, certificado, espelho |
| `scripts/` | **Claude Code** | Migração, carga, verificação |
| `tests/` | **Claude Code** | Testes de backend |
| `public/*.html` | **Gemini** | Telas |
| `public/*.css` | **Gemini** | Estilo |
| `public/script.js` | **Gemini** | Roteador SPA |
| `public/renderRealModules.js` | **Gemini** | Renderização |
| `public/*.js` (módulos de tela) | **Gemini** | `login.js`, `compras.js`, ... |

### A fronteira compartilhada

**`public/apiService.js` é o único arquivo que os dois tocam.** Ele é o contrato:
o backend define o formato, o frontend consome.

Regra: **quem muda o contrato, muda o `apiService.js` e avisa.** Se o Claude Code
adiciona um endpoint, ele adiciona o método aqui. Se o Gemini precisa de um
formato diferente, ele pede — não altera o backend por conta própria.

Arquivos que exigem conversa antes de mexer:

- `package.json` — os dois podem querer adicionar dependência
- `README.md`
- `.claude/settings.json`
- `CONTRATO-API-FRONTEND.md` — escrito pelo backend, lido pelo frontend

---

## 2. Branches

```
main                          ← integração; só recebe merge
├── saneamento/backend-*      ← Claude Code
└── frontend/*                ← Gemini
```

**Por que branches separadas e não a mesma:** um agente rodando `git checkout` ou
`git reset` puxa arquivos debaixo do outro no meio de uma edição, e os dois
disputam o `index.lock` ao commitar. Em branches distintas isso não acontece.

Ciclo de cada agente:

```bash
git checkout -b frontend/tela-login       # ou saneamento/backend-...
# ...trabalha, commita...
npm run verificar                          # precisa passar na sua camada
git push -u origin <branch>
```

Integração na `main` (você decide quando):

```bash
git checkout main
git merge --no-ff frontend/tela-login
npm run verificar                          # agora a pilha inteira
git push
```

### Se der conflito

Quase sempre será em `public/apiService.js` ou `package.json`. Nos dois casos:
**mantenha as duas mudanças**, não escolha um lado. São adições, não
substituições — um método novo do backend e um helper novo do frontend cabem
juntos.

---

## 3. Como testar os dois juntos

A API serve o frontend estático de `public/`, então **um comando sobe tudo**:

```bash
npm run dev:api
# http://localhost:3000  → frontend
# http://localhost:3000/api/v1/...  → API
# http://localhost:3000/health  → healthcheck
```

Não existe servidor de frontend separado. Alterou um `.html` ou `.js` em
`public/`? Recarregue o navegador. Alterou `src/`? Reinicie o processo.

### A verificação de pilha

```bash
npm run verificar
```

Sobe a API numa porta livre, provisiona um usuário próprio, exercita **banco →
API → frontend** e diz exatamente qual camada quebrou:

```
1. BANCO
   conexão, papel que respeita RLS, dados carregados, usuário para login
2. API
   rota protegida recusa sem token, header de tenant não contorna autenticação,
   login, os 12 endpoints, isolamento entre CNPJs, CNPJ não autorizado → 403
3. FRONTEND
   index.html servido, toda rota do menu tem página, todo módulo JS que o
   roteador carrega existe, apiService manda Authorization e trata 401
```

Sai com código ≠ 0 se algo falhar. **É o teste que os dois agentes rodam antes
de dizer que terminaram.**

O usuário de verificação (`verificador@eco-mitang.local`) tem senha nova a cada
execução, existe só em memória durante a rodada e não interfere em ninguém.
Isso não é detalhe: a primeira versão usava a credencial real do Diego e passou
a falhar no instante em que o frontend mexeu na senha ao construir a tela de
login.

### Contra uma API já rodando

```bash
npm run verificar -- --porta 3000
npm run verificar -- --json          # para CI
```

### Os outros comandos

| Comando | Camada | Quando |
|---|---|---|
| `npm run verificar` | tudo | antes de qualquer push |
| `npm test` | backend | mudou `src/` |
| `npm run db:verificar` | banco | mudou dado ou migration |
| `npm run build` | backend | sempre, antes de subir |
| `npm run db:status` | banco | conferir migrations aplicadas |

---

## 4. O banco é compartilhado — e isso importa

Os dois agentes usam a **mesma instância do Supabase**. Não há banco de
desenvolvimento separado.

Consequências práticas:

- **Só o Claude Code roda migrations.** Se o frontend precisa de uma coluna ou
  endpoint novo, pede.
- **Nunca rode `npm run db:reingest` sem avisar** — ele apaga e recarrega
  transações e notas fiscais a partir dos arquivos-fonte.
- **Trocar a senha de um usuário afeta o outro agente.** Para testar login, use
  um usuário descartável:
  ```bash
  npm run db:usuario -- --email teste-ui@local --nome "Teste UI" --papel Financeiro
  ```
- Mudou dado? Rode `npm run db:verificar` — 13 provas de integridade financeira.

---

## 5. Verdades sobre o backend que o frontend precisa saber

Detalhe completo em `CONTRATO-API-FRONTEND.md`. O essencial:

1. **Toda rota de dado exige `Authorization: Bearer <token>`.** Sem token, 401.
2. **O tenant vem do token.** `x-empresa-id` é só uma seleção dentro da lista de
   CNPJs do usuário; um CNPJ fora dela devolve 403.
3. **O backend distingue "é zero" de "não sabemos"** — via `sem_dados`,
   `comparavel`, `base_tributaria_disponivel`, `baseado_em_dados`,
   `lucro_liquido_parcial`, `origem`. Se a UI achatar essa distinção, todo o
   trabalho de tirar os números inventados se perde na última camada.
4. **Percentuais são número, não string.** `margem_bruta_pct: 55.8`, e pode ser
   `null`.
5. **`mom_percentual` pode ser `null`.** `null >= 0` é `true` em JavaScript —
   testar `comparavel` antes de formatar, ou a tela imprime `▲ +null%`.

---

## 6. Rotina de cada agente

**Ao começar:**
```bash
git fetch origin && git checkout -b <sua-branch> origin/main
npm install
npm run verificar        # ponto de partida conhecido
```

**Ao terminar:**
```bash
npm run build && npm run verificar
git add <apenas o seu território>
git commit && git push -u origin <sua-branch>
```

Commite **só os seus caminhos**. `git add -A` numa árvore compartilhada leva
junto o trabalho pela metade do outro agente:

```bash
git add src/ database/ scripts/ tests/     # Claude Code
git add public/                            # Gemini
```

---

## 7. Estado atual

Rodando `npm run verificar` hoje:

- **Banco**: 5/5 — papel `eco_app` sem BYPASSRLS, 1.324 transações, 172 notas,
  204 obrigações, 182 clientes
- **API**: 7/7 — 12 endpoints em 200, isolamento entre CNPJs confirmado
- **Frontend**: 4/6 — faltam as páginas `analises` e `automacoes`, e 8 módulos
  JS que o roteador carrega mas que não existem no disco

As duas pendências são de frontend e estão no plano em
`https://claude.ai/code/artifact/96277f7c-abaf-4786-adc2-caa151ea694a`.
