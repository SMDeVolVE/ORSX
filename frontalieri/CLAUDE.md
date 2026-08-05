# App Frontalieri Italia–Svizzera — Handoff progetto

Progetto personale di Ste. App mobile da pubblicare sugli store per i lavoratori
frontalieri Italia→Svizzera (estendibile a Francia/Germania). Questo file riassume
tutto il lavoro fatto per continuare lo sviluppo in Claude Code.

## Visione e mercato

- Segmento: ~413'000 frontalieri in Svizzera (Q1 2026), di cui ~92'000 italiani
  (~78'500 in Ticino). I frontalieri dalla Francia sono ~236'000: tradurre l'app
  in francese moltiplica il mercato ~2,5x.
- Nessuna app nativa dominante trovata. Concorrenza = ecosistemi web:
  CambiaValute.ch (content marketing + servizio cambio), frontaliereticino.ch
  (calcolatori, comparatore cambio su 16 operatori, comparatore LAMal).
- Il bisogno è validato; lo spazio "app mobile con notifiche e gestione
  continuativa" è libero. Rischio: gli incumbent web possono farla con un
  pubblico già loro.

## Modello di business

1. Affiliazioni cambio valuta (CambiaValute, Wise, Revolut, Neon — programmi
   referral esistenti)
2. Lead generation assicurativa LAMal (canale più ricco nel mercato svizzero)
3. Premium €3–5/mese: alert cambio personalizzati, promemoria fiscali
- Obiettivo indicativo: 5–7'000 utenti attivi in 18–24 mesi via gruppi Facebook
  frontalieri → €30–60k/anno, costi vivi < €2k, margini >90%.

## Roadmap concordata

- Fase 0 — Validazione: contatti affiliazioni PRIMA di sviluppare, sondaggio nei
  gruppi FB, naming/dominio. (da fare)
- Fase 1 — MVP (2–3 mesi part-time): calcolatore netto + alert cambio CHF/EUR +
  comparatore base. Stack proposto: Flutter o React Native + Supabase.
- Fase 2 — Lancio store + distribuzione gruppi frontalieri + prime affiliazioni.
- Fase 3 — Premium, comparatore LAMal, promemoria fiscali.

## Struttura del progetto (cartella `frontalieri/` nel repo ORSX)

```
frontalieri/
├── CLAUDE.md                     questo file
├── data/
│   └── aliquote-ti-2026.json     tabelle A e R ufficiali TI 2026 (celibe, 0 figli)
├── engine/
│   ├── motore.mjs                motore di calcolo condiviso (zero dipendenze UI)
│   ├── motore.test.mjs           11 test — eseguire: node --test engine/motore.test.mjs
│   └── cambio.mjs                fetch tasso CHF→EUR live (frankfurter + fallback)
├── prototipo/
│   └── calcolatore-netto-frontaliere.jsx   prototipo React v2 "cascata trattenute"
└── scripts/
    └── estrai_tabelle.py         PDF ti.ch → JSON per tutte le tabelle A/B/C/H/R/S/T/U
```

NOTA: il repo ORSX contiene anche `app.py` (Gestione Commesse, tool Evolve) —
i due progetti convivono ma NON condividono codice; valutare un repo dedicato
quando si sceglie lo stack definitivo.

## Stato attuale

- Prototipo calcolatore netto v2 in `prototipo/` (React + Tailwind, mobile-first).
  Elemento distintivo: la "cascata delle trattenute" — il lordo CHF scende voce
  per voce fino ad attraversare la linea tratteggiata del confine dove diventa
  netto EUR. Font: Space Grotesk (numeri) + Inter. Palette: ink navy #16233A,
  rosso CH #C22F2F, blu EU #1B4FA0, verde netto #1E7F4F.
- La logica di calcolo è stata ESTRATTA in `engine/motore.mjs` (framework-agnostic,
  riutilizzabile in React Native/Expo) e coperta da 11 test che passano, inclusi:
  soglie tabelle, verifica R ≈ A×0,8, monotonia aliquote, scaglioni IRPEF, clamp
  LPP, due casi completi end-to-end e l'invariante "vecchio regime ≥ nuovo".
  Il prototipo JSX resta standalone (per Claude artifacts); il motore è la fonte
  di verità per l'app.
- `scripts/estrai_tabelle.py` è pronto ma NON ancora eseguito: l'ambiente Claude
  Code remoto non raggiunge www4.ti.ch (policy di rete). Va lanciato in locale:
  `pip install pdfplumber requests && python scripts/estrai_tabelle.py`.
  Estrae tutte le 8 tabelle (0–9 figli), compatta le fasce e auto-verifica A/R
  contro la trascrizione manuale. Il parser va controllato a campione alla prima
  esecuzione (layout PDF non testato).

### Logica di calcolo implementata (in `engine/motore.mjs`)

Contributi sociali CH (quota dipendente) sul lordo annuo:
- AVS/AI/IPG 5,3% · AD 1,1% (cap 148'200) · AINP ~1% (varia per azienda)
- LPP: salario coordinato = clamp(lordo − 26'460, 3'675, 64'260), aliquota per
  fascia d'età (25–34: 7%, 35–44: 10%, 45–54: 15%, 55–65: 18%), quota
  dipendente = metà. Parametri 2025/26.

Imposta alla fonte: aliquote UFFICIALI Canton Ticino edizione 2026 in
`data/aliquote-ti-2026.json`:
- Tabella A = vecchi frontalieri (ante 17.07.2023) e rientro settimanale
- Tabella R = nuovi frontalieri; la riduzione all'80% del nuovo accordo è GIÀ
  inclusa nella tabella (verificato: R ≈ A×0,8 con arrotondamenti del Cantone)
- Profilo coperto: celibe/nubile senza figli (colonne 0–9 figli identiche in A/R)

Lato Italia (solo nuovi frontalieri):
- Imponibile = (lordo − contributi CH) × cambio − franchigia €10'000
- IRPEF a scaglioni 2026 (23% ≤28k, 35% 28–50k, 43% >50k) + addizionali stimate 1,7%
- Credito d'imposta = imposta alla fonte CH convertita in EUR
- Saldo Italia = max(IRPEF+add − credito, 0)
- Detrazioni IRPEF personali NON incluse (semplificazione dichiarata)

## Prossimi passi tecnici

1. Validare il motore con buste paga reali (Ste può farlo direttamente —
   confrontare con i test in `engine/motore.test.mjs` e aggiungere i casi reali)
2. Eseguire IN LOCALE `scripts/estrai_tabelle.py` per generare
   `data/aliquote-ti-2026-completo.json` con tutte le tabelle B/C/H/S/T/U
   (coniugati/figli) e verificare l'output a campione contro i PDF
3. Estendere `motore.mjs` con selettore situazione familiare + numero figli
   usando il JSON completo
4. Integrare `engine/cambio.mjs` nel prototipo (tasso live) + notifiche push
   per gli alert
5. Scelta stack definitiva (Flutter vs React Native vs Expo) e repo dedicato

## Fonti ufficiali

- Pagina tabelle TI: https://www4.ti.ch/dfe/dc/dichiarazione/imposte-alla-fonte-1/tabelle-di-calcolo-dellimposta-alla-fonte
- Tabella A 2026: https://www4.ti.ch/fileadmin/DFE/DC/DOC-IF/Aliquote_2026/Ticino_tabella_A_2026.pdf
- Tabella R 2026: https://www4.ti.ch/fileadmin/DFE/DC/DOC-IF/Aliquote_2026/Ticino_tabella_R_2026.pdf
- Coniugati/figli: stesse URL con B, C, H, S, T, U
- Tariffe ERP tutta la Svizzera (ZIP machine-readable, per multi-cantone futuro):
  https://www.estv.admin.ch/estv/it/home/imposta-federale-diretta/imposta-alla-fonte/tariffe-if-salari.html
- Dati frontalieri: UST (Ufficio federale di statistica), rilevazione trimestrale

## Vincoli e note

- Il progetto è personale e volutamente NON in ambito edilizia per non
  sovrapporsi a possibili sviluppi per Evolve SA (datore di lavoro di Ste).
- Lingua prodotto: italiano; francese in roadmap per il mercato Ginevra/Lemano.
- Ogni output con numeri fiscali deve dichiarare "non è consulenza fiscale".
