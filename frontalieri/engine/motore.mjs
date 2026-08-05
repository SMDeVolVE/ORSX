// Motore di calcolo netto frontalieri IT⇄CH — logica condivisa, senza dipendenze UI.
// Stessa logica del prototipo JSX v2; le tabelle aliquote vengono passate come dato
// (vedi data/aliquote-ti-2026.json) così il motore resta valido per più cantoni/anni.
// Non costituisce consulenza fiscale.

// Parametri LPP 2025/26 (indicativi)
export const LPP = { coord: 26460, minCoord: 3675, maxCoord: 64260 };

export const LPP_BANDS = [
  { label: "25–34", rate: 0.07 },
  { label: "35–44", rate: 0.10 },
  { label: "45–54", rate: 0.15 },
  { label: "55–65", rate: 0.18 },
];

// Contributi sociali CH, quota dipendente
export const SOCIALI = {
  avs: 0.053,          // AVS/AI/IPG
  ad: 0.011,           // assicurazione disoccupazione
  adCap: 148200,       // tetto salario assicurato AD
  ainp: 0.01,          // infortuni non professionali (varia per azienda)
};

// Lato Italia — nuovi frontalieri (accordo 2023)
export const ITALIA = {
  franchigiaEur: 10000,
  addizionali: 0.017,  // addizionali regionale+comunale stimate
  // Scaglioni 2026: la L. Bilancio 2026 taglia il 2° scaglione dal 35% al 33%
  // (beneficio max 440 €, "sterilizzato" oltre 200'000 € di reddito complessivo)
  scaglioni: [
    { fino: 28000, aliquota: 0.23 },
    { fino: 50000, aliquota: 0.33 },
    { fino: Infinity, aliquota: 0.43 },
  ],
  sterilizzazioneSoglia: 200000,
  sterilizzazioneImporto: 440,
};

// Cerca l'aliquota nella tabella [[redditoMax, aliquota%], ...] ordinata per reddito.
export function lookupRate(table, income) {
  for (const [max, rate] of table) if (income <= max) return rate;
  return table[table.length - 1][1];
}

// Mappa situazione familiare → lettera tabella TI (vecchi/nuovi frontalieri).
// H/U (monoparentali) esistono solo da 1 figlio in su.
export const TABELLE_FAMIGLIA = {
  vecchio: { celibe: "A", coniugato_unico: "B", coniugato_doppio: "C", monoparentale: "H" },
  nuovo: { celibe: "R", coniugato_unico: "S", coniugato_doppio: "T", monoparentale: "U" },
};

/**
 * Seleziona la serie di aliquote dal JSON completo (aliquote-ti-2026-completo.json,
 * formato { A: { "0": [[max,%],...], ... }, ... }).
 * @returns {{ lettera: string, figli: number, tabella: number[][] }}
 */
export function scegliTabella(dati, { regime, famiglia = "celibe", figli = 0 }) {
  const lettera = TABELLE_FAMIGLIA[regime]?.[famiglia];
  if (!lettera || !dati[lettera]) throw new Error(`Tabella non trovata per ${regime}/${famiglia}`);
  const minFigli = famiglia === "monoparentale" ? 1 : 0;
  const f = Math.min(Math.max(figli, minFigli), 9);
  return { lettera, figli: f, tabella: dati[lettera][String(f)] };
}

// ── Detrazioni IRPEF (valori 2025/26, semplificazioni dichiarate) ──────────
// Non modellati: trattamento integrativo/bonus per redditi ≤20k (raro per
// salari CH), micro-maggiorazioni della detrazione coniuge (10-30 €),
// detrazioni per oneri (mutui, sanità, ...).

// Detrazione per redditi di lavoro dipendente (art. 13 TUIR).
export function detrazioneLavoroDipendente(reddito) {
  if (reddito <= 0) return 0;
  if (reddito <= 15000) return 1955;
  if (reddito <= 28000) return 1910 + (1190 * (28000 - reddito)) / 13000;
  if (reddito <= 50000) return (1910 * (50000 - reddito)) / 22000;
  return 0;
}

