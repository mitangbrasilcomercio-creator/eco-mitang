# -*- coding: utf-8 -*-
"""
Gera o relatorio de conferencia de CFOP a partir das notas de producao.

Por que existe: a DRE soma TODA nota emitida como receita e TODA nota recebida
como compra, sem olhar CFOP. Medido em 2026, isso poe R$ 255.270 de receita que
nao e venda e R$ 441.000 de custo que nao e compra.

A leitura de cada grupo abaixo e minha hipotese, nao decisao. Quem classifica e
o Diego -- o relatorio existe para ele poder fazer isso vendo emitente,
destinatario, itens e natureza de cada nota.

Uso:  python scripts/relatorios/gerar_cfop.py
"""
import json
import io
import html

ENTRADA = 'local/relatorios/cfop.json'
SAIDA_CORPO = 'local/relatorios/corpo.html'
SAIDA_RESUMO = 'local/relatorios/resumo.json'

# Hipotese por grupo: (classificacao, leitura, ressalva)
LEITURA = {
    ('5102', 'EMITIDA'): (
        'RECEITA', 'Venda de mercadoria dentro do estado. Receita operacional.', ''),
    ('6102', 'EMITIDA'): (
        'RECEITA', 'Venda de mercadoria para fora do estado. Receita operacional.', ''),
    ('sem CFOP', 'EMITIDA'): (
        'RECEITA', 'NFS-e nao tem CFOP. A natureza fala em manutencao de bens e equipamentos.',
        'Confirmar se todas sao servico prestado, e nao repasse ou reembolso.'),

    ('5915', 'RECEBIDA'): (
        'NAO E COMPRA',
        'Remessa para conserto emitida pela DOF SUBSEA PARA a Mitang: equipamento do '
        'cliente entrando para reparo.',
        'Nao houve compra e nao saiu dinheiro. Hoje entra como compra e derruba o lucro bruto.'),
    ('5551', 'EMITIDA'): (
        'NAO E RECEITA OPERACIONAL',
        'Venda de bem do ativo imobilizado. O item e um T-CROSS, vendido para a Recreio Veiculos.',
        'E baixa de ativo: resultado nao operacional. Voce confirmou que o carro era da empresa.'),
    ('5916', 'EMITIDA'): (
        'NAO E RECEITA',
        'Retorno de mercadoria recebida para conserto: o equipamento do cliente voltando '
        'depois do reparo. Contraparte e a DOF SUBSEA, a mesma do 5915.',
        'Se houve servico cobrado, ele deveria estar numa NFS-e a parte. Confirmar.'),
    ('5949', 'EMITIDA'): (
        'NAO E RECEITA',
        'Outra saida de mercadoria. Voce explicou: nota de transporte de equipamento proprio '
        'saindo para executar servico em outro local.',
        'A natureza e generica demais para cravar. Vale ler a observacao de cada uma.'),

    ('6102', 'RECEBIDA'): ('COMPRA', 'Fornecedor de fora do estado vendendo para a Mitang.', ''),
    ('6101 + 6102', 'RECEBIDA'): ('COMPRA', 'Fornecedor industrial de fora do estado.', ''),
    ('6101', 'RECEBIDA'): ('COMPRA', 'Fornecedor de fora do estado.', ''),
    ('5102', 'RECEBIDA'): ('COMPRA', 'Fornecedor do mesmo estado.', ''),
    ('5405', 'RECEBIDA'): (
        'COMPRA', 'Venda com substituicao tributaria ja recolhida. Supermercado, na maioria.',
        'Parecem consumiveis de copa. Confirmar se e insumo de producao ou despesa.'),
    ('5102 + 5405', 'RECEBIDA'): (
        'COMPRA', 'Venda normal e substituicao tributaria na mesma nota.', ''),
    ('6106', 'RECEBIDA'): ('COMPRA', 'Venda de fora do estado.', ''),
    ('6108', 'RECEBIDA'): ('COMPRA', 'Venda a consumidor final, fora do estado.', ''),
    ('6107', 'RECEBIDA'): ('COMPRA', 'Venda de producao do estabelecimento, fora do estado.', ''),
    ('6401', 'RECEBIDA'): ('COMPRA', 'Venda com substituicao tributaria, fora do estado.', ''),
    ('6404', 'RECEBIDA'): ('COMPRA', 'Venda a consumidor final com ST ja recolhida.', ''),
    ('5101', 'RECEBIDA'): ('COMPRA', 'Venda de producao do estabelecimento, mesmo estado.', ''),
    ('sem CFOP', 'RECEBIDA'): (
        'SERVICO TOMADO', 'NFS-e tomada: instalacao, montagem e servico tecnico contratado.', ''),

    ('5949', 'RECEBIDA'): (
        'A DECIDIR',
        'Outra saida emitida pela DOF SUBSEA para a Mitang. Valores baixos: R$ 50 e R$ 100.',
        'Nao sei o que sao.'),
    ('2202', 'RECEBIDA'): (
        'A DECIDIR', 'Retorno de mercadoria nao entregue.',
        'Devolucao de algo que voces enviaram e voltou? Precisa do contexto.'),
}

