// SCOPA e SCOPONE SCIENTIFICO — il motore puro, bot compreso.
//
// Come cuticchiune.js: niente rete, niente timer, niente DOM, stato solo
// JSON. Server e client lo usano attraverso il contratto dei giochi: due
// oggetti, `scopa` e `scopone`, che condividono tutte le regole e cambiano
// solo nella distribuzione (vedi REGOLE). Ogni regola vive qui e solo qui.
//
// Il gioco in tre righe: si gioca una carta. Se in tavola c'e' una carta di
// pari valore si deve prendere quella; se no, una combinazione che fa la
// somma; se no, la carta resta in tavola. Chi svuota il tavolo fa scopa.
// A fine mano contano carte, denari, settebello, primiera e scope.
//
// Posti in senso antiorario: a destra di X c'e' (X+1)%n, e si gioca in quel
// verso. Il primo a giocare sta a destra del mazziere; il mazziere gira a
// destra a ogni mano.
//
// Valori di presa: asso 1 ... sette 7, donna 8, cavallo 9, re 10, cioe'
// proprio `valoreDi` di mazzo.js. Forza e punti di mazzo.js sono del
// Cuticchiune e qui non si usano.
//
// Varianti NON fatte (possibili aggiunte, ognuna come opzione della partita):
//   - scopone classico: 9 carte a testa e 4 in tavola;
//   - napola: asso, due e tre di denari presi insieme danno punti in piu';
//   - re bello: il re di denari vale un punto, come il settebello;
//   - asso piglia tutto e scopa d'assi: varianti in cui l'asso prende tutto
//     il tavolo (cambia se e quando vale scopa).

import { mazzoNuovo, mescola, semeDi, valoreDi, nomeDi } from '../mazzo.js';

export const SETTEBELLO = 'D7';
const RE = 10;

/** Valori di primiera, per valore di carta. Il sette e' la carta regina. */
export const PRIMIERA = { 1: 16, 2: 12, 3: 13, 4: 14, 5: 15, 6: 18, 7: 21, 8: 10, 9: 10, 10: 10 };

/** Le due distribuzioni. Tutto il resto (prese, scope, conti) e' uguale. */
const REGOLE = {
  // 3 carte a testa e 4 scoperte; finite le carte se ne danno altre 3
  scopa:   { carteATesta: 3,  inTavola: 4 },
  // tutte le 40 carte subito, tavolo vuoto, nessuna ridistribuzione
  scopone: { carteATesta: 10, inTavola: 0 },
};

const TUTTE = mazzoNuovo();
const SEMI_ID = ['D', 'C', 'S', 'B'];

export function prossimo(posto, n) { return (posto + 1) % n; }

function latoDi(m, posto) { return m.lati.findIndex(l => l.includes(posto)); }

// ────────────────────────────── LE PRESE ──────────────────────────────

/** Tutti i sottoinsiemi di `tavolo` che sommano esattamente `somma`.
 *  I valori sono tutti positivi, quindi si pota appena si supera. */
function combinazioni(tavolo, somma) {
  const trovate = [];
  const scelte = [];
  (function cerca(da, resto) {
    if (resto === 0) { trovate.push(scelte.slice()); return; }
    for (let i = da; i < tavolo.length; i++) {
      const v = valoreDi(tavolo[i]);
      if (v > resto) continue;
      scelte.push(tavolo[i]);
      cerca(i + 1, resto - v);
      scelte.pop();
    }
  })(0, somma);
  return trovate;
}

/**
 * Le prese che `carta` puo' fare su `tavolo`, ognuna come elenco di carte.
 *   - se c'e' una carta di pari valore si DEVE prendere una di quelle, una
 *     sola: la somma non e' ammessa al suo posto;
 *   - se no si DEVE prendere una delle combinazioni che fanno la somma;
 *   - [] vuol dire che la carta resta in tavola.
 * Con piu' carte di pari valore, o piu' combinazioni, sceglie chi gioca.
 */
export function presePossibili(tavolo, carta) {
  const v = valoreDi(carta);
  const pari = tavolo.filter(c => valoreDi(c) === v);
  if (pari.length) return pari.map(c => [c]);
  // senza carte pari ogni combinazione ha almeno due carte
  return combinazioni(tavolo, v);
}

