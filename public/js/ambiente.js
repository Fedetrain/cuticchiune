// DOVE STIAMO GIRANDO — con un server dietro, o da soli su un sito statico.
//
// Il sito compilato (tools/costruisci-sito.mjs, per GitHub Pages) scrive
// window.CUTICCHIUNE_STATICO = true nella pagina. Li' non c'e' nessun /api/ e
// nessun WebSocket: il tavolo sta dentro il browser di chi lo apre. Cambia
// anche l'indirizzo del tavolo, che deve stare nel frammento (#/s/CODICE),
// perche' Pages non sa rispondere a /s/CODICE.

export const STATICO = !!globalThis.CUTICCHIUNE_STATICO;

/** L'indirizzo da mandare agli amici per questo tavolo. */
export function linkDi(codice) {
  return STATICO
    ? `${location.origin}${location.pathname}#/s/${codice}`
    : `${location.origin}/s/${codice}`;
}

/** Scrive l'indirizzo del tavolo nella barra, senza ricaricare. `null` = home. */
export function scriviUrl(codice) {
  const dove = codice ? (STATICO ? `#/s/${codice}` : `/s/${codice}`) : (STATICO ? location.pathname : '/');
  history.replaceState(null, '', dove);
}

/** Il codice del tavolo se siamo arrivati da un link, se no null. */
export function codiceDaUrl() {
  const m = (STATICO ? location.hash : location.pathname).match(/\/s\/([A-Za-z]{4})\/?$/);
  return m ? m[1].toUpperCase() : null;
}