// Ulteriore detrazione lavoro dipendente (L. Bilancio 2025, strutturale).
export function ulterioreDetrazione(reddito) {
  if (reddito > 20000 && reddito <= 32000) return 1000;
  if (reddito > 32000 && reddito < 40000) return (1000 * (40000 - reddito)) / 8000;
  return 0;
}

// Coniuge a carico (reddito proprio del coniuge ≤ 2'840,51 €).
export function detrazioneConiuge(reddito) {
  if (reddito <= 0) return 0;
  if (reddito <= 15000) return 800 - (110 * reddito) / 15000;
  if (reddito <= 40000) return 690;
  if (reddito < 80000) return (690 * (80000 - reddito)) / 40000;
  return 0;
}

// Figli a carico di 21+ anni (sotto i 21 c'è l'assegno unico, non la detrazione).
export function detrazioneFigli(reddito, figliMaggiorenni) {
  if (figliMaggiorenni <= 0) return 0;
  const teorico = 95000 + (figliMaggiorenni - 1) * 15000;
  const quota = (teorico - reddito) / teorico;
  return quota > 0 ? 950 * figliMaggiorenni * quota : 0;
}

// IRPEF a scaglioni sull'imponibile in EUR (lorda, prima delle detrazioni).
export function irpef(imponibile) {
  if (imponibile <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const { fino, aliquota } of ITALIA.scaglioni) {
    tax += (Math.min(imponibile, fino) - prev) * aliquota;
    if (imponibile <= fino) break;
    prev = fino;
  }
  return tax;
}

// Contributi sociali CH quota dipendente sul lordo annuo.
// bandaLpp: indice in LPP_BANDS (fascia d'età).
// opts (tutti opzionali, per aderire alla busta paga reale):
//   tassoAinp  — LAINF non professionale + complementare (default 1%; tipico ~1,01%)
//   lppAnnuo   — importo LPP annuo reale (sostituisce la stima per fascia d'età)
//   altrePct   — altre trattenute percentuali aziendali/CCL (es. IGM malattia + CCL)
export function contributiSociali(lordoAnnuo, bandaLpp, opts = {}) {
  const { tassoAinp = SOCIALI.ainp, lppAnnuo = null, altrePct = 0 } = opts;
  const avs = lordoAnnuo * SOCIALI.avs;
  const ad = Math.min(lordoAnnuo, SOCIALI.adCap) * SOCIALI.ad;
  const ainp = lordoAnnuo * tassoAinp;
  const coordinato = Math.min(Math.max(lordoAnnuo - LPP.coord, LPP.minCoord), LPP.maxCoord);
  const lpp = lppAnnuo ?? (coordinato * LPP_BANDS[bandaLpp].rate) / 2;
  const altre = lordoAnnuo * altrePct;
  return { avs, ad, ainp, lpp, altre, totale: avs + ad + ainp + lpp + altre };
}

/**
 * Calcolo completo lordo CHF → netto.
 *
 * @param {object} p
 * @param {number} p.lordoMensile  lordo mensile CHF
 * @param {number} p.mensilita     12 o 13
 * @param {number} p.bandaLpp      indice fascia d'età in LPP_BANDS
 * @param {"nuovo"|"vecchio"} p.regime  nuovo = tabelle R/S/T/U + conguaglio Italia
 * @param {number} p.cambio        CHF→EUR
 * @param {object} [p.tabelle]     legacy: { A: [[max,%],...], R: [[max,%],...] } (solo celibe)
 * @param {object} [p.dati]        JSON completo { A: {"0": [...], ...}, ... } — abilita famiglia/figli
 * @param {string} [p.famiglia]    celibe | coniugato_unico | coniugato_doppio | monoparentale
 * @param {number} [p.figli]       0–9 figli a carico
 * @param {number} [p.tassoAinp]   LAINF NP + complementare (default 1%)
 * @param {number} [p.altrePct]    altre trattenute % aziendali/CCL (IGM, CCL, ...)
 * @param {number} [p.lppMensile]  LPP mensile reale da busta paga (12 prelievi/anno;
 *                                 di norma la tredicesima non è soggetta a LPP)
 * @param {boolean} [p.detrazioni] applica le detrazioni IRPEF (default true)
 * @param {boolean} [p.coniugeACarico]    coniuge fiscalmente a carico (reddito ≤ 2'840,51 €)
 * @param {number}  [p.figliMaggiorenni]  figli 21+ a carico (per la detrazione IT)
 */
