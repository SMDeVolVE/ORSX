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
  scaglioni: [
    { fino: 28000, aliquota: 0.23 },
    { fino: 50000, aliquota: 0.35 },
    { fino: Infinity, aliquota: 0.43 },
  ],
};

// Cerca l'aliquota nella tabella [[redditoMax, aliquota%], ...] ordinata per reddito.
export function lookupRate(table, income) {
  for (const [max, rate] of table) if (income <= max) return rate;
  return table[table.length - 1][1];
}

// IRPEF a scaglioni sull'imponibile in EUR (senza detrazioni personali).
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
export function contributiSociali(lordoAnnuo, bandaLpp) {
  const avs = lordoAnnuo * SOCIALI.avs;
  const ad = Math.min(lordoAnnuo, SOCIALI.adCap) * SOCIALI.ad;
  const ainp = lordoAnnuo * SOCIALI.ainp;
  const coordinato = Math.min(Math.max(lordoAnnuo - LPP.coord, LPP.minCoord), LPP.maxCoord);
  const lpp = (coordinato * LPP_BANDS[bandaLpp].rate) / 2;
  return { avs, ad, ainp, lpp, totale: avs + ad + ainp + lpp };
}

/**
 * Calcolo completo lordo CHF → netto.
 *
 * @param {object} p
 * @param {number} p.lordoMensile  lordo mensile CHF
 * @param {number} p.mensilita     12 o 13
 * @param {number} p.bandaLpp      indice fascia d'età in LPP_BANDS
 * @param {"nuovo"|"vecchio"} p.regime  nuovo = tabella R + conguaglio Italia
 * @param {number} p.cambio        CHF→EUR
 * @param {object} p.tabelle       { A: [[max,%],...], R: [[max,%],...] }
 */
export function calcolaNetto({ lordoMensile, mensilita, bandaLpp, regime, cambio, tabelle }) {
  const lordoAnnuo = lordoMensile * mensilita;

  const sociali = contributiSociali(lordoAnnuo, bandaLpp);

  const aliquota = lookupRate(regime === "nuovo" ? tabelle.R : tabelle.A, lordoAnnuo);
  const fonte = lordoAnnuo * (aliquota / 100);

  let saldoItaliaEur = 0, imponibileItEur = 0, irpefLordaEur = 0, creditoEur = 0;
  if (regime === "nuovo") {
    imponibileItEur = Math.max((lordoAnnuo - sociali.totale) * cambio - ITALIA.franchigiaEur, 0);
    irpefLordaEur = irpef(imponibileItEur) + imponibileItEur * ITALIA.addizionali;
    creditoEur = fonte * cambio;
    saldoItaliaEur = Math.max(irpefLordaEur - creditoEur, 0);
  }

  const nettoAnnuoChf = lordoAnnuo - sociali.totale - fonte - saldoItaliaEur / cambio;

  return {
    lordoAnnuo,
    ...sociali,
    sociali: sociali.totale,
    aliquota, fonte,
    imponibileItEur, irpefLordaEur, creditoEur, saldoItaliaEur,
    nettoAnnuoChf,
    nettoMensileChf: nettoAnnuoChf / 12,
    nettoMensileEur: (nettoAnnuoChf / 12) * cambio,
    pressione: 1 - nettoAnnuoChf / lordoAnnuo,
  };
}
