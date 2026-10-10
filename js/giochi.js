// I GIOCHI VISTI DAL CLIENT — il registro (lo stesso del server) e, per ogni
// gioco, quello che serve a mostrarlo: la frase della home, le regole, i
// numeri sulle targhe, le parole dell'albo.
//
// Le regole vere stanno in src/giochi/: qui c'e' solo come si raccontano.
// Un gioco nuovo nel registro funziona anche senza una scheda qui: prende
// quella generica (nome, giocatori, punti della classifica). La scheda serve
// a farlo raccontare bene.

import { GIOCHI, GIOCO_DI_SERIE, latiDi } from '../src/giochi/index.js';

export { GIOCHI, GIOCO_DI_SERIE, latiDi };

/** Il lato (squadra o giocatore) del posto `p`, nello stato `s`. */
export function latoDi(s, p) {
  const sq = s.gioco?.squadre;
  return sq ? sq.findIndex(l => l.includes(p)) : p;
}

/**
 * Accanto a quale posto sta il mucchio delle prese di un lato (Scopa): il
 * mio, se il lato e' il mio; se no il primo del lato che gioca dopo di me. A
 * coppie le carte le tiene uno solo, come al tavolo vero.
 */
export function postoMucchio(s, lato) {
  const posti = s.gioco.squadre ? s.gioco.squadre[lato] : [lato];
  if (s.io.posto >= 0 && posti.includes(s.io.posto)) return s.io.posto;
  const n = s.posti.length, mio = Math.max(0, s.io.posto);
  return posti.slice().sort((a, b) => ((a - mio + n) % n) - ((b - mio + n) % n))[0];
}

/** Un nome di carta con l'articolo: «il Sette di Coppe», «l'Asso di Spade», «la Donna di Bastoni». */
export function conArticolo(nome) {
  if (/^Asso/.test(nome)) return `l'${nome}`;
  if (/^Donna/.test(nome)) return `la ${nome}`;
  return `il ${nome}`;
}

/** «4 giocatori», «2 o 4 giocatori», con le coppie se ci sono. */
export function quantiGiocatori(gioco) {
  const n = gioco.posti;
  const base = n.length === 1 ? `${n[0]} giocatori` : `${n.slice(0, -1).join(', ')} o ${n[n.length - 1]} giocatori`;
  if (n.length === 1 && gioco.squadre(n[0])) return `${base}, in coppia`;
  if (n.length === 1) return `${base}, ognuno per sé`;
  return base;
}

/** Come si chiama un lato per chi guarda: «tu», «voi», o i nomi. */
export function nomeLato(s, lato, { maiuscola = false } = {}) {
  const posti = s.gioco.squadre ? s.gioco.squadre[lato] : [lato];
  const mio = s.io.posto >= 0 && posti.includes(s.io.posto);
  let nome;
  if (mio) nome = posti.length === 1 ? 'tu' : 'voi';
  else nome = posti.map(p => s.posti[p]?.nome || '—').join(' e ');
  return maiuscola ? nome[0].toUpperCase() + nome.slice(1) : nome;
}

// ─────────────────────────────── le regole ───────────────────────────────

