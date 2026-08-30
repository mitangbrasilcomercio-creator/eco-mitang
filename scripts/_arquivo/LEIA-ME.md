# Scripts arquivados

Estes 85 scripts foram escritos ao longo do desenvolvimento para inspecionar,
corrigir e recarregar dados a mao. Eles **não fazem parte do fluxo do sistema** e
não devem ser executados contra o banco de produção.

## Por que saíram de `scripts/`

Vários deles **gravavam direto nas tabelas**, fora da lógica de domínio da
aplicação. Isso teve consequência concreta: as categorias em
`transacoes_bancarias` acabaram divergindo do que o parser de OFX produzia --
161 lançamentos de rendimento de CDI estavam gravados como varredura de
liquidez, porque um script de reconciliação os sobrescreveu depois da ingestão.
Quando o banco e o código discordam, o banco vence em silêncio, e ninguém
descobre até a auditoria.

Exemplos do que estava aqui dentro:

- `classify_business_partners.js` -- criava a coluna `clientes.tipo_entidade`
  com `ALTER TABLE`, fora de qualquer migration. O schema real do banco passou a
  ter uma coluna que nenhum arquivo de migration declarava. Hoje ela está
  formalizada em `database/22_parceiros_e_obrigacoes.sql`.
- `reconcile_transactions_with_categories.js`, `mark_informative_transactions.js`
  -- reescreviam `categoria_financeira` em massa.
- `fix_all_mojibake_in_db.js`, `sanitize_database_duplicates.js`,
  `fix_duplicate_clients.js` -- correções pontuais de dados.
- Dezenas de `inspect_*.js` e `audit_*.js` -- consultas de diagnóstico
  descartáveis.

## O que usar no lugar

| Necessidade | Comando |
|---|---|
| Ver o estado do schema | `npm run db:status` |
| Aplicar migrations | `npm run db:migrate` |
| Recarregar OFX/XML dos arquivos reais | `npm run db:reingest` |
| Carregar contas a pagar | `npm run db:seed:obrigacoes` |
| Auditar a integridade financeira | `npm run db:verificar` |
| Criar usuário | `npm run db:usuario -- --email ... --nome ...` |
| Diagnóstico pontual | uma consulta `SELECT` avulsa, sem gravar |

**Regra:** correção de dado passa por migration versionada ou por re-ingestão a
partir dos arquivos-fonte. Nunca por `UPDATE` avulso -- é o que torna a base
auditável.

Os arquivos ficam aqui por valor histórico: vários documentam como cada
descoberta sobre os dados reais foi feita.
