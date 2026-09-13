// IL BOT — «u Cumpari». Gioca al posto di chi manca o di chi è caduto.
//
// Al Cuticchiune si vince non prendendo, ma chi non prende MAI perde a
// prescindere. Quindi il bot ha due stagioni: finché non ha una presa cerca
// quella più economica possibile (da ultimo, con pochi punti sul tavolo);
// dopo, scarica le carte pericolose e lascia prendere gli altri.
// Deterministico a parità di stato: i test lo possono prevedere.

import { semeDi, forzaDi, puntiDi } from './mazzo.js';
import { mosseValide, vincitorePresa, puntiPresa, preseRimaste, PUNTI_ULTIMA, N } from './cuticchiune.js';

/** Quanto è pericoloso tenersi questa carta: punti, poi forza (un tre prende, un quattro mai). */
function pericolo(c) { return puntiDi(c) * 10 + forzaDi(c); }
function piuPericolosa(carte) { return carte.slice().sort((a, b) => pericolo(b) - pericolo(a))[0]; }
function menoPericolosa(carte) { return carte.slice().sort((a, b) => pericolo(a) - pericolo(b))[0]; }
/** Fra le carte che prendono, quella che porta meno punti; a parità la più forte (me la tolgo). */
function prendiEconomica(carte) { return carte.slice().sort((a, b) => puntiDi(a) - puntiDi(b) || forzaDi(b) - forzaDi(a))[0]; }

/** Le carte di `carte` con cui, giocate adesso, si vincerebbe la presa. */
function cheVincono(m, posto, carte) {
  return carte.filter(c => vincitorePresa([...m.tavolo, { posto, carta: c }], m.semeApertura || semeDi(c)) === posto);
}

/** Le carte di un seme che il bot non ha visto: in mano agli altri, o ancora da giocare. */
function fuoriDelSeme(m, posto, seme) {
  const viste = new Set([...m.mani[posto], ...m.prese.flat(), ...m.tavolo.map(t => t.carta)]);
  const fuori = [];
  for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) if (!viste.has(`${seme}${v}`)) fuori.push(`${seme}${v}`);
  return fuori;
}

/** Una carta «imbattibile» nel suo seme: nessuna carta fuori la supera. */
function imbattibile(m, posto, c) {
  return fuoriDelSeme(m, posto, semeDi(c)).every(x => forzaDi(x) < forzaDi(c));
}

/** Le soglie, tarate a tavolino con 1500 mani bot-contro-caso (12/09/2026).
 *  `urgenza: 10` vuol dire che il bot cerca la presa di salvezza fin dalla
 *  prima carta: aspettare una presa «economica» faceva restare a zero prese
 *  una mano su tre, e a zero prese si perde sempre. Con 10 il bot perde il
 *  43% in meno di chi gioca a caso; con 4 perdeva più di lui. Le soglie di
 *  costo restano per chi vuole provare un bot più prudente. */
export const PARAMETRI = { urgenza: 10, disperazione: 2, costoUltimo: 2, costoCerta: 1, costoRischio: 4 };

export function scegli(m, posto, rnd = Math.random) {
  const valide = mosseValide(m, posto);
  if (valide.length === 1) return valide[0];
  const rimaste = preseRimaste(m);
  const hoPreso = m.nPrese[posto] > 0;
  const ultimo = m.tavolo.length === N - 1;
  // L’ultima presa porta tre punti in piu’: per il bot vale come se sul tavolo
  // ci fosse un asso in piu’, e infatti in fondo alla mano se ne guarda bene.
  const inBallo = puntiPresa(m.tavolo) + (rimaste === 1 ? PUNTI_ULTIMA : 0);
  // «mi serve una presa»: non ho preso e la mano si accorcia
  const urgenza = !hoPreso && rimaste <= PARAMETRI.urgenza;
  const disperazione = !hoPreso && rimaste <= PARAMETRI.disperazione;

  // ── apro io ──────────────────────────────────────────────────────────
  if (m.tavolo.length === 0) {
    if (urgenza) {
      // apro con una carta imbattibile: chi ha il seme è obbligato a stare sotto
      const sicure = valide.filter(c => imbattibile(m, posto, c) && fuoriDelSeme(m, posto, semeDi(c)).length >= 1);
      if (sicure.length) return prendiEconomica(sicure);
      // altrimenti la più forte del seme in cui gli altri hanno più carte
      return valide.slice().sort((a, b) =>
        forzaDi(b) - forzaDi(a) || fuoriDelSeme(m, posto, semeDi(b)).length - fuoriDelSeme(m, posto, semeDi(a)).length)[0];
    }
    // apro basso: una carta che non può prendere (4-5-6-7)
    const deboli = valide.filter(c => forzaDi(c) <= 4);
    if (deboli.length) return deboli.slice().sort((a, b) => forzaDi(a) - forzaDi(b))[0];
    return menoPericolosa(valide);
  }

  // ── rispondo ─────────────────────────────────────────────────────────
  const rispondoAlSeme = semeDi(valide[0]) === m.semeApertura;
  if (!rispondoAlSeme) return piuPericolosa(valide);       // non posso prendere: scarico

  const vincenti = cheVincono(m, posto, valide);
  const perdenti = valide.filter(c => !vincenti.includes(c));

  if (!hoPreso && vincenti.length) {
    const economica = prendiEconomica(vincenti);
    const costo = inBallo + puntiDi(economica);
    const certe = vincenti.filter(c => imbattibile(m, posto, c));
    if (urgenza) {
      // mi serve la presa: da ultimo è certa; altrimenti gioco la carta con più
      // probabilità di reggere (imbattibile se ce l'ho, sennò la più forte)
      if (ultimo) return economica;
      if (certe.length) return prendiEconomica(certe);
      if (costo <= PARAMETRI.costoRischio || disperazione) return vincenti.slice().sort((a, b) => forzaDi(b) - forzaDi(a))[0];
    } else {
      // c'è tempo: prendo solo se costa poco e la presa è sicura
      if (ultimo && costo <= PARAMETRI.costoUltimo) return economica;
      if (certe.length && inBallo + puntiDi(prendiEconomica(certe)) <= PARAMETRI.costoCerta) return prendiEconomica(certe);
    }
  }

  if (perdenti.length) return piuPericolosa(perdenti);      // posso perdere: scarico la più pericolosa che perde
  return prendiEconomica(vincenti);                          // costretto a prendere
}

/** Un giocatore che gioca a caso, per misurare quanto vale il bot. */
export function aCaso(m, posto, rnd = Math.random) {
  const v = mosseValide(m, posto);
  return v[Math.floor(rnd() * v.length)];
}

/** Nomi da paese per i posti vuoti. */
export const NOMI_BOT = ['Turi', 'Cicciu', 'Nzino', 'Vanni', 'Peppi', 'Totò', 'Sarino', 'Mimmu'];