CHIP = {
    'RECEITA': ('ok', 'entra na receita'),
    'COMPRA': ('ok', 'entra no custo'),
    'SERVICO TOMADO': ('ok', 'entra na despesa'),
    'NAO E RECEITA': ('alerta', 'sai da receita'),
    'NAO E RECEITA OPERACIONAL': ('alerta', 'sai da receita operacional'),
    'NAO E COMPRA': ('grave', 'sai do custo'),
    'A DECIDIR': ('neutro', 'preciso de voce'),
}


def e(s):
    return html.escape('' if s is None else str(s))


def brl(v):
    return 'R$ ' + '{:,.2f}'.format(float(v or 0)).replace(',', '@').replace('.', ',').replace('@', '.')


def main():
    grupos = json.load(io.open(ENTRADA, encoding='utf-8'))
    maior = max(x['total'] for x in grupos)

    fora_receita = sum(x['total'] for x in grupos
                       if LEITURA.get((x['cfop'], x['direcao']), ('',))[0].startswith('NAO E RECEITA'))
    fora_custo = sum(x['total'] for x in grupos
                     if LEITURA.get((x['cfop'], x['direcao']), ('',))[0] == 'NAO E COMPRA')
    indefinido = sum(x['total'] for x in grupos
                     if LEITURA.get((x['cfop'], x['direcao']), ('',))[0] == 'A DECIDIR')

    cards = []
    for x in grupos:
        prop, leitura, ressalva = LEITURA.get(
            (x['cfop'], x['direcao']), ('A DECIDIR', 'Grupo nao classificado.', 'Precisa de leitura sua.'))
        tom, rotulo = CHIP[prop]
        largura = max(0.6, x['total'] / maior * 100)

        linhas = []
        for n in x['notas']:
            itens = ''.join(
                '<li><span class="it-d">' + e(i['d']) + '</span>'
                '<span class="it-q num">' + e(i['q']) + '</span>'
                '<span class="it-v num">' + brl(i['v']) + '</span></li>'
                for i in n['itens'])
            linhas.append(
                '<tr><td class="mono">' + e(n['numero']) + '</td>'
                '<td class="mono dim">' + e(n['data']) + '</td>'
                '<td><span class="parte">' + e(n['contraparte']) + '</span>'
                '<span class="nat">' + e(n['natureza']) + '</span>'
                '<ul class="itens">' + itens + '</ul></td>'
                '<td class="num val">' + brl(n['valor']) + '</td></tr>')

        omit = ('<p class="omit">mais ' + str(x['omitidas']) + ' nota(s) neste grupo</p>'
                if x['omitidas'] else '')
        res = '<p class="ressalva">' + e(ressalva) + '</p>' if ressalva else ''
        tipo = 'NF-e' if x['tipo'] == 'NFE_PRODUTO' else 'NFS-e'
        plural_n = 's' if x['qtd_notas'] > 1 else ''
        plural_i = 'ns' if x['qtd_itens'] > 1 else 'm'

        cards.append(
            '<section class="grupo t-' + tom + '">'
            '<header class="g-head">'
            '<div class="g-id"><span class="cfop mono">' + e(x['cfop']) + '</span>'
            '<span class="dir">' + e(x['direcao'].lower()) + '</span>'
            '<span class="tipo">' + tipo + '</span></div>'
            '<div class="g-val"><span class="total num">' + brl(x['total']) + '</span>'
            '<span class="qtd">' + str(x['qtd_notas']) + ' nota' + plural_n +
            ' &middot; ' + str(x['qtd_itens']) + ' ite' + plural_i + '</span></div>'
            '</header>'
            '<div class="barra"><i style="width:' + '{:.2f}'.format(largura) + '%"></i></div>'
            '<div class="g-corpo"><p class="leitura">' + e(leitura) + '</p>' + res +
            '<span class="chip c-' + tom + '">' + e(rotulo) + '</span></div>'
            '<div class="tabela-wrap"><table>'
            '<thead><tr><th>NF</th><th>emissao</th><th>contraparte e itens</th>'
            '<th class="num">valor</th></tr></thead>'
            '<tbody>' + ''.join(linhas) + '</tbody></table></div>' + omit +
            '</section>')

    io.open(SAIDA_CORPO, 'w', encoding='utf-8').write(''.join(cards))
    io.open(SAIDA_RESUMO, 'w', encoding='utf-8').write(json.dumps({
        'fora_receita': round(fora_receita, 2),
        'fora_custo': round(fora_custo, 2),
        'indefinido': round(indefinido, 2),
        'grupos': len(grupos),
        'notas': sum(x['qtd_notas'] + x['omitidas'] for x in grupos)
    }, ensure_ascii=False))

    import sys
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    print('cartoes gerados :', len(cards))
    print('sai da receita  : ' + brl(fora_receita))
    print('sai do custo    : ' + brl(fora_custo))
    print('a decidir       : ' + brl(indefinido))


if __name__ == '__main__':
    main()
