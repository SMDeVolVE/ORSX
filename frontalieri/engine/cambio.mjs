// Tasso di cambio CHF→EUR live, con fallback tra due API gratuite senza chiave.
// Da usare nell'app con cache locale (il tasso BCE si aggiorna una volta al giorno,
// ~16:00 CET nei giorni feriali) e valore manuale come ultima risorsa.

const FONTI = [
  {
    nome: "frankfurter.app",
    url: "https://api.frankfurter.app/latest?from=CHF&to=EUR",
    estrai: (json) => json?.rates?.EUR,
  },
  {
    nome: "exchangerate.host",
    url: "https://api.exchangerate.host/latest?base=CHF&symbols=EUR",
    estrai: (json) => json?.rates?.EUR,
  },
];

/**
 * @returns {Promise<{tasso: number, fonte: string, data: string}>}
 * @throws se nessuna fonte risponde con un tasso valido
 */
export async function fetchCambioChfEur({ timeoutMs = 8000 } = {}) {
  const errori = [];
  for (const { nome, url, estrai } of FONTI) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const tasso = estrai(json);
      if (typeof tasso === "number" && tasso > 0.5 && tasso < 2) {
        return { tasso, fonte: nome, data: json.date ?? new Date().toISOString().slice(0, 10) };
      }
      throw new Error(`tasso non plausibile: ${tasso}`);
    } catch (e) {
      errori.push(`${nome}: ${e.message}`);
    }
  }
  throw new Error("Nessuna fonte cambio disponibile — " + errori.join("; "));
}