const REGOLE_CUTICCHIUNE = `
  <p><strong>Quattro giocatori, ognuno per sé.</strong> Dieci carte a testa, tutto il mazzo. Si gioca in senso antiorario. Vince la mano chi <em>non</em> prende punti. Ma chi non prende nemmeno una volta perde a prescindere.</p>
  <h3>La presa</h3>
  <p>Chi apre gioca una carta e fissa il seme. Gli altri <strong>devono rispondere allo stesso seme</strong> se ce l'hanno; se non ce l'hanno giocano quello che vogliono, ma una carta di altro seme non prende mai. Prende la carta più forte del seme d'apertura, e chi prende apre la presa dopo.</p>
  <h3>La forza, dalla più forte</h3>
  <div class="scala-forza" data-carte="D3 D2 D1 D10 D9 D8 D7 D6 D5 D4"></div>
  <p class="nota">L'asso vale tre punti ma nella presa è solo terzo: è la trappola del gioco.</p>
  <h3>I punti</h3>
  <table class="tabella">
    <tr><td>Asso</td><td class="num">3</td></tr>
    <tr><td>Due, Tre, Donna, Cavallo, Re</td><td class="num">1</td></tr>
    <tr><td>Quattro, Cinque, Sei, Sette</td><td class="num">0</td></tr>
    <tr><td><strong>Chi piglia l'ultima presa</strong></td><td class="num">+3</td></tr>
    <tr class="totale"><td>In tutto, in una mano</td><td class="num">35</td></tr>
  </table>
  <p class="nota">I punti degli altri <strong>non si vedono</strong>: si tengono a mente, ed è metà del gioco. Chi vuole il tabellone lo accende dalle opzioni del tavolo.</p>
  <h3>La singa</h3>
  <p>A fine mano si contano i punti presi. Se tutti e quattro hanno preso almeno una volta, <strong>prende una singa chi ha più punti</strong> (a pari merito, tutti i pari). Se uno o più giocatori non hanno fatto nemmeno una presa, <strong>la singa la prendono loro</strong>, a prescindere dai punti.</p>
  <h3>Chi apre</h3>
  <p>La prima mano la apre chi ha il <strong>cinque di denari</strong>. Poi: se ha perso uno solo, apre lui; se hanno perso in due o più, apre chi sta a destra di chi non ha perso.</p>
  <h3>Fine della partita</h3>
  <p>Finisce quando un giocatore arriva a <strong>10 singhe</strong>, oppure quando <strong>due giocatori arrivano a 5</strong>. In quel caso perdono quei due, e chi ne aveva già più di cinque <strong>esce franco</strong>: non conta chi ha più singhe, conta quale fine scatta per prima.</p>`;

const REGOLE_BRISCOLA = `
  <p><strong>In due, o in quattro a coppie</strong>: chi ti sta di fronte gioca con te. Tre carte a testa; la carta dopo si scopre ed è la <strong>briscola</strong>, il seme che comanda per tutta la mano. Va sotto il mazzo, e la pesca l'ultimo.</p>
  <h3>La presa</h3>
  <p>Ognuno gioca una carta, in senso antiorario. <strong>Non c'è obbligo di rispondere al seme.</strong> Prende la briscola più alta, se ce n'è una; se no la carta più alta del seme di chi ha aperto. Una carta di un terzo seme non prende mai.</p>
  <p>Dopo la presa si pesca dal mazzo: prima chi ha preso, poi gli altri in giro. Chi ha preso apre la presa dopo. Finito il mazzo si giocano le carte rimaste in mano.</p>
  <h3>La forza, dalla più forte</h3>
  <div class="scala-forza" data-carte="D1 D3 D10 D9 D8 D7 D6 D5 D4 D2"></div>
  <h3>I punti</h3>
  <table class="tabella">
    <tr><td>Asso</td><td class="num">11</td></tr>
    <tr><td>Tre</td><td class="num">10</td></tr>
    <tr><td>Re</td><td class="num">4</td></tr>
    <tr><td>Cavallo</td><td class="num">3</td></tr>
    <tr><td>Donna</td><td class="num">2</td></tr>
    <tr><td>Sette, Sei, Cinque, Quattro, Due</td><td class="num">0</td></tr>
    <tr class="totale"><td>In tutto, in una mano</td><td class="num">120</td></tr>
  </table>
  <p class="nota">Asso e tre sono i <strong>carichi</strong>. I punti presi non si vedono: si contano a mente. Chi vuole il tabellone lo accende dalle opzioni del tavolo.</p>
  <h3>La mano e la partita</h3>
  <p>Vince la mano chi fa <strong>più di 60 punti</strong>; 60 a 60 è patta e non conta. Vince la partita chi arriva per primo al numero di mani vinte scelto dal padrone di casa (di serie due).</p>
  <p>Il primo a giocare sta a destra di chi distribuisce, e chi distribuisce cambia a ogni mano.</p>`;

