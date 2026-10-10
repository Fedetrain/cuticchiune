// BRISCOLA — il motore puro, bot compreso.
//
// Come cuticchiune.js: niente rete, niente timer, niente DOM, stato solo
// JSON. Lo usano la stanza, i bot e i test attraverso il contratto dei giochi
// (vedi src/giochi/index.js).
//
// Le regole tradizionali, in poche righe. Si gioca in due, o in quattro a
// coppie fisse (0+2 contro 1+3). Tre carte a testa; la carta dopo si scopre:
// e' la BRISCOLA, il suo seme comanda, e lei va sotto il mazzo, ultima a
// essere pescata. Si gioca una carta a testa, senza obbligo di rispondere al
// seme. Prende la briscola piu' alta, se ce n'e' una; se no la carta piu'
// alta del seme di chi ha aperto. Chi prende pesca per primo, poi gli altri
// in ordine, e apre la presa dopo. Finito il mazzo si giocano le carte
// rimaste. La mano la vince chi fa piu' di 60 punti su 120; 60 pari e' patta.
//
// Forza e punti NON sono quelli di mazzo.js, che sono del Cuticchiune: qui
// l'asso e il tre sono i «carichi» (11 e 10 punti) e il due e' la carta piu'
// povera. Stanno in questo file e solo qui.
//
// Posti in senso antiorario: a destra di X c'e' (X+1)%n, e si gioca in quel
// verso. Il primo a giocare sta a destra del mazziere; il mazziere gira a
// destra a ogni mano.

import { mazzoNuovo, mescola, semeDi, valoreDi, SEMI } from '../mazzo.js';

/** Forza per valore: asso, tre, re, cavallo, donna, 7, 6, 5, 4, 2. */
const FORZA = { 1: 10, 3: 9, 10: 8, 9: 7, 8: 6, 7: 5, 6: 4, 5: 3, 4: 2, 2: 1 };
/** Punti per valore: i carichi (asso 11, tre 10) e le figure (4, 3, 2). */
const PUNTI = { 1: 11, 3: 10, 10: 4, 9: 3, 8: 2 };

export const forzaDi = (c) => FORZA[valoreDi(c)];
export const puntiDi = (c) => PUNTI[valoreDi(c)] || 0;
export const PUNTI_MANO = 120;
export const META = 60;
export const IN_MANO = 3;
/** Un carico e' un asso o un tre: da solo vale una presa di figure. */
export const carico = (c) => puntiDi(c) >= 10;

function lati(n) { return n === 4 ? [[0, 2], [1, 3]] : Array.from({ length: n }, (_, i) => [i]); }
function latoDi(m, posto) { return m.lati.findIndex(l => l.includes(posto)); }
function cartaDi(mossa) { return typeof mossa === 'string' ? mossa : mossa?.carta; }

// ────────────────────────────── LA PRESA ──────────────────────────────

/**
 * Chi prende: si parte dalla carta di chi apre e si guarda chi la batte.
 * Una carta batte la migliore fin li' se e' dello stesso seme e piu' forte,
 * oppure se e' briscola e la migliore non lo e'. Una carta di un terzo seme
 * non batte mai niente.
 */
export function vincitorePresa(carte, semeBriscola) {
  let migliore = carte[0];
  for (const c of carte.slice(1)) {
    const stessoSeme = semeDi(c.carta) === semeDi(migliore.carta);
    if (stessoSeme ? forzaDi(c.carta) > forzaDi(migliore.carta) : semeDi(c.carta) === semeBriscola) migliore = c;
  }
  return migliore.posto;
}

export function puntiPresa(carte) { return carte.reduce((s, c) => s + puntiDi(c.carta), 0); }

// ────────────────────────────── LA MANO ──────────────────────────────

/**
 * Nuova mano: tre carte a testa a partire da destra del mazziere, poi si
 * scopre la briscola e la si mette sotto il mazzo. Il tallone si pesca dalla
 * testa; la briscola e' l'ultima carta, e se la prende l'ultimo a pescare.
 * `mazzo` (facoltativo, per i test): le 40 carte nell'ordine in cui si danno.
 */