export function calcolaNetto({ lordoMensile, mensilita, bandaLpp, regime, cambio, tabelle, dati, famiglia = "celibe", figli = 0, tassoAinp, altrePct, lppMensile, detrazioni = true, coniugeACarico = false, figliMaggiorenni = 0 }) {
  const lordoAnnuo = lordoMensile * mensilita;

  const sociali = contributiSociali(lordoAnnuo, bandaLpp, {
    ...(tassoAinp !== undefined && { tassoAinp }),
    ...(altrePct !== undefined && { altrePct }),
    ...(lppMensile !== undefined && lppMensile !== null && { lppAnnuo: lppMensile * 12 }),
  });

  let tabella, lettera;
  if (dati) {
    ({ tabella, lettera } = scegliTabella(dati, { regime, famiglia, figli }));
  } else {
    tabella = regime === "nuovo" ? tabelle.R : tabelle.A;
    lettera = regime === "nuovo" ? "R" : "A";
  }
  const aliquota = lookupRate(tabella, lordoAnnuo);
  const fonte = lordoAnnuo * (aliquota / 100);

  let saldoItaliaEur = 0, imponibileItEur = 0, irpefLordaEur = 0, creditoEur = 0;
  let detrazioniEur = 0, irpefNettaEur = 0, addizionaliEur = 0;
  if (regime === "nuovo") {
    imponibileItEur = Math.max((lordoAnnuo - sociali.totale) * cambio - ITALIA.franchigiaEur, 0);
    irpefLordaEur = irpef(imponibileItEur);
    if (detrazioni) {
      detrazioniEur =
        detrazioneLavoroDipendente(imponibileItEur) +
        ulterioreDetrazione(imponibileItEur) +
        (coniugeACarico ? detrazioneConiuge(imponibileItEur) : 0) +
        detrazioneFigli(imponibileItEur, figliMaggiorenni);
    }
    irpefNettaEur = Math.max(irpefLordaEur - detrazioniEur, 0);
    // sterilizzazione del taglio 35→33% oltre 200k (riduzione delle detrazioni per oneri)
    if (imponibileItEur > ITALIA.sterilizzazioneSoglia) irpefNettaEur += ITALIA.sterilizzazioneImporto;
    addizionaliEur = imponibileItEur * ITALIA.addizionali;
    creditoEur = fonte * cambio;
    // il credito per le imposte estere abbatte l'IRPEF netta; le addizionali restano dovute
    saldoItaliaEur = Math.max(irpefNettaEur - creditoEur, 0) + addizionaliEur;
  }

  const nettoAnnuoChf = lordoAnnuo - sociali.totale - fonte - saldoItaliaEur / cambio;

  return {
    lordoAnnuo,
    ...sociali,
    sociali: sociali.totale,
    lettera, aliquota, fonte,
    imponibileItEur, irpefLordaEur, detrazioniEur, irpefNettaEur, addizionaliEur, creditoEur, saldoItaliaEur,
    nettoAnnuoChf,
    nettoMensileChf: nettoAnnuoChf / 12,
    nettoMensileEur: (nettoAnnuoChf / 12) * cambio,
    pressione: 1 - nettoAnnuoChf / lordoAnnuo,
  };
}
