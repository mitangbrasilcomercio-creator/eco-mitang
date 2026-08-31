# Roadmap — onde estamos e o que vem

> Ponto único de entrada para "o que fazer agora". Substitui a leitura dos
> quatro documentos onde essa resposta estava espalhada.
> **Atualizado em 31/08/2026.**

Este arquivo é curto de propósito. O projeto tem 8 mil linhas de documentação;
o problema nunca foi falta de plano, foi plano em quatro lugares que discordavam
entre si. Quando precisar de profundidade, os documentos abaixo continuam
valendo — mas a ordem de execução é esta aqui.

---

## Como as regras são mantidas

**Regra que vive só em prosa é ignorada.** O que funcionou neste projeto foram
as regras que quebram alguma coisa quando violadas:

| Regra | O que a impõe |
|---|---|
| Rota nova sem permissão não sobe | `tests/rotas-permissao.test.js` |
| Migration não testada não entra em produção | `database/homologado.json` |
| CNPJ inventado não entra no banco | `chk_empresas_cnpj_valido` |
| Mock e backend não podem divergir | `tests/mock-contrato.test.js` |
| Lucro líquido não pode virar apelido do EBITDA | `tests/dre-calculo.test.js` |
| Escrita em produção sem confirmação e backup | `scripts/lib/ambiente.js` |

**Ao criar uma regra nova, escreva o teste antes do parágrafo.** Se não der para
testar, provavelmente é preferência, não regra.

---

## Estado real, em números

```
65 testes · 13/13 provas de integridade · 7/7 de schema
220 orçamentos · 1.324 transações · 182 clientes · 172 notas · 120 itens
9 rotas de API · 10 tabelas ainda vazias
1 de 9 módulos de frontend implementado de fato
```

O que existe com profundidade: autenticação, isolamento por RLS, extrato,
DRE (com as lacunas declaradas), clientes, catálogo, dashboard.

O que não existe: pessoal, aptidão, embarques, estoque, produção, compras,
razão contábil, conciliação, ingestão pela interface.

---

## Ordem de execução

| Quando | Entrega | Quem | Destrava |
|---|---|---|---|
| **agora** | Aplicar migrations 27-29 em produção | Diego | os dados corretos |
| **semanas 1-2** | Trigger de auditoria · `auditoria_acessos` · máquina de estados | Claude | Gaveta de Auditoria |
| **semanas 3-6** | Colaboradores · certificações · `aptidao_colaborador` · embarques | Claude | doc 04 do Gemini |
| **em paralelo** | Construtor de orçamentos sobre o mock | Gemini | uso real |
| **semanas 7-10** | Plano de contas · partida dobrada · fechamento · backfill | Claude | DRE do razão |
| **semanas 11-13** | RBAC granular · campo · JIT · MFA | Claude | salário mascarado |
| **semanas 16-20** | Ingestão pela tela · motor fiscal · CFOP | Claude | doc 10 do Gemini |
| **semanas 21-27** | Estoque · BOM · imobilizado | Claude | CMV e lucro líquido |

**A decisão que sustenta essa ordem:** o módulo de pessoal foi antecipado da
semana 13 para a 6. O incidente que originou o projeto não é evento passado — a
condição que o causou vale a cada alocação feita hoje.

---

## Divisão de trabalho

`AGENTES.md` tem o detalhe. O resumo:

- **Claude Code** — `src/ database/ scripts/ tests/ mock/`
- **Antigravity/Gemini** — `public/`
- **Fronteira** — `public/apiService.js` e `CONTRATO-API-FRONTEND.md`

Os dois agentes não se comunicam direto: rodam em produtos diferentes, sem canal
entre eles. A comunicação é por arquivo, e o acoplamento real é o servidor de
fronteira (`npm run mock`), que serve as rotas ainda não escritas na forma exata
do contrato — com teste que quebra o build de quem divergir.

- Gemini escreve em `frontend-specs/`
- Claude escreve em `frontend-specs/respostas-claude/`
- Ninguém edita o arquivo do outro. Discordância vira documento novo citando o
  arquivo e a seção.

---

## O que ainda depende de terceiros

| Pendência | De quem |
|---|---|
| Rotacionar a senha do banco (ficou no histórico do git) | Diego |
| Plano de contas validado com o contador | contador, pré-requisito da semana 7 |
| Preencher a coluna B da planilha nos 12 orçamentos de agosto | Diego |
| Corrigir `393` no lugar do número (FEST, L271/272) | Diego |
| Conferir agência da conta Bradesco | Diego |
| Chave PIX sair do código e virar parâmetro | Claude |

---

## Documentação: o que ler, e o que está velho

**Vale:**

| Arquivo | Para quê |
|---|---|
| `README.md` | instalação e comandos |
| `AGENTES.md` | fronteira entre os dois agentes |
| `CONTRATO-API-FRONTEND.md` | o que a API promete |
| `database/HOMOLOGACAO.md` | como testar sem tocar em produção |
| `frontend-specs/respostas-claude/R01…R06` | estado real e decisões técnicas |
| `.claude/eco-mitang-*.md` | diagnóstico e decisões arquiteturais de fundo |

**Precisa de atenção:**

- `SYSTEM_WORKFLOW_ARCHITECTURE.md` e `WORKFLOW_ECOSYSTEM.md` datam de 27/08 e
  afirmam *"Status: Em Produção / Carga 100% Real Ativa"*. Muita coisa mudou
  desde então. Não foram tocados porque parecem ser do agente de frontend —
  cabe a ele atualizar ou aposentar.

**Removido:** `skills/` era cópia byte a byte de `.agents/skills/` (md5
idêntico em 11 arquivos). Ficou só uma.

---

## A lição que este projeto já pagou para aprender

Três dos erros mais caros até aqui não foram de código:

1. A DRE reportava EBITDA positivo porque R$ 464 mil em pagamento a fornecedor
   era consultado e descartado.
2. O `valor_total` de 5 orçamentos guardava o valor de um item em vez da soma —
   R$ 138 mil subnotificados no funil.
3. Um bug de leitura de XML fez uma célula vazia engolir a vizinha, e eu
   construí três conclusões erradas sobre a planilha em cima disso.

**Os três foram achados conferindo contra uma segunda fonte** — a planilha
original, os PDFs enviados ao cliente, e o Diego olhando a tela. Nenhum foi
achado relendo código.

Por isso a regra que vale mais que qualquer processo aqui: **antes de afirmar
que um dado está certo, confira contra algo que não seja você.**