export function nuovaMano(partita, { rnd = Math.random, mazzo = null } = {}) {
  const n = partita.n;
  const carte = mazzo ? mazzo.slice() : mescola(mazzoNuovo(), rnd);
  const mani = Array.from({ length: n }, () => []);
  for (let giro = 0; giro < IN_MANO; giro++) {
    for (let i = 1; i <= n; i++) mani[(partita.mazziere + i) % n].push(carte.shift());
  }
  const briscola = carte.shift();
  const apre = (partita.mazziere + 1) % n;
  return {
    n,
    lati: lati(n),
    mazziere: partita.mazziere,
    mani,
    tallone: [...carte, briscola],   // la briscola sta sotto: e' l'ultima
    briscola,
    semeBriscola: semeDi(briscola),
    tavolo: [],                      // [{posto, carta}] nell'ordine in cui sono calate
    apre,                            // chi ha aperto la presa corrente
    turno: apre,
    prese: Array.from({ length: n }, () => []),   // carte prese, per posto
    nPrese: Array(n).fill(0),
    numeroPresa: 0,
    ultimaPresa: null,               // {carte, vincitore, punti}
    storico: [],
    finita: false,
  };
}

/** Senza obbligo di seme: chi e' di turno gioca qualunque carta abbia. */
export function mosseValide(m, posto) {
  if (m.finita || m.turno !== posto) return [];
  return m.mani[posto].map(carta => ({ carta }));
}

export function puntiLati(m) {
  return m.lati.map(posti => posti.reduce((s, p) => s + m.prese[p].reduce((t, c) => t + puntiDi(c), 0), 0));
}

/**
 * Gioca una carta. Muta `m`. Quando la presa si chiude: `presa`, e
 * `pescato` se dopo si e' pescato dal mazzo. A fine mano: `fine`.
 */
export function gioca(m, posto, mossa) {
  const c = cartaDi(mossa);
  if (m.finita) return { ok: false, errore: 'La mano è finita. Aspetta le carte della prossima.' };
  if (m.turno !== posto) return { ok: false, errore: 'Non tocca a te. Gioca quando la tua targa diventa gialla.' };
  if (typeof c !== 'string' || !m.mani[posto].includes(c)) return { ok: false, errore: 'Questa carta non è nella tua mano. Gioca una delle tue.' };

  m.mani[posto].splice(m.mani[posto].indexOf(c), 1);
  m.tavolo.push({ posto, carta: c });
  const esito = { ok: true, posto, carta: c };
  if (m.tavolo.length < m.n) {
    m.turno = (posto + 1) % m.n;
    return esito;
  }

  const carte = m.tavolo.slice();
  const vincitore = vincitorePresa(carte, m.semeBriscola);
  const punti = puntiPresa(carte);
  m.prese[vincitore].push(...carte.map(x => x.carta));
  m.nPrese[vincitore]++;
  m.ultimaPresa = { carte, vincitore, punti };
  m.storico.push({ carte, vincitore, punti });
  m.numeroPresa++;
  m.tavolo = [];
  m.apre = vincitore;
  m.turno = vincitore;
  esito.presa = { carte, vincitore, punti };

  // si pesca: prima chi ha preso, poi gli altri in ordine. Il tallone ha
  // sempre un numero di carte multiplo dei giocatori (34 in due, 28 in
  // quattro), quindi o pescano tutti o nessuno.
  if (m.tallone.length) {
    for (let i = 0; i < m.n; i++) m.mani[(vincitore + i) % m.n].push(m.tallone.shift());
    esito.pescato = true;
  }

  if (m.mani.every(h => h.length === 0)) {
    m.finita = true;
    m.turno = -1;
    esito.fine = risultatoMano(m);
  }
  return esito;
}

/** Il verdetto: chi passa i 60 punti vince la mano; 60 pari e' patta (vincitore null). */
export function risultatoMano(m) {
  const punti = puntiLati(m);
  const vincitore = punti.findIndex(p => p > META);
  return { lati: m.lati.map(l => l.slice()), punti, nPrese: m.nPrese.slice(), vincitore: vincitore >= 0 ? vincitore : null };
}

