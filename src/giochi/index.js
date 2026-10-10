// IL REGISTRO DEI GIOCHI — quali giochi ha Appò Carte, e in che ordine.
//
// Ogni gioco e' un modulo puro in questa cartella, condiviso da server e
// client come src/mazzo.js, e risponde allo stesso contratto:
//
//   { id, nome, posti: [2, 4], squadre(n), opzioni: { chiave: { serie, valori } },
//     nuovaPartita({ n, opzioni }), nuovaMano(partita, { rnd }),
//     mosseValide(mano, posto), gioca(mano, posto, mossa), vista(mano, posto, partita),
//     applicaMano(partita, mano), classifica(partita), bot(mano, posto, rnd) }
//
// facoltativi: `famiglia` (vedi sotto), `riepilogo(mano, partita)` per il
// pannello di fine mano, `etichetta` dentro un'opzione per la lobby.
//
// La FAMIGLIA dice al client che tavolo apparecchiare:
//   'prese' — una carta a testa sul tavolo, qualcuno prende (Cuticchiune, Briscola);
//   'pesca' — carte scoperte in mezzo, si prende per valore o per somma (Scopa).
// Un gioco la puo' dichiarare da se'; se no vale quella scritta qui sotto.
//
// Un gioco nuovo e' un file in questa cartella e una riga qui.

import cuticchiune from './cuticchiune.js';
import briscola from './briscola.js';
import { scopa, scopone } from './scopa.js';

/** Il modulo com'e', piu' la famiglia se non la dice lui. */
const voce = (gioco, famiglia) => ({ famiglia, ...gioco });

export const GIOCHI = {
  cuticchiune: voce(cuticchiune, 'prese'),
  briscola: voce(briscola, 'prese'),
  scopa: voce(scopa, 'pesca'),
  scopone: voce(scopone, 'pesca'),
};

export const GIOCO_DI_SERIE = 'cuticchiune';

/** Il gioco con questo id, o quello di serie se l'id non c'e'. */
export function giocoDa(id) { return GIOCHI[id] || GIOCHI[GIOCO_DI_SERIE]; }

/** Le opzioni di serie di un gioco: { chiave: valore }. */
export function opzioniDiSerie(gioco) {
  return Object.fromEntries(Object.entries(gioco.opzioni || {}).map(([k, o]) => [k, o.serie]));
}

/** I lati: le squadre, o un lato per giocatore se ognuno gioca per se'. */
export function latiDi(gioco, n) {
  return gioco.squadre(n) ?? Array.from({ length: n }, (_, i) => [i]);
}