/** Le mosse di `posto` adesso: una per ogni (carta, presa) ammessa. */
function mosseValide(m, posto) {
  if (m.finita || posto !== m.turno) return [];
  const mosse = [];
  for (const carta of m.mani[posto]) {
    const prese = presePossibili(m.tavolo, carta);
    if (!prese.length) mosse.push({ carta, presa: [] });
    for (const presa of prese) mosse.push({ carta, presa });
  }
  return mosse;
}

/** Le prese si confrontano come insiemi: l'ordine delle carte non conta. */
function stessoInsieme(a, b) {
  return Array.isArray(b) && a.length === b.length && a.slice().sort().join() === b.slice().sort().join();
}

// ─────────────────────── I TESTI PER CHI GIOCA ───────────────────────

/** «il Sette di Coppe», «l'Asso di Spade», «la Donna di Bastoni». */
function ilNome(c) {
  const nome = nomeDi(c);
  if (valoreDi(c) === 1) return `l'${nome}`;
  if (valoreDi(c) === 8) return `la ${nome}`;
  return `il ${nome}`;
}
function maiuscola(s) { return s[0].toUpperCase() + s.slice(1); }
function elenco(carte) {
  const nomi = carte.map(ilNome);
  return nomi.length === 1 ? nomi[0] : `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`;
}

/** Perche' la presa indicata non va, e cosa fare. Chiamata solo quando
 *  la presa non corrisponde a nessuna delle `possibili` con quella carta. */
function spiegaPresa(m, carta, presa, possibili) {
  if (!Array.isArray(presa) || presa.some(c => typeof c !== 'string')) {
    return 'La presa non è un elenco di carte. Indica le carte da prendere, oppure un elenco vuoto per lasciare la carta in tavola.';
  }
  const fuori = presa.find(c => !m.tavolo.includes(c));
  if (fuori) return `${maiuscola(ilNome(fuori))} non è in tavola. Prendi solo carte che sono in tavola.`;
  if (new Set(presa).size !== presa.length) return 'Hai indicato due volte la stessa carta. Indica ogni carta una volta sola.';
  const v = valoreDi(carta);
  if (possibili.length === 1 && possibili[0].presa.length === 0) {
    return `Con ${ilNome(carta)} non si prende niente: in tavola nessuna carta e nessuna somma fa ${v}. Gioca la carta senza prendere.`;
  }
  if (presa.length === 0) {
    const come = possibili.length === 1 ? `Prendi ${elenco(possibili[0].presa)}.` : 'Scegli quali carte prendere.';
    return `Con ${ilNome(carta)} devi prendere, perché in tavola c'è una presa da ${v}. ${come}`;
  }
  const pari = m.tavolo.filter(c => valoreDi(c) === v);
  if (pari.length === 1) {
    return `In tavola c'è una carta di pari valore, quindi con ${ilNome(carta)} si prende solo quella. Prendi ${ilNome(pari[0])}.`;
  }
  if (pari.length > 1) {
    return `In tavola ci sono ${pari.length} carte di pari valore, quindi con ${ilNome(carta)} se ne prende una sola. Prendi ${pari.map(ilNome).join(' oppure ')}.`;
  }
  const somma = presa.reduce((s, c) => s + valoreDi(c), 0);
  if (somma !== v) return `Le carte scelte sommano ${somma}, ma ${ilNome(carta)} vale ${v}. Scegli carte che sommano ${v}.`;
  return 'Questa presa non è fra quelle ammesse. Scegli una delle prese proposte.';
}

// ────────────────────────────── LA MANO ──────────────────────────────

/** Da' `carteATesta` carte a ognuno, a partire da chi sta a destra del mazziere. */
function daiCarte(m) {
  const { carteATesta } = REGOLE[m.gioco];
  for (let i = 1; i <= m.n; i++) {
    const posto = (m.mazziere + i) % m.n;
    m.mani[posto].push(...m.mazzo.splice(0, carteATesta));
  }
}

/**
 * Nuova mano. Il mazziere lo tiene la partita; alla prima mano (mazziere
 * null) si sceglie con `rnd`, o e' il posto 0 se rnd non c'e'.
 * `mazzo` (facoltativo, per i test): le 40 carte in ordine, date dalla
 * prima: prima le mani, a gruppi, da destra del mazziere; poi il tavolo.
 * Se in tavola escono tre o quattro re si rimescola tutto con `rnd`.
 */
