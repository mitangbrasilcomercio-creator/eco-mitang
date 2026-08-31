# -*- coding: utf-8 -*-
import zipfile, re, sys, io, collections, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
z = zipfile.ZipFile('local/planilhas/receitas-despesas.xlsx')
ss=[]
for si in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf-8'), re.S):
    ss.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)).replace('&amp;','&'))
L={}
for m in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', z.read('xl/worksheets/sheet1.xml').decode('utf-8'), re.S):
    col,lin,attrs,corpo=m.group(1),int(m.group(2)),m.group(3),m.group(4) or ''
    t=re.search(r't="([^"]+)"',attrs); t=t.group(1) if t else 'n'
    v=re.search(r'<v>(.*?)</v>',corpo,re.S)
    L.setdefault(lin,{})[col]='' if not v else (ss[int(v.group(1))] if t=='s' else v.group(1))
def c(l,x): return str(L.get(l,{}).get(x,'')).strip()
def n(s):
    try: return float(s)
    except: return None
E=datetime.date(1899,12,30)
def dt(s):
    v=n(s); return (E+datetime.timedelta(days=int(v))) if v and v>1000 else None

print('=== CERTIBRASIL, linha por linha ===')
for lin in range(2,max(L)+1):
    if 'CERTIBRASIL' not in c(lin,'D').upper(): continue
    print('  NFe %-10s parc %s/%s  R$ %-10s  pago %s  vence %s  rec %s' % (
        c(lin,'J') or '-', c(lin,'Z'), c(lin,'Y'), format(n(c(lin,'L')) or 0,',.2f'),
        dt(c(lin,'M')) or '-', dt(c(lin,'R')) or '-', c(lin,'W')))

print('\n=== AGRUPANDO PARCELAS PELA NFe (a chave que liga a compra) ===')
compras=collections.defaultdict(list)
soltas=0
for lin in range(2,max(L)+1):
    if c(lin,'B')!='Despesa': continue
    qt=n(c(lin,'Y'))
    if not qt or qt<=1: continue
    nf=c(lin,'J')
    if not nf: soltas+=1; continue
    compras[(c(lin,'D'), nf)].append(lin)

for (dest,nf), linhas in sorted(compras.items(), key=lambda x:-len(x[1])):
    qt=int(n(c(linhas[0],'Y')) or 0)
    parcelas=sorted(int(n(c(l,'Z')) or 0) for l in linhas)
    total=sum(n(c(l,'L')) or 0 for l in linhas)
    pagas=[l for l in linhas if dt(c(l,'M'))]
    vencs=[dt(c(l,'R')) for l in linhas if dt(c(l,'R'))]
    print('  %-14s NFe %-10s  %d de %d parcelas na planilha  R$ %10s  pagas %d  ultima vence %s' % (
        dest[:14], nf[:10], len(linhas), qt, format(total,',.2f'), len(pagas),
        max(vencs).isoformat() if vencs else '?'))
    if len(linhas) < qt:
        print('       faltam %d parcela(s) nao lancadas' % (qt-len(linhas)))
print('\n  parcelamentos sem NFe (nao da para agrupar):', soltas)
