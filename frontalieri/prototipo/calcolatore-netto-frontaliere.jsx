import { useState, useMemo } from "react";

// ─────────────────────────────────────────────────────────────
//  Calcolatore netto frontalieri IT⇄CH — v2
//  Imposta alla fonte: aliquote UFFICIALI Canton Ticino 2026
//  Tabella A (vecchi frontalieri) e Tabella R (nuovi frontalieri)
//  Fonte: Divisione delle contribuzioni TI — edizione 2026
//  Profilo: celibe/nubile senza figli (colonne 0-9 identiche).
//  Tabelle B/C/H (coniugati, figli): prossima iterazione.
// ─────────────────────────────────────────────────────────────

const FMT_CHF = new Intl.NumberFormat("it-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
const FMT_EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fchf = (v) => FMT_CHF.format(Math.round(v));
const feur = (v) => FMT_EUR.format(Math.round(v));

// Parametri LPP 2025/26 (indicativi)
const LPP = { coord: 26460, minCoord: 3675, maxCoord: 64260 };
const LPP_BANDS = [
  { label: "25–34", rate: 0.07 },
  { label: "35–44", rate: 0.10 },
  { label: "45–54", rate: 0.15 },
  { label: "55–65", rate: 0.18 },
];

// Aliquote ufficiali TI 2026 — coppie [reddito annuo max CHF, aliquota %]
// (solo i punti in cui l'aliquota cambia; sotto 19'800 l'imposta è trascurabile)
const TAB_A = [
  [19800,0.2],[20400,0.5],[21000,0.7],[21600,0.9],[22200,1.1],[22800,1.3],[23400,1.5],
  [24000,1.7],[24600,1.8],[25200,2.0],[25800,2.1],[26400,2.3],[27000,2.4],[27600,2.6],
  [28200,2.7],[28800,2.8],[29400,3.0],[30600,3.2],[31200,3.3],[32400,3.4],[33000,3.5],
  [34200,3.6],[35400,3.7],[36000,3.8],[36600,4.0],[37200,4.1],[37800,4.2],[38400,4.3],
  [39000,4.5],[39600,4.6],[40200,4.7],[40800,4.8],[41400,5.0],[42000,5.2],[42600,5.3],
  [43200,5.4],[43800,5.6],[44400,5.7],[45000,5.8],[45600,6.0],[46200,6.1],[46800,6.2],
  [47400,6.3],[48000,6.4],[48600,6.5],[49200,6.6],[49800,6.7],[50400,6.8],[51000,7.0],
  [51600,7.1],[52200,7.2],[52800,7.3],[53400,7.4],[54000,7.5],[54600,7.6],[55200,7.7],
  [55800,7.8],[56400,7.9],[57000,8.0],[57600,8.1],[58800,8.2],[59400,8.3],[60000,8.4],
  [60600,8.5],[61200,8.6],[61800,8.7],[62400,8.8],[63000,8.9],[63600,9.0],[64200,9.1],
  [65400,9.2],[66000,9.3],[66600,9.4],[67200,9.5],[67800,9.6],[69000,9.7],[70200,9.9],
  [70800,10.0],[72000,10.1],[72600,10.2],[73200,10.3],[73800,10.4],[75000,10.5],
  [75600,10.6],[76200,10.7],[76800,10.8],[78000,10.9],[78600,11.0],[79200,11.1],
  [80400,11.2],[81000,11.3],[81600,11.4],[82800,11.5],[84000,11.6],[84600,11.7],
  [85800,11.8],[86400,11.9],[87600,12.0],[88800,12.1],[89400,12.2],[90600,12.3],
  [91800,12.4],[93000,12.5],[94200,12.6],[95400,12.7],[96600,12.8],[97800,12.9],
  [99000,13.0],[100200,13.1],[101400,13.2],[102600,13.3],[103200,13.4],[104400,13.5],
  [105600,13.6],[106800,13.7],[108000,13.8],[108600,13.9],[110400,14.0],[111600,14.1],
  [112200,14.2],[113400,14.3],[114600,14.4],[115800,14.5],[117000,14.6],[117600,14.7],
  [118800,14.8],[120600,14.9],[121200,15.0],[123000,15.1],[124200,15.2],[125400,15.3],
  [126600,15.4],[127800,15.5],[129600,15.6],[130800,15.7],[132600,15.8],[133800,15.9],
  [135600,16.0],[136800,16.1],[138000,16.2],[139200,16.3],[140400,16.4],[142200,16.5],
  [142800,16.6],[144600,16.7],[145800,16.8],[147000,16.9],[148200,17.0],[150000,17.1],
  [151200,17.2],[152400,17.3],[153600,17.4],[155400,17.5],[156600,17.6],[157800,17.7],
  [159600,17.8],[161400,17.9],[162600,18.0],[164400,18.1],[165600,18.2],[167400,18.3],
  [169200,18.4],[171000,18.5],[172800,18.6],[174000,18.7],[175800,18.8],[177600,18.9],
  [178800,19.0],[180600,19.1],[181800,19.2],[183600,19.3],[185400,19.4],[187200,19.5],
  [189000,19.6],[190800,19.7],[192600,19.8],[194400,19.9],[196200,20.0],[198000,20.1],
  [199800,20.2],[9999999,20.3],
];

const TAB_R = [
  [19800,0.1],[20400,0.4],[21000,0.5],[21600,0.7],[22200,0.8],[22800,1.0],[23400,1.2],
  [24000,1.3],[24600,1.4],[25800,1.6],[26400,1.8],[27000,1.9],[27600,2.0],[28200,2.1],
  [28800,2.2],[29400,2.4],[30600,2.5],[31200,2.6],[32400,2.7],[34200,2.8],[35400,2.9],
  [36000,3.0],[37200,3.2],[37800,3.3],[38400,3.4],[39600,3.6],[40200,3.7],[40800,3.8],
  [41400,4.0],[42000,4.1],[42600,4.2],[43200,4.3],[43800,4.4],[44400,4.5],[45000,4.6],
  [46200,4.8],[46800,4.9],[47400,5.0],[48000,5.1],[49200,5.2],[49800,5.3],[50400,5.4],
  [51600,5.6],[52200,5.7],[52800,5.8],[53400,5.9],[54600,6.0],[55200,6.1],[55800,6.2],
  [56400,6.3],[57600,6.4],[58800,6.5],[59400,6.6],[60000,6.7],[61200,6.8],[61800,6.9],
  [62400,7.0],[63000,7.1],[64200,7.2],[65400,7.3],[66000,7.4],[66600,7.5],[67800,7.6],
  [69000,7.7],[70200,7.9],[72000,8.0],[72600,8.1],[73200,8.2],[73800,8.3],[75600,8.4],
  [76200,8.5],[76800,8.6],[78000,8.7],[79200,8.8],[80400,8.9],[81000,9.0],[81600,9.1],
  [84000,9.2],[84600,9.3],[85800,9.4],[86400,9.5],[88800,9.6],[89400,9.7],[90600,9.8],
  [91800,9.9],[94200,10.0],[95400,10.1],[96600,10.2],[97800,10.3],[100200,10.4],
  [101400,10.5],[102600,10.6],[103200,10.7],[105600,10.8],[106800,10.9],[108000,11.0],
  [108600,11.1],[111600,11.2],[112200,11.3],[113400,11.4],[114600,11.5],[117000,11.6],
  [117600,11.7],[118800,11.8],[120600,11.9],[123000,12.0],[124200,12.1],[125400,12.2],
  [126600,12.3],[129600,12.4],[130800,12.5],[132600,12.6],[133800,12.7],[136800,12.8],
  [138000,12.9],[139200,13.0],[140400,13.1],[142800,13.2],[144600,13.3],[145800,13.4],
  [147000,13.5],[150000,13.6],[151200,13.7],[152400,13.8],[153600,13.9],[156600,14.0],
  [157800,14.1],[159600,14.2],[161400,14.3],[164400,14.4],[165600,14.5],[167400,14.6],
  [169200,14.7],[172800,14.8],[174000,14.9],[175800,15.0],[177600,15.1],[180600,15.2],
  [181800,15.3],[183600,15.4],[185400,15.5],[189000,15.6],[190800,15.7],[192600,15.8],
  [194400,15.9],[198000,16.0],[199800,16.1],[9999999,16.2],
];

function lookupRate(table, income) {
  for (const [max, rate] of table) if (income <= max) return rate;
  return table[table.length - 1][1];
}

// IRPEF 2026 (scaglioni indicativi)
function irpef(imponibile) {
  if (imponibile <= 0) return 0;
  let tax = Math.min(imponibile, 28000) * 0.23;
  if (imponibile > 28000) tax += (Math.min(imponibile, 50000) - 28000) * 0.35;
  if (imponibile > 50000) tax += (imponibile - 50000) * 0.43;
  return tax;
}

export default function CalcolatoreNetto() {
  const [lordoMensile, setLordoMensile] = useState(5500);
  const [mensilita, setMensilita] = useState(13);
  const [banda, setBanda] = useState(1);
  const [regime, setRegime] = useState("nuovo");
  const [cambio, setCambio] = useState(1.06);

  const r = useMemo(() => {
    const lordoAnnuo = lordoMensile * mensilita;

    // Contributi sociali CH (quota dipendente)
    const avs = lordoAnnuo * 0.053;
    const ad = Math.min(lordoAnnuo, 148200) * 0.011;
    const ainp = lordoAnnuo * 0.01;
    const coordinato = Math.min(Math.max(lordoAnnuo - LPP.coord, LPP.minCoord), LPP.maxCoord);
    const lpp = (coordinato * LPP_BANDS[banda].rate) / 2;
    const sociali = avs + ad + ainp + lpp;

    // Imposta alla fonte: aliquota ufficiale TI 2026 sul lordo annuo
    const aliquota = lookupRate(regime === "nuovo" ? TAB_R : TAB_A, lordoAnnuo);
    const fonte = lordoAnnuo * (aliquota / 100);

    // Lato Italia (solo nuovi frontalieri)
    let saldoItaliaEur = 0, imponibileItEur = 0, irpefLordaEur = 0, creditoEur = 0;
    if (regime === "nuovo") {
      imponibileItEur = Math.max((lordoAnnuo - sociali) * cambio - 10000, 0);
      irpefLordaEur = irpef(imponibileItEur) + imponibileItEur * 0.017;
      creditoEur = fonte * cambio;
      saldoItaliaEur = Math.max(irpefLordaEur - creditoEur, 0);
    }

    const nettoAnnuoChf = lordoAnnuo - sociali - fonte - saldoItaliaEur / cambio;
    return {
      lordoAnnuo, avs, ad, ainp, lpp, sociali, fonte, aliquota,
      imponibileItEur, irpefLordaEur, creditoEur, saldoItaliaEur,
      nettoAnnuoChf,
      nettoMensileChf: nettoAnnuoChf / 12,
      nettoMensileEur: (nettoAnnuoChf / 12) * cambio,
      pressione: 1 - nettoAnnuoChf / lordoAnnuo,
    };
  }, [lordoMensile, mensilita, banda, regime, cambio]);

  const segments = [
    { key: "Contributi sociali CH", value: r.sociali, color: "#8A94A6", note: "AVS · AD · AINP · LPP" },
    { key: "Imposta alla fonte CH", value: r.fonte, color: "#C22F2F", note: `tab. ${regime === "nuovo" ? "R" : "A"} · ${r.aliquota}%` },
    ...(regime === "nuovo"
      ? [{ key: "Saldo IRPEF Italia", value: r.saldoItaliaEur / cambio, color: "#1B4FA0", note: "dopo credito d'imposta" }]
      : []),
  ];

  const inputCls = "w-full rounded-lg border px-3 py-2 text-right font-semibold focus:outline-none focus:ring-2";

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
            Aliquote ufficiali TI 2026 · Prototipo
          </p>
          <h1 className="num text-2xl font-bold" style={{ color: "#16233A" }}>
            Quanto ti resta davvero
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#5B6472" }}>
            Dal lordo in franchi al netto in euro, trattenuta per trattenuta.
          </p>
        </header>

        {/* Regime */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[
            { id: "vecchio", label: "Vecchio frontaliere", sub: "tabella A · ante 17.07.2023" },
            { id: "nuovo", label: "Nuovo frontaliere", sub: "tabella R · doppia imposizione" },
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

        {/* Input */}
        <section className="rounded-2xl border bg-white p-4" style={{ borderColor: "#DDE2EA" }}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "#5B6472" }}>
            Lordo mensile (CHF)
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
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "#5B6472" }}>
                Mensilità
              </label>
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
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "#5B6472" }}>
                Età (per LPP)
              </label>
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
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "#5B6472" }}>
                Aliquota fonte
              </label>
              <div className="num rounded-lg border px-3 py-2 text-right text-sm font-bold"
                style={{ borderColor: "#DDE2EA", color: "#C22F2F", background: "#FBF6F6" }}>
                {r.aliquota}%
              </div>
              <p className="mt-0.5 text-[10px]" style={{ color: "#8A94A6" }}>
                tabella {regime === "nuovo" ? "R" : "A"} ufficiale · celibe
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "#5B6472" }}>
                Cambio CHF→EUR
              </label>
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
              <li className="flex justify-between"><span>Infortuni AINP (~1%)</span><span className="num">{fchf(r.ainp)}</span></li>
              <li className="flex justify-between"><span>LPP quota dipendente ({(LPP_BANDS[banda].rate * 100).toFixed(0)}% / 2)</span><span className="num">{fchf(r.lpp)}</span></li>
              <li className="flex justify-between"><span>Imposta alla fonte ({r.aliquota}% · tab. {regime === "nuovo" ? "R" : "A"})</span><span className="num">{fchf(r.fonte)}</span></li>
              {regime === "nuovo" && (
                <>
                  <li className="mt-1 flex justify-between border-t pt-1" style={{ borderColor: "#EEF1F5" }}>
                    <span>Imponibile Italia (dopo franchigia €10k)</span><span className="num">{feur(r.imponibileItEur)}</span>
                  </li>
                  <li className="flex justify-between"><span>IRPEF + addizionali stimate</span><span className="num">{feur(r.irpefLordaEur)}</span></li>
                  <li className="flex justify-between"><span>Credito d'imposta svizzera</span><span className="num">− {feur(r.creditoEur)}</span></li>
                </>
              )}
            </ul>
          </details>
        </section>

        <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "#8A94A6" }}>
          Aliquote alla fonte: tabelle ufficiali A e R del Canton Ticino, edizione 2026 (profilo celibe/nubile
          senza figli; la riduzione all'80% per i nuovi frontalieri è già inclusa nella tabella R). Contributi
          LPP indicativi; detrazioni IRPEF personali non incluse. Non costituisce consulenza fiscale.
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
