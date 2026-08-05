// Validazione contro una busta paga reale TI 2026 (tariffa T0N, conguaglio mensile).
// Gli importi personali restano fuori dal repo: qui si verificano i MECCANISMI
// riscontrati sulla busta — aliquote contributive, lookup T0, LPP fisso, IGM/CCL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lookupRate, contributiSociali, calcolaNetto } from "./motore.mjs";

const dati = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/aliquote-ti-2026-completo.json", import.meta.url)), "utf8"),
);

test("tariffa T0 (coniugato doppio reddito, nuovo front.): 5% nella fascia ~52'000 annui", () => {
  // riscontro da busta paga reale: conguaglio mensile al 5,00% con lookup su salario x12
  assert.equal(lookupRate(dati.T["0"], 52000), 5.0);
});

test("le trattenute percentuali della busta corrispondono ai tassi del motore", () => {
  // Busta reale: AVS 5,30% · AD 1,10% · LAINF NP 0,89% + complementare 0,122% ≈ 1,01%
  const c = contributiSociali(52000, 1, { tassoAinp: 0.0101 });
  assert.equal(c.avs, 52000 * 0.053);
  assert.equal(c.ad, 52000 * 0.011);
  assert.ok(Math.abs(c.ainp - 52000 * 0.0101) < 0.01);
  // il default 1% resta un'ottima approssimazione del combinato reale
  assert.ok(Math.abs(contributiSociali(52000, 1).ainp - c.ainp) / c.ainp < 0.02);
});

test("LPP a importo fisso da busta paga sostituisce la stima per fascia d'età", () => {
  const stima = contributiSociali(56000, 2);
  const reale = contributiSociali(56000, 2, { lppAnnuo: 160 * 12 });
  assert.equal(reale.lpp, 1920);
  assert.notEqual(stima.lpp, reale.lpp);
});

test("altre trattenute aziendali/CCL (es. IGM 0,77% + CCL 0,40%)", () => {
  const c = contributiSociali(52000, 1, { altrePct: 0.0077 + 0.004 });
  assert.ok(Math.abs(c.altre - 52000 * 0.0117) < 0.01);
  assert.ok(Math.abs(c.totale - (c.avs + c.ad + c.ainp + c.lpp + c.altre)) < 0.001);
});

test("calcolaNetto con parametri da busta paga: tutte le opzioni si propagano", () => {
  const r = calcolaNetto({
    lordoMensile: 4300, mensilita: 13, bandaLpp: 1, regime: "nuovo", cambio: 1.07,
    dati, famiglia: "coniugato_doppio", figli: 0,
    tassoAinp: 0.0101, altrePct: 0.0117, lppMensile: 160,
  });
  assert.equal(r.lettera, "T");
  assert.equal(r.lpp, 160 * 12);
  assert.ok(Math.abs(r.altre - 4300 * 13 * 0.0117) < 0.01);
  assert.ok(r.nettoAnnuoChf > 0 && r.nettoAnnuoChf < r.lordoAnnuo);
});

test("retrocompatibilità: senza opzioni il comportamento resta identico", () => {
  const c = contributiSociali(71500, 1);
  assert.equal(c.altre, 0);
  assert.equal(c.ainp, 715);
  assert.equal(c.lpp, 45040 * 0.10 / 2);
});
