# -*- coding: utf-8 -*-
"""
Extrai os orcamentos da Tabela de Orcamentos.xlsm para um JSON conferivel.

NAO grava em banco. A saida deste script e o insumo do relatorio de
reconciliacao -- a ideia e que nada entre em producao antes de Diego olhar
linha a linha o que vai mudar.

Decisoes que este extrator toma, e por que:

1. **O numero vem da coluna B, "Orcamento".** E a primeira coluna da tabela
   `IntensVendidos` (B3:AL328), segundo a definicao dentro do proprio arquivo.

   [ERRO ANTERIOR] Uma versao deste extrator lia a coluna AN, sem cabecalho e
   fora da tabela, e concluiu que a coluna do numero estava "deslocada uma
   linha". Nao estava: o leitor de XML tinha um bug que fazia celula vazia
   engolir a vizinha, e B parecia vazia em 314 das 325 linhas. Diego apontou a
   divergencia olhando a propria planilha; o XML cru deu razao a ele.

2. **Mes e ano vem do NUMERO, nunca das colunas de texto.** `Mes Emiss.` e
   `Ano Emiss.` sao campos digitados, e campo digitado erra. O numero do
   orcamento e a chave que vai para o Word, o PDF, a nota e o boleto.

3. **Data divergente e marcada, nao corrigida.** Daria para "consertar" a L78
   juntando o ano do numero com o dia da coluna -- daria 14/05/2025, exatamente
   o PDF. Mas o mesmo truque na L110 daria 29/08, e o PDF diz 04/08. Acertaria
   uma e erraria a outra. Entao as duas saem com `divergencia_data` para decisao
   humana.

4. **Frete bruto e base do desconto ficam separados.** A planilha calcula
   (mercadoria + frete) x (1 - desconto); o PDF do mesmo orcamento mostra o
   desconto so na mercadoria e o frete ja liquido. Os dois fecham no mesmo
   total. Guardar so o final perderia a informacao de qual apresentacao usar.

5. **Duas datas distintas, nunca fundidas.** `data_emissao` e quando o cliente
   pediu o orcamento; `data_aprovacao` e quando a Mitang ficou ciente da
   aprovacao -- que pode ser depois da data que consta no pedido de compra do
   cliente. A filosofia da empresa: vale o dia em que se soube.

6. **Nada e arredondado em silencio.** A planilha guarda 21043.199999999997;
   sai como 21043.20, com o bruto preservado em `valor_original_planilha`
   quando diferem.
"""
import json, io, re, sys, hashlib, datetime, collections

CAMINHO_JSON = 'local/planilhas/lista.json'
CAMINHO_XLSM = 'local/planilhas/tabela-orcamentos.xlsm'
SAIDA = 'local/planilhas/orcamentos-extraidos.json'

COL = {
    'vendido_por': 'C', 'data_emissao': 'F', 'cliente': 'G', 'cliente_doc': 'H',
    'contato': 'I', 'pack': 'J', 'codigo': 'K', 'quantidade': 'L', 'quimica': 'M',
    'enviado': 'N', 'aprovado': 'O', 'po_cliente': 'P', 'data_aprovacao': 'Q',
    'tipo_nf': 'T', 'numero_nf': 'W', 'prazo_dias': 'X', 'vencimento': 'Y',
    'metodo_pagamento': 'AB', 'status_boleto': 'AC',
    'valor_unitario': 'AD', 'valor_qnt': 'AE', 'desconto': 'AF', 'frete': 'AG',
    'valor_final': 'AH', 'pagamento': 'AI', 'situacao': 'AJ', 'observacao': 'AK',
}

EPOCA = datetime.date(1899, 12, 30)


def texto(linhas, lin, col):
    return str(linhas.get(str(lin), {}).get(col, '')).strip()


def numero(v):
    if v in ('', '-', None):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def dinheiro(v):
    """Arredonda para centavo, guardando o bruto quando o float mente."""
    n = numero(v)
    if n is None:
        return None, None
    r = round(n + 1e-9, 2)
    return r, (n if abs(n - r) > 1e-9 else None)


def data(v):
    n = numero(v)
    # Serial pequeno nao e data: alguem digitou uma contagem de dias.
    if n is None or n < 1000:
        return None, (n if n is not None else None)
    return (EPOCA + datetime.timedelta(days=int(n))).isoformat(), None


