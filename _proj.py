# -*- coding: utf-8 -*-
import zipfile, re, sys, io, collections, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
z = zipfile.ZipFile('local/planilhas/receitas-despesas.xlsx')
ss=[]
for si in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf-8'), re.S):
    ss.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)).replace('&amp;','&'))
L={}
for m in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', z.read('xl/worksheets/sheet1.xml').decode('utf-8'), re.S):
    col,lin,attrs,corpo = m.group(1),int(m.group(2)),m.group(3),m.group(4) or ''
    t=re.search(r't="([^"]+)"',attrs); t=t.group(1) if t else 'n'
    v=re.search(r'<v>(.*?)</v>',corpo,re.S)
    L.setdefault(lin,{})[col] = '' if not v else (ss[int(v.group(1))] if t=='s' else v.group(1))
def c(l,x): return str(L.get(l,{}).get(x,'')).strip()
def n(s):
    try: return float(s)
    except: return None
E=datetime.date(1899,12,30)
def dt(s):
    v=n(s); return (E+datetime.timedelta(days=int(v))) if v and v>1000 else None

print('=== A COLUNA "Recorrência" SEPARA DUAS COISAS DIFERENTES ===')
g=collections.defaultdict(lambda: collections.defaultdict(lambda:[0,0.0]))
for lin in range(2,max(L)+1):
    if c(lin,'B')!='Despesa': continue
    v=n(c(lin,'L'))
    if v is None: continue
    r=c(lin,'W') or '(vazio)'; cat=c(lin,'C')
    g[r][cat][0]+=1; g[r][cat][1]+=v
for r in sorted(g, key=lambda k:-sum(x[1] for x in g[k].values())):
    tot=sum(x[1] for x in g[r].values())
    print('\n  %-12s R$ %14s' % (r, format(tot,',.2f')))
    for cat,(qt,val) in sorted(g[r].items(), key=lambda x:-x[1][1])[:6]:
        print('      %-26s %2d  R$ %12s' % (cat[:26], qt, format(val,',.2f')))

print('\n\n=== PARCELAS AINDA EM ABERTO (vencimento a partir de set/2026) ===')
hoje=datetime.date(2026,9,1)
abertas=[]
for lin in range(2,max(L)+1):
    if c(lin,'B')!='Despesa': continue
    venc=dt(c(lin,'R')); pago=dt(c(lin,'M'))
    v=n(c(lin,'L'))
    if not venc or v is None or pago: continue
    if venc < hoje: continue
    abertas.append((venc, v, c(lin,'D') or c(lin,'E'), c(lin,'C'), c(lin,'W'),
                    int(n(c(lin,'Z')) or 0), int(n(c(lin,'Y')) or 0)))
abertas.sort()
por_mes=collections.defaultdict(float)
for venc,v,dest,cat,rec,np,qt in abertas:
    por_mes[venc.strftime('%Y-%m')]+=v
    p = ' (parc %d/%d)' % (np,qt) if qt>1 else ''
    print('  %s  R$ %11s  %-26s %-14s %s%s' % (venc, format(v,',.2f'), dest[:26], cat[:14], rec, p))
print('\n  --- compromisso ja assumido, por mes ---')
for m in sorted(por_mes): print('    %s   R$ %s' % (m, format(por_mes[m],',.2f')))
print('    TOTAL     R$ %s  em %d parcelas' % (format(sum(por_mes.values()),',.2f'), len(abertas)))