const SCOPA_PRESA = `
  <h3>La presa</h3>
  <p>Al tuo turno giochi una carta. Se in tavola c'è una carta <strong>dello stesso valore</strong>, prendi quella, e solo quella. Se no, prendi un gruppo di carte che insieme <strong>fanno il suo valore</strong>. Se non c'è niente da prendere, la carta resta in tavola. Quando si può prendere, si deve.</p>
  <p>I valori: asso 1, dal due al sette il numero della carta, donna 8, cavallo 9, re 10.</p>
  <p>Se con la stessa carta ci sono più prese possibili, scegli tu quale: il tavolo ti mostra le scelte.</p>
  <h3>La scopa</h3>
  <p>Chi prende tutte le carte in tavola fa <strong>scopa</strong>, e vale un punto. La carta della scopa si mette di traverso sul mucchio delle prese, così a fine mano si contano. L'ultima carta della mano non fa scopa.</p>
  <p>A fine mano le carte rimaste in tavola vanno a chi ha preso per ultimo.</p>
  <h3>I punti della mano</h3>
  <table class="tabella">
    <tr><td>Carte: chi ne ha prese di più</td><td class="num">1</td></tr>
    <tr><td>Denari: chi ne ha presi di più</td><td class="num">1</td></tr>
    <tr><td>Settebello: il sette di denari</td><td class="num">1</td></tr>
    <tr><td>Primiera: vedi sotto</td><td class="num">1</td></tr>
    <tr><td>Ogni scopa</td><td class="num">1</td></tr>
  </table>
  <p class="nota">A pari carte, o a pari denari, quel punto non va a nessuno. Durante la mano al tavolo si vede quante carte ha preso ognuno e quante scope; il conto vero arriva a fine mano.</p>
  <h3>La primiera</h3>
  <p>Per ogni seme conta la carta che vale di più in primiera, e si sommano le quattro. Prende il punto chi fa di più. Un seme che manca vale zero.</p>
  <table class="tabella">
    <tr><td>Sette</td><td class="num">21</td></tr>
    <tr><td>Sei</td><td class="num">18</td></tr>
    <tr><td>Asso</td><td class="num">16</td></tr>
    <tr><td>Cinque</td><td class="num">15</td></tr>
    <tr><td>Quattro</td><td class="num">14</td></tr>
    <tr><td>Tre</td><td class="num">13</td></tr>
    <tr><td>Due</td><td class="num">12</td></tr>
    <tr><td>Donna, Cavallo, Re</td><td class="num">10</td></tr>
  </table>
  <h3>La partita</h3>
  <p>Vince chi arriva per primo a <strong>11 punti</strong> (o a 21, se lo sceglie il padrone di casa). Se ci si arriva insieme vince chi ne ha di più; a pari punti si gioca un'altra mano.</p>`;

const REGOLE_SCOPA = `
  <p><strong>In due, o in quattro a coppie</strong>: chi ti sta di fronte gioca con te. Tre carte a testa e quattro scoperte in tavola. Quando tutti hanno giocato le loro tre carte se ne danno altre tre, finché c'è mazzo. Se all'inizio escono tre o quattro re in tavola si rimescola.</p>
  ${SCOPA_PRESA}`;

const REGOLE_SCOPONE = `
  <p><strong>In quattro, a coppie</strong>: chi ti sta di fronte gioca con te. È la Scopa con una differenza: si danno <strong>tutte le carte subito</strong>, dieci a testa, e il tavolo parte vuoto. Niente mazzo e niente seconde distribuzioni: ogni carta che passa si può contare.</p>
  ${SCOPA_PRESA}`;

// ─────────────────────────────── le schede ───────────────────────────────
//
// targa(s, p): i numeri sulla targa del posto p durante la mano.
//   { dati: [{ v, etichetta, titolo }], tacche: n | null }

const prese = (s, p) => ({ v: s.mano.nPrese?.[p] ?? 0, etichetta: 'prese', titolo: 'prese fatte in questa mano' });

