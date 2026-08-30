# Contrato de API — o que mudou para o front-end

Documento para quem estiver cuidando da camada visual (Antigravity/Gemini).
O backend foi reescrito; a UI ainda não. Isto lista exatamente o que precisa
mudar no front e por quê.

`public/apiService.js` já foi adaptado (token, cabeçalhos, tratamento de 401/403).
O resto — telas — está pendente.

---

## 1. Autenticação: agora existe (antes não existia)

`login.html` era um fragmento visual sem backend nenhum. Não havia tabela de
usuários, rota de login nem token. **Qualquer pessoa com a URL via todos os
dados financeiros da holding.**

### O que fazer

```js
const r = await apiService.login(email, senha);
if (r.success) {
  // token e usuário já ficam guardados pelo apiService
  // r.data.usuario.empresas -> lista de CNPJs permitidos
  // r.data.usuario.papel    -> Gestor_CLevel | Financeiro | Vendedor | Operacional
  // r.data.usuario.pode_visao_consolidada
} else {
  mostrarErro(r.error); // ex.: "E-mail ou senha invalidos."
}
```

Eventos que a UI deve escutar:

| Evento | Quando | O que fazer |
|---|---|---|
| `mitang_nao_autenticado` | qualquer chamada devolveu 401 | levar para a tela de login |
| `mitang_acesso_negado` | 403 | avisar que o perfil não permite aquilo |
| `mitang_tenant_changed` | trocou o CNPJ ativo | recarregar os dados da tela |
| `mitang_sessao_encerrada` | logout | limpar a tela |

Helpers disponíveis: `apiService.estaAutenticado()`, `.getUsuario()`,
`.getEmpresasPermitidas()`, `.podeVisaoConsolidada()`, `.logout()`.

## 2. Seletor de empresa: vem do usuário, não do código

Antes o UUID da Mitang Brasil estava escrito no `apiService.js` como padrão.

Agora o seletor deve ser montado com `apiService.getEmpresasPermitidas()`
(`[{ id, nome_fantasia, cnpj }]`). A opção **"Holding (consolidado)"**
(`'all'`) só aparece se `apiService.podeVisaoConsolidada()` for verdadeiro —
o backend devolve 403 para quem não tem essa permissão.

## 3. Campos novos: "zero" x "não sabemos"

Esta é a mudança mais importante para a UI.

O backend antigo preenchia lacunas com números plausíveis: R$ 152.342,82 de
custódia, R$ 85.200,00 a receber, inadimplência igual a 8% do faturado, MoM fixo
em −5,2%, receita de R$ 150.000 em novembro. Nada disso vinha de lugar nenhum.

Foram todos removidos. Agora, quando não há base, o valor é `0` e vem um campo
dizendo isso:

| Campo | Onde | Significado quando `false`/`true` |
|---|---|---|
| `sem_dados` | dashboard, resumo, contas a pagar | não há registro no período |
| `comparavel` | indicadores com MoM | não há período anterior para comparar (`mom_percentual: null`) |
| `base_tributaria_disponivel` | DRE → `deducoes` | nenhuma nota do período traz imposto destacado |
| `baseado_em_dados` | projeção mensal | não há recebível registrado para o mês |
| `origem_saidas` | projeção mensal | `TITULOS_LANCADOS` (fato) ou `CUSTO_FIXO_RECORRENTE` (estimativa) |
| `lucro_liquido_parcial` | DRE | não inclui depreciação/amortização |
| `origem` | qualquer resposta | `CACHE_EXPIRADO` ou `LOCAL_MIRROR` — dado de contingência |

**Sugestão de tratamento:** onde `comparavel === false`, mostrar "—" em vez de
uma seta de tendência. Onde `origem` estiver presente, exibir um aviso discreto
de que o dado pode estar desatualizado. Onde `baseado_em_dados === false`,
diferenciar visualmente da previsão apoiada em títulos reais.

Um indicador em branco é uma informação honesta. Um número inventado não é.

## 4. Mudanças por endpoint

Rotas e nomes de campo foram preservados onde possível. As diferenças:

### `GET /financeiro/transacoes`
Ganhou `subtotais: { entradas, saidas, liquido }`, calculado no banco sobre o
**recorte filtrado inteiro** — não só a página. Se a UI somava a página para
montar o rodapé (`tfoot`), agora pode usar isto direto.

### `GET /financeiro/resumo-caixa`
- Aceita `?periodo=` / `?data_inicio=&data_fim=` (antes ignorava período).
- `a_receber` agora sai dos **títulos em aberto**, não da soma de todas as notas
  emitidas — antes contava como pendente o dinheiro que já tinha entrado.
