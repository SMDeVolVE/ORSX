// Test sul JSON completo estratto dai PDF ufficiali (tutte le tabelle, 0-9 figli)
// — node --test engine/tabelle-complete.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lookupRate, scegliTabella, calcolaNetto, TABELLE_FAMIGLIA } from "./motore.mjs";

const dati = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/aliquote-ti-2026-completo.json", import.meta.url)), "utf8"),
);
const v1 = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/aliquote-ti-2026.json", import.meta.url)), "utf8"),
);

test("struttura: 8 tabelle, colonne figli attese, soglia finale 1'200'000", () => {
  for (const [regime, mappa] of Object.entries(TABELLE_FAMIGLIA)) {
    for (const [famiglia, lettera] of Object.entries(mappa)) {
      assert.ok(dati[lettera], `manca la tabella ${lettera} (${regime}/${famiglia})`);
      const minFigli = famiglia === "monoparentale" ? 1 : 0;
      for (let f = minFigli; f <= 9; f++) {
        const serie = dati[lettera][String(f)];
        assert.ok(Array.isArray(serie) && serie.length > 100, `${lettera}${f}: serie mancante o troppo corta`);
        assert.equal(serie[serie.length - 1][0], 1200000, `${lettera}${f}: soglia finale`);
      }
      assert.equal(dati[lettera][String(minFigli - 1)], undefined, `${lettera}: colonna sotto il minimo`);
    }
  }
});

test("A0 e R0 del JSON completo coincidono con la trascrizione manuale (19'801-199'800)", () => {
  const coppie = [
    ["A", v1.tabella_A_vecchi_frontalieri],
    ["R", v1.tabella_R_nuovi_frontalieri],
  ];
  for (const [lettera, manuale] of coppie) {
    for (let income = 19801; income <= 199800; income += 300) {
      assert.equal(
        lookupRate(dati[lettera]["0"], income),
        lookupRate(manuale, income),
        `${lettera}0 a ${income} CHF`,
      );
    }
  }
});

test("riduzione 80%: R/S/T/U ≈ A/B/C/H × 0,8 su tutte le colonne figli", () => {
  for (const [vecchia, nuova] of [["A", "R"], ["B", "S"], ["C", "T"], ["H", "U"]]) {
    for (const f of Object.keys(dati[nuova])) {
      for (let income = 30000; income <= 1200000; income += 10000) {
        const a = lookupRate(dati[vecchia][f], income);
        const r = lookupRate(dati[nuova][f], income);
        assert.ok(Math.abs(r - a * 0.8) <= 0.15, `${nuova}${f} a ${income}: A=${a} R=${r}`);
      }
    }
  }
});

test("più figli a carico → aliquota mai più alta (a parità di reddito)", () => {
  for (const lettera of ["A", "B", "C", "R", "S", "T"]) {
    for (let income = 40000; income <= 200000; income += 20000) {
      for (let f = 0; f < 9; f++) {
        const conMeno = lookupRate(dati[lettera][String(f)], income);
        const conPiu = lookupRate(dati[lettera][String(f + 1)], income);
        assert.ok(conPiu <= conMeno, `${lettera} a ${income}: ${f} figli=${conMeno} < ${f + 1} figli=${conPiu}`);
      }
    }
  }
});

test("scegliTabella: mapping regime/famiglia e clamp figli", () => {
  assert.equal(scegliTabella(dati, { regime: "vecchio", famiglia: "celibe" }).lettera, "A");
  assert.equal(scegliTabella(dati, { regime: "nuovo", famiglia: "coniugato_doppio", figli: 3 }).lettera, "T");
  // monoparentale parte da 1 figlio anche se ne chiedi 0
  const h = scegliTabella(dati, { regime: "vecchio", famiglia: "monoparentale", figli: 0 });
  assert.equal(h.lettera, "H");
  assert.equal(h.figli, 1);
  // oltre 9 figli si usa la colonna 9
  assert.equal(scegliTabella(dati, { regime: "nuovo", famiglia: "celibe", figli: 12 }).figli, 9);
  assert.throws(() => scegliTabella(dati, { regime: "nuovo", famiglia: "inesistente" }));
});

test("valori campione dal PDF ufficiale", () => {
  assert.equal(lookupRate(dati.A["0"], 71500), 10.1);
  assert.equal(lookupRate(dati.R["0"], 71500), 8.0);
  assert.equal(lookupRate(dati.A["0"], 1200000), 31.7);
  assert.equal(lookupRate(dati.B["2"], 80000), 1.9);
  assert.equal(lookupRate(dati.H["1"], 50000), 1.8);
});

test("calcolaNetto con dati completi: vecchio frontaliere coniugato 2 figli ha netto più alto", () => {
  const base = { lordoMensile: 6000, mensilita: 13, bandaLpp: 1, regime: "vecchio", cambio: 1.06, dati };
  const celibe = calcolaNetto({ ...base, famiglia: "celibe" });
  const coniugato = calcolaNetto({ ...base, famiglia: "coniugato_unico", figli: 2 });
  assert.equal(celibe.lettera, "A");
  assert.equal(coniugato.lettera, "B");
  assert.ok(coniugato.fonte < celibe.fonte);
  assert.ok(coniugato.nettoAnnuoChf > celibe.nettoAnnuoChf);
});

test("nuovo frontaliere: la fonte più bassa del coniugato è assorbita dal saldo IRPEF Italia", () => {
  // Con il conguaglio italiano attivo, meno fonte CH = meno credito d'imposta:
  // il netto resta invariato (le detrazioni familiari italiane non sono modellate).
  const base = { lordoMensile: 6000, mensilita: 13, bandaLpp: 1, regime: "nuovo", cambio: 1.06, dati };
  const celibe = calcolaNetto({ ...base, famiglia: "celibe" });
  const coniugato = calcolaNetto({ ...base, famiglia: "coniugato_unico", figli: 2 });
  assert.ok(coniugato.fonte < celibe.fonte);
  assert.ok(coniugato.saldoItaliaEur > celibe.saldoItaliaEur);
  assert.ok(Math.abs(coniugato.nettoAnnuoChf - celibe.nettoAnnuoChf) < 1);
});

test("calcolaNetto: percorso legacy (tabelle A/R) e nuovo (dati) coincidono per il celibe", () => {
  const tabelle = { A: v1.tabella_A_vecchi_frontalieri, R: v1.tabella_R_nuovi_frontalieri };
  for (const regime of ["nuovo", "vecchio"]) {
    const legacy = calcolaNetto({ lordoMensile: 5500, mensilita: 13, bandaLpp: 1, regime, cambio: 1.06, tabelle });
    const nuovo = calcolaNetto({ lordoMensile: 5500, mensilita: 13, bandaLpp: 1, regime, cambio: 1.06, dati });
    assert.equal(legacy.aliquota, nuovo.aliquota, regime);
    assert.equal(legacy.nettoAnnuoChf, nuovo.nettoAnnuoChf, regime);
  }
});
