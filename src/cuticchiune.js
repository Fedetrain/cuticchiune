// CUTICCHIUNE — il motore puro.
//
// Nessuna rete, nessun timer, nessun DOM: solo lo stato di una MANO, quello
// di una PARTITA, e le funzioni che li fanno avanzare. Il server (stanza.js)
// lo chiama, i bot lo interrogano, i test lo martellano. Ogni regola vive qui
// e solo qui.
//
// Il gioco in due righe: quattro giocatori, ognuno per sé, 10 carte a testa.
// Si risponde al seme se si può. Vince la presa la carta più forte del seme di
// apertura. A fine mano PERDE chi ha preso più punti — ma chi non ha preso
// nemmeno una volta perde a prescindere. Chi perde prende una «singa».
// La partita finisce a 10 singhe, o quando due giocatori arrivano a 5.
//
// Posti: 0,1,2,3 in senso antiorario. «A destra di X» è il posto (X+1)%4.

import { mazzoNuovo, mescola, semeDi, forzaDi, puntiDi, carta } from './mazzo.js';

export const N = 4;
export const CARTE_A_TESTA = 10;
export const SINGHE_PARTITA = 10;   // un giocatore a 10 singhe: finita
export const SINGHE_COPPIA = 5;     // due giocatori a 5 singhe: finita

export function prossimo(posto) { return (posto + 1) % N; }

// ────────────────────────────── LA MANO ──────────────────────────────

/**
 * Nuova mano: 10 carte a testa, nessun tallone.
 * `apre`: chi gioca la prima carta. Se è null, apre chi ha il 5 di denari
 * (regola della prima mano della partita).
 */
export function nuovaMano({ apre = null, rnd = Math.random } = {}) {
  const mazzo = mescola(mazzoNuovo(), rnd);
  const mani = [[], [], [], []];
  for (let i = 0; i < mazzo.length; i++) mani[i % N].push(mazzo[i]);
  if (apre === null) apre = mani.findIndex(h => h.includes(carta('D', 5)));
  return {
    mani,
    tavolo: [],                 // [{posto, carta}] nell'ordine in cui sono state giocate
    semeApertura: null,
    apre,                       // chi ha aperto la presa corrente
    turno: apre,
    prese: [[], [], [], []],    // carte prese da ciascun posto
    nPrese: [0, 0, 0, 0],       // quante prese ha fatto ciascuno
    numeroPresa: 0,             // prese chiuse (0..10)
    ultimaPresa: null,          // {carte, vincitore, punti}
    storico: [],
    finita: false,
    apertaDa: apre,             // chi ha aperto la mano (per il diario)
  };
}

export function puntiPresiDa(m, posto) {
  return m.prese[posto].reduce((s, c) => s + puntiDi(c), 0);
}

/**
 * Le carte che `posto` può giocare adesso. Obbligo di seme: se ha il seme
 * d'apertura deve rispondere; altrimenti tutto.
 */
export function mosseValide(m, posto) {
  if (m.finita || m.turno !== posto) return [];
  const mano = m.mani[posto];
  if (!m.semeApertura) return mano.slice();
  const delSeme = mano.filter(c => semeDi(c) === m.semeApertura);
  return delSeme.length ? delSeme : mano.slice();
}

/** Chi vince: la carta più forte fra quelle del seme d'apertura. Le altre non contano mai. */
export function vincitorePresa(carte, semeApertura) {
  let migliore = null;
  for (const c of carte) {
    if (semeDi(c.carta) !== semeApertura) continue;
    if (!migliore || forzaDi(c.carta) > forzaDi(migliore.carta)) migliore = c;
  }
  return migliore.posto;
}

export function puntiPresa(carte) {
  return carte.reduce((s, c) => s + puntiDi(c.carta), 0);
}

/**
 * Gioca una carta. Muta `m`. Ritorna {ok, errore?} e, quando la presa si
 * chiude, `presa`; quando la mano finisce, `fine` (vedi risultatoMano).
 */
export function gioca(m, posto, c) {
  if (m.finita) return { ok: false, errore: 'La mano è finita' };
  if (m.turno !== posto) return { ok: false, errore: 'Non tocca a te' };
  if (!m.mani[posto].includes(c)) return { ok: false, errore: 'Non hai questa carta' };
  if (!mosseValide(m, posto).includes(c)) return { ok: false, errore: 'Devi rispondere al seme' };

  m.mani[posto].splice(m.mani[posto].indexOf(c), 1);
  m.tavolo.push({ posto, carta: c });
  if (m.tavolo.length === 1) m.semeApertura = semeDi(c);
  const esito = { ok: true, posto, carta: c };

  if (m.tavolo.length < N) {
    m.turno = prossimo(posto);
    return esito;
  }

  const vincitore = vincitorePresa(m.tavolo, m.semeApertura);
  const punti = puntiPresa(m.tavolo);
  const carte = m.tavolo.slice();
  m.prese[vincitore].push(...carte.map(x => x.carta));
  m.nPrese[vincitore]++;
  m.ultimaPresa = { carte, vincitore, punti };
  m.storico.push({ carte, vincitore, punti });
  m.numeroPresa++;
  m.tavolo = [];
  m.semeApertura = null;
  m.apre = vincitore;
  m.turno = vincitore;
  esito.presa = { carte, vincitore, punti };

  if (m.mani.every(h => h.length === 0)) {
    m.finita = true;
    m.turno = -1;
    esito.fine = risultatoMano(m);
  }
  return esito;
}

/**
 * Il verdetto della mano.
 *   - se qualcuno non ha preso nemmeno una volta: perdono loro, tutti;
 *   - altrimenti perde chi ha più punti; a pari merito perdono tutti i pari.
 * `motivo` dice perché, così l'interfaccia lo può raccontare.
 */
