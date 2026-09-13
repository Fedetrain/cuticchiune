// TEST DEL MOTORE — node tools/test-cuticchiune.mjs
// Regole, singhe, fine partita, e mille mani fra bot che devono sempre tornare.

import assert from 'node:assert/strict';
import { mazzoNuovo, prng, puntiDi, forzaDi, PUNTI_TOTALI, nomeDi, ordinaMano } from '../src/mazzo.js';
import {
  nuovaMano, gioca, vincitorePresa, risultatoMano, mosseValide, vistaMano,
  nuovaPartita, applicaMano, controllaFine, chiApreDopo, classifica, PUNTI_ULTIMA,
} from '../src/cuticchiune.js';
import { scegli, aCaso } from '../src/bot.js';

let passati = 0;
function test(nome, fn) {
  try { fn(); passati++; console.log(`  ✓ ${nome}`); }
  catch (e) { console.error(`  ✗ ${nome}\n    ${e.message}`); process.exitCode = 1; }
}

/** Una mano con carte scelte a tavolino. */
function manoFissa(mani, apre) {
  const m = nuovaMano({ apre, rnd: prng(1) });
  m.mani = mani.map(h => h.slice());
  m.apre = apre; m.turno = apre; m.apertaDa = apre;
  return m;
}

console.log('mazzo');
test('40 carte, tutte diverse, 32 punti nelle carte (con i 3 dell’ultima presa fanno 35)', () => {
  const m = mazzoNuovo();
  assert.equal(m.length, 40);
  assert.equal(new Set(m).size, 40);
  assert.equal(PUNTI_TOTALI, 32);
});
test('ordine di forza: tre > due > asso > re > cavallo > donna > 7 > 6 > 5 > 4', () => {
  const ordine = ['D3', 'D2', 'D1', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4'];
  for (let i = 1; i < ordine.length; i++) assert.ok(forzaDi(ordine[i - 1]) > forzaDi(ordine[i]), `${ordine[i - 1]} > ${ordine[i]}`);
});
test('punti: asso 3, due/tre/figure 1, il resto 0', () => {
  assert.equal(puntiDi('C1'), 3); assert.equal(puntiDi('C2'), 1); assert.equal(puntiDi('C3'), 1);
  assert.equal(puntiDi('C8'), 1); assert.equal(puntiDi('C9'), 1); assert.equal(puntiDi('C10'), 1);
  for (const v of [4, 5, 6, 7]) assert.equal(puntiDi(`C${v}`), 0);
});
test('nomi e ordinamento della mano', () => {
  assert.equal(nomeDi('B8'), 'Donna di Bastoni');
  assert.deepEqual(ordinaMano(['S4', 'D1', 'D3', 'C7']), ['D3', 'D1', 'C7', 'S4']);
});

console.log('presa');
test('vince la più forte del seme d apertura; il fuori seme non conta mai', () => {
  const carte = [{ posto: 0, carta: 'D4' }, { posto: 1, carta: 'C3' }, { posto: 2, carta: 'D1' }, { posto: 3, carta: 'D10' }];
  assert.equal(vincitorePresa(carte, 'D'), 2, 'l asso batte il re e il quattro; il tre di coppe è scarto');
});
test('il due batte l asso, il tre batte tutti', () => {
  assert.equal(vincitorePresa([{ posto: 0, carta: 'S1' }, { posto: 1, carta: 'S2' }, { posto: 2, carta: 'S7' }, { posto: 3, carta: 'S4' }], 'S'), 1);
  assert.equal(vincitorePresa([{ posto: 0, carta: 'S1' }, { posto: 1, carta: 'S2' }, { posto: 2, carta: 'S3' }, { posto: 3, carta: 'S4' }], 'S'), 2);
});

console.log('mano');
test('distribuzione: 10 carte a testa, apre chi ha il 5 di denari', () => {
  const m = nuovaMano({ rnd: prng(3) });
  assert.deepEqual(m.mani.map(h => h.length), [10, 10, 10, 10]);
  assert.ok(m.mani[m.apre].includes('D5'));
  assert.equal(m.turno, m.apre);
});
test('obbligo di seme: con il seme in mano non si può scartare', () => {
  const m = manoFissa([['D5', 'C1'], ['D7', 'C2'], ['D4', 'S3'], ['B4', 'B5']], 0);
  assert.equal(gioca(m, 0, 'D5').ok, true);
  assert.deepEqual(mosseValide(m, 1), ['D7']);
  assert.equal(gioca(m, 1, 'C2').ok, false);
  assert.equal(gioca(m, 1, 'D7').ok, true);
  assert.equal(gioca(m, 2, 'D4').ok, true);
  assert.deepEqual(mosseValide(m, 3), ['B4', 'B5'], 'senza il seme, tutto è lecito');
  const e = gioca(m, 3, 'B5');
  assert.equal(e.presa.vincitore, 1, 'il sette di denari batte 5 e 4');
  assert.equal(m.turno, 1, 'chi prende apre');
});
test('non si gioca fuori turno né carte che non si hanno', () => {
  const m = nuovaMano({ rnd: prng(2) });
  const altro = (m.apre + 1) % 4;
  assert.equal(gioca(m, altro, m.mani[altro][0]).ok, false);
  assert.equal(gioca(m, m.apre, 'ZZ').ok, false);
});
test('mano completa: 10 prese, 35 punti distribuiti (32 piu’ l’ultima presa), fine con verdetto', () => {
  const m = nuovaMano({ rnd: prng(5) });
  let fine = null;
  while (!m.finita) {
    const e = gioca(m, m.turno, mosseValide(m, m.turno)[0]);
    assert.ok(e.ok, e.errore);
    if (e.fine) fine = e.fine;
  }
  assert.equal(m.numeroPresa, 10);
  assert.ok(fine);
  assert.equal(fine.punti.reduce((a, b) => a + b, 0), PUNTI_TOTALI + PUNTI_ULTIMA);
  assert.equal(fine.nPrese.reduce((a, b) => a + b, 0), 10);
  assert.ok(fine.perdenti.length >= 1);
});
test('la vista non mostra le altre mani', () => {
  const m = nuovaMano({ rnd: prng(6) });
  const v = vistaMano(m, 2);
  assert.deepEqual(v.mano, m.mani[2]);
  assert.deepEqual(v.conteggi, [10, 10, 10, 10]);
  const testo = JSON.stringify(v);
  for (const c of m.mani[0]) assert.ok(!testo.includes(`"${c}"`), `la carta ${c} di un altro non deve viaggiare`);
});

console.log('verdetto della mano');
test('tutti hanno preso: perde chi ha più punti', () => {
  const m = nuovaMano({ rnd: prng(7) });
  m.nPrese = [3, 3, 2, 2];
  m.prese = [['D1', 'C1'], ['D2'], ['D4'], ['D5']];
  const r = risultatoMano(m);
  assert.deepEqual(r.perdenti, [0]); assert.equal(r.motivo, 'piu-punti');
});
test('pareggio in testa: perdono tutti i pari', () => {
  const m = nuovaMano({ rnd: prng(7) });
  m.nPrese = [3, 3, 2, 2];
  m.prese = [['D1'], ['C1'], ['D4'], ['D5']];
  const r = risultatoMano(m);
  assert.deepEqual(r.perdenti, [0, 1]); assert.equal(r.motivo, 'pareggio');
});
test('chi non ha preso mai perde, anche se un altro ha tutti i punti', () => {
  const m = nuovaMano({ rnd: prng(7) });
  m.nPrese = [8, 0, 2, 0];
  m.prese = [['D1', 'C1', 'S1', 'B1'], [], ['D4'], []];
  const r = risultatoMano(m);
  assert.deepEqual(r.perdenti, [1, 3]); assert.equal(r.motivo, 'zero-prese');
});

console.log('apertura della mano successiva');
test('un solo perdente: apre lui', () => {
  const m = nuovaMano({ rnd: prng(8) }); m.apertaDa = 0;
  assert.equal(chiApreDopo({ perdenti: [2], punti: [5, 5, 12, 10], nPrese: [3, 3, 2, 2] }, m), 2);
});
test('due perdenti: apre chi sta a destra del migliore fra i non perdenti', () => {
  const m = nuovaMano({ rnd: prng(8) }); m.apertaDa = 0;
  // perdono 1 e 3; salvi 0 (8 punti) e 2 (4 punti): il migliore è 2, apre 3
  assert.equal(chiApreDopo({ perdenti: [1, 3], punti: [8, 10, 4, 10], nPrese: [3, 3, 2, 2] }, m), 3);
});
test('tre perdenti: apre chi sta a destra dell unico salvo', () => {
  const m = nuovaMano({ rnd: prng(8) }); m.apertaDa = 0;
  assert.equal(chiApreDopo({ perdenti: [0, 1, 3], punti: [0, 0, 32, 0], nPrese: [0, 0, 10, 0] }, m), 3);
});

console.log('fine partita');
test('dieci singhe: perde da solo', () => {
  assert.deepEqual(controllaFine([9, 2, 3, 1], [10, 2, 3, 1]), { motivo: 'dieci-singhe', perdenti: [0], franchi: [], singhe: [10, 2, 3, 1] });
});
test('due arrivano a 5 nella stessa mano: perdono loro', () => {
  const e = controllaFine([4, 4, 1, 2], [5, 5, 1, 2]);
  assert.equal(e.motivo, 'coppia-a-5'); assert.deepEqual(e.perdenti, [0, 1]); assert.deepEqual(e.franchi, []);
});
test('uno arriva a 5 e un altro c era già: perdono entrambi', () => {
  const e = controllaFine([6, 4, 1, 2], [6, 5, 1, 2]);
  assert.equal(e.motivo, 'coppia-a-5'); assert.deepEqual(e.perdenti, [0, 1]);
});
test('«esce franco»: chi aveva più di 5 si salva se due altri arrivano a 5 insieme', () => {
  const e = controllaFine([7, 4, 4, 0], [7, 5, 5, 0]);
  assert.equal(e.motivo, 'coppia-a-5'); assert.deepEqual(e.perdenti, [1, 2]); assert.deepEqual(e.franchi, [0]);
});
test('«esce franco» anche a 9: la coppia a 5 vince sul conteggio', () => {
  const e = controllaFine([9, 4, 4, 0], [10, 5, 5, 0]);
  assert.equal(e.motivo, 'coppia-a-5'); assert.deepEqual(e.perdenti, [1, 2]); assert.deepEqual(e.franchi, [0]);
});
test('un solo giocatore a 5: la partita continua', () => {
  assert.equal(controllaFine([4, 0, 0, 0], [5, 0, 0, 0]), null);
  assert.equal(controllaFine([8, 3, 0, 0], [9, 4, 0, 0]), null);
});
test('applicaMano aggiorna singhe, decide chi apre e la classifica', () => {
  const p = nuovaPartita();
  const m = nuovaMano({ rnd: prng(9) }); m.apertaDa = 1;
  applicaMano(p, { punti: [10, 8, 8, 6], nPrese: [3, 3, 2, 2], perdenti: [0], motivo: 'piu-punti' }, m);
  assert.deepEqual(p.singhe, [1, 0, 0, 0]);
  assert.equal(p.prossimoApre, 0);
  assert.equal(p.finita, false);
  p.singhe = [4, 4, 9, 0];
  const esito = applicaMano(p, { punti: [10, 10, 6, 6], nPrese: [3, 3, 2, 2], perdenti: [0, 1], motivo: 'pareggio' }, m);
  assert.equal(esito.motivo, 'coppia-a-5');
  assert.deepEqual(esito.franchi, [2]);
  const cl = classifica(p);
  assert.equal(cl[0].posto, 3, 'in testa chi ha meno singhe fra i salvi');
  assert.equal(cl[1].posto, 2, 'poi il franco, salvo a 9');
  assert.ok(cl[2].perde && cl[3].perde);
});

console.log('bot');
test('senza il seme scarica la carta più pericolosa', () => {
  const m = manoFissa([['D5', 'C4'], ['C1', 'S3', 'B4', 'B7'], ['D4', 'D6'], ['D7', 'D8']], 0);
  gioca(m, 0, 'D5');
  assert.equal(scegli(m, 1), 'C1', 'l asso vale 3 punti: via');
});
test('con il seme, se può perdere la presa scarica la più alta che perde', () => {
  const m = manoFissa([['D3', 'C4'], ['D1', 'D2', 'D4'], ['D6', 'D7'], ['D8', 'D9']], 0);
  gioca(m, 0, 'D3');
  assert.equal(scegli(m, 1), 'D1', 'il tre prende comunque: via l asso da 3 punti');
});
test('costretto a prendere, prende con la carta che porta meno punti', () => {
  const m = manoFissa([['D4', 'C4'], ['D3', 'D2', 'D10'], ['D6', 'D7'], ['D8', 'D9']], 0);
  gioca(m, 0, 'D4');
  assert.equal(scegli(m, 1), 'D3', 'tutte prendono e valgono 1: la più forte, così me la tolgo');
});
test('se non ha mai preso e la presa è povera, da ultimo la prende', () => {
  const m = manoFissa([['D4', 'C4'], ['D5', 'C5'], ['D6', 'C6'], ['D7', 'D8', 'C7']], 0);
  m.nPrese = [2, 3, 3, 0]; m.numeroPresa = 8;
  gioca(m, 0, 'D4'); gioca(m, 1, 'D5'); gioca(m, 2, 'D6');
  assert.equal(scegli(m, 3), 'D7', 'prende con la più economica fra le vincenti');
});
test('1000 mani fra bot: sempre 35 punti, 10 prese, nessun errore', () => {
  const rnd = prng(2026);
  const zeroPrese = [0, 0, 0, 0];
  for (let i = 0; i < 1000; i++) {
    const m = nuovaMano({ apre: i % 4, rnd });
    while (!m.finita) {
      const e = gioca(m, m.turno, scegli(m, m.turno, rnd));
      if (!e.ok) throw new Error(e.errore);
    }
    const r = risultatoMano(m);
    assert.equal(r.punti.reduce((a, b) => a + b, 0), PUNTI_TOTALI + PUNTI_ULTIMA);
    assert.equal(m.prese.flat().length, 40);
    if (r.motivo === 'zero-prese') zeroPrese[r.perdenti.length]++;
  }
  console.log(`    (mani decise da zero prese, per numero di perdenti: ${zeroPrese.slice(1).join('/')})`);
});
test('il bot perde meno di chi gioca a caso', () => {
  const rnd = prng(77);
  const singhe = [0, 0, 0, 0];   // posto 0 e 2: bot; 1 e 3: caso
  const MANI = 600;
  for (let i = 0; i < MANI; i++) {
    const m = nuovaMano({ apre: i % 4, rnd });
    while (!m.finita) {
      const p = m.turno;
      gioca(m, p, p % 2 === 0 ? scegli(m, p, rnd) : aCaso(m, p, rnd));
    }
    for (const q of risultatoMano(m).perdenti) singhe[q]++;
  }
  const bot = singhe[0] + singhe[2], caso = singhe[1] + singhe[3];
  console.log(`    (singhe bot/caso su ${MANI} mani: ${bot}/${caso})`);
  assert.ok(bot < caso * 0.75, `il bot deve perdere nettamente meno: ${bot} contro ${caso}`);
});
test('partite intere fra bot: finiscono sempre, entro 40 mani', () => {
  const rnd = prng(31);
  let maniTot = 0, franchi = 0, motivi = {};
  for (let g = 0; g < 200; g++) {
    const p = nuovaPartita();
    let mani = 0;
    while (!p.finita) {
      const m = nuovaMano({ apre: p.prossimoApre, rnd });
      while (!m.finita) gioca(m, m.turno, scegli(m, m.turno, rnd));
      applicaMano(p, risultatoMano(m), m);
      mani++;
      assert.ok(mani <= 40, 'una partita non può durare più di 40 mani');
    }
    maniTot += mani;
    motivi[p.esito.motivo] = (motivi[p.esito.motivo] || 0) + 1;
    if (p.esito.franchi.length) franchi++;
  }
  console.log(`    (media ${(maniTot / 200).toFixed(1)} mani a partita; fine per ${JSON.stringify(motivi)}; «esce franco» ${franchi} volte)`);
});

console.log(`\n${passati} test passati${process.exitCode ? ', CON ERRORI' : ''}`);