def main():
    doc = json.load(io.open(CAMINHO_JSON, encoding='utf-8'))
    linhas = doc['linhas']

    with open(CAMINHO_XLSM, 'rb') as fh:
        hash_fonte = hashlib.sha256(fh.read()).hexdigest()

    registros = []
    avisos = collections.Counter()

    for lin in sorted(linhas, key=int):
        n = int(lin)
        if n < 4:
            continue
        cliente = texto(linhas, lin, COL['cliente'])
        if not cliente:
            continue  # linha vazia do rodape da planilha

        # (1) numero vem da coluna B, a primeira da tabela IntensVendidos
        numero_orc = texto(linhas, lin, 'B')
        padrao = None
        # OOMMAA, com sufixo opcional de versao: '010526-2' e a segunda
        # proposta do mesmo negocio -- o cliente pediu dois formatos ao mesmo
        # tempo, e Diego marcou as duas com o mesmo numero base.
        m = re.fullmatch(r'(\d{4,6})(?:-(\d+))?', numero_orc)
        if m:
            n6 = m.group(1).zfill(6)
            ordem, mes, ano = int(n6[:2]), int(n6[2:4]), 2000 + int(n6[4:6])
            numero_orc = n6 + ('-' + m.group(2) if m.group(2) else '')
            padrao = 'OOMMAA'
        elif numero_orc:
            # Numeracao de outro CNPJ da holding, com regra propria
            # (ex.: 01.S.26.042.038 na venda triangulada para a Valaris).
            ordem = mes = ano = None
            padrao = 'OUTRO_CNPJ'
            avisos['numeracao_de_outro_cnpj'] += 1
        else:
            avisos['sem_numero'] += 1
            numero_orc = None
            ordem = mes = ano = None

        emissao, emissao_bruta = data(texto(linhas, lin, COL['data_emissao']))
        aprovacao, aprovacao_bruta = data(texto(linhas, lin, COL['data_aprovacao']))

        # (3) o numero manda; divergencia e marcada, nao corrigida
        divergencia = None
        if emissao and mes:
            d = datetime.date.fromisoformat(emissao)
            if d.month != mes or d.year != ano:
                divergencia = {
                    'numero_diz': '%04d-%02d' % (ano, mes),
                    'coluna_diz': emissao,
                    'observacao': 'O numero e a data de emissao discordam. '
                                  'Nas duas conferencias contra PDF o numero estava certo. '
                                  'Nao foi corrigido: precisa de decisao humana.'
                }
                avisos['divergencia_data'] += 1

        if aprovacao_bruta is not None:
            avisos['data_aprovacao_invalida'] += 1

        vu, vu_bruto = dinheiro(texto(linhas, lin, COL['valor_unitario']))
        vq, vq_bruto = dinheiro(texto(linhas, lin, COL['valor_qnt']))
        vf, vf_bruto = dinheiro(texto(linhas, lin, COL['valor_final']))
        frete, _ = dinheiro(texto(linhas, lin, COL['frete']))
        desconto = numero(texto(linhas, lin, COL['desconto'])) or 0.0
        qtd = numero(texto(linhas, lin, COL['quantidade']))

        # (4) qual base o desconto usou, quando da para distinguir
        base_desconto = None
        if vf is not None and vq is not None and desconto and frete:
            a = round((vq + frete) * (1 - desconto), 2)   # merc + frete
            b = round(vq * (1 - desconto) + frete, 2)     # so mercadoria
            if abs(a - vf) <= 0.02 and abs(b - vf) > 0.02:
                base_desconto = 'PRODUTOS_MAIS_FRETE'
            elif abs(b - vf) <= 0.02 and abs(a - vf) > 0.02:
                base_desconto = 'PRODUTOS'
            else:
                base_desconto = 'INDISTINGUIVEL'

        # confere a aritmetica da propria planilha
        confere = None
        if None not in (vq, vf):
            esperado = round((vq + (frete or 0)) * (1 - desconto), 2)
            confere = abs(esperado - vf) <= 0.02
            if not confere:
                avisos['aritmetica_nao_fecha'] += 1

        registros.append({
            'origem': {'arquivo': 'Tabela de Orcamentos.xlsm',
                       'aba': 'Lista_De_Orcamentos',
                       'linha': n,
                       'hash_fonte': hash_fonte[:16]},
            'numero_orcamento': numero_orc,
            'padrao_numeracao': padrao,
            'ordem_no_mes': ordem,
            'competencia': ('%04d-%02d' % (ano, mes)) if mes else None,
            'vendido_por': texto(linhas, lin, COL['vendido_por']) or None,
            'cliente_nome': cliente,
            'cliente_documento': texto(linhas, lin, COL['cliente_doc']) or None,
            'contato': texto(linhas, lin, COL['contato']) or None,
            'pack': texto(linhas, lin, COL['pack']) or None,
            'codigo': texto(linhas, lin, COL['codigo']) or None,
            'quimica': texto(linhas, lin, COL['quimica']) or None,
            'quantidade': qtd,
            'valor_unitario': vu,
            'valor_mercadoria': vq,
            'desconto_pct': round(desconto * 100, 4),
            'frete_bruto': frete,
            'base_desconto': base_desconto,
            'valor_final': vf,
            'valor_original_planilha': vf_bruto,
            'aritmetica_fecha': confere,
            # (5) duas datas distintas, nunca fundidas
            'data_emissao': emissao,
            'data_aprovacao': aprovacao,
            'data_aprovacao_invalida': aprovacao_bruta,
            'divergencia_data': divergencia,
            'aprovado': texto(linhas, lin, COL['aprovado']) or None,
            'po_cliente': texto(linhas, lin, COL['po_cliente']) or None,
            'numero_nf': texto(linhas, lin, COL['numero_nf']) or None,
            'tipo_nf': texto(linhas, lin, COL['tipo_nf']) or None,
            'vencimento': data(texto(linhas, lin, COL['vencimento']))[0],
            'metodo_pagamento': texto(linhas, lin, COL['metodo_pagamento']) or None,
            'situacao': texto(linhas, lin, COL['situacao']) or None,
            'observacao': texto(linhas, lin, COL['observacao']) or None,
            # 2026 e o ano que a empresa vai levar a serio; 2025 e historico
            'confiabilidade': 'RIGOROSO' if (ano or 0) >= 2026 else 'HISTORICO',
        })

    json.dump({'gerado_em': datetime.datetime.now().isoformat(timespec='seconds'),
               'fonte_sha256': hash_fonte,
               'total': len(registros),
               'avisos': dict(avisos),
               'orcamentos': registros},
              io.open(SAIDA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    print('extraidos: %d registros' % len(registros))
    print('fonte sha256: %s' % hash_fonte[:32])
    for k, v in sorted(avisos.items()):
        print('  aviso %-26s %d' % (k, v))
    print('gravado em %s' % SAIDA)


if __name__ == '__main__':
    main()
