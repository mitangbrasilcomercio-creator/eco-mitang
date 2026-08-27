import pdfplumber
import json
import re

pdf_path = r'Arquivos_Reais_Para_A_IA_Usar_Como_Parametro\Planilha de Orçamentos (Mitang Brasil & Arandu - Baterias Apenas)\Planilha de Orçamentos - Atualizada 26-08-2026.pdf'

with pdfplumber.open(pdf_path) as pdf:
    p0 = pdf.pages[0]
    words = p0.extract_words()
    print(f"Total words: {len(words)}")

    min_top = min(w['top'] for w in words)
    max_top = max(w['top'] for w in words)
    min_x0 = min(w['x0'] for w in words)
    max_x1 = max(w['x1'] for w in words)
    print(f"Top range: {min_top:.1f} to {max_top:.1f}")
    print(f"X range: {min_x0:.1f} to {max_x1:.1f}")

    # Inspect the first 50 words in raw order
    print("\nFirst 50 raw words:")
    for w in words[:50]:
        print(f"{w['text']:<18} top={w['top']:.1f} x0={w['x0']:.1f} x1={w['x1']:.1f}")
