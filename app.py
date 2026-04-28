"""
Gestione Commesse - Convertitore Partenza → Risultato
Carica qualsiasi file in formato Partenza, visualizza e scarica in formato Risultato.
"""
import io
import sys
import base64
from pathlib import Path

import pandas as pd
import streamlit as st
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ── PyInstaller path helper ───────────────────────────────────────────────────

def _bundled(name):
    base = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).parent
    return base / name

# ── Costanti di stile (estratte da Risultato.xlsx) ───────────────────────────

COMPANY      = "Evolve SA"
COLOR_DARK   = "1F3864"   # titolo righe
COLOR_HEADER = "2E75B6"   # intestazioni colonne
COLOR_ALT    = "EBF3FB"   # righe alternate

MAPPA = {
    "Ordine":               "N° Mandato",
    "Ordine Denominazione": "Denominazione",
    "Nome CO responsabile": "Responsabile",
    "Codice centro":        "Stato",
    "Importo contratto":    "Importo Contratto",
    "Fatturato":            "Fatturato",
    "Incassato IVA escl.":  "Incassato",
    "Fatture mancante":     "Fatture Mancanti",
}
# Colonne opzionali: ricerca per sottostringa (robusta a varianti di encoding)
# chiave = sottostringa da cercare nel nome colonna, valore = nome destinazione
MAPPA_OPT_CERCA = {
    "Ore lavorate": "Ore Lavorate",
}
COL_NUM = ["Importo Contratto", "Fatturato", "Incassato", "Fatture Mancanti"]
COL_ORE = ["Ore Lavorate"]   # numerico intero, non valuta
COL_TXT = ["N° Mandato", "Denominazione", "Responsabile", "Stato"]

