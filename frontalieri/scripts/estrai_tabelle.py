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

# Riga dati (layout PDF 2026): "min - max" del reddito annuale seguito da
# 10 aliquote percentuali (colonne 0-9 figli), es.
#   "19201 - 19800 0.20 0.20 ... 0.20"
RATE = r"\d+\.\d+"
# 10 colonne (0-9 figli) per A/B/C/R/S/T; 9 colonne (1-9 figli) per H/U (monoparentali)
RIGA_RE = re.compile(rf"^\s*(\d+)\s*-\s*(\d+)\s+((?:{RATE}\s+){{8,9}}{RATE})\s*$")


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
                # soglia = estremo superiore della fascia "min - max"
                reddito = _num(m.group(2))
                aliquote = [_num(x) for x in m.group(3).split()]
                if any(a > 100 for a in aliquote):
                    continue
                righe.append((reddito, aliquote))
    return righe


def compatta(righe: list[tuple[float, list[float]]], figli: int) -> list[list[float]]:
    """Tiene solo i punti in cui l'aliquota cambia. L'ultima soglia resta quella
    reale del PDF (1'200'000); oltre, lookupRate applica l'ultima aliquota."""
    serie = sorted((reddito, aliquote[figli]) for reddito, aliquote in righe)
    out: list[list[float]] = []
    for reddito, aliquota in serie:
        if out and out[-1][1] == aliquota:
            out[-1][0] = reddito  # estende la fascia
        else:
            out.append([reddito, aliquota])
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
        n_col = len(righe[0][1])
        if any(len(aliquote) != n_col for _, aliquote in righe):
            print(f"  {tab}: ATTENZIONE — numero colonne incoerente tra le righe")
            continue
        primo_figlio = 0 if n_col == 10 else 1  # H/U partono da 1 figlio
        risultato[tab] = {str(primo_figlio + i): compatta(righe, i) for i in range(n_col)}
        print(f"  {tab}: {len(righe)} righe estratte, colonne figli {primo_figlio}-9")

    OUT_PATH.write_text(json.dumps(risultato, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Salvato {OUT_PATH}")

    # verifica contro il JSON v1 trascritto a mano: le tabelle A0 e R0 devono dare
    # la stessa aliquota della trascrizione su tutto il suo intervallo affidabile
    # (19'801–199'800; sotto, la v1 semplificava; sopra, la v1 era troncata).
    def _lookup(tab, income):
        for soglia, aliquota in tab:
            if income <= soglia:
                return aliquota
        return tab[-1][1]

    v1_path = ROOT / "data" / "aliquote-ti-2026.json"
    if v1_path.exists() and "A" in risultato and "R" in risultato:
        v1 = json.loads(v1_path.read_text(encoding="utf-8"))
        for tab, chiave in [("A", "tabella_A_vecchi_frontalieri"), ("R", "tabella_R_nuovi_frontalieri")]:
            estratta = risultato[tab]["0"]
            attesa = v1[chiave]
            scarti = [
                (income, _lookup(estratta, income), _lookup(attesa, income))
                for income in range(19801, 199801, 300)
                if _lookup(estratta, income) != _lookup(attesa, income)
            ]
            if scarti:
                print(f"  verifica {tab} vs trascrizione manuale: {len(scarti)} DIFFERENZE, es. {scarti[:5]}")
            else:
                print(f"  verifica {tab} vs trascrizione manuale: OK (19'801–199'800)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