/**
 * Quello che vede `posto`: la sua mano in chiaro, delle altre solo quante
 * carte sono. La briscola si vede sempre, anche dopo che qualcuno l'ha
 * pescata: e' stata scoperta, la sanno tutti. I punti presi si contano a
 * mente, come al tavolo vero, a meno che il tavolo non li voglia in chiaro.
 */
export function vista(m, posto, partita) {
  const mio = Number.isInteger(posto) && posto >= 0 && posto < m.n;
  const inChiaro = m.finita || !!partita?.opzioni?.puntiInChiaro;
  return {
    mano: mio ? m.mani[posto].slice() : [],
    valide: mio ? mosseValide(m, posto) : [],
    conteggi: m.mani.map(h => h.length),
    tavolo: m.tavolo.slice(),
    semeApertura: m.tavolo.length ? semeDi(m.tavolo[0].carta) : null,
    apre: m.apre,
    turno: m.turno,
    numeroPresa: m.numeroPresa,
    ultimaPresa: m.ultimaPresa,
    nPrese: m.nPrese.slice(),
    punti: inChiaro ? puntiLati(m) : null,
    briscola: m.briscola,
    semeBriscola: m.semeBriscola,
    mazzo: m.tallone.length,
    mazziere: m.mazziere,
    finita: m.finita,
    lati: m.lati.map(l => l.slice()),
    maniVinte: partita ? partita.maniVinte.slice() : null,
  };
}

// ───────────────────────────── LA PARTITA ─────────────────────────────

const OPZIONI = {
  // a quante mani vinte finisce la partita; le patte non contano
  maniVittoria: { serie: 2, valori: [1, 2, 3], etichetta: 'Mani vinte per vincere la partita' },
  puntiInChiaro: { serie: false, valori: [false, true], etichetta: 'Punti presi in chiaro durante la mano' },
};

export function nuovaPartita({ n = 2, opzioni = {} } = {}) {
  if (n !== 2 && n !== 4) throw new Error(`Briscola: si gioca in 2 o in 4, non in ${n}`);
  const scelte = {};
  for (const [k, o] of Object.entries(OPZIONI)) scelte[k] = o.valori.includes(opzioni[k]) ? opzioni[k] : o.serie;
  return {
    n,
    opzioni: scelte,
    lati: lati(n),
    maniVinte: lati(n).map(() => 0),
    patte: 0,
    // alla prima mano distribuisce l'ultimo posto: cosi' apre il posto 0,
    // che e' chi ha aperto il tavolo
    mazziere: n - 1,
    mani: [],            // una voce per mano: {punti, vincitore, mazziere}
    finita: false,
    esito: null,
  };
}

/** Conta la mano, passa il mazzo a destra, decide se la partita e' finita. */
export function applicaMano(p, m) {
  const r = risultatoMano(m);
  if (r.vincitore === null) p.patte++;
  else p.maniVinte[r.vincitore]++;
  p.mani.push({ punti: r.punti, vincitore: r.vincitore, mazziere: m.mazziere });
  p.mazziere = (m.mazziere + 1) % p.n;
  const vince = p.maniVinte.findIndex(v => v >= p.opzioni.maniVittoria);
  if (vince < 0) return null;
  p.finita = true;
  p.esito = { vincitore: vince, maniVinte: p.maniVinte.slice(), patte: p.patte };
  return p.esito;
}

export function classifica(p) {
  return p.lati
    .map((posti, lato) => ({ lato, posti: posti.slice(), punti: p.maniVinte[lato], vince: p.finita && p.esito?.vincitore === lato }))
    .sort((a, b) => b.punti - a.punti || a.lato - b.lato);
}

/** Per il pannello di fine mano: le prese giocate e il conto delle mani. */
export function riepilogo(m, p) {
  return { storico: m.storico, maniVinte: p.maniVinte.slice(), patte: p.patte, briscola: m.briscola, prossimoMazziere: p.mazziere };
}

// ─────────────────────────────── IL BOT ───────────────────────────────
//
// Semplice ma non stupido. Le regole che segue, in ordine:
//   · non spreca briscole e carichi su prese senza punti;
//   · se l'avversario ha messo punti, prende: col seme se puo' (gratis), con
//     la briscola piu' bassa che basta se no;
//   · a quattro, se il compagno sta gia' prendendo non lo supera: gli passa
//     punti se e' l'ultimo a giocare, se no butta una carta liscia;
//   · quando apre, apre con la carta che costa meno.
// Guarda solo quello che vede un giocatore vero. Deterministico a parita' di
// stato: i test lo possono prevedere.

