// IL MAZZO SICILIANO — 40 carte, quattro semi, dieci valori.
//
// I semi hanno il nome italiano e quello siciliano; il nome siciliano è quello
// che si legge sul tavolo. I valori 8, 9 e 10 sono le figure: nel mazzo
// siciliano il fante è una donna («a Donna»), poi il cavallo e il re.
//
// I PUNTI e la FORZA sono quelli del Cuticchiune (vedi README §Regole):
//   punti  — asso 3; due, tre, donna, cavallo, re 1; quattro..sette 0
//   forza  — tre > due > asso > re > cavallo > donna > 7 > 6 > 5 > 4
// L'asso vale più di tutti ma nella presa è solo terzo: è la trappola del gioco.
//
// Questo file è condiviso da server e client (ES module puro): è l'unico posto
// in cui si dice cosa vale una carta.

export const SEMI = [
  { id: 'D', nome: 'Denari',  sic: 'Oru',   colore: '#b8860b' },
  { id: 'C', nome: 'Coppe',   sic: 'Cuppi', colore: '#8b2f2f' },
  { id: 'S', nome: 'Spade',   sic: 'Spati', colore: '#2b4c7e' },
  { id: 'B', nome: 'Bastoni', sic: 'Mazzi', colore: '#4f6b2f' },
];

export const VALORI = [
  { v: 1,  nome: 'Asso',    sic: 'Assu',    punti: 3, forza: 8 },
  { v: 2,  nome: 'Due',     sic: 'Dui',     punti: 1, forza: 9 },
  { v: 3,  nome: 'Tre',     sic: 'Tri',     punti: 1, forza: 10 },
  { v: 4,  nome: 'Quattro', sic: 'Quattru', punti: 0, forza: 1 },
  { v: 5,  nome: 'Cinque',  sic: 'Cincu',   punti: 0, forza: 2 },
  { v: 6,  nome: 'Sei',     sic: 'Sei',     punti: 0, forza: 3 },
  { v: 7,  nome: 'Sette',   sic: 'Setti',   punti: 0, forza: 4 },
  { v: 8,  nome: 'Donna',   sic: 'Donna',   punti: 1, forza: 5 },
  { v: 9,  nome: 'Cavallo', sic: 'Cavaddu', punti: 1, forza: 6 },
  { v: 10, nome: 'Re',      sic: 'Re',      punti: 1, forza: 7 },
];

/** Una carta è una stringa corta, es. "D1" (asso di denari), "B10" (re di bastoni).
 *  Così viaggia in rete senza costi e si confronta con `===`. */
export function carta(seme, v) { return `${seme}${v}`; }
export function semeDi(c) { return c[0]; }
export function valoreDi(c) { return Number(c.slice(1)); }
export function puntiDi(c) { return VALORI[valoreDi(c) - 1].punti; }
export function forzaDi(c) { return VALORI[valoreDi(c) - 1].forza; }
export function infoSeme(id) { return SEMI.find(x => x.id === id); }
export function nomeDi(c) {
  const s = infoSeme(semeDi(c));
  const v = VALORI[valoreDi(c) - 1];
  return `${v.nome} di ${s.nome}`;
}
export function nomeSicDi(c) {
  const s = infoSeme(semeDi(c));
  const v = VALORI[valoreDi(c) - 1];
  return `${v.sic} di ${s.sic}`;
}

export function mazzoNuovo() {
  const m = [];
  for (const s of SEMI) for (const v of VALORI) m.push(carta(s.id, v.v));
  return m;
}

/** Fisher-Yates con un generatore iniettabile: i test passano un PRNG a seme
 *  fisso e la partita diventa riproducibile. */
export function mescola(mazzo, rnd = Math.random) {
  const m = mazzo.slice();
  for (let i = m.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [m[i], m[j]] = [m[j], m[i]];
  }
  return m;
}

/** PRNG deterministico (mulberry32) per test e partite riproducibili. */
export function prng(seme) {
  let a = seme >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Ordina una mano per seme e forza: è come la tiene in mano un giocatore vero. */
export function ordinaMano(mano) {
  const ordSeme = { D: 0, C: 1, S: 2, B: 3 };
  return mano.slice().sort((a, b) =>
    ordSeme[semeDi(a)] - ordSeme[semeDi(b)] || forzaDi(b) - forzaDi(a));
}

/** Tutti i punti del mazzo: 4 semi × (3+1+1+1+1+1). */
export const PUNTI_TOTALI = mazzoNuovo().reduce((s, c) => s + puntiDi(c), 0);