export function risultatoMano(m) {
  const punti = [0, 1, 2, 3].map(p => puntiPresiDa(m, p));
  const aZero = [0, 1, 2, 3].filter(p => m.nPrese[p] === 0);
  if (aZero.length) {
    return { punti, nPrese: m.nPrese.slice(), perdenti: aZero, motivo: 'zero-prese' };
  }
  const max = Math.max(...punti);
  const perdenti = [0, 1, 2, 3].filter(p => punti[p] === max);
  return { punti, nPrese: m.nPrese.slice(), perdenti, motivo: perdenti.length > 1 ? 'pareggio' : 'piu-punti' };
}

export function preseRimaste(m) { return CARTE_A_TESTA - m.numeroPresa; }

/** La vista di un giocatore: la sua mano in chiaro, le altre come conteggi. */
export function vistaMano(m, posto) {
  return {
    mano: posto >= 0 && posto < N ? m.mani[posto].slice() : [],
    valide: posto >= 0 && posto < N ? mosseValide(m, posto) : [],
    conteggi: m.mani.map(h => h.length),
    tavolo: m.tavolo.slice(),
    semeApertura: m.semeApertura,
    apre: m.apre,
    turno: m.turno,
    numeroPresa: m.numeroPresa,
    ultimaPresa: m.ultimaPresa,
    nPrese: m.nPrese.slice(),
    punti: [0, 1, 2, 3].map(p => puntiPresiDa(m, p)),
    finita: m.finita,
  };
}

// ───────────────────────────── LA PARTITA ─────────────────────────────

export function nuovaPartita() {
  return {
    singhe: [0, 0, 0, 0],
    mani: [],            // una voce per mano: {punti, perdenti, motivo, apertaDa}
    finita: false,
    esito: null,         // vedi controllaFine
    prossimoApre: null,  // null = chi ha il 5 di denari (prima mano)
  };
}

/**
 * Chi apre la mano successiva.
 *   - un solo perdente → apre lui;
 *   - due o più → apre il giocatore «di mano»: chi sta a destra di chi non ha
 *     perso. Se i non-perdenti sono due, il riferimento è il migliore della
 *     mano (meno punti; a parità meno prese; a parità il primo dopo chi ha
 *     aperto) — è l'unica scelta che rende la regola sempre applicabile.
 */
export function chiApreDopo(risultato, m) {
  const { perdenti, punti, nPrese } = risultato;
  if (perdenti.length === 1) return perdenti[0];
  const salvi = [0, 1, 2, 3].filter(p => !perdenti.includes(p));
  if (salvi.length === 0) return prossimo(m.apertaDa);   // tutti a pari merito: si gira
  const ordine = salvi.slice().sort((a, b) =>
    punti[a] - punti[b] || nPrese[a] - nPrese[b] || ((a - m.apertaDa + N) % N) - ((b - m.apertaDa + N) % N));
  return prossimo(ordine[0]);
}

/**
 * Applica il verdetto di una mano alla partita: aggiorna singhe, decide se è
 * finita e chi apre dopo. Ritorna l'esito di partita (o null se continua).
 *
 * Ordine dei controlli (dalla specifica):
 *   1. due o più giocatori arrivano a 5 singhe IN QUESTA MANO → la partita
 *      finisce per loro; chi era già oltre le 5 «esce franco»;
 *   2. altrimenti, se due giocatori (chi arriva ora + chi c'era già) sono a
 *      5 o più → finisce, perdono entrambi;
 *   3. altrimenti, chi tocca le 10 singhe perde da solo.
 */
export function applicaMano(p, risultato, m) {
  const prima = p.singhe.slice();
  for (const q of risultato.perdenti) p.singhe[q]++;
  p.mani.push({ punti: risultato.punti, nPrese: risultato.nPrese, perdenti: risultato.perdenti, motivo: risultato.motivo, apertaDa: m.apertaDa });
  p.prossimoApre = chiApreDopo(risultato, m);
  p.esito = controllaFine(prima, p.singhe);
  if (p.esito) p.finita = true;
  return p.esito;
}

export function controllaFine(prima, dopo) {
  const arrivatiA5 = [0, 1, 2, 3].filter(q => prima[q] < SINGHE_COPPIA && dopo[q] >= SINGHE_COPPIA);
  const giaOltre = [0, 1, 2, 3].filter(q => prima[q] >= SINGHE_COPPIA);
  if (arrivatiA5.length >= 2) {
    return { motivo: 'coppia-a-5', perdenti: arrivatiA5, franchi: giaOltre, singhe: dopo.slice() };
  }
  const a5 = [0, 1, 2, 3].filter(q => dopo[q] >= SINGHE_COPPIA);
  if (a5.length >= 2) {
    return { motivo: 'coppia-a-5', perdenti: a5, franchi: [], singhe: dopo.slice() };
  }
  const a10 = [0, 1, 2, 3].filter(q => dopo[q] >= SINGHE_PARTITA);
  if (a10.length) {
    return { motivo: 'dieci-singhe', perdenti: a10, franchi: [], singhe: dopo.slice() };
  }
  return null;
}

/** Classifica finale: chi si è salvato in testa (meno singhe), i perdenti in coda. */
export function classifica(p) {
  const esito = p.esito || { perdenti: [] };
  return [0, 1, 2, 3]
    .map(q => ({ posto: q, singhe: p.singhe[q], perde: esito.perdenti.includes(q), franco: (esito.franchi || []).includes(q) }))
    .sort((a, b) => (a.perde - b.perde) || (a.singhe - b.singhe) || (a.posto - b.posto));
}
