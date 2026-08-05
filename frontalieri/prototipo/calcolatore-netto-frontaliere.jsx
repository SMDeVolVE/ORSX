import { useState, useMemo } from "react";
import { calcolaNetto, LPP_BANDS, TABELLE_FAMIGLIA } from "../engine/motore.mjs";
import dati from "../data/aliquote-ti-2026-completo.json";

// ─────────────────────────────────────────────────────────────
//  Calcolatore netto frontalieri IT⇄CH — v3
//  Aliquote UFFICIALI Canton Ticino 2026, tutte le tabelle
//  (A/B/C/H vecchi frontalieri · R/S/T/U nuovi frontalieri, 0-9 figli).
//  Motore condiviso in ../engine/motore.mjs, validato su busta paga reale.
//  Detrazioni IRPEF italiane incluse (lavoro dipendente, coniuge, figli 21+).
//  Non costituisce consulenza fiscale.
// ─────────────────────────────────────────────────────────────

const FMT_CHF = new Intl.NumberFormat("it-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
const FMT_EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fchf = (v) => FMT_CHF.format(Math.round(v));
const feur = (v) => FMT_EUR.format(Math.round(v));

const FAMIGLIE = [
  { id: "celibe", label: "Celibe / nubile" },
  { id: "coniugato_unico", label: "Coniugato, unico reddito" },
  { id: "coniugato_doppio", label: "Coniugato, doppio reddito" },
  { id: "monoparentale", label: "Monoparentale" },
];

export default function CalcolatoreNetto() {
  const [lordoMensile, setLordoMensile] = useState(5500);
  const [mensilita, setMensilita] = useState(13);
  const [banda, setBanda] = useState(1);
  const [regime, setRegime] = useState("nuovo");
  const [famiglia, setFamiglia] = useState("celibe");
  const [figli, setFigli] = useState(0);
  const [cambio, setCambio] = useState(1.07);
  // sezione "da busta paga" (opzionale)
  const [lppMensile, setLppMensile] = useState("");
  const [altrePctIn, setAltrePctIn] = useState("");
  // lato Italia (solo nuovi frontalieri)
  const [coniugeACarico, setConiugeACarico] = useState(false);
  const [figliMaggiorenni, setFigliMaggiorenni] = useState(0);

  const figliEffettivi = famiglia === "monoparentale" ? Math.max(figli, 1) : figli;
  const lettera = TABELLE_FAMIGLIA[regime][famiglia];

  const r = useMemo(() => calcolaNetto({
    lordoMensile, mensilita, bandaLpp: banda, regime, cambio, dati,
    famiglia, figli: figliEffettivi,
    ...(lppMensile !== "" && Number(lppMensile) > 0 ? { lppMensile: Number(lppMensile) } : {}),
    ...(altrePctIn !== "" && Number(altrePctIn) > 0 ? { altrePct: Number(altrePctIn) / 100 } : {}),
    coniugeACarico,
    figliMaggiorenni,
  }), [lordoMensile, mensilita, banda, regime, cambio, famiglia, figliEffettivi, lppMensile, altrePctIn, coniugeACarico, figliMaggiorenni]);

  const segments = [
    { key: "Contributi sociali CH", value: r.sociali, color: "#8A94A6", note: "AVS · AD · AINP · LPP" + (r.altre > 0 ? " · CCL" : "") },
    { key: "Imposta alla fonte CH", value: r.fonte, color: "#C22F2F", note: `tab. ${r.lettera}${figliEffettivi} · ${r.aliquota}%` },
    ...(regime === "nuovo"
      ? [{ key: "Saldo imposte Italia", value: r.saldoItaliaEur / cambio, color: "#1B4FA0", note: "IRPEF netta + addizionali − credito" }]
      : []),
  ];

  const inputCls = "w-full rounded-lg border px-3 py-2 text-right font-semibold focus:outline-none focus:ring-2";
  const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide";

  return (
    <div className="min-h-screen" style={{ background: "#F4F6F9", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap');
        .num { font-family: 'Space Grotesk', system-ui, sans-serif; font-variant-numeric: tabular-nums; }
        input[type=range]{ accent-color:#16233A; }
        @media (prefers-reduced-motion: reduce){ *{ transition:none !important; } }
      `}</style>

      <div className="mx-auto max-w-md px-4 pb-10 pt-6">
        <header className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#C22F2F" }}>
            Aliquote ufficiali TI 2026 · tutte le tabelle · Prototipo v3
          </p>
          <h1 className="num text-2xl font-bold" style={{ color: "#16233A" }}>
            Quanto ti resta davvero
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#5B6472" }}>
            Dal lordo in franchi al netto in euro, trattenuta per trattenuta.
          </p>
        </header>

        {/* Regime */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[
            { id: "vecchio", label: "Vecchio frontaliere", sub: "ante 17.07.2023 · tab. A-H" },
            { id: "nuovo", label: "Nuovo frontaliere", sub: "doppia imposizione · tab. R-U" },
          ].map((o) => (
            <button
              key={o.id}
              onClick={() => setRegime(o.id)}
              className="rounded-xl border px-3 py-2.5 text-left transition-colors"
              style={regime === o.id
                ? { background: "#16233A", borderColor: "#16233A", color: "#fff" }
                : { background: "#fff", borderColor: "#DDE2EA", color: "#16233A" }}
            >
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-[11px] opacity-70">{o.sub}</span>
            </button>
          ))}
        </div>

        {/* Famiglia + figli */}
        <section className="mb-4 rounded-2xl border bg-white p-4" style={{ borderColor: "#DDE2EA" }}>
          <label className={labelCls} style={{ color: "#5B6472" }}>Situazione familiare</label>
          <div className="grid grid-cols-2 gap-2">
            {FAMIGLIE.map((f) => (
              <button key={f.id} onClick={() => setFamiglia(f.id)}
                className="rounded-lg border px-2 py-1.5 text-left text-xs font-semibold"
                style={famiglia === f.id
                  ? { background: "#16233A", borderColor: "#16233A", color: "#fff" }
                  : { background: "#fff", borderColor: "#DDE2EA", color: "#16233A" }}>
                {f.label}
                <span className="ml-1 opacity-60">· {TABELLE_FAMIGLIA[regime][f.id]}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label className={labelCls + " mb-0"} style={{ color: "#5B6472" }}>
              Figli a carico {famiglia === "monoparentale" && <span className="normal-case">(min 1)</span>}
            </label>
            <div className="flex items-center gap-3">
              <button onClick={() => setFigli(Math.max(figli - 1, 0))} aria-label="meno figli"
                className="num h-8 w-8 rounded-lg border font-bold" style={{ borderColor: "#DDE2EA", color: "#16233A" }}>−</button>
              <span className="num w-6 text-center text-lg font-bold" style={{ color: "#16233A" }}>{figliEffettivi}</span>
              <button onClick={() => setFigli(Math.min(figli + 1, 9))} aria-label="più figli"
                className="num h-8 w-8 rounded-lg border font-bold" style={{ borderColor: "#DDE2EA", color: "#16233A" }}>+</button>
            </div>
          </div>
        </section>

        {/* Input principali */}
        <section className="rounded-2xl border bg-white p-4" style={{ borderColor: "#DDE2EA" }}>
          <label className={labelCls} style={{ color: "#5B6472" }}>
            Salario mensile soggetto (CHF) <span className="normal-case">— senza spese/rimborsi</span>
          </label>
          <input
            type="number"
            className={inputCls + " num text-lg"}
            style={{ borderColor: "#DDE2EA", color: "#16233A" }}
            value={lordoMensile}
            min={0}
            onChange={(e) => setLordoMensile(Number(e.target.value) || 0)}
          />
          <input
            type="range" min={3000} max={12000} step={100} value={Math.min(lordoMensile, 12000)}
            onChange={(e) => setLordoMensile(Number(e.target.value))}
            className="mt-2 w-full"
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "#5B6472" }}>Mensilità</label>
              <div className="flex gap-2">
                {[12, 13].map((m) => (
                  <button key={m} onClick={() => setMensilita(m)}
                    className="num flex-1 rounded-lg border py-1.5 text-sm font-semibold"
                    style={mensilita === m
                      ? { background: "#16233A", borderColor: "#16233A", color: "#fff" }
                      : { background: "#fff", borderColor: "#DDE2EA", color: "#16233A" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls} style={{ color: "#5B6472" }}>Età (per LPP)</label>
              <select
                className="w-full rounded-lg border px-2 py-1.5 text-sm font-semibold"
                style={{ borderColor: "#DDE2EA", color: "#16233A", background: "#fff" }}
                value={banda}
                onChange={(e) => setBanda(Number(e.target.value))}
              >
                {LPP_BANDS.map((b, i) => (
                  <option key={b.label} value={i}>{b.label} anni</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "#5B6472" }}>Aliquota fonte</label>
              <div className="num rounded-lg border px-3 py-2 text-right text-sm font-bold"
                style={{ borderColor: "#DDE2EA", color: "#C22F2F", background: "#FBF6F6" }}>
                {r.aliquota}%
              </div>
              <p className="mt-0.5 text-[10px]" style={{ color: "#8A94A6" }}>
                tabella {r.lettera}{figliEffettivi} ufficiale 2026
              </p>
            </div>
            <div>
              <label className={labelCls} style={{ color: "#5B6472" }}>Cambio CHF→EUR</label>
              <input
                type="number" step="0.005"
                className={inputCls + " num"}
                style={{ borderColor: "#DDE2EA", color: "#16233A" }}
                value={cambio}
                onChange={(e) => setCambio(Number(e.target.value) || 1)}
              />
              <p className="mt-0.5 text-[10px]" style={{ color: "#8A94A6" }}>nell'app: tasso live + alert</p>
            </div>
          </div>

          {/* Da busta paga (opzionale) */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold" style={{ color: "#5B6472" }}>
              Precisione da busta paga (opzionale)
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} style={{ color: "#5B6472" }}>LPP mensile (CHF)</label>
                <input type="number" placeholder="stima per età" className={inputCls + " num text-sm"}
                  style={{ borderColor: "#DDE2EA", color: "#16233A" }}
                  value={lppMensile} onChange={(e) => setLppMensile(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "#5B6472" }}>Altre trattenute %</label>
                <input type="number" step="0.01" placeholder="es. IGM+CCL 1.17" className={inputCls + " num text-sm"}
                  style={{ borderColor: "#DDE2EA", color: "#16233A" }}
                  value={altrePctIn} onChange={(e) => setAltrePctIn(e.target.value)} />
              </div>
            </div>
            {regime === "nuovo" && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: "#5B6472" }}>
                  <input type="checkbox" checked={coniugeACarico} onChange={(e) => setConiugeACarico(e.target.checked)} />
                  Coniuge a carico (IT)
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: "#5B6472" }}>
                  Figli 21+ a carico
                  <input type="number" min={0} max={9} className="num w-14 rounded-lg border px-2 py-1 text-right"
                    style={{ borderColor: "#DDE2EA", color: "#16233A" }}
                    value={figliMaggiorenni} onChange={(e) => setFigliMaggiorenni(Math.max(0, Math.min(9, Number(e.target.value) || 0)))} />
                </label>
              </div>
            )}
          </details>
        </section>

        {/* Risultato */}
        <section className="mt-4 overflow-hidden rounded-2xl" style={{ background: "#16233A" }}>
          <div className="px-5 pb-4 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#9FB3D9" }}>
              Netto mensile stimato
            </p>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="num text-4xl font-bold text-white">{feur(r.nettoMensileEur)}</span>
              <span className="num text-base font-semibold" style={{ color: "#9FB3D9" }}>
                {fchf(r.nettoMensileChf)}
              </span>
            </div>
            <p className="mt-1 text-xs" style={{ color: "#9FB3D9" }}>
              su 12 mesi · pressione complessiva {(r.pressione * 100).toFixed(1)}%
            </p>
          </div>
        </section>

        {/* Cascata */}
        <section className="mt-4 rounded-2xl border bg-white p-4" style={{ borderColor: "#DDE2EA" }}>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "#16233A" }}>
            La cascata delle trattenute (annuo)
          </h2>

          <Row label="Lordo annuo" value={fchf(r.lordoAnnuo)} bar={1} color="#16233A" bold />
          {segments.map((s) => (
            <Row key={s.key} label={s.key} note={s.note} value={"− " + fchf(s.value)}
              bar={s.value / r.lordoAnnuo} color={s.color} />
          ))}

          <div className="my-3 flex items-center gap-2">
            <div className="h-px flex-1 border-t border-dashed" style={{ borderColor: "#C22F2F" }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#C22F2F" }}>
              confine · ×{cambio.toFixed(3)}
            </span>
            <div className="h-px flex-1 border-t border-dashed" style={{ borderColor: "#1B4FA0" }} />
          </div>

          <Row label="Netto annuo" value={feur(r.nettoAnnuoChf * cambio)}
            bar={r.nettoAnnuoChf / r.lordoAnnuo} color="#1E7F4F" bold />

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold" style={{ color: "#5B6472" }}>
              Dettaglio voci
            </summary>
            <ul className="mt-2 space-y-1 text-xs" style={{ color: "#5B6472" }}>
              <li className="flex justify-between"><span>AVS / AI / IPG (5,3%)</span><span className="num">{fchf(r.avs)}</span></li>
              <li className="flex justify-between"><span>Disoccupazione AD (1,1%)</span><span className="num">{fchf(r.ad)}</span></li>
              <li className="flex justify-between"><span>Infortuni AINP</span><span className="num">{fchf(r.ainp)}</span></li>
              <li className="flex justify-between"><span>LPP quota dipendente{lppMensile !== "" && Number(lppMensile) > 0 ? " (da busta)" : ` (${(LPP_BANDS[banda].rate * 100).toFixed(0)}% / 2)`}</span><span className="num">{fchf(r.lpp)}</span></li>
              {r.altre > 0 && (
                <li className="flex justify-between"><span>Altre trattenute (IGM, CCL, ...)</span><span className="num">{fchf(r.altre)}</span></li>
              )}
              <li className="flex justify-between"><span>Imposta alla fonte ({r.aliquota}% · tab. {r.lettera}{figliEffettivi})</span><span className="num">{fchf(r.fonte)}</span></li>
              {regime === "nuovo" && (
                <>
                  <li className="mt-1 flex justify-between border-t pt-1" style={{ borderColor: "#EEF1F5" }}>
                    <span>Imponibile Italia (dopo franchigia €10k)</span><span className="num">{feur(r.imponibileItEur)}</span>
                  </li>
                  <li className="flex justify-between"><span>IRPEF lorda</span><span className="num">{feur(r.irpefLordaEur)}</span></li>
                  <li className="flex justify-between"><span>Detrazioni (lav. dip.{coniugeACarico ? ", coniuge" : ""}{figliMaggiorenni > 0 ? ", figli 21+" : ""})</span><span className="num">− {feur(r.detrazioniEur)}</span></li>
                  <li className="flex justify-between"><span>Addizionali stimate (1,7%)</span><span className="num">{feur(r.addizionaliEur)}</span></li>
                  <li className="flex justify-between"><span>Credito d'imposta svizzera</span><span className="num">− {feur(r.creditoEur)}</span></li>
                  <li className="flex justify-between font-semibold" style={{ color: "#1B4FA0" }}>
                    <span>Saldo dichiarazione Italia</span><span className="num">{feur(r.saldoItaliaEur)}</span>
                  </li>
                </>
              )}
            </ul>
          </details>
        </section>

        <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "#8A94A6" }}>
          Aliquote alla fonte: tabelle ufficiali del Canton Ticino, edizione 2026 (A/B/C/H vecchi frontalieri,
          R/S/T/U nuovi; la riduzione all'80% è già inclusa nelle tabelle R-U). Motore validato su busta paga
          reale. Detrazioni IRPEF: lavoro dipendente, ulteriore detrazione, coniuge e figli 21+ a carico;
          non incluse detrazioni per oneri. Non costituisce consulenza fiscale.
        </p>
      </div>
    </div>
  );
}

function Row({ label, note, value, bar, color, bold }) {
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between">
        <span className={"text-xs " + (bold ? "font-semibold" : "")} style={{ color: bold ? "#16233A" : "#5B6472" }}>
          {label}
          {note && <span className="ml-1 text-[10px]" style={{ color: "#8A94A6" }}>· {note}</span>}
        </span>
        <span className={"num text-sm " + (bold ? "font-bold" : "font-semibold")} style={{ color: bold ? "#16233A" : color }}>
          {value}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#EEF1F5" }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: Math.max(bar * 100, 1.5) + "%", background: color }} />
      </div>
    </div>
  );
}