function nuovaMano(id, partita, { rnd, mazzo } = {}) {
  const n = partita.n;
  const mazziere = partita.mazziere ?? (rnd ? Math.floor(rnd() * n) : 0);
  if (mazzo && !stessoInsieme(TUTTE, mazzo)) throw new Error('nuovaMano: il mazzo deve avere le 40 carte, ognuna una volta');
  const m = {
    gioco: id,
    n,
    lati: partita.lati.map(l => l.slice()),
    mazziere,
    turno: prossimo(mazziere, n),
    mazzo: [],
    mani: [],
    tavolo: [],
    prese: partita.lati.map(() => []),   // carte prese, per lato
    scope: partita.lati.map(() => 0),    // scope fatte, per lato
    ultimoAPrendere: null,               // posto: a lui le carte rimaste a fine mano
    ultimaMossa: null,
    storico: [],                         // tutte le mosse: sono pubbliche
    rimescolate: 0,                      // quante volte sono usciti tre re in tavola
    restanti: null,                      // { posto, carte } a fine mano, se ne restavano
    finita: false,
    risultato: null,                     // RisultatoMano, a fine mano
  };
  let carte = mazzo ? mazzo.slice() : mescola(TUTTE, rnd ?? Math.random);
  for (;;) {
    m.mazzo = carte;
    m.mani = Array.from({ length: n }, () => []);
    daiCarte(m);
    m.tavolo = m.mazzo.splice(0, REGOLE[id].inTavola);
    // un re si prende solo con un altro re (nessuna somma arriva oltre 10):
    // con tre o quattro re in tavola almeno due resterebbero li' fino in
    // fondo e nessuno potrebbe piu' fare scopa. Per questo si rimescola e si ridà.
    if (m.tavolo.filter(c => valoreDi(c) === RE).length < 3) break;
    m.rimescolate++;
    carte = mescola(TUTTE, rnd ?? Math.random);
  }
  return m;
}

/**
 * Gioca una mossa. Muta `m`. Accetta `{ carta }` senza presa se con quella
 * carta c'e' una sola mossa; se ce n'e' piu' d'una risponde con le `scelte`.
 */
function gioca(m, posto, mossa) {
  if (m.finita) return { ok: false, errore: 'La mano è finita. Aspetta le carte della prossima mano.' };
  if (posto !== m.turno) return { ok: false, errore: 'Non è il tuo turno. Gioca quando tocca a te.' };
  const carta = mossa && mossa.carta;
  if (typeof carta !== 'string') return { ok: false, errore: 'Non hai indicato la carta da giocare. Scegli una carta della tua mano.' };
  if (!m.mani[posto].includes(carta)) return { ok: false, errore: `${maiuscola(ilNome(carta))} non è nella tua mano. Gioca una delle tue carte.` };

  const possibili = mosseValide(m, posto).filter(x => x.carta === carta);
  let scelta;
  if (mossa.presa == null) {
    if (possibili.length > 1) {
      return { ok: false, errore: `Con ${ilNome(carta)} puoi prendere in ${possibili.length} modi. Scegli quali carte prendere.`, scelte: possibili };
    }
    scelta = possibili[0];
  } else {
    scelta = possibili.find(x => stessoInsieme(x.presa, mossa.presa));
    if (!scelta) return { ok: false, errore: spiegaPresa(m, carta, mossa.presa, possibili) };
  }
  return applica(m, posto, scelta);
}

