# -*- coding: utf-8 -*-
"""Le a aba Lista_De_Orcamentos do .xlsm cru: valor E formula, sem intermediario."""
import zipfile, re, io, json, sys

z = zipfile.ZipFile('local/planilhas/tabela-orcamentos.xlsm')

# --- sharedStrings -----------------------------------------------------------
ss = []
sx = z.read('xl/sharedStrings.xml').decode('utf-8')
for si in re.findall(r'<si>(.*?)</si>', sx, re.S):
    partes = re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)
    txt = ''.join(partes)
    txt = (txt.replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')
              .replace('&quot;','"').replace('&apos;',"'"))
    ss.append(txt)

# --- celulas -----------------------------------------------------------------
sheet = z.read('xl/worksheets/sheet1.xml').decode('utf-8')

def col_idx(ref):
    letras = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in letras: n = n*26 + (ord(ch)-64)
    return n

linhas = {}
formulas = {}
for m in re.finditer(r'<c r="([A-Z]+)(\d+)"([^>]*)>(.*?)</c>|<c r="([A-Z]+)(\d+)"([^>]*)/>', sheet, re.S):
    if m.group(1):
        col, lin, attrs, corpo = m.group(1), int(m.group(2)), m.group(3), m.group(4)
    else:
        col, lin, attrs, corpo = m.group(5), int(m.group(6)), m.group(7), ''
    t = re.search(r't="([^"]+)"', attrs)
    t = t.group(1) if t else 'n'

    f = re.search(r'<f[^>]*>(.*?)</f>', corpo, re.S)
    if f: formulas.setdefault(lin, {})[col] = f.group(1)

    v = re.search(r'<v>(.*?)</v>', corpo, re.S)
    if t == 'inlineStr':
        iv = re.search(r'<t[^>]*>(.*?)</t>', corpo, re.S)
        val = iv.group(1) if iv else ''
    elif v is None:
        val = ''
    elif t == 's':
        val = ss[int(v.group(1))]
    else:
        val = v.group(1)
    if isinstance(val, str):
        val = (val.replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')
                  .replace('&quot;','"').replace('&apos;',"'"))
    linhas.setdefault(lin, {})[col] = val

ordenadas = sorted(linhas)
print('linhas com conteudo:', len(ordenadas), '| primeira:', ordenadas[0], '| ultima:', ordenadas[-1])
print('linhas com formula:', len(formulas))

json.dump({'linhas': {str(k): v for k, v in linhas.items()},
           'formulas': {str(k): v for k, v in formulas.items()}},
          io.open('local/planilhas/lista.json','w',encoding='utf-8'), ensure_ascii=False)
print('gravado local/planilhas/lista.json')
