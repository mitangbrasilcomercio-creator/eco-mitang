import pdfplumber
import json

pdf_path = r'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro\Planilha de Orçamentos (Mitang Brasil & Arandu - Baterias Apenas)\Planilha de Orçamentos - Atualizada 26-08-2026.pdf'

with pdfplumber.open(pdf_path) as pdf:
    p0 = pdf.pages[0]
    words = p0.extract_words()
    print(f"Total words: {len(words)}")
    
    # Sort all words by top, then x0
    # Let's find unique tops
    tops = sorted(list(set(round(w['top'], 1) for w in words)))
    print(f"Unique tops count: {len(tops)}")
    print(f"Tops range: min={tops[0]} max={tops[-1]}")
    
    # Let's inspect where 'Vendido' is
    v_words = [w for w in words if 'Vendido' in w['text'] or '010125' in w['text']]
    print(f"Found search words: {len(v_words)}")
    for w in v_words[:10]:
        print(f" -> {w['text']} top={w['top']} x0={w['x0']} x1={w['x1']}")

    if v_words:
        top_hdr = v_words[0]['top']
        hdr_line = [w for w in words if abs(w['top'] - top_hdr) < 2]
        hdr_line.sort(key=lambda w: w['x0'])
        print(f"\nHeader line words ({len(hdr_line)}):")
        for w in hdr_line[:30]:
            print(f"   {w['text']:<18} x0={w['x0']:<6.1f} x1={w['x1']:<6.1f} top={w['top']:<6.1f}")