/** Esegue una mossa gia' controllata. */
function applica(m, posto, { carta, presa }) {
  const lato = latoDi(m, posto);
  m.mani[posto].splice(m.mani[posto].indexOf(carta), 1);
  const ultimaGiocata = m.mazzo.length === 0 && m.mani.every(h => h.length === 0);

  let scopa = false;
  if (presa.length) {
    m.tavolo = m.tavolo.filter(c => !presa.includes(c));
    m.prese[lato].push(carta, ...presa);
    m.ultimoAPrendere = posto;
    // L'ultima carta della mano non fa mai scopa: il tavolo andrebbe
    // comunque a chi ha preso per ultimo. Una scopa all'ultima carta di un
    // giro, con il mazzo ancora pieno, invece vale.
    scopa = m.tavolo.length === 0 && !ultimaGiocata;
    if (scopa) m.scope[lato]++;
  } else {
    m.tavolo.push(carta);
  }

  m.ultimaMossa = { posto, carta, presa: presa.slice(), scopa };
  m.storico.push({ posto, carta, presa: presa.slice(), scopa });
  // dopo una ridistribuzione tocca comunque a destra di chi ha giocato: l'ultimo
  // del giro e' sempre il mazziere, e il nuovo giro riparte alla sua destra
  m.turno = prossimo(posto, m.n);
  const esito = { ok: true, posto, carta, presa: presa.slice(), scopa, ridistribuito: false };

  if (m.mani.some(h => h.length)) return esito;
  if (m.mazzo.length) {
    daiCarte(m);           // in tavola non si aggiunge niente
    esito.ridistribuito = true;
    return esito;
  }

  // Fine mano: le carte rimaste vanno a chi ha preso per ultimo (non e'
  // scopa). Con 40 carte qualcuno prende per forza: la seconda carta di un
  // valore che arriva in tavola deve prendere la prima. Il mazziere e' solo
  // una rete di sicurezza.
  if (m.tavolo.length) {
    const chi = m.ultimoAPrendere ?? m.mazziere;
    m.restanti = { posto: chi, carte: m.tavolo.slice() };
    m.prese[latoDi(m, chi)].push(...m.tavolo);
    m.tavolo = [];
    esito.restanti = { posto: chi, carte: m.restanti.carte.slice() };
  }
  m.finita = true;
  m.turno = -1;
  m.risultato = risultatoMano(m);
  esito.fine = m.risultato;
  return esito;
}

/** Il lato che ha da solo il valore piu' alto, o null se in testa sono pari. */
function unicoMassimo(valori) {
  const max = Math.max(...valori);
  const primi = valori.flatMap((v, i) => (v === max ? [i] : []));
  return primi.length === 1 ? primi[0] : null;
}

/** Primiera: per ogni seme la carta di primiera piu' alta; un seme che manca vale 0. */
export function valorePrimiera(carte) {
  let totale = 0;
  for (const s of SEMI_ID) {
    const delSeme = carte.filter(c => semeDi(c) === s).map(c => PRIMIERA[valoreDi(c)]);
    totale += delSeme.length ? Math.max(...delSeme) : 0;
  }
  return totale;
}

/**
 * Il conto della mano, per lato. Legge solo `lati`, `prese` e `scope`.
 * Carte e denari: il punto va a chi ne ha di piu', a pari nessuno. Con due
 * lati e' proprio «piu' di 20» e «piu' di 5»; scritto cosi' resta giusto
 * anche con piu' lati (la scopa a tre, se mai si aggiungesse, conta cosi').
 */
export function risultatoMano(m) {
  const carte = m.prese.map(p => p.length);
  const denari = m.prese.map(p => p.filter(c => semeDi(c) === 'D').length);
  const chiSette = m.prese.findIndex(p => p.includes(SETTEBELLO));
  const settebello = chiSette >= 0 ? chiSette : null;
  const primiera = m.prese.map(valorePrimiera);
  const scope = m.scope.slice();
  const assegnati = {
    carte: unicoMassimo(carte),
    denari: unicoMassimo(denari),
    settebello,
    primiera: unicoMassimo(primiera),
  };
  const puntiMano = m.lati.map((_, lato) =>
    scope[lato] + Object.values(assegnati).filter(x => x === lato).length);
  return { lati: m.lati.map(l => l.slice()), voci: { carte, denari, settebello, primiera, scope }, assegnati, puntiMano };
}

/**
 * Quello che vede `posto`: la sua mano in chiaro, le altre come conteggi,
 * il mazzo come numero. Le prese si mostrano: sono tutte carte passate
 * scoperte dal tavolo. Posto -1 = spettatore.
 * Oltre al contratto: `restanti` e `risultato`, per chi rientra a mano finita.
 * `partita` non serve: i punti della partita li da' `classifica`.
 */
