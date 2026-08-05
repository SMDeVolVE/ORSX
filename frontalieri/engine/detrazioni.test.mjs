// Test detrazioni IRPEF (valori 2025/26) — node --test engine/detrazioni.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  detrazioneLavoroDipendente, ulterioreDetrazione, detrazioneConiuge, detrazioneFigli, calcolaNetto,
} from "./motore.mjs";

const dati = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/aliquote-ti-2026-completo.json", import.meta.url)), "utf8"),
);

test("detrazione lavoro dipendente: valori chiave e continuità agli snodi", () => {
  assert.equal(detrazioneLavoroDipendente(0), 0);
  assert.equal(detrazioneLavoroDipendente(15000), 1955);
  assert.equal(detrazioneLavoroDipendente(28000), 1910);            // 1910 + 0
  assert.ok(Math.abs(detrazioneLavoroDipendente(28001) - 1910) < 0.1); // continua
  assert.equal(detrazioneLavoroDipendente(39000), (1910 * 11000) / 22000); // 955
  assert.equal(detrazioneLavoroDipendente(50000), 0);
  assert.equal(detrazioneLavoroDipendente(60000), 0);
});

test("ulteriore detrazione (LdB 2025): finestra 20k-40k", () => {
  assert.equal(ulterioreDetrazione(20000), 0);
  assert.equal(ulterioreDetrazione(25000), 1000);
  assert.equal(ulterioreDetrazione(32000), 1000);
  assert.equal(ulterioreDetrazione(36000), 500);
  assert.equal(ulterioreDetrazione(40000), 0);
});

test("detrazione coniuge a carico", () => {
  assert.equal(detrazioneConiuge(15000), 800 - 110);
  assert.equal(detrazioneConiuge(30000), 690);
  assert.equal(detrazioneConiuge(60000), (690 * 20000) / 40000);    // 345
  assert.equal(detrazioneConiuge(80000), 0);
});

test("detrazione figli 21+: quota decrescente col reddito", () => {
  assert.equal(detrazioneFigli(30000, 0), 0);
  const unFiglio = detrazioneFigli(30000, 1);                       // 950 × 65000/95000
  assert.ok(Math.abs(unFiglio - (950 * 65000) / 95000) < 0.01);
  assert.ok(detrazioneFigli(30000, 2) > unFiglio);
  assert.equal(detrazioneFigli(95000, 1), 0);
});

test("calcolaNetto: le detrazioni riducono il saldo Italia (caso ~52k CHF annui)", () => {
  const base = {
    lordoMensile: 4333.35, mensilita: 12, bandaLpp: 1, regime: "nuovo",
    cambio: 1.0731, dati, famiglia: "coniugato_doppio", figli: 0,
    tassoAinp: 0.01012, altrePct: 0.0117005, lppMensile: 162.55,
  };
  const con = calcolaNetto(base);
  const senza = calcolaNetto({ ...base, detrazioni: false });
  assert.ok(con.detrazioniEur > 900);                    // lav. dip. ~960 + ulteriore ~135
  assert.equal(senza.detrazioniEur, 0);
  assert.ok(Math.abs((senza.saldoItaliaEur - con.saldoItaliaEur) - con.detrazioniEur) < 0.01);
  assert.ok(con.nettoAnnuoChf > senza.nettoAnnuoChf);
});

test("coniuge e figli 21+ a carico aumentano le detrazioni", () => {
  const base = {
    lordoMensile: 4333.35, mensilita: 12, bandaLpp: 1, regime: "nuovo",
    cambio: 1.0731, dati, famiglia: "coniugato_unico", figli: 0,
  };
  const solo = calcolaNetto(base);
  const conFamiglia = calcolaNetto({ ...base, coniugeACarico: true, figliMaggiorenni: 1 });
  assert.ok(conFamiglia.detrazioniEur > solo.detrazioniEur + 690);
  assert.ok(conFamiglia.saldoItaliaEur < solo.saldoItaliaEur);
});

test("il credito estero abbatte solo l'IRPEF netta, le addizionali restano dovute", () => {
  // reddito basso: IRPEF netta ~0 grazie alle detrazioni, ma le addizionali rimangono
  const r = calcolaNetto({
    lordoMensile: 2600, mensilita: 12, bandaLpp: 0, regime: "nuovo",
    cambio: 1.0731, dati, famiglia: "celibe",
  });
  assert.ok(r.irpefNettaEur < r.irpefLordaEur);
  assert.ok(r.saldoItaliaEur >= r.addizionaliEur - 0.01 || r.irpefNettaEur > r.creditoEur);
});

test("sopra 50k € di imponibile le detrazioni lavoro dipendente si azzerano", () => {
  const r = calcolaNetto({
    lordoMensile: 5500, mensilita: 13, bandaLpp: 1, regime: "nuovo", cambio: 1.06, dati,
  });
  assert.ok(r.imponibileItEur > 50000);
  assert.equal(r.detrazioniEur, 0);
});
