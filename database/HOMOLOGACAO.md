# Ambiente de homologação

O plano de execução chamava a ausência deste ambiente de **"o risco mais urgente
hoje"**: `db:migrate` e `db:reingest` rodavam direto no Supabase de produção,
sem rede de proteção. Duas vezes isso já custou dados reais — contas bancárias
duplicadas por rodar código desatualizado, e 75 duplicatas de nota fiscal
apagadas por um `TRUNCATE ... CASCADE`.

---

## Em uma linha

```bash
npm run homolog:preparar
```

Sobe um PostgreSQL 17 em container, aplica todas as migrations e cria o papel
`eco_app`. Do zero até um banco utilizável, sem rede e sem custo.

---

## O que mudou no dia a dia

**O alvo padrão de todo script de banco passou a ser homologação.**

| Comando | Alvo |
|---|---|
| `npm run db:migrate` | homologação |
| `npm run db:migrate:prod` | produção, com as travas abaixo |
| `npm run db:verificar` | homologação |
| `npm run db:verificar:prod` | produção (somente leitura) |

Produção também pode ser pedida com `--producao` em qualquer script, ou por
`ECO_AMBIENTE=producao`. **A flag ganha da variável**: um `.env` apontando para
produção não contamina um comando escrito de propósito para homologação.

Todo script imprime o alvo — host, porta e base — antes da primeira query.

### As travas de produção

Operação que escreve em produção passa por quatro portas:

1. **Escolha explícita.** Nunca por omissão.
2. **Confirmação digitada.** É preciso escrever `PRODUCAO` por extenso. Sem
   terminal (CI), exige `--confirmar-producao`.
3. **Backup antes.** `pg_dump` em formato custom para `database/backups/`. Se o
   backup falhar, a operação não acontece.
4. **Prova de homologação.** Migration que nunca passou em homologação — ou que
   foi editada depois de passar — é recusada. O registro fica em
   `database/homologado.json`, versionado.

Cada trava tem um escape (`--sem-backup`, `--sem-homologacao`), porque uma
proteção sem saída acaba sendo contornada de formas piores. Usar o escape é uma
decisão consciente e visível no histórico do shell.

Em homologação **nada disso é perguntado**. Fricção onde não há risco só ensina
a confirmar no automático — e é assim que a proteção morre.

---

## Por que container local, e não um terceiro projeto Supabase

| | Container local | Projeto Supabase |
|---|---|---|
| Custo | zero | sai do plano gratuito |
| Reset completo | `npm run homolog:zerar`, segundos | trabalhoso — e por isso não se faz |
| Sem rede | funciona | não |
| Fidelidade de plataforma | parcial | total |

O ponto decisivo é o segundo. Um ambiente de teste vale pela facilidade de
jogá-lo fora: se recriar do zero dá preguiça, a base apodrece e deixa de
representar qualquer coisa.

As migrations deste projeto são PostgreSQL puro — as únicas extensões são
`uuid-ossp` e `pgcrypto`, ambas no contrib. Não foi preciso emular nada.

### O que o container reproduz de propósito

`database/homologacao/00_papeis_supabase.sql` cria `anon`, `authenticated` e
`service_role`, **com o privilégio padrão que expõe tabela nova** — exatamente
o comportamento inseguro da plataforma.

Sem isso, a migration 26 (que fecha essa exposição) seria um no-op aqui, e
"passou em homologação" não significaria nada para essa classe de defeito.

### O que ele não cobre

Supavisor, TLS com CA fixada, e o comportamento real do PostgREST. É superfície
de plataforma, não de schema — e continua sendo exercitada contra produção por
`npm run verificar` e `node scripts/verificar_schema.js --producao`.

---

## Espelhar produção

```bash
npm run homolog:espelhar
```

Dump de produção (somente leitura do lado de lá) → base local recriada →
restore → **anonimização obrigatória**.

`database/homologacao/anonimizar.sql` segue um critério único:

- **Preserva** o que muda um cálculo: valor, data, CNPJ de pessoa jurídica,
  categoria, empresa. Sem isso o espelho não serve para testar DRE, conciliação
  ou isolamento entre tenants.
- **Destrói** o que identifica pessoa física ou dá acesso: e-mail, senha,
  telefone, nome de pessoa, CPF.

CNPJ de empresa é dado público e é a chave do pareamento nota × pagamento —
mantê-lo é o que permite reproduzir aqui o teste de duplicidade do DRE. CPF não
tem essa função, e vai embora.

Ao final o comando **confere** que nenhum e-mail real sobrou. Se a anonimização
falhar, a transação é revertida e o comando manda zerar a base: uma homologação
com dado real não deve ser usada.

Depois de espelhar, a senha de qualquer usuário é `homologacao`.

---

## Comandos

| | |
|---|---|
| `npm run homolog:preparar` | do zero até um banco utilizável |
| `npm run homolog:espelhar` | copia produção, anonimizando |
| `npm run homolog:status` | container, versão, tabelas, migrations |
| `npm run homolog:zerar` | destrói o volume e refaz |
| `npm run homolog:derrubar` | para o container, mantém os dados |
| `node scripts/verificar_schema.js` | invariantes: RLS, policies, grants, ledger |
| `node scripts/test_connection.js --app` | diagnóstico com o papel `eco_app` |

Requer Docker Desktop rodando.

---

## O que a primeira execução encontrou

Vale registrar, porque é a justificativa do ambiente inteiro.

**1. O schema de produção não podia ser reconstruído a partir das migrations.**
`12_nfe_nfse_xml_armazenamento.sql` cria `notas_fiscais_itens` com uma FK para
`itens_catalogo`, que só nascia na `14_`. Em produção nunca apareceu: as tabelas
já existiam, aplicadas fora de ordem por um script avulso. Mas um banco que não
se reconstrói a partir das próprias migrations não tem plano de recuperação.
Corrigido renumerando para `11a_`.

**2. Quatro objetos de produção expostos ao PostgREST.** `parceiros_negocio`,
`plano_contas`, `obrigacoes_recorrentes` e a view `vw_obrigacoes_recorrentes`,
todos com `DELETE, INSERT, SELECT, TRUNCATE, UPDATE` para `anon`. Foram criados
pela migration 22, **depois** da 21 ter revogado tudo — a 21 corrigiu o estado
presente sem estabelecer a regra futura. A view vazava por completo (view não
respeita a RLS da tabela de baixo sem `security_invoker`), e `TRUNCATE` não
passa por RLS em tabela nenhuma. Corrigido pela migration 26.

**3. Um script conectando em produção com verificação de certificado desligada.**
`scripts/test_connection.js` mantinha o `rejectUnauthorized: false` que havia
sido removido do pool da aplicação no saneamento anterior.

Os três estavam invisíveis enquanto o único critério de sucesso era "a migration
rodou sem erro em produção".