function vista(m, posto) {
  const mio = Number.isInteger(posto) && posto >= 0 && posto < m.n;
  return {
    mano: mio ? m.mani[posto].slice() : [],
    valide: mio ? mosseValide(m, posto) : [],
    conteggi: m.mani.map(h => h.length),
    tavolo: m.tavolo.slice(),
    mazzo: m.mazzo.length,
    mazziere: m.mazziere,
    turno: m.turno,
    prese: m.prese.map(p => p.slice()),
    scope: m.scope.slice(),
    ultimaMossa: m.ultimaMossa ? { ...m.ultimaMossa, presa: m.ultimaMossa.presa.slice() } : null,
    finita: m.finita,
    lati: m.lati.map(l => l.slice()),
    restanti: m.restanti,
    risultato: m.risultato,
  };
}

// ───────────────────────────── LA PARTITA ─────────────────────────────

const PUNTI_VITTORIA = { serie: 11, valori: [11, 21] };

function nuovaPartita(gioco, { n, opzioni = {} } = {}) {
  n = n ?? gioco.posti[0];
  if (!gioco.posti.includes(n)) throw new Error(`${gioco.nome}: si gioca in ${gioco.posti.join(' o ')}, non in ${n}`);
  // un traguardo fuori elenco non e' un errore di chi gioca: si usa quello di serie
  const traguardo = PUNTI_VITTORIA.valori.includes(opzioni.puntiVittoria) ? opzioni.puntiVittoria : PUNTI_VITTORIA.serie;
  const lati = gioco.squadre(n) ?? Array.from({ length: n }, (_, i) => [i]);
  return {
    gioco: gioco.id,
    n,
    opzioni: { puntiVittoria: traguardo },
    lati,
    punti: lati.map(() => 0),
    mazziere: null,      // null = alla prima mano lo sceglie nuovaMano
    mani: [],            // una voce per mano: { mazziere, puntiMano, scope }
    finita: false,
    esito: null,         // EsitoPartita
  };
}

/**
 * Somma i punti della mano, passa il mazzo a destra e decide la fine: se
 * almeno un lato ha raggiunto il traguardo vince chi ha piu' punti; se i
 * primi sono pari si gioca un'altra mano.
 */
function applicaMano(partita, mano) {
  if (!mano.finita) throw new Error('applicaMano: la mano non è ancora finita');
  if (partita.finita) throw new Error('applicaMano: la partita è già finita');
  const r = mano.risultato ?? risultatoMano(mano);
  r.puntiMano.forEach((p, lato) => { partita.punti[lato] += p; });
  partita.mani.push({ mazziere: mano.mazziere, puntiMano: r.puntiMano.slice(), scope: r.voci.scope.slice() });
  partita.mazziere = prossimo(mano.mazziere, partita.n);
  if (Math.max(...partita.punti) < partita.opzioni.puntiVittoria) return null;
  const vincitore = unicoMassimo(partita.punti);
  if (vincitore === null) return null;
  partita.finita = true;
  partita.esito = { vincitore, punti: partita.punti.slice() };
  return partita.esito;
}

/** Classifica: piu' punti in testa; a pari punti l'ordine dei lati. */
function classifica(partita) {
  return partita.lati
    .map((posti, lato) => ({ lato, posti: posti.slice(), punti: partita.punti[lato], vince: partita.finita && partita.esito.vincitore === lato }))
    .sort((a, b) => b.punti - a.punti || a.lato - b.lato);
}

// ─────────────────────────────── IL BOT ───────────────────────────────
//
// Valuta ogni mossa valida con un punteggio e gioca la migliore; a pari
// punteggio decide `rnd` (senza rnd, la prima). Guarda solo quello che un
// giocatore vero vede: la sua mano, il tavolo, le prese, quante carte hanno
// gli altri e quante ne restano nel mazzo.
//
//   guadagno: scopa, e il pregio delle carte che porta a casa;
//   rischio:  cosa lascia in tavola a chi gioca dopo (sempre un avversario,
//             anche a quattro): una somma fino a 10 e' una scopa servita, e
//             le carte buone esposte si possono prendere col pari. La
//             probabilita' che l'avversario abbia il valore giusto si stima
//             sulle carte non ancora viste.

/** Una scopa e' un punto secco: l'unita' di misura del bot. */
const SCOPA_VALE = 15;

/** Quanto vale portarsi a casa una carta, in quindicesimi di punto circa. */
function pregio(c) {
  const v = valoreDi(c);
  let p = 1;                              // ogni carta conta per le carte
  if (semeDi(c) === 'D') p += 2;          // denari
  if (c === SETTEBELLO) p += 15;          // un punto da solo
  if (v === 7) p += 4;                    // primiera
  else if (v === 6) p += 2;
  else if (v === 1) p += 1;
  return p;
}

