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
│   ├── aliquote-ti-2026.json     tabelle A e R (trascrizione manuale, celibe 0 figli)
│   └── aliquote-ti-2026-completo.json   TUTTE le 8 tabelle, 0-9 figli, fino a 1.2M CHF
├── engine/
│   ├── motore.mjs                motore di calcolo condiviso (zero dipendenze UI)
│   ├── motore.test.mjs           test del motore (11)
│   ├── tabelle-complete.test.mjs test del JSON completo (9)
│   └── cambio.mjs                fetch tasso CHF→EUR live (frankfurter + fallback)
├── prototipo/
│   └── calcolatore-netto-frontaliere.jsx   prototipo React v2 "cascata trattenute"
└── scripts/
    └── estrai_tabelle.py         PDF ti.ch → JSON (già eseguito; i PDF restano fuori dal repo)
```

Test: `node --test engine/motore.test.mjs engine/tabelle-complete.test.mjs` (20, tutti verdi)

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
  riutilizzabile in React Native/Expo) e coperta da 20 test che passano.
  Il prototipo JSX resta standalone (per Claude artifacts); il motore è la fonte
  di verità per l'app.
- TUTTE le 8 tabelle 2026 (A/B/C/H vecchi, R/S/T/U nuovi; 0–9 figli) sono state
  estratte dai PDF ufficiali in `data/aliquote-ti-2026-completo.json` con
  `scripts/estrai_tabelle.py` (la rete dell'ambiente è stata sbloccata su
  www4.ti.ch). Verifiche fatte: A0/R0 identiche alla trascrizione manuale su
  19'801–199'800; riduzione 80% confermata su tutte e 4 le coppie (scarto max
  0,08 punti); più figli → aliquota mai più alta; H/U partono da 1 figlio.
  Le tabelle ufficiali arrivano a CHF 1'200'000 (A0 max 31,7%) — la trascrizione
  manuale era troncata a ~200'000.
  NOTA: 4 refusi nella fonte stessa (dip isolati di 0,1 punti in B1/C1/S1/T1
  attorno a 1,12–1,17M CHF) — lasciati fedeli al PDF.
- `motore.mjs` supporta ora famiglia + figli: `calcolaNetto({..., dati, famiglia,
  figli})` con famiglia ∈ {celibe, coniugato_unico, coniugato_doppio,
  monoparentale}; `scegliTabella()` mappa regime+famiglia → lettera tabella.
  Il percorso legacy `tabelle:{A,R}` resta compatibile.
  Insight fiscale emerso dai test: per i NUOVI frontalieri il vantaggio famiglia
  sull'imposta alla fonte è assorbito dal saldo IRPEF (meno fonte = meno credito
  d'imposta); il beneficio pieno si vede solo per i vecchi frontalieri. Le
  detrazioni familiari ITALIANE non sono ancora modellate — quando lo saranno,
  il vantaggio tornerà visibile anche per i nuovi.

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
2. Aggiornare il prototipo JSX con selettore famiglia + figli (il motore è
   pronto; manca solo la UI)
3. Modellare le detrazioni familiari IRPEF italiane (carichi di famiglia) —
   senza, il vantaggio figli non si vede per i nuovi frontalieri
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