/** Quanto costa dare via una carta: i punti, poi l'essere briscola, poi la forza. */
function costo(m, c) { return puntiDi(c) * 10 + (semeDi(c) === m.semeBriscola ? 60 : 0) + forzaDi(c); }
const piuEconomica = (m, carte) => carte.slice().sort((a, b) => costo(m, a) - costo(m, b))[0];

export function bot(m, posto) {
  const valide = mosseValide(m, posto).map(x => x.carta);
  if (valide.length <= 1) return valide.length ? { carta: valide[0] } : null;
  const br = (c) => semeDi(c) === m.semeBriscola;

  // ── apro io: la carta che costa meno (un liscio; mai un carico se c'e' altro)
  if (m.tavolo.length === 0) return { carta: piuEconomica(m, valide) };

  const chiPrende = vincitorePresa(m.tavolo, m.semeBriscola);
  const ultimo = m.tavolo.length === m.n - 1;
  const compagno = m.n === 4 && latoDi(m, chiPrende) === latoDi(m, posto);
  const inPalio = puntiPresa(m.tavolo);
  const vinceCon = (c) => vincitorePresa([...m.tavolo, { posto, carta: c }], m.semeBriscola) === posto;
  const vincenti = valide.filter(vinceCon);
  const perdenti = valide.filter(c => !vinceCon(c));

  // ── il compagno sta prendendo: non lo supero
  if (compagno) {
    const nonSupera = perdenti.length ? perdenti : valide;
    if (ultimo) {
      // la presa e' nostra: ci metto i punti che posso, ma non una briscola
      const lisce = nonSupera.filter(c => !br(c));
      if (lisce.length) return { carta: lisce.slice().sort((a, b) => puntiDi(b) - puntiDi(a) || forzaDi(a) - forzaDi(b))[0] };
    }
    return { carta: piuEconomica(m, nonSupera) };
  }

  // ── sta prendendo un avversario
  // col seme si prende gratis: la carta resta mia e i punti pure. Da ultimo
  // anche col carico (nessuno puo' piu' tagliare); prima solo se in tavola
  // c'e' un carico da portare a casa, perche' dopo puo' arrivare una briscola.
  const colSeme = vincenti.filter(c => !br(c));
  if (colSeme.length && (ultimo || inPalio > 0)) {
    const sicure = ultimo || inPalio >= 10 ? colSeme : colSeme.filter(c => !carico(c));
    if (sicure.length) {
      return { carta: ultimo ? sicure.slice().sort((a, b) => puntiDi(b) - puntiDi(a) || forzaDi(a) - forzaDi(b))[0] : piuEconomica(m, sicure) };
    }
  }
  // con la briscola si prende solo se ne vale la pena: un carico in tavola
  // vale anche la briscola alta, delle figure valgono una briscola liscia
  const briscole = vincenti.filter(br);
  if (briscole.length && inPalio > 0) {
    const lisce = briscole.filter(c => !carico(c));
    if (inPalio >= 10) return { carta: piuEconomica(m, briscole) };
    if (lisce.length && inPalio >= 3) return { carta: piuEconomica(m, lisce) };
  }
  // non prendo: butto la carta che costa meno
  if (perdenti.length) return { carta: piuEconomica(m, perdenti) };
  return { carta: piuEconomica(m, valide) };
}

// ───────────────────────────── IL CONTRATTO ─────────────────────────────

export default {
  id: 'briscola',
  nome: 'Briscola',
  famiglia: 'prese',
  posti: [2, 4],
  squadre: (n) => (n === 4 ? [[0, 2], [1, 3]] : null),
  opzioni: OPZIONI,
  nuovaPartita,
  nuovaMano,
  mosseValide,
  gioca,
  vista,
  applicaMano,
  classifica,
  riepilogo,
  bot,
};

/** I nomi dei semi servono al pannello e alle regole: «briscola a Coppe». */
export const nomeSeme = (id) => SEMI.find(s => s.id === id)?.nome;
