// Test addizionali regionali/comunali a scaglioni — node --test engine/addizionali.test.mjs
// Valori di riscontro: esempi pubblicati per Appiano Gentile (delibera 40/2025)
// e addizionale regionale Lombardia 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  imposteAScaglioni, irpef, calcolaNetto,
  ADDIZIONALE_LOMBARDIA, ADDIZIONALE_APPIANO_GENTILE, ITALIA,
} from "./motore.mjs";

const dati = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/aliquote-ti-2026-completo.json", import.meta.url)), "utf8"),
);

test("addizionale regionale Lombardia: riscontro a 35'000 € (510,30)", () => {
  assert.ok(Math.abs(imposteAScaglioni(35000, ADDIZIONALE_LOMBARDIA) - 510.30) < 0.01);
  assert.ok(Math.abs(imposteAScaglioni(20000, ADDIZIONALE_LOMBARDIA) - 263.50) < 0.01);
});

test("addizionale comunale Appiano Gentile: riscontri pubblicati", () => {
  assert.ok(Math.abs(imposteAScaglioni(20000, ADDIZIONALE_APPIANO_GENTILE) - 54.00) < 0.01);
  assert.ok(Math.abs(imposteAScaglioni(35000, ADDIZIONALE_APPIANO_GENTILE) - 117.60) < 0.01);
});

test("imposteAScaglioni: casi limite", () => {
  assert.equal(imposteAScaglioni(0, ADDIZIONALE_LOMBARDIA), 0);
  assert.equal(imposteAScaglioni(-100, ADDIZIONALE_LOMBARDIA), 0);
  assert.equal(imposteAScaglioni(1000, []), 0);
  // irpef() ora è un caso particolare del calcolo generico
  assert.equal(irpef(60000), imposteAScaglioni(60000, ITALIA.scaglioni));
});

test("calcolaNetto: scaglioni reali sostituiscono la stima flat 1,7%", () => {
  const base = {
    lordoMensile: 65000 / 12, mensilita: 12, bandaLpp: 1, regime: "nuovo",
    cambio: 1.0731, dati, famiglia: "coniugato_doppio",
  };
  const flat = calcolaNetto(base);
  const reali = calcolaNetto({
    ...base,
    addizionaleRegionale: ADDIZIONALE_LOMBARDIA,
    addizionaleComunale: ADDIZIONALE_APPIANO_GENTILE,
  });
  assert.ok(Math.abs(flat.addizionaliEur - flat.imponibileItEur * 0.017) < 0.01);
  const attese = imposteAScaglioni(reali.imponibileItEur, ADDIZIONALE_LOMBARDIA)
    + imposteAScaglioni(reali.imponibileItEur, ADDIZIONALE_APPIANO_GENTILE);
  assert.ok(Math.abs(reali.addizionaliEur - attese) < 0.01);
  assert.ok(reali.addizionaliEur > flat.addizionaliEur);      // a ~50k il flat 1,7% sottostima
  // solo comunale, senza regionale
  const soloCom = calcolaNetto({ ...base, addizionaleComunale: ADDIZIONALE_APPIANO_GENTILE });
  assert.ok(soloCom.addizionaliEur < reali.addizionaliEur);
});
