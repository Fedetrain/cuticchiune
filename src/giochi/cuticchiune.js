// CUTICCHIUNE dentro il contratto dei giochi — un adattatore sottile.
//
// Le regole stanno in src/cuticchiune.js e il bot in src/bot.js, com'erano:
// tools/test-cuticchiune.mjs le martella da li' e qui non si tocca niente.
// Questo file traduce soltanto: le mosse diventano { carta }, la vista
// nasconde i punti se il tavolo li vuole a mente, la classifica parla di
// «lati» come tutti gli altri giochi (al Cuticchiune ognuno e' un lato).

import * as C from '../cuticchiune.js';
import { scegli } from '../bot.js';

const OPZIONI = {
  // i punti si contano a mente: e' meta' del gioco. Chi vuole il tabellone
  // lo accende dalle opzioni del tavolo.
  puntiInChiaro: { serie: false, valori: [false, true], etichetta: 'Punti presi in chiaro durante la mano' },
};

function cartaDi(mossa) { return typeof mossa === 'string' ? mossa : mossa?.carta; }

export default {
  id: 'cuticchiune',
  nome: 'Cuticchiune',
  famiglia: 'prese',
  posti: [4],
  squadre: () => null,
  opzioni: OPZIONI,

  nuovaPartita({ n = 4, opzioni = {} } = {}) {
    if (n !== C.N) throw new Error(`Cuticchiune: si gioca in ${C.N}, non in ${n}`);
    const p = C.nuovaPartita();
    p.opzioni = { puntiInChiaro: opzioni.puntiInChiaro === true };
    return p;
  },

  /** Apre chi dice la partita; alla prima mano chi ha il 5 di denari. */
  nuovaMano(p, { rnd = Math.random } = {}) { return C.nuovaMano({ apre: p.prossimoApre, rnd }); },

  mosseValide(m, posto) { return C.mosseValide(m, posto).map(carta => ({ carta })); },

  gioca(m, posto, mossa) {
    const c = cartaDi(mossa);
    if (typeof c !== 'string') return { ok: false, errore: 'Non hai indicato la carta. Scegline una della tua mano.' };
    return C.gioca(m, posto, c);
  },

  vista(m, posto, p) {
    const v = C.vistaMano(m, posto);
    v.valide = v.valide.map(carta => ({ carta }));
    if (!m.finita && !p?.opzioni?.puntiInChiaro) v.punti = null;
    v.singhe = p ? p.singhe.slice() : [0, 0, 0, 0];
    return v;
  },

  /** Il verdetto della mano, poi le singhe e chi apre dopo (src/cuticchiune.js). */
  applicaMano(p, m) { return C.applicaMano(p, C.risultatoMano(m), m); },

  /** I punti di un lato sono le sue singhe: meno ne hai, meglio stai. */
  classifica(p) {
    return C.classifica(p).map(r => ({
      lato: r.posto, posti: [r.posto], punti: r.singhe,
      vince: p.finita && !r.perde, singhe: r.singhe, perde: r.perde, franco: r.franco,
    }));
  },

  /** Per il pannello di fine mano: singhe dopo la mano, chi apre, le prese giocate. */
  riepilogo(m, p) {
    return { singhe: p.singhe.slice(), prossimoApre: p.prossimoApre, storico: m.storico, bonusUltima: m.bonusUltima };
  },

  bot(m, posto, rnd) { return { carta: scegli(m, posto, rnd) }; },
};