const SCHEDE = {
  cuticchiune: {
    frase: 'Vince chi prende meno punti, ma chi non fa nemmeno una presa perde.',
    regole: REGOLE_CUTICCHIUNE,
    albo: 'singhe a partita',
    punti: 'singhe',
    targa(s, p) {
      const m = s.mano;
      const dati = [prese(s, p)];
      if (m.punti) dati.push({ v: m.punti[p], etichetta: 'punti', titolo: 'punti presi in questa mano' });
      return { dati, tacche: m.singhe ? m.singhe[p] : 0 };
    },
  },
  briscola: {
    frase: 'Il seme della briscola taglia tutti gli altri. Vince la mano chi passa i 60 punti.',
    regole: REGOLE_BRISCOLA,
    albo: 'mani vinte a partita',
    punti: 'mani',
    targa(s, p) {
      const m = s.mano;
      const lato = latoDi(s, p);
      const dati = [prese(s, p)];
      if (m.punti) dati.push({ v: m.punti[lato], etichetta: 'punti', titolo: s.gioco.squadre ? 'punti presi dalla coppia' : 'punti presi in questa mano' });
      if (m.maniVinte) dati.push({ v: m.maniVinte[lato], etichetta: 'mani', titolo: 'mani vinte in questa partita' });
      return { dati, tacche: null };
    },
  },
  scopa: {
    frase: 'Si prende dal tavolo la carta di pari valore, o carte che fanno la somma. Chi svuota il tavolo fa scopa.',
    regole: REGOLE_SCOPA,
    albo: 'punti a partita',
    punti: 'punti',
    targa: targaPesca,
  },
  scopone: {
    breve: 'Scopone',
    frase: 'Dieci carte a testa dall\'inizio e tavolo vuoto. Si gioca in coppia, con le regole della Scopa.',
    regole: REGOLE_SCOPONE,
    albo: 'punti a partita',
    punti: 'punti',
    targa: targaPesca,
  },
};

/** Alla Scopa la targa dice quante carte ha preso il lato, le scope, i punti della partita.
 *  A coppie i numeri sono del lato: si scrivono una volta, sulla targa di chi tiene il mucchio. */
function targaPesca(s, p) {
  const m = s.mano;
  const lato = latoDi(s, p);
  if (postoMucchio(s, lato) !== p) return { dati: [], tacche: null };
  const coppia = !!s.gioco.squadre;
  const dati = [
    { v: m.prese?.[lato]?.length ?? 0, etichetta: 'carte', titolo: coppia ? 'carte prese dalla coppia' : 'carte prese in questa mano' },
    { v: m.scope?.[lato] ?? 0, etichetta: 'scope', titolo: coppia ? 'scope della coppia' : 'scope in questa mano' },
  ];
  const riga = s.partita?.classifica?.find(r => r.lato === lato);
  if (riga) dati.push({ v: riga.punti, etichetta: 'punti', titolo: 'punti in questa partita' });
  return { dati, tacche: null };
}

/** La scheda di un gioco; per un gioco senza scheda, una generica che non sbaglia. */
export function scheda(id) {
  return SCHEDE[id] || {
    frase: '',
    regole: '<p>Le regole di questo gioco non sono ancora scritte qui. Chiedile a chi ha aperto il tavolo.</p>',
    albo: 'punti a partita',
    punti: 'punti',
    targa(s, p) {
      const riga = s.partita?.classifica?.find(r => r.posti.includes(p));
      return { dati: riga ? [{ v: riga.punti, etichetta: 'punti', titolo: 'punti in questa partita' }] : [], tacche: null };
    },
  };
}

/** Le etichette delle opzioni del gioco: quella del gioco, o una scritta qui, o la chiave. */
const ETICHETTE = {
  puntiVittoria: 'Punti per vincere la partita',
  maniVittoria: 'Mani vinte per vincere la partita',
  puntiInChiaro: 'Punti presi in chiaro durante la mano',
};
export function etichettaOpzione(chiave, descr) { return descr?.etichetta || ETICHETTE[chiave] || chiave; }
