# -*- coding: utf-8 -*-
import zipfile, re, sys, io, collections, unicodedata, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
z = zipfile.ZipFile('local/planilhas/receitas-despesas.xlsx')
ss=[]
for si in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf-8'), re.S):
    ss.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)).replace('&amp;','&'))
sheet = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
L={}
for m in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', sheet, re.S):
    col,lin,attrs,corpo = m.group(1),int(m.group(2)),m.group(3),m.group(4) or ''
    t=re.search(r't="([^"]+)"',attrs); t=t.group(1) if t else 'n'
    v=re.search(r'<v>(.*?)</v>',corpo,re.S)
    L.setdefault(lin,{})[col] = '' if not v else (ss[int(v.group(1))] if t=='s' else v.group(1))
def c(l,x): return str(L.get(l,{}).get(x,'')).strip()
def n(s):
    try: return float(s)
    except: return None
EPOCA = datetime.date(1899,12,30)
def dt(s):
    v=n(s)
    return (EPOCA+datetime.timedelta(days=int(v))).isoformat() if v and v>1000 else ''

# TODAS as colunas da linha, com o cabecalho, para as despesas com parcelamento
print('=== DESPESAS COM PARCELAMENTO DECLARADO (le a linha inteira) ===\n')
achou = 0
for lin in range(2, max(L)+1):
    if c(lin,'B') != 'Despesa': continue
    qnt, num_p = n(c(lin,'Y')), n(c(lin,'Z'))
    if not qnt or qnt <= 1: continue
    achou += 1
    restante = n(c(lin,'AA')) or 0
    total_compra = n(c(lin,'AB')) or 0
    valor = n(c(lin,'L')) or 0
    faltam = int(qnt - (num_p or 0))
    venc = dt(c(lin,'R'))
    # projeta o fim: vencimento + (parcelas que faltam) meses
    fim = ''
    if venc and faltam > 0:
        d = datetime.date.fromisoformat(venc)
        mes = d.month + faltam; ano = d.year + (mes-1)//12; mes = (mes-1)%12+1
        fim = '%04d-%02d' % (ano, mes)
    print('  %-26s %-22s' % (c(lin,'D')[:26], c(lin,'C')[:22]))
    print('     descricao : %s' % c(lin,'E')[:70])
    print('     recorrencia: %-10s  parcela %s de %s   faltam %d' % (c(lin,'W'), int(num_p or 0), int(qnt), faltam))
    print('     valor/parc : R$ %-12s  restante R$ %-12s  total R$ %s' % (
        format(valor,',.2f'), format(restante,',.2f'), format(total_compra,',.2f')))
    print('     pago em    : %-12s vence %-12s  ultima parcela ~ %s' % (dt(c(lin,'M')), venc, fim or '?'))
    if c(lin,'F'): print('     obs        : %s' % c(lin,'F')[:70])
    print()
print('linhas com parcelamento:', achou)

print('\n=== "Mensal" x "Pontual": o que a coluna Recorrencia separa ===')
g = collections.defaultdict(lambda: collections.defaultdict(float))
cnt = collections.defaultdict(lambda: collections.defaultdict(int))
for lin in range(2, max(L)+1):
    if c(lin,'B')!='Despesa': continue
    v = n(c(lin,'L'))
    if v is None: continue
    g[c(lin,'W') or '(vazio)'][c(lin,'C')] += v
    cnt[c(lin,'W') or '(vazio)'][c(lin,'C')] += 1
for rec in sorted(g, key=lambda k: -sum(g[k].values())):
    print('\n  %s  — R$ %s' % (rec, format(sum(g[rec].values()),',.2f')))
    for cat, tot in sorted(g[rec].items(), key=lambda x:-x[1]):
        print('     %-26s %2d lanc   R$ %s' % (cat[:26], cnt[rec][cat], format(tot,',.2f')))
