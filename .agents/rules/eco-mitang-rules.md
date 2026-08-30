# Regras Mandatórias de Desenvolvimento: Eco-Mitang ERP

Ao trabalhar neste repositório, qualquer assistente de IA ou desenvolvedor deve
seguir estritamente estas diretrizes.

---

## 1. Segurança Multi-Tenant & SQL Parametrizado

- **Nunca** interpole strings em SQL. Sempre `$1, $2, ...`.
  Isto já foi violado e custou caro: quatro controllers montavam
  `AND empresa_id = '${empresaId}'` a partir de um header do navegador --
  injeção de SQL não autenticada.
- **Todo acesso ao banco passa por `withTenantQuery` ou `withTenantTransaction`**
  (`src/core/database/supabase-pool.ts`). `pgPool.query` direto só é aceitável
  em `src/modules/auth/` (tabelas de usuário, que não são multi-tenant) e no
  healthcheck de boot.
- **Não escreva filtro manual de `empresa_id` em consultas de leitura.** Quem
  isola é a Row-Level Security. Filtro manual é redundante e cria a ilusão de
  que a segurança depende de lembrar dele.
- O tenant vem **sempre do JWT**, nunca de um header confiado. `x-empresa-id` é
  apenas uma *seleção* validada contra a lista do token.

## 2. Nenhum número inventado

Esta é a regra mais importante de um ERP financeiro.

- Quando não há dado, o valor é `0` e o payload traz `sem_dados: true` ou
  `comparavel: false`. **Nunca** um valor plausível.
- Proibido: fallback do tipo `soma > 0 ? soma : 18837.20`, percentual fixo
  (`mom_percentual: -5.2`), estimativa apresentada como apuração
  (`receitaBruta * 0.0865`), ou distribuição sintética
  (`(total/15) * (i % 3 === 0 ? 2.5 : 0.3)`).
- Se um número é estimado, o payload precisa dizer isso (ex.:
  `origem_saidas: 'CUSTO_FIXO_RECORRENTE'`, `lucro_liquido_parcial: true`).

## 3. Datas

- Nunca escreva "hoje" no código. Use `src/core/utils/periodo.ts`, que recebe a
  data de referência por parâmetro (real em produção, fixa nos testes).
- Datas do banco são `DATE`/`TIMESTAMPTZ`. `'DD/MM/AAAA'` é formato de
  **exibição**, tarefa do front-end -- nunca formato de armazenamento.

## 4. Migrations

- Schema muda **somente** por arquivo numerado em `database/`, aplicado por
  `npm run db:migrate`. Nunca por `ALTER TABLE` dentro de um script avulso.
- **Migration aplicada é imutável.** O runner compara o hash e recusa arquivos
  editados depois de aplicados. Correção = arquivo novo.
- Toda tabela com `empresa_id` precisa de policy `PERMISSIVE` com `USING` **e**
  `WITH CHECK`. Policy `RESTRICTIVE` sozinha nega tudo -- foi assim que a RLS
  ficou decorativa por todo o projeto.
- Um `CREATE TYPE` por bloco `DO $$`. Vários no mesmo bloco fazem o
  `EXCEPTION WHEN duplicate_object` engolir a criação dos seguintes.

## 5. Correção de dados

- Dado errado se corrige por **re-ingestão a partir do arquivo-fonte**
  (`npm run db:reingest`) ou por migration versionada. Nunca por `UPDATE` avulso.
- Scripts de diagnóstico podem ler. Não podem gravar.
- Depois de qualquer carga: `npm run db:verificar` precisa passar 13/13.

## 6. Espelho local (`database/local_mirror/`)

- É **cache de leitura**, e só. Nunca destino de escrita.
- Escrita do usuário vai para o PostgreSQL. O worker de sincronização
  sobrescreve o espelho a partir do banco -- qualquer coisa gravada só no JSON
  se perde em horas.

## 7. Arquitetura Orientada a Eventos

- Ao mudar o status de uma entidade de domínio, publique o evento no
  `globalEventBus` e declare o payload em `src/core/events/events.types.ts`.
- O fluxo operacional em `examples/simulacao-event-driven/` roda em memória e
  **não** é o sistema em produção. Leia o `LEIA-ME.md` de lá antes de mexer.

## 8. Validação de entrada

- Zod em todo `POST`, `PUT`, `PATCH` **e** em query params de listagem
  (`limit`, `offset` e datas incluídos).
- Erro de validação: HTTP 422 com o campo e a mensagem.
- Mensagem de erro do PostgreSQL **nunca** volta ao cliente.

## 9. Automação cadastral

Ao criar ou evoluir módulos de entidades cadastradas, implemente:
- auto-enriquecimento por fontes públicas oficiais (sem mock, sem dado gerado);
- detecção de risco de compliance (CNPJ inapto, certidão vencida);
- rotina de sincronização em segundo plano;
- histórico de alterações (SCD Tipo 2) com data de vigência.

## 10. Testes e encerramento

- Todo script e teste que abre conexão precisa fechá-la
  (`encerrarPool()` / `client.end()`).
- Antes de considerar qualquer tarefa concluída:
  ```bash
  npm run build && npm test && npm run db:verificar
  ```
- Bug corrigido ganha teste de regressão com o dado real que o revelou. Veja
  `tests/ofx-classificador.test.js`: cada caso ali é um erro que já aconteceu em
  produção.
