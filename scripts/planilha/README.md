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

## Duas armadilhas já encontradas

**A coluna do número está deslocada uma linha.** O número do orçamento da linha
N está em `AN[N-1]`, não em `AN[N]`. Conferido contra o PDF
`010925 - Orçamento Signature-ADCP RDI.pdf`, que é da Oceanpact — a mesma
empresa que o deslocamento aponta. Ler a coluna alinhada dá o número do vizinho
a cada linha, e o número do orçamento é a chave que amarra Word, PDF, nota e
boleto.

**A planilha e o PDF apresentam o desconto de formas diferentes e chegam ao
mesmo total.** No orçamento 010925: a planilha guarda frete bruto de R$ 130,00 e
aplica o desconto sobre mercadoria + frete; o PDF mostra o desconto só sobre a
mercadoria e o frete já líquido, R$ 126,10. Os dois fecham em R$ 29.558,81, com
zero de diferença. Por isso o sistema precisa guardar **frete bruto + a base do
desconto**, e saber imprimir as duas apresentações.