/** Probabilita' che una mano di `h` carte, pescata fra `ignote`, ne contenga
 *  almeno una delle `k` che servono. */
function probabilita(k, ignote, h) {
  if (k <= 0 || h <= 0) return 0;
  let nessuna = 1;
  for (let i = 0; i < h && i < ignote; i++) nessuna *= Math.max(0, ignote - k - i) / (ignote - i);
  return 1 - nessuna;
}

function bot(m, posto, rnd) {
  const mosse = mosseValide(m, posto);
  if (mosse.length <= 1) return mosse[0] ?? null;

  // le carte che il bot non ha visto: in mano agli altri o nel mazzo
  const viste = new Set([...m.mani[posto], ...m.tavolo, ...m.prese.flat()]);
  const ignotePerValore = Array(11).fill(0);
  let ignote = 0;
  for (const c of TUTTE) if (!viste.has(c)) { ignotePerValore[valoreDi(c)]++; ignote++; }

  // chi gioca dopo di me: quante carte avra' in mano
  const restano = m.mani.reduce((s, h) => s + h.length, 0) - 1;
  const ultimaGiocata = restano === 0 && m.mazzo.length === 0;
  const carteDopo = restano > 0 ? m.mani[prossimo(posto, m.n)].length
    : (m.mazzo.length ? REGOLE[m.gioco].carteATesta : 0);
  const ceLHa = v => probabilita(ignotePerValore[v], ignote, carteDopo);

  function rischio(tavolo) {
    if (!tavolo.length || ultimaGiocata) return 0;
    let r = 0;
    const somma = tavolo.reduce((s, c) => s + valoreDi(c), 0);
    // con una sola carta la scopa e' col pari; con piu' carte nessuna puo'
    // valere la somma, quindi chi ha quel valore e' obbligato a prenderle tutte
    if (somma <= 10) r += ceLHa(somma) * (SCOPA_VALE + tavolo.reduce((s, c) => s + pregio(c), 0));
    for (const c of tavolo) r += ceLHa(valoreDi(c)) * pregio(c) * 0.5;
    return r;
  }

  const punteggi = mosse.map(({ carta, presa }) => {
    let s = 0;
    let dopo;
    if (presa.length) {
      dopo = m.tavolo.filter(c => !presa.includes(c));
      if (!dopo.length && !ultimaGiocata) s += SCOPA_VALE;
      for (const c of [carta, ...presa]) s += pregio(c);
    } else {
      dopo = [...m.tavolo, carta];
      s -= pregio(carta) * 0.3;     // un sette o un denaro calato e' un regalo possibile
    }
    return s - rischio(dopo);
  });

  const migliore = Math.max(...punteggi);
  const pari = mosse.filter((_, i) => punteggi[i] >= migliore - 1e-9);
  return pari.length === 1 || !rnd ? pari[0] : pari[Math.floor(rnd() * pari.length)];
}

// ───────────────────────────── IL CONTRATTO ─────────────────────────────

function creaGioco({ id, nome, posti, squadre }) {
  const gioco = {
    id,
    nome,
    posti,
    squadre,
    opzioni: { puntiVittoria: { serie: PUNTI_VITTORIA.serie, valori: PUNTI_VITTORIA.valori.slice() } },
    nuovaPartita: (arg) => nuovaPartita(gioco, arg),
    nuovaMano: (partita, arg) => nuovaMano(id, partita, arg),
    mosseValide,
    gioca,
    vista,
    applicaMano,
    classifica,
    bot,
  };
  return gioco;
}

/** Scopa: in due ognuno per se', in quattro a coppie fisse 0+2 contro 1+3. */
export const scopa = creaGioco({
  id: 'scopa',
  nome: 'Scopa',
  posti: [2, 4],
  squadre: n => (n === 4 ? [[0, 2], [1, 3]] : null),
});

/** Scopone scientifico: sempre in quattro, a coppie fisse. */
export const scopone = creaGioco({
  id: 'scopone',
  nome: 'Scopone scientifico',
  posti: [4],
  squadre: () => [[0, 2], [1, 3]],
});

export default scopa;
