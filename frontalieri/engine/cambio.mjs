// Tasso di cambio CHF→EUR live, con fallback tra due API gratuite senza chiave.
// Da usare nell'app con cache locale (il tasso BCE si aggiorna una volta al giorno,
// ~16:00 CET nei giorni feriali) e valore manuale come ultima risorsa.
//
// Endpoint verificati il 2026-08-05:
// - frankfurter è migrato da api.frankfurter.app (ora 301) a api.frankfurter.dev
// - exchangerate.host ora richiede API key → sostituito con open.er-api.com

const FONTI = [
  {
    nome: "frankfurter.dev (BCE)",
    url: "https://api.frankfurter.dev/v1/latest?base=CHF&symbols=EUR",
    estrai: (json) => ({ tasso: json?.rates?.EUR, data: json?.date }),
  },
  {
    nome: "open.er-api.com",
    url: "https://open.er-api.com/v6/latest/CHF",
    estrai: (json) => ({
      tasso: json?.rates?.EUR,
      data: json?.time_last_update_utc?.slice(0, 16),
    }),
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
      const { tasso, data } = estrai(await res.json());
      if (typeof tasso === "number" && tasso > 0.5 && tasso < 2) {
        return { tasso, fonte: nome, data: data ?? null };
      }
      throw new Error(`tasso non plausibile: ${tasso}`);
    } catch (e) {
      errori.push(`${nome}: ${e.message}`);
    }
  }
  throw new Error("Nessuna fonte cambio disponibile — " + errori.join("; "));
}
