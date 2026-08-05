#!/usr/bin/env python3
"""
Estrae le tabelle dell'imposta alla fonte del Canton Ticino (edizione 2026)
dai PDF ufficiali e le salva in JSON per il motore di calcolo.

Tabelle:
  vecchi frontalieri / residenti: A (celibe), B (coniugato unico reddito),
                                  C (coniugato doppio reddito), H (monoparentale)
  nuovi frontalieri (accordo 2023, riduzione 80% già inclusa):
                                  R (celibe), S (=B), T (=C), U (=H)

Uso (in locale, serve accesso internet a www4.ti.ch):
    pip install pdfplumber requests
    python scripts/estrai_tabelle.py            # scarica e estrae tutte
    python scripts/estrai_tabelle.py A R        # solo alcune tabelle
    python scripts/estrai_tabelle.py --no-download   # usa i PDF già in scripts/pdf/

Output: data/aliquote-ti-2026-completo.json
    { "A": { "0": [[redditoMax, aliquota%], ...], "1": [...], ..., "9": [...] }, ... }
    Le chiavi "0".."9" sono il numero di figli a carico. Per compattezza si
    salvano solo i punti in cui l'aliquota cambia (stesso formato del JSON v1).

NOTA: il parser è scritto sul layout tipico dei PDF ti.ch (righe: reddito
mensile/annuo seguito da 10 colonne di aliquote 0–9 figli). Alla prima
esecuzione verificare a campione i valori contro il PDF; se il layout
differisce, adattare parse_righe().
"""
import json
import re
import sys
from pathlib import Path

BASE_URL = "https://www4.ti.ch/fileadmin/DFE/DC/DOC-IF/Aliquote_2026/Ticino_tabella_{}_2026.pdf"
TABELLE = ["A", "B", "C", "H", "R", "S", "T", "U"]

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = Path(__file__).resolve().parent / "pdf"
OUT_PATH = ROOT / "data" / "aliquote-ti-2026-completo.json"

# Riga dati attesa: un importo (reddito) seguito da 10 aliquote percentuali.
# Gli importi nei PDF ti.ch usano l'apostrofo come separatore migliaia (19'800).
NUM = r"\d{1,3}(?:['.]?\d{3})*(?:\.\d+)?"
RIGA_RE = re.compile(rf"^\s*({NUM})\s+((?:{NUM}\s+){{9}}{NUM})\s*$")


def scarica(tabella: str) -> Path:
    import requests

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    dest = PDF_DIR / f"Ticino_tabella_{tabella}_2026.pdf"
    if dest.exists() and dest.stat().st_size > 10_000:
        print(f"  {tabella}: PDF già presente, salto il download")
        return dest
    url = BASE_URL.format(tabella)
    print(f"  {tabella}: scarico {url}")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def _num(s: str) -> float:
    return float(s.replace("'", "").replace(",", "."))


def parse_righe(pdf_path: Path) -> list[tuple[float, list[float]]]:
    """Ritorna [(reddito, [aliquota_0figli .. aliquota_9figli]), ...]."""
    import pdfplumber

    righe = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            testo = page.extract_text() or ""
            for line in testo.splitlines():
                m = RIGA_RE.match(line)
                if not m:
                    continue
                reddito = _num(m.group(1))
                aliquote = [_num(x) for x in m.group(2).split()]
                # scarta righe di intestazione/piede che combaciano per caso
                if reddito < 100 or any(a > 100 for a in aliquote):
                    continue
                righe.append((reddito, aliquote))
    return righe


def compatta(righe: list[tuple[float, list[float]]], figli: int) -> list[list[float]]:
    """Tiene solo i punti in cui l'aliquota cambia; ultima soglia → 9'999'999."""
    serie = sorted((reddito, aliquote[figli]) for reddito, aliquote in righe)
    out: list[list[float]] = []
    for reddito, aliquota in serie:
        if out and out[-1][1] == aliquota:
            out[-1][0] = reddito  # estende la fascia
        else:
            out.append([reddito, aliquota])
    if out:
        out[-1][0] = 9999999
    return out


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    no_download = "--no-download" in sys.argv
    tabelle = [t.upper() for t in args] or TABELLE

    risultato: dict = {
        "fonte": "Divisione delle contribuzioni, Canton Ticino — Aliquote imposta alla fonte, edizione 2026",
        "note": "Coppie [reddito annuo massimo CHF, aliquota %] per numero di figli 0-9. "
                "Tabelle R/S/T/U (nuovi frontalieri) incorporano già la riduzione all'80%.",
    }
    for tab in tabelle:
        pdf_path = PDF_DIR / f"Ticino_tabella_{tab}_2026.pdf"
        if not no_download:
            pdf_path = scarica(tab)
        if not pdf_path.exists():
            print(f"  {tab}: PDF mancante ({pdf_path}), salto")
            continue
        righe = parse_righe(pdf_path)
        if not righe:
            print(f"  {tab}: ATTENZIONE — nessuna riga riconosciuta, layout da verificare")
            continue
        risultato[tab] = {str(f): compatta(righe, f) for f in range(10)}
        print(f"  {tab}: {len(righe)} righe estratte")

    OUT_PATH.write_text(json.dumps(risultato, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Salvato {OUT_PATH}")

    # verifica di plausibilità contro il JSON v1 trascritto a mano (tabelle A e R, 0 figli)
    v1_path = ROOT / "data" / "aliquote-ti-2026.json"
    if v1_path.exists() and "A" in risultato and "R" in risultato:
        v1 = json.loads(v1_path.read_text(encoding="utf-8"))
        for tab, chiave in [("A", "tabella_A_vecchi_frontalieri"), ("R", "tabella_R_nuovi_frontalieri")]:
            estratta = risultato[tab]["0"]
            attesa = v1[chiave]
            uguali = estratta == [[float(a), float(b)] for a, b in attesa] or estratta == attesa
            print(f"  verifica {tab} vs trascrizione manuale: {'OK' if uguali else 'DIFFERENZE — controllare!'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
