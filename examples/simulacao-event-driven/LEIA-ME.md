# Simulação Event-Driven (não é o sistema em produção)

Este diretório contém o fluxo operacional completo que o projeto se propõe a
ter: **triagem → cotação → ordem de serviço → execução → QSMS → financeiro**,
com barramento de eventos, listeners e as três travas de negócio (bloqueio
financeiro da OS, proibição de hard-delete de parcela, imutabilidade de
auditoria aprovada).

## O ponto importante

Tudo aqui roda em `core/db-client.ts` -- um **objeto em memória**:

```ts
export class InMemoryDB {
  public data: Record<string, any[]> = { empresas: [], cotacoes: [], ... };
}
```

Nada disso persiste. O ciclo inteiro existe apenas enquanto `npm run demo` está
executando, e some quando o processo termina.

Isso não estava claro antes: estes módulos viviam em `src/`, lado a lado com o
código que a API realmente serve, e as migrations `03` a `09` criam as tabelas
correspondentes no PostgreSQL -- tabelas que a aplicação **nunca lê nem grava**.
Quem olhasse o repositório concluiria que o fluxo operacional estava
implementado e funcionando.

Separar em `examples/` deixa a divisão honesta:

| | Onde | Persiste? | Servido pela API? |
|---|---|---|---|
| Núcleo financeiro/fiscal | `src/` | Sim, PostgreSQL | Sim |
| Fluxo operacional | `examples/simulacao-event-driven/` | Não, memória | Não |

## Como rodar

```bash
npm run demo
```

## As migrations 03–09 continuam no lugar

`03_tickets_triagem.sql` a `09_analytics_cqrs.sql` **não foram removidas**. Elas
descrevem corretamente o modelo de dados deste fluxo, incluindo os triggers de
regra de negócio, e são o ponto de partida quando ele for implementado de
verdade.

## Para tornar isto real

O caminho é trocar `InMemoryDB` por repositórios usando `withTenantTransaction`
(em `src/core/database/supabase-pool.ts`), no mesmo padrão de
`src/modules/clientes/clientes.repository.ts`. A RLS da migration 21 já cobre
`tickets_triagem`, `cotacoes`, `ordens_servico`, `auditorias_qsms` e as demais
tabelas envolvidas -- o isolamento multi-tenant já está pronto para receber esse
fluxo.
