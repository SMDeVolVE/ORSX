# Benchmark calcolatori concorrenti — agosto 2026

Confronto del nostro motore (tabelle ufficiali TI 2026, validato su busta paga
reale) contro i due calcolatori web di riferimento, a parità di profilo:
**nuovo frontaliere, celibe, 0 figli, 35–44 anni, Canton Ticino, cambio 1,07,
12 mensilità**. Analisi condotta sul codice JavaScript effettivamente servito
dai loro siti (non via UI), portato 1:1 in `scratchpad` e confrontato.

## Risultati

### 52'000 CHF annui

|                    | Noi (uff.) | frontaliereticino.ch | cambiavalute.ch |
|--------------------|-----------:|---------------------:|----------------:|
| Contributi CH      | 5'125      | 6'708                | 9'048           |
| Imposta fonte      | 2'964 (5,7%) | 2'704 (5,20%)      | 3'093 (~5,95% eff.) |
| Saldo Italia (EUR) | 7'351      | 7'869                | 7'743           |
| **Netto annuo CHF**| **37'041** | 35'233               | 32'623          |
| Pressione          | 28,8%      | 32,2%                | 37,3%           |

### 65'000 CHF annui

|                    | Noi (uff.) | frontaliereticino.ch | cambiavalute.ch |
|--------------------|-----------:|---------------------:|----------------:|
| Contributi CH      | 6'737      | 8'385                | 11'310          |
| Imposta fonte      | 4'745 (7,3%) | 4'784 (7,36%)      | 3'866           |
| Saldo Italia (EUR) | 10'959     | 11'678               | 11'262          |
| **Netto annuo CHF**| **43'276** | 40'917               | 39'299          |
| Pressione          | 33,4%      | 37,1%                | 39,5%           |

Scarto sul netto annuo: **1'800–2'400 CHF** vs frontaliereticino,
**3'900–4'400 CHF** vs cambiavalute.

## Come calcolano loro (dal loro codice)

### frontaliereticino.ch (`calculationService.js`)

- **Tabelle fonte approssimate**: ~15–20 punti per tabella con interpolazione
  lineare (vs le ~2'000 fasce ufficiali da 600 CHF). A 52k sottostima di
  0,5–0,7 punti; esatta solo vicino ai nodi (es. 65k).
- Solo tabelle A/B/C/H; il nuovo frontaliere è "×0,8" sull'interpolata (ok come
  logica, ma eredita l'errore di interpolazione; niente arrotondamenti R/S/T/U).
- **Figli = sconto forfettario sull'aliquota** (B −2,5pt, C −2,1pt, H −1,5pt a
  figlio; tabella A nessuno sconto) invece delle colonne ufficiali 0–9.
- **LPP quota dipendente sul lordo intero** (3,5–9%), senza salario coordinato
  → sovrastima ~1'300–1'600 CHF/anno rispetto al minimo legale.
- LAINF 0,7% + IGM 0,8% inclusi di default (noi: AINP 1% + `altrePct` opzionale).
- Detrazione lavoro dipendente art. 13 identica alla nostra, ma **manca
  l'ulteriore detrazione LdB 2025** (fino a 1'000 €). Figli: 950 € flat per
  TUTTI i figli (ufficiale: solo 21+, quota decrescente col reddito).
- **Credito d'imposta pro-quota** (`credito × imponibile/lordo`) e applicato
  anche alle addizionali. Vedi "questione aperta" sotto.
- Punti di forza: addizionali comunali per singolo comune di residenza,
  confronto LAMal/SSN, assegni familiari, spese di vita — ampiezza di prodotto.

### cambiavalute.ch (script inline WordPress/Elementor)

- **Aliquota fonte piatta per cantone** (TI 9%) × 0,8, applicata sul reddito
  DOPO i contributi — nessuna progressione per reddito. La riduzione ×0,8 è
  applicata anche ai VECCHI frontalieri (errato). Coniugati: ×0,9 forfettario.
- **LPP: aliquota di fascia INTERA (7/10/15/18%) sul lordo pieno** — addebita
  al dipendente anche la metà del datore, senza coordinato → a 52k sono
  5'200 CHF/anno di sola LPP (realistico: ~1'300).
- **Secondo scaglione IRPEF al 33%** (dal 2024 è 35%).
- **Nessun credito d'imposta svizzero**: l'imposta alla fonte viene dedotta
  dalla base imponibile invece che accreditata (metodo non conforme alla
  convenzione). Nessuna detrazione, nessuna addizionale.
- Franchigia 10'000 applicata in CHF (la legge la fissa in EUR) e sommata al
  netto in EUR senza conversione (bug di unità).
- Il calcolatore è dichiaratamente una "stima" a corredo del servizio di cambio.

## Questione aperta per il nostro motore

**Credito d'imposta pro-quota (art. 165 c. 10 TUIR)**: quando il reddito
estero concorre solo parzialmente (franchigia 10'000 €), il credito andrebbe
ridotto in proporzione. frontaliereticino lo riduce (pro-quota imponibile/lordo);
noi accreditiamo il 100%. Impatto: ~1'000–1'400 €/anno sul saldo. Da verificare
con un commercialista specializzato (circolari AdE sul nuovo accordo) — se
confermato, aggiungere la riduzione proporzionale in `motore.mjs`.

## Conclusioni per il prodotto

1. **Il vantaggio competitivo c'è ed è misurabile**: siamo gli unici con le
   tabelle ufficiali complete (differenza fino a 0,7 punti di aliquota) e con
   la validazione su busta paga reale (scarto 3 centesimi).
2. Argomenti di marketing onesti: "aliquote ufficiali del Cantone, non
   interpolazioni", "LPP calcolata come in busta paga", "detrazioni 2026
   aggiornate (inclusa l'ulteriore detrazione)".
3. Da copiare da frontaliereticino: addizionali comunali per comune (hanno un
   dataset per ~100 comuni di frontiera), comparatore LAMal/SSN, assegni
   familiari.
4. Nessuno dei due gestisce: tredicesima vs 12 mensilità nel conguaglio,
   LPP reale da busta, trattenute CCL/IGM configurabili — tutte cose che
   abbiamo già.

*Metodologia: codice concorrente scaricato il 5.8.2026 e portato 1:1 in JS;
script di confronto in `scratchpad/benchmark3.mjs` (sessione Claude Code).
Non costituisce consulenza fiscale.*
