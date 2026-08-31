# Leitura da planilha original de orçamentos

A `Tabela de Orçamentos.xlsm` é a fonte de verdade comercial da holding — 423
linhas, aba `Lista_De_Orçamentos`, cobrindo Mitang e Arandu.

## Por que ler o XML cru

Toda leitura "amigável" de planilha entrega o valor já mastigado: perde a
fórmula, e no caminho perdeu também os acentos (`Oceanpact Geociências` virou
`Oceanpact Geoci?ncias`). Numa planilha onde **317 das 325 linhas têm o Valor
Final digitado à mão** e só 8 têm fórmula, saber qual é qual muda a leitura
inteira.

Um `.xlsm` é um ZIP de XML. `ler_orcamentos.py` abre o ZIP, resolve as
`sharedStrings` e devolve, por célula, o valor **e** a fórmula.

## Uso

```bash
python scripts/planilha/ler_orcamentos.py      # -> local/planilhas/lista.json
python scripts/planilha/conferir_numeracao.py  # confere OOMMAA x data de emissão
```

O `.xlsm` fica em `local/planilhas/`, fora do git: é dado da empresa, não código.

## Onde estão as colunas

A definição da tabela dentro do arquivo é autoritativa, e é ela que vale:
`IntensVendidos`, intervalo **B3:AL328**. A coluna **B é `Orçamento`** — o
número do negócio, preenchido nas 325 linhas.

> **[ERRO ANTERIOR]** Uma versão deste leitor tinha um bug de regex: numa célula
> vazia o Excel escreve `<c r="A4" s="12"/>`, e a expressão casava o `/` como
> atributo, engolindo a célula seguinte até o próximo `</c>`. Cada célula vazia
> comia a vizinha. Com isso a coluna B parecia vazia em 314 das 325 linhas, e
> concluí que o número vivia numa coluna `AN` "deslocada uma linha". Nada disso
> existe. Diego apontou a divergência olhando a própria planilha; o XML cru deu
> razão a ele (`B4 = 10125`). Corrigido: atributos preguiçosos e as duas
> terminações na mesma alternativa.
>
> Lição que ficou: antes de afirmar qualquer coisa sobre uma coluna, nomear o
> cabeçalho dela e conferir contra a definição da tabela.

**A planilha e o PDF apresentam o desconto de formas diferentes e chegam ao
mesmo total.** No orçamento 010925: a planilha guarda frete bruto de R$ 130,00 e
aplica o desconto sobre mercadoria + frete; o PDF mostra o desconto só sobre a
mercadoria e o frete já líquido, R$ 126,10. Os dois fecham em R$ 29.558,81, com
zero de diferença. Por isso o sistema precisa guardar **frete bruto + a base do
desconto**, e saber imprimir as duas apresentações.
