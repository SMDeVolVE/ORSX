// Test del motore di calcolo — node --test engine/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lookupRate, irpef, contributiSociali, calcolaNetto, LPP_BANDS } from "./motore.mjs";

const dati = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/aliquote-ti-2026.json", import.meta.url)), "utf8"),
);
const tabelle = { A: dati.tabella_A_vecchi_frontalieri, R: dati.tabella_R_nuovi_frontalieri };

test("lookupRate: estremi e soglie tabella A", () => {
  assert.equal(lookupRate(tabelle.A, 19800), 0.2);
  assert.equal(lookupRate(tabelle.A, 19801), 0.5);   // scatta lo scaglione successivo
  assert.equal(lookupRate(tabelle.A, 71500), 10.1);  // 5'500 × 13
  assert.equal(lookupRate(tabelle.A, 199800), 20.2);
  assert.equal(lookupRate(tabelle.A, 500000), 20.3); // oltre l'ultima soglia
});

test("lookupRate: estremi tabella R", () => {
  assert.equal(lookupRate(tabelle.R, 19800), 0.1);
  assert.equal(lookupRate(tabelle.R, 71500), 8.0);
  assert.equal(lookupRate(tabelle.R, 500000), 16.2);
});

test("tabella R ≈ tabella A × 0,8 (riduzione nuovo accordo già inclusa)", () => {
  for (const [max, rateA] of tabelle.A) {
    if (max > 999999) continue;
    const rateR = lookupRate(tabelle.R, max);
    assert.ok(
      Math.abs(rateR - rateA * 0.8) <= 0.15,
      `a ${max} CHF: A=${rateA} R=${rateR}, atteso ≈${(rateA * 0.8).toFixed(2)}`,
    );
  }
});

test("aliquote monotone non decrescenti", () => {
  for (const tab of [tabelle.A, tabelle.R]) {
    for (let i = 1; i < tab.length; i++) {
      assert.ok(tab[i][1] >= tab[i - 1][1], `aliquota decresce a ${tab[i][0]}`);
      assert.ok(tab[i][0] > tab[i - 1][0], `soglia non crescente a ${tab[i][0]}`);
    }
  }
});

test("IRPEF a scaglioni", () => {
  assert.equal(irpef(0), 0);
  assert.equal(irpef(-5), 0);
  assert.equal(irpef(28000), 6440);            // 28'000 × 23%
  assert.equal(irpef(50000), 14140);           // 6'440 + 22'000 × 35%
  assert.equal(irpef(60000), 18440);           // 14'140 + 10'000 × 43%
});

test("contributi sociali: LPP con salario coordinato", () => {
  // lordo 71'500, fascia 35–44 (10%): coordinato = 71'500 − 26'460 = 45'040
  const c = contributiSociali(71500, 1);
  assert.equal(Math.round(c.avs * 100) / 100, 3789.5);
  assert.equal(Math.round(c.ad * 100) / 100, 786.5);
  assert.equal(c.ainp, 715);
  assert.equal(c.lpp, 45040 * 0.10 / 2);       // 2'252
});

test("contributi sociali: clamp minimo e massimo del coordinato", () => {
  // lordo sotto la deduzione di coordinamento → coordinato = minimo 3'675
  assert.equal(contributiSociali(25000, 0).lpp, 3675 * 0.07 / 2);
  // lordo altissimo → coordinato = massimo 64'260; AD resta sul tetto 148'200
  const alto = contributiSociali(300000, 3);
  assert.equal(alto.lpp, 64260 * 0.18 / 2);
  assert.equal(alto.ad, 148200 * 0.011);
});

test("caso completo: nuovo frontaliere 5'500 × 13, 35–44, cambio 1.06", () => {
  const r = calcolaNetto({ lordoMensile: 5500, mensilita: 13, bandaLpp: 1, regime: "nuovo", cambio: 1.06, tabelle });
  assert.equal(r.lordoAnnuo, 71500);
  assert.equal(r.aliquota, 8.0);
  assert.equal(r.fonte, 5720);
  assert.equal(Math.round(r.sociali), 7543);
  // imponibile IT = (71'500 − 7'543) × 1.06 − 10'000 ≈ 57'794.42
  assert.ok(Math.abs(r.imponibileItEur - 57794.42) < 0.5);
  // IRPEF 17'491.60 + addizionali 982.51 − credito 6'063.20 ≈ saldo 12'410.91
  assert.ok(Math.abs(r.saldoItaliaEur - 12410.91) < 1);
  assert.ok(Math.abs(r.nettoAnnuoChf - 46528.6) < 2);
  assert.ok(r.pressione > 0.3 && r.pressione < 0.4);
});

test("caso completo: vecchio frontaliere — nessun conguaglio Italia", () => {
  const r = calcolaNetto({ lordoMensile: 5500, mensilita: 13, bandaLpp: 1, regime: "vecchio", cambio: 1.06, tabelle });
  assert.equal(r.aliquota, 10.1);
  assert.equal(r.saldoItaliaEur, 0);
  assert.equal(r.creditoEur, 0);
  assert.equal(r.nettoAnnuoChf, r.lordoAnnuo - r.sociali - r.fonte);
});

test("il vecchio regime conviene sempre a parità di condizioni", () => {
  for (const lordoMensile of [3500, 5000, 6500, 8000, 10000]) {
    const nuovo = calcolaNetto({ lordoMensile, mensilita: 13, bandaLpp: 1, regime: "nuovo", cambio: 1.06, tabelle });
    const vecchio = calcolaNetto({ lordoMensile, mensilita: 13, bandaLpp: 1, regime: "vecchio", cambio: 1.06, tabelle });
    assert.ok(vecchio.nettoAnnuoChf >= nuovo.nettoAnnuoChf, `a ${lordoMensile}/mese il nuovo regime risulta migliore`);
  }
});

test("coerenza con tutte le fasce LPP", () => {
  for (let banda = 0; banda < LPP_BANDS.length; banda++) {
    const r = calcolaNetto({ lordoMensile: 6000, mensilita: 13, bandaLpp: banda, regime: "nuovo", cambio: 1.06, tabelle });
    assert.ok(r.nettoAnnuoChf > 0 && r.nettoAnnuoChf < r.lordoAnnuo);
  }
});
