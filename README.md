# Eco-Mitang ERP

ERP multi-tenant para a holding **Eco-Mitang**, composta por 4 CNPJs operacionais:

1. **Mitang Brasil & Arandu** — manufatura de baterias subsea e hospitalares
2. **Mitang Rental** — locação de equipamentos oceanográficos e metrologia
3. **Mitang Services** — serviços especializados offshore
4. **Mitang Academy / Sea House** — cursos e treinamentos marítimos

Backend em Node.js + TypeScript + Express sobre PostgreSQL (Supabase).
Front-end SPA em `public/`.

---

## Início rápido

```bash
npm install

# 1. Papel de aplicação sem privilégio (imprime a APP_DATABASE_URL para o .env)
npm run db:role

# 2. Schema
npm run db:migrate

# 3. Primeiro usuário
npm run db:usuario -- --email voce@empresa.com --nome "Seu Nome" \
                      --papel Gestor_CLevel --consolidado

# 4. Carga dos dados reais
npm run db:reingest            # extratos OFX + XMLs de NF-e/NFS-e
npm run db:seed:obrigacoes     # contas a pagar

# 5. Conferência
npm run db:verificar           # precisa passar 13/13
npm test

# 6. Subir
npm run dev:api
```

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `APP_DATABASE_URL` | sim | Conexão da aplicação (papel `eco_app`, **sem** BYPASSRLS) |
| `MIGRATION_DATABASE_URL` | sim | Conexão privilegiada, só para migrations e scripts |
| `JWT_SECRET` | sim | Assinatura do token (mín. 32 caracteres, sem default) |
| `ECO_WEBHOOK_SECRET` | sim | Segredo dos webhooks (mín. 24 caracteres, sem default) |
| `CORS_ORIGINS` | não | Origens permitidas, separadas por vírgula |
| `PORT` | não | Padrão 3000 |
| `CNPJ_AUTO_DISCOVERY` | não | `true` liga a varredura de CNPJ (consome cota de API externa) |
| `SYNC_INTERVAL_MS` | não | Intervalo do espelho local (padrão 6 h) |

O servidor **recusa subir** sem `APP_DATABASE_URL` e `JWT_SECRET`.

---

## Autenticação

Toda rota de dado exige `Authorization: Bearer <token>`.

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"voce@empresa.com","senha":"..."}'
```

O token carrega o usuário, o papel e **a lista de CNPJs que ele pode acessar**.
O header `x-empresa-id` é apenas uma *seleção* dentro dessa lista: um CNPJ fora
dela devolve `403`. `x-empresa-id: all` traz a visão consolidada, e só para
quem tem `pode_visao_consolidada`.

Papéis: `Gestor_CLevel`, `Financeiro`, `Vendedor`, `Operacional`.

---

## Arquitetura

### Isolamento multi-tenant

O isolamento é imposto pelo **banco**, não pela aplicação:

- A aplicação conecta com o papel `eco_app`, que **não** tem `BYPASSRLS`.
- Cada tabela com `empresa_id` tem policy `PERMISSIVE FOR ALL` com
  `USING (empresa_id = ANY(app_empresa_ids()))` e
  `WITH CHECK (empresa_id = app_current_empresa())`.
- Leitura enxerga o conjunto de CNPJs do contexto (é assim que a visão
  consolidada funciona); escrita é travada no CNPJ selecionado.
- Tabelas-filhas sem `empresa_id` herdam o isolamento via `EXISTS` no pai.

Consequência prática: uma consulta nova que esqueça o filtro de tenant **não
vaza dados** — o banco não devolve as linhas dos outros CNPJs.

Todo acesso passa por `withTenantQuery` / `withTenantTransaction`
(`src/core/database/supabase-pool.ts`).

### Camadas

```text
rota → authMiddleware → tenantMiddleware → controller → service → repository → PostgreSQL
                                            (Zod)      (regra)      (SQL)