- Novos: `a_receber_vencido`, `a_pagar_vencido`, `periodo`.
- `rendimentos_financeiros_juros` finalmente traz valor (antes era sempre
  R$ 0,00 por divergência de nome de categoria).

### `GET /financeiro/contas-a-pagar`
Mesma forma (`kpis` + `data`), mas vindo do PostgreSQL em vez de um arquivo JSON.
`status_vencimento` e `dias_em_atraso` agora são calculados contra **hoje** —
antes eram valores congelados que nunca envelheciam.

### `GET /financeiro/projecao-futura`
- Parâmetro `?meses=` (1 a 12).
- `projecao_mensal[]` ganhou `competencia`, `saldo_acumulado`, `origem_saidas`,
  `baseado_em_dados`, `qtd_titulos_receber`.
- `status_cobertura` pode ser `SEM_RECEBIVEL_REGISTRADO`.

### `GET /dashboard/metrics`
- `receitas.pipeline_orcamentos` é **novo e separado** do faturamento. Antes o
  backend fazia `Math.max(orçamentos, notas)` — o maior entre duas grandezas
  diferentes. Faturamento agora é só nota fiscal emitida; orçamento aprovado é
  pipeline comercial.
- Indicadores viraram objetos com `comparavel`.
- `runway.dias_cobertura` pode ser `null` (`status: 'SEM_BASE_DE_CALCULO'`).
- `runway.detalhamento.projecao_diaria_quinzena` usa os vencimentos reais de
  cada dia — antes era `(total/15) * (i % 3 === 0 ? 2.5 : 0.3)`.
- `series_grafico.chaves[]` acompanha `meses[]`.
- `periodo_info.rotulo` e `.comparado_com`.

### `GET /contabilidade/dre`
- Percentuais viraram número: `margem_bruta_pct: 55.8` (antes `"55.8%"`).
  Pode ser `null` quando não há base.
- `deducoes` traz `base_tributaria_disponivel`,
  `notas_com_imposto_destacado`, `notas_sem_imposto_destacado`.
- `lucro_liquido` deixou de ser um alias do EBITDA.

### `GET /faturamento/notas`
Ganhou `?data_inicio`/`?data_fim`, `soma_valor_filtrado`, e a rota de detalhe
`GET /faturamento/notas/:id` (com itens e duplicatas).

### `POST /financeiro/categorizar-transacao`
Restrito a `Gestor_CLevel` e `Financeiro`. **Agora grava no banco.** Antes
gravava só no espelho local em disco, e o worker de sincronização sobrescrevia
o arquivo a partir do PostgreSQL — toda categorização feita pelo usuário se
perdia em até 24 horas, sem aviso.

### `GET /financeiro/categorias` (novo)
Categorias existentes com contagem — para montar o seletor sem lista fixa.

### `GET /catalogo`
A rota antiga `/catalogo` (sem `/api/v1`) foi removida: eram dois módulos
concorrentes servindo duas tabelas diferentes. Use `/api/v1/catalogo`.

## 5. Erros

Formato uniforme:

```json
{ "success": false, "error": "mensagem para o usuario", "code": "CODIGO_ESTAVEL" }
```

| HTTP | Situação |
|---|---|
| 401 | sem token, token inválido ou expirado |
| 403 | CNPJ não permitido, ou papel insuficiente |
| 404 | recurso inexistente **ou fora do CNPJ selecionado** |
| 422 | validação (`details[]` com `campo` e `mensagem`) |
| 429 | excesso de tentativas de login |
| 503 | banco indisponível e sem contingência |

Mensagens internas do PostgreSQL não voltam mais para o cliente.

## 6. Checklist do front

- [ ] Tela de login funcional usando `apiService.login()`
- [ ] Guarda de rota: redirecionar quando `mitang_nao_autenticado` disparar
- [ ] Seletor de empresa montado com `getEmpresasPermitidas()`
- [ ] Opção "consolidado" só quando `podeVisaoConsolidada()`
- [ ] Botão de logout
- [ ] Exibir nome e papel do usuário logado
- [ ] Tratar `comparavel: false` (sem seta de tendência)
- [ ] Tratar `sem_dados` (estado vazio explícito, não "R$ 0,00" seco)
- [ ] Aviso quando `origem` for `CACHE_EXPIRADO` ou `LOCAL_MIRROR`
- [ ] Percentuais da DRE agora são número, não string com `%`
- [ ] Esconder ações de escrita para papéis sem permissão
