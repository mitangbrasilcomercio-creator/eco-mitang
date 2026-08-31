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

print('=== FORMA E METODO DE PAGAMENTO NAS DESPESAS ===')
cm=collections.Counter(); ct=collections.Counter()
for lin in range(2,max(L)+1):
    if c(lin,'B')!='Despesa': continue
    cm[c(lin,'X') or '(vazio)']+=1; ct[c(lin,'AC') or '(vazio)']+=1
print('  Forma de Pag. :', dict(cm))
print('  Metodo de Pag.:', dict(ct))

print('\n=== TUDO QUE FOI PAGO COM CARTAO DE CREDITO ===')
tot=0.0
por_mes=collections.defaultdict(float)
for lin in range(2,max(L)+1):
    if c(lin,'B')!='Despesa': continue
    metodo=(c(lin,'AC')+' '+c(lin,'X')).upper()
    if 'CART' not in metodo and c(lin,'C')!='Cartão de Crédito': continue
    v=n(c(lin,'L')) or 0; tot+=v
    venc=dt(c(lin,'R'))
    if venc: por_mes[venc.strftime('%Y-%m')]+=v
    print('  %-22s %-20s R$ %10s  parc %s/%s  vence %s  NFe %s' % (
        c(lin,'D')[:22], c(lin,'C')[:20], format(v,',.2f'),
        c(lin,'Z') or '-', c(lin,'Y') or '-', venc or '-', c(lin,'J') or '-'))
print('  TOTAL no cartao: R$ %s' % format(tot,',.2f'))
print('\n  por mes de vencimento:')
for m in sorted(por_mes): print('    %s  R$ %s' % (m, format(por_mes[m],',.2f')))