```

Nenhum SQL dentro de controller. Nenhuma string SQL montada por concatenação de
entrada do usuário.

### Espelho local (`database/local_mirror/`)

Cache **de leitura** em disco, para o painel continuar respondendo quando o
Supabase Free Tier pausa por inatividade. Respostas servidas por contingência
vêm marcadas com `origem: 'CACHE_EXPIRADO'` ou `'LOCAL_MIRROR'`, para nunca se
confundirem com o estado atual do banco.

**Não é destino de escrita.** Escrita do usuário vai para o PostgreSQL.

---

## Ingestão de dados

### Extratos OFX (Itaú, Bradesco)

Pipeline em 4 camadas, na ordem que importa:

1. **Linhas de saldo** (`SALDO APLICAÇÃO AUTOMÁTICA`, `SALDO TOTAL DISPONÍVEL`,
   `SDO APLIC AUT`) são fotografias do saldo, não movimentação — expurgadas.
2. **Rendimentos** de CDI (`REND PAGO`, `RENTAB.INVEST`) — receita financeira,
   segregada do faturamento comercial. Tem precedência sobre a camada 3, porque
   `REND PAGO APLIC AUT MAIS` contém "APLIC AUT" mas é rendimento.
3. **Varredura de liquidez** (`APL APLIC AUT MAIS`, `RES APLIC AUT MAIS`) —
   movimento entre conta corrente e aplicação do mesmo titular, neutro na DRE.
4. **Operações reais** — clientes, fornecedores, tributos, folha, tarifas.

A classificação fica isolada em `src/modules/financeiro/ofx/ofx-classificador.ts`
e é coberta por testes com os memos reais dos bancos.

**Idempotência:** hash SHA-256 por lançamento (tenant + banco + conta + FITID +
data + valor + memo normalizado) com `ON CONFLICT DO NOTHING`. O FITID sozinho
não serve — o Bradesco reaproveita o mesmo FITID em lançamentos distintos.
Reimportar o mesmo arquivo na mesma conta é bloqueado por `UNIQUE` no hash do
arquivo.

**Roteamento multi-tenant:** a conta bancária é a autoridade sobre o CNPJ do
lançamento. Um trigger recusa qualquer transação cujo `empresa_id` divirja do
titular da conta.

### NF-e / NFS-e

Ingestão sem perdas: todas as tags vão para `dados_completos_json` (JSONB), o
XML assinado é preservado em `conteudo_xml`, e itens e duplicatas viram tabelas
relacionais. Idempotente pela chave de acesso.

---

## Módulos financeiros

- **Tesouraria** — extrato com filtros, busca e subtotais calculados no banco
  sobre o recorte inteiro (não só a página visível).
- **Resumo de caixa** — saldo bancário oficial (LEDGERBAL), entradas e saídas
  operacionais, rendimentos, custódia overnight, a receber (títulos em aberto) e
  a pagar.
- **Contas a pagar** — obrigações recorrentes com `status_vencimento` calculado
  contra a data corrente.
- **Projeção de caixa** — recebíveis das duplicatas em aberto e saídas das
  obrigações lançadas; onde não há título, usa o custo fixo recorrente e
  **declara isso** (`origem_saidas`, `baseado_em_dados`).
- **DRE** — receita bruta, deduções, CMV, lucro bruto, despesas operacionais,
  EBITDA e lucro líquido.
- **Dashboard executivo** — MoM, runway, curva ABC de inadimplência, custódia,
  séries do gráfico com granularidade adaptativa.

### Uma regra que atravessa todos eles

**Quando não há dado, o valor é zero e o payload diz que não há base.**

Campos como `sem_dados`, `comparavel`, `base_tributaria_disponivel`,
`baseado_em_dados` e `lucro_liquido_parcial` existem para o front distinguir
"o valor é zero" de "não sabemos". Um ERP financeiro nunca deve devolver um
número plausível no lugar de um que ele não tem.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev:api` | Sobe a API em modo desenvolvimento |
| `npm run build` | Compila para `dist/` |
| `npm start` | Roda a versão compilada |
| `npm test` | Testes com asserção (`node --test`) |
| `npm run db:status` | Mostra quais migrations estão aplicadas |
| `npm run db:migrate` | Aplica as pendentes, cada uma em sua transação |
| `npm run db:role` | Cria/rotaciona o papel `eco_app` |
| `npm run db:usuario` | Cria usuário |
| `npm run db:reingest` | Recarrega OFX e XMLs dos arquivos reais (`--dry-run` disponível) |
| `npm run db:seed:obrigacoes` | Carrega as contas a pagar |
| `npm run db:verificar` | Auditoria de integridade financeira (13 provas) |
| `npm run demo` | Simulação event-driven em memória (ver `examples/`) |

---

## Estrutura

```text
├── src/
│   ├── core/
│   │   ├── cache/            # cache em memória com stale fallback
│   │   ├── database/         # pool com TLS verificado, contexto de tenant, espelho
│   │   ├── events/           # barramento de eventos de domínio
│   │   ├── middlewares/      # autenticação, tenant, webhook
│   │   └── utils/periodo.ts  # resolução de períodos e faixas do gráfico
│   └── modules/
│       ├── auth/             # login, JWT, papéis, log de acesso
│       ├── financeiro/       # tesouraria, OFX, contas a pagar, projeção
│       ├── dashboard/        # painel executivo
│       ├── contabilidade/    # DRE
│       ├── faturamento/      # NF-e / NFS-e
│       ├── clientes/         # cadastro, enriquecimento CNPJ, dossiê 360°
│       ├── orcamentos/       # histórico de cotações
│       └── catalogo/         # catálogo universal
├── database/                 # migrations numeradas + certificado + espelho
├── examples/                 # simulação event-driven (memória, não é produção)
├── scripts/                  # fluxo oficial (7 scripts)
│   └── _arquivo/             # 85 scripts de desenvolvimento, não executar
├── tests/                    # testes com asserção
└── public/                   # front-end
```

---

## Notas de operação

- **`database/certs/supabase-ca.crt`** é a CA raiz da Supabase, usada para
  verificar o certificado do servidor. Sem ela a conexão falha — de propósito.
  Baixe uma nova no painel (Settings → Database → SSL Configuration) se expirar.
- **`database/backups/`** guarda os dumps criados antes de cada re-ingestão.
  Não vai para o git.
- As pastas de extratos de **Mitang Soluções Submarinas** e **Sea House** estão
  vazias. Os módulos financeiros desses CNPJs vão aparecer sem dado — o sistema
  reporta isso em vez de estimar.
- Os CNPJs de Mitang Services (`33333333000103`) e Mitang Academy
  (`44444444000104`) ainda são placeholders e precisam ser substituídos pelos
  reais.