# ── Page config ───────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Gestione Commesse",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
  html, body, [class*="css"] { font-family: 'Segoe UI', sans-serif; }
  .main .block-container { padding-top: 0.6rem; padding-bottom: 2rem; }
  .header-bar {
    display: flex; align-items: center; gap: 1.2rem;
    background: #1F3864; padding: 0.85rem 1.5rem;
    border-radius: 10px; margin-bottom: 1.1rem;
  }
  .header-bar img  { height: 48px; object-fit: contain; }
  .header-title    { color: #fff; font-size: 1.3rem; font-weight: 700; }
  .header-sub      { color: #a0c4ff; font-size: 0.8rem; margin-top: 3px; }
  .placeholder {
    text-align: center; padding: 4rem 2rem; background: #f7fafc;
    border-radius: 12px; border: 2px dashed #cbd5e0; margin-top: 1rem;
  }
</style>
""", unsafe_allow_html=True)

# ── Helpers ───────────────────────────────────────────────────────────────────

def img_b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

# ── Lettura dati ──────────────────────────────────────────────────────────────

@st.cache_data(show_spinner="Lettura file in corso...")
def leggi_file(file_bytes, file_name="file"):
    """
    Scansiona TUTTI i fogli del file.
    Concatena tutti i fogli che contengono la colonna 'Ordine'.
    Non esegue mai dropna() — NaN numerici → 0, testi → "".
    Restituisce (df_calcoli, df_export, fogli_letti).
    """
    xl = pd.ExcelFile(io.BytesIO(file_bytes))
    blocchi, fogli_ok = [], []

    for sheet in xl.sheet_names:
        try:
            raw = xl.parse(sheet, header=0)
            raw.columns = [str(c).strip() for c in raw.columns]
            if "Ordine" not in raw.columns or len(raw) == 0:
                continue
            mancanti = [c for c in MAPPA if c not in raw.columns]
            if mancanti:
                continue
            chunk = raw[list(MAPPA.keys())].copy()
            # Aggiungi colonne opzionali con ricerca per sottostringa
            for cerca, dst in MAPPA_OPT_CERCA.items():
                trovata = next(
                    (col for col in raw.columns
                     if cerca.lower() in col.lower()),
                    None
                )
                chunk[dst] = raw[trovata] if trovata else 0
            blocchi.append(chunk)
            fogli_ok.append(sheet)
        except Exception:
            continue

    if not blocchi:
        st.error("**{}**: nessun foglio con la colonna 'Ordine' trovato.".format(file_name))
        st.write("Fogli presenti:", xl.sheet_names)
        st.stop()

    migliore = pd.concat(blocchi, ignore_index=True)
    migliore = migliore.rename(columns=MAPPA)

    df_export = migliore.copy()
    for c in COL_NUM:
        df_export[c] = pd.to_numeric(df_export[c], errors="coerce")
    for c in COL_ORE:
        if c in df_export.columns:
            df_export[c] = pd.to_numeric(df_export[c], errors="coerce")

    df = migliore.copy()
    for c in COL_NUM:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    for c in COL_ORE:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    for c in COL_TXT:
        df[c]        = df[c].fillna("").astype(str).str.strip()
        df_export[c] = df_export[c].fillna("").astype(str).str.strip()

    df["Stato"]        = df["Stato"].str.capitalize()
    df_export["Stato"] = df_export["Stato"].str.capitalize()

    return df, df_export, fogli_ok


# ── Riepilogo responsabili ────────────────────────────────────────────────────

def build_riepilogo(df):
    stato_pivot = (
        df.groupby(["Responsabile", "Stato"])
        .size().unstack(fill_value=0).reset_index()
    )
    for col in ["Aperto", "Attivo", "Chiuso"]:
        if col not in stato_pivot.columns:
            stato_pivot[col] = 0

    agg_dict = {
        "Mandati":           ("N° Mandato",       "count"),
        "Importo Contratto": ("Importo Contratto", "sum"),
        "Fatturato":         ("Fatturato",         "sum"),
        "Incassato":         ("Incassato",         "sum"),
        "Fatture Mancanti":  ("Fatture Mancanti",  "sum"),
    }
    if "Ore Lavorate" in df.columns:
        agg_dict["Ore Lavorate"] = ("Ore Lavorate", "sum")

    agg = df.groupby("Responsabile", sort=False, as_index=False).agg(**agg_dict)

    keep = ["Responsabile"] + [c for c in ["Aperto", "Attivo", "Chiuso"]
                                if c in stato_pivot.columns]
    rep = agg.merge(stato_pivot[keep], on="Responsabile", how="left").fillna(0)

    for c in ["Mandati", "Aperto", "Attivo", "Chiuso"]:
        if c in rep.columns:
            rep[c] = rep[c].astype(int)

    ordine = ["Responsabile", "Mandati", "Aperto", "Attivo", "Chiuso",
              "Importo Contratto", "Fatturato", "Incassato", "Fatture Mancanti",
              "Ore Lavorate"]
    rep = rep[[c for c in ordine if c in rep.columns]]
    rep = rep.sort_values("Mandati", ascending=False).reset_index(drop=True)

    # Riga TOTALE GENERALE
    tot = {"Responsabile": "TOTALE GENERALE",
           "Mandati": rep["Mandati"].sum()}
    for c in ["Aperto", "Attivo", "Chiuso"]:
        if c in rep.columns:
            tot[c] = rep[c].sum()
    for c in COL_NUM + COL_ORE:
        if c in rep.columns:
            tot[c] = rep[c].sum()
    rep = pd.concat([rep, pd.DataFrame([tot])], ignore_index=True)

    for c in ["Mandati", "Aperto", "Attivo", "Chiuso"]:
        if c in rep.columns:
            rep[c] = rep[c].astype(int)

    return rep


# ── Generazione Excel (formato identico a Risultato.xlsx) ────────────────────

def genera_excel(df_mandati_export, df_riepilogo, n_mandati):
    buf = io.BytesIO()
    wb  = Workbook()

    thin   = Side(style="thin", color="B8C6D9")
    BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

    def stile_titolo():
        return Font(name="Calibri", bold=True, size=13, color="FFFFFF")

    def stile_hdr():
        return Font(name="Calibri", bold=True, size=10, color="FFFFFF")

    def fill(hex_color):
        return PatternFill("solid", fgColor=hex_color)

    def _scrivi_foglio_mandati(ws):
        cols    = list(df_mandati_export.columns)
        n_cols  = len(cols)
        num_idx = {cols.index(c) + 1 for c in COL_NUM if c in cols}
        ore_idx = {cols.index(c) + 1 for c in COL_ORE if c in cols}

        # Riga 1 – titolo
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=n_cols)
        c = ws.cell(1, 1, "MANDATI  \u2022  {}  \u2022  {} mandati".format(COMPANY, n_mandati))
        c.font      = stile_titolo()
        c.fill      = fill(COLOR_DARK)
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[1].height = 24

        # Riga 2 – intestazioni
        ws.row_dimensions[2].height = 20
        for ci, h in enumerate(cols, 1):
            c = ws.cell(2, ci, h)
            c.font      = stile_hdr()
            c.fill      = fill(COLOR_HEADER)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border    = BORDER

        # Righe dati
        for ri, row in enumerate(df_mandati_export.itertuples(index=False), 3):
            ws.row_dimensions[ri].height = 15
            for ci, val in enumerate(row, 1):
                # NaN → cella vuota
                cell_val = None if (isinstance(val, float) and pd.isna(val)) else val
                c = ws.cell(ri, ci, cell_val)
                c.border    = BORDER
                c.alignment = Alignment(vertical="center")
                if ci in num_idx:
                    c.number_format = "#,##0.00"
                    c.alignment     = Alignment(horizontal="right", vertical="center")
                elif ci in ore_idx:
                    c.number_format = "#,##0"
                    c.alignment     = Alignment(horizontal="right", vertical="center")
                if ri % 2 == 0:
                    c.fill = fill(COLOR_ALT)

        # AutoFilter: deve coprire dall'intestazione all'ultima riga dati
        ws.auto_filter.ref = "A2:{}{}".format(get_column_letter(n_cols), ws.max_row)
        ws.freeze_panes    = "A3"

        # Larghezze colonne
        larghezze = {
            "N° Mandato": 18, "Denominazione": 44, "Responsabile": 22,
            "Stato": 12,      "Importo Contratto": 18, "Fatturato": 16,
            "Incassato": 16,  "Fatture Mancanti": 18, "Ore Lavorate": 14,
        }
        for ci, h in enumerate(cols, 1):
            ws.column_dimensions[get_column_letter(ci)].width = larghezze.get(h, 15)

    def _scrivi_foglio_riepilogo(ws):
        cols    = list(df_riepilogo.columns)
        n_cols  = len(cols)
        num_idx = {cols.index(c) + 1 for c in COL_NUM if c in cols}
        int_idx = {cols.index(c) + 1 for c in ["Mandati","Aperto","Attivo","Chiuso"] if c in cols}
        ore_idx = {cols.index(c) + 1 for c in COL_ORE if c in cols}

        # Riga 1 – titolo
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=n_cols)
        c = ws.cell(1, 1, "RIEPILOGO PER RESPONSABILE")
        c.font      = Font(name="Calibri", bold=True, size=12, color="FFFFFF")
        c.fill      = fill(COLOR_DARK)
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[1].height = 24

        # Riga 2 – intestazioni
        ws.row_dimensions[2].height = 20
        for ci, h in enumerate(cols, 1):
            c = ws.cell(2, ci, h)
            c.font      = stile_hdr()
            c.fill      = fill(COLOR_HEADER)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.border    = BORDER

        # Righe dati
        for ri, row in enumerate(df_riepilogo.itertuples(index=False), 3):
            is_tot = str(row[0]).startswith("TOTALE")
            ws.row_dimensions[ri].height = 16 if is_tot else 15
            for ci, val in enumerate(row, 1):
                cell_val = None if (isinstance(val, float) and pd.isna(val)) else val
                c = ws.cell(ri, ci, cell_val)
                c.border = BORDER
                if is_tot:
                    c.font  = Font(name="Calibri", bold=True, size=10, color="FFFFFF")
                    c.fill  = fill(COLOR_DARK)
                    c.alignment = Alignment(
                        horizontal="right" if ci > 1 else "left",
                        vertical="center")
                else:
                    c.alignment = Alignment(vertical="center")
                    if ri % 2 == 0:
                        c.fill = fill(COLOR_ALT)
                if ci in num_idx or ci in ore_idx:
                    c.number_format = "#,##0.00"
                    if not is_tot:
                        c.alignment = Alignment(horizontal="right", vertical="center")
                elif ci in int_idx:
                    c.number_format = "#,##0"
                    if not is_tot:
                        c.alignment = Alignment(horizontal="right", vertical="center")

        # AutoFilter: deve coprire dall'intestazione all'ultima riga dati
        ws.auto_filter.ref = "A2:{}{}".format(get_column_letter(n_cols), ws.max_row)
        ws.freeze_panes    = "A3"

        # Larghezze colonne
        larghezze = {
            "Responsabile": 25, "Mandati": 10, "Aperto": 10,
            "Attivo": 10, "Chiuso": 10, "Importo Contratto": 18,
            "Fatturato": 16, "Incassato": 16, "Fatture Mancanti": 18,
            "Ore Lavorate": 14,
        }
        for ci, h in enumerate(cols, 1):
            ws.column_dimensions[get_column_letter(ci)].width = larghezze.get(h, 14)

    ws1 = wb.active
    ws1.title = "Mandati"
    _scrivi_foglio_mandati(ws1)

    ws2 = wb.create_sheet("Riepilogo Responsabili")
    _scrivi_foglio_riepilogo(ws2)

    wb.save(buf)
    buf.seek(0)
    return buf.read()


# ═══════════════════════════════════════════════════════════════════════════════
# INTERFACCIA
# ═══════════════════════════════════════════════════════════════════════════════

# Logo
LOGO = _bundled("immagine.png")
logo_html = ""
if LOGO.exists():
    logo_html = '<img src="data:image/png;base64,{}" />'.format(img_b64(str(LOGO)))

# Sidebar
st.sidebar.markdown("## Gestione Commesse")
st.sidebar.markdown("---")
uploaded_files = st.sidebar.file_uploader(
    "Carica uno o più file sorgente (.xlsx)",
    type=["xlsx"],
    accept_multiple_files=True,
    help="Seleziona più file tenendo premuto CTRL (o CMD su Mac). Verranno uniti in un unico report.",
)

# Header (sempre visibile)
if uploaded_files:
    src_label = ", ".join(f.name for f in uploaded_files)
else:
    src_label = "nessun file caricato"

st.markdown("""
<div class="header-bar">
  {logo}
  <div>
    <div class="header-title">Gestione Commesse — {company}</div>
    <div class="header-sub">Sorgente: {src}</div>
  </div>
</div>
""".format(logo=logo_html, company=COMPANY, src=src_label), unsafe_allow_html=True)

# Schermata attesa
if not uploaded_files:
    st.markdown("""
    <div class="placeholder">
      <div style="font-size:3rem">📂</div>
      <div style="font-size:1.1rem;font-weight:700;color:#2d3748;margin-top:.6rem">
        Nessun file caricato
      </div>
      <div style="font-size:.9rem;color:#718096;margin-top:.4rem">
        Carica uno o più file Excel dal pannello a sinistra.<br>
        Puoi selezionare <strong>più file insieme</strong> (CTRL+clic) per unirli in un unico report.
      </div>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# ── Carica e concatena tutti i file ──────────────────────────────────────────

all_df, all_export, info_fogli = [], [], []
for f in uploaded_files:
    fb = f.read()
    d, de, fogli = leggi_file(fb, f.name)
    all_df.append(d)
    all_export.append(de)
    info_fogli.append("{} → {} ({} righe)".format(f.name, fogli, len(d)))

df        = pd.concat(all_df,    ignore_index=True)
df_export = pd.concat(all_export, ignore_index=True)

# ── Metriche ──────────────────────────────────────────────────────────────────

st.metric("Totale Mandati Elaborati", len(df))

kpi_cols = st.columns(5 if "Ore Lavorate" in df.columns else 4)
kpi_cols[0].metric("Importo Contratto",
                   "CHF {:,.0f}".format(df["Importo Contratto"].sum()).replace(",","'"))
kpi_cols[1].metric("Fatturato",
                   "CHF {:,.0f}".format(df["Fatturato"].sum()).replace(",","'"))
kpi_cols[2].metric("Incassato",
                   "CHF {:,.0f}".format(df["Incassato"].sum()).replace(",","'"))
kpi_cols[3].metric("Fatture Mancanti",
                   "CHF {:,.0f}".format(df["Fatture Mancanti"].sum()).replace(",","'"))
if "Ore Lavorate" in df.columns:
    kpi_cols[4].metric("Ore Lavorate",
                       "{:,.0f} h".format(df["Ore Lavorate"].sum()).replace(",","'"))

with st.expander("File caricati ({})".format(len(uploaded_files)), expanded=False):
    for info in info_fogli:
        st.write("•", info)

# ── Filtri sidebar ────────────────────────────────────────────────────────────

st.sidebar.markdown("---")
st.sidebar.markdown("### Filtri")

stati_list = sorted(df["Stato"].replace("", pd.NA).dropna().unique().tolist())
resp_list  = sorted(df["Responsabile"].replace("", pd.NA).dropna().unique().tolist())

sel_stati = st.sidebar.multiselect("Stato",         stati_list, default=stati_list)
sel_resp  = st.sidebar.multiselect("Responsabile",  resp_list,  default=resp_list)
cerca     = st.sidebar.text_input("Cerca per mandato o denominazione")

filt = df.copy()
if sel_stati:
    filt = filt[filt["Stato"].isin(sel_stati)]
if sel_resp:
    filt = filt[filt["Responsabile"].isin(sel_resp)]
if cerca.strip():
    q = cerca.strip()
    filt = filt[
        filt["N° Mandato"].str.contains(q, case=False, na=False) |
        filt["Denominazione"].str.contains(q, case=False, na=False)
    ]

st.sidebar.info("Visualizzate: {} / {} righe".format(len(filt), len(df)))

# ── Tabs ──────────────────────────────────────────────────────────────────────

tab1, tab2 = st.tabs(["📋  Mandati", "👤  Riepilogo Responsabili"])

# ─── Tab 1 ───────────────────────────────────────────────────────────────────
with tab1:
    st.markdown("**{} mandati** — clicca sulle intestazioni per ordinare".format(len(filt)))

    def color_stato(val):
        return {
            "Attivo": "background-color:#c6f6d5;color:#22543d",
            "Chiuso": "background-color:#e2e8f0;color:#4a5568",
            "Aperto": "background-color:#bee3f8;color:#2a4365",
        }.get(str(val), "background-color:#fefcbf;color:#744210")

    fmt = {c: "{:,.2f}" for c in COL_NUM}
    if "Ore Lavorate" in filt.columns:
        fmt["Ore Lavorate"] = "{:,.2f}"
    styled = (
        filt.style
        .map(color_stato, subset=["Stato"])
        .format(fmt)
    )
    st.dataframe(styled, use_container_width=True, height=560)

    # Export: usa df_export (NaN originali, non fillna 0)
    filt_export = df_export.loc[filt.index].copy()
    riepilogo   = build_riepilogo(df)
    excel_bytes = genera_excel(filt_export, riepilogo, len(filt))

    fname = uploaded_files[0].name.replace(".xlsx","") if len(uploaded_files)==1 else "Report_Unificato"
    st.download_button(
        label="⬇  Scarica Report Excel (.xlsx)",
        data=excel_bytes,
        file_name="Report_Mandati_{}.xlsx".format(fname),
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

# ─── Tab 2 ───────────────────────────────────────────────────────────────────
with tab2:
    riepilogo = build_riepilogo(df)
    st.markdown("**{}** responsabili — aggregato su **{}** mandati totali".format(
        len(riepilogo) - 1, len(df)))   # -1 per escludere TOTALE GENERALE

    # Evidenzia riga TOTALE GENERALE
    def hl_totale(row):
        if str(row["Responsabile"]).startswith("TOTALE"):
            return ["background-color:#1F3864;color:white;font-weight:bold"] * len(row)
        return [""] * len(row)

    fmt_r = {c: "{:,.2f}" for c in COL_NUM if c in riepilogo.columns}
    if "Ore Lavorate" in riepilogo.columns:
        fmt_r["Ore Lavorate"] = "{:,.2f}"
    styled_r = (
        riepilogo.style
        .apply(hl_totale, axis=1)
        .format(fmt_r)
    )
    st.dataframe(styled_r, use_container_width=True, height=500)

    excel_bytes2 = genera_excel(df_export, riepilogo, len(df))
    fname2 = uploaded_files[0].name.replace(".xlsx","") if len(uploaded_files)==1 else "Report_Unificato"
    st.download_button(
        label="⬇  Scarica Report Excel (.xlsx)",
        data=excel_bytes2,
        file_name="Report_Mandati_{}.xlsx".format(fname2),
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        key="dl2",
    )
