# -*- coding: utf-8 -*-
"""
Confere a numeracao OOMMAA dos orcamentos contra a data de emissao da planilha.

A regra veio do Diego: dois digitos de ordem no mes, dois de mes, dois de ano.
'041025' e o quarto orcamento de outubro de 2025. Esse numero e a chave que
amarra planilha, Word, PDF, nota fiscal e boleto -- se ele estiver errado numa
linha, os cinco documentos daquele negocio ficam orfaos.
"""
import json, io, sys, re, collections, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

d = json.load(io.open('local/planilhas/lista.json', encoding='utf-8'))
L = d['linhas']

MESES = {'jan':1,'fev':2,'mar':3,'abr':4,'mai':5,'jun':6,
         'jul':7,'ago':8,'set':9,'out':10,'nov':11,'dez':12}

def cel(lin, col):
    return str(L.get(lin, {}).get(col, '')).strip()

def serial_para_data(v):
    try: n = float(v)
    except: return None
    if n < 1: return None
    return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(n))

ok = divergem = sem_numero = fora_do_padrao = 0
casos = []
por_mes = collections.defaultdict(list)
incompletos = []

for lin in sorted(L, key=int):
    if int(lin) < 4: continue
    num = cel(lin, 'B') or cel(lin, 'AN')
    # a coluna do numero pode variar; tenta achar um OOMMAA em B ou AN
    if not num:
        for c in ('A','B','AN','AM'):
            v = cel(lin, c)
            if re.fullmatch(r'\d{5,6}', v): num = v; break
    mes_txt, ano_txt = cel(lin,'D'), cel(lin,'E')
    emissao = serial_para_data(cel(lin,'F'))
    ad, ah = cel(lin,'AD'), cel(lin,'AH')

    if not (ad and ah):
        incompletos.append((lin, num, cel(lin,'G')[:28], mes_txt, ano_txt))

    if not num:
        sem_numero += 1; continue
    n6 = num.zfill(6)
    if not re.fullmatch(r'\d{6}', n6):
        fora_do_padrao += 1; continue

    ordem, mm, aa = int(n6[:2]), int(n6[2:4]), int(n6[4:6])
    por_mes[(aa, mm)].append((ordem, lin, num))

    esperado_mes = MESES.get(mes_txt.lower()[:3])
    esperado_ano = None
    try: esperado_ano = int(ano_txt) % 100
    except: pass
    if emissao:
        esperado_mes = esperado_mes or emissao.month
        esperado_ano = esperado_ano if esperado_ano is not None else emissao.year % 100

    if esperado_mes is None or esperado_ano is None:
        continue
    if mm == esperado_mes and aa == esperado_ano:
        ok += 1
    else:
        divergem += 1
        casos.append((lin, num, mes_txt, ano_txt, emissao, mm, aa, esperado_mes, esperado_ano))

print('=== NUMERACAO OOMMAA x DATA DE EMISSAO ===')
print('  conferidos e coerentes :', ok)
print('  divergem               :', divergem)
print('  sem numero             :', sem_numero)
print('  fora do padrao 6 digitos:', fora_do_padrao)

if casos:
    print('\n--- divergencias ---')
    for lin, num, mt, at, em, mm, aa, em_, aa_ in casos[:15]:
        print('  L%-4s num %-8s diz %02d/%02d  | planilha diz %s/%s (%s)' % (
            lin, num, mm, aa, mt, at, em))

print('\n=== ORDINAIS POR MES ===')
buracos = []
for (aa, mm) in sorted(por_mes):
    ordens = sorted(o for o, _, _ in por_mes[(aa, mm)])
    unicos = sorted(set(ordens))
    dup = len(ordens) - len(unicos)
    falta = [x for x in range(1, max(unicos)+1) if x not in unicos] if unicos else []
    if dup or falta:
        buracos.append((aa, mm, len(ordens), dup, falta))
print('  meses com registro:', len(por_mes))
print('  meses com ordinal repetido ou faltando:', len(buracos))
for aa, mm, tot, dup, falta in buracos[:14]:
    print('    %02d/%02d  %3d orcamentos | repetidos: %d | faltam: %s' % (
        mm, aa, tot, dup, ','.join(map(str, falta[:10])) or '-'))

print('\n=== LINHAS SEM PRECO (rascunho) : %d ===' % len(incompletos))
for lin, num, emp, mt, at in incompletos[:20]:
    print('  L%-4s %-8s %-30s %s/%s' % (lin, num or '(sem numero)', emp, mt, at))
