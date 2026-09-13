// TEST DELLA RETE LOCALE — node tools/test-locale.mjs
// Il tavolo dentro la pagina: nessun server, nessun WebSocket. Si gioca una
// partita intera contro tre bot passando dalla stessa ReteLocale che usa il
// sito statico, e si controlla che le informazioni nascoste restino nascoste.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReteLocale } from '../public/js/rete-locale.js';
import { RITMO } from '../src/stanza.js';

const tempi = { ...RITMO, presaInVista: 10, fineMano: 20, primaCartaBot: 5, cartaBot: 5, turnoDefault: 0 };
let passati = 0;
async function test(nome, fn) {
  try { await fn(); passati++; console.log(`  ✓ ${nome}`); }
  catch (e) { console.error(`  ✗ ${nome}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}

/** Un client come lo vede l'app: ascolta gli eventi della rete e tiene l'ultimo stato. */
function client() {
  const rete = new ReteLocale({ tempi, link: (c) => `https://esempio/#/s/${c}` });
  const c = { rete, stato: null, benvenuto: null, errori: [], eventi: [] };
  rete.on('stato', (s) => { c.stato = s; });
  rete.on('benvenuto', (m) => { c.benvenuto = m; });
  rete.on('errore', (m) => c.errori.push(m));
  rete.on('evento', (e) => c.eventi.push(e));
  c.aspetta = (pred, ms = 4000) => new Promise((ok, ko) => {
    const t0 = Date.now();
    const guarda = () => {
      if (c.stato && pred(c.stato)) return ok(c.stato);
      if (Date.now() - t0 > ms) return ko(new Error('timeout: ' + pred.toString().slice(0, 70)));
      setTimeout(guarda, 5);
    };
    guarda();
  });
  return c;
}

await test('apre un tavolo da sola: benvenuto, codice, link da condividere', async () => {
  const c = client();
  c.rete.entra({ t: 'crea', nome: 'Federico' });
  await c.aspetta(s => s.fase === 'attesa');
  assert.match(c.benvenuto.codice, /^[A-Z]{4}$/);
  assert.equal(c.benvenuto.link, `https://esempio/#/s/${c.benvenuto.codice}`);
  assert.equal(c.stato.io.posto, 0);
  assert.equal(c.stato.io.host, true);
  c.rete.chiudi();
});

await test('tre bot, la partita parte e finisce: qualcuno perde davvero', async () => {
  const c = client();
  c.rete.entra({ t: 'crea', nome: 'Federico' });
  await c.aspetta(s => s.fase === 'attesa');
  for (let i = 0; i < 3; i++) c.rete.invia({ t: 'bot' });
  await c.aspetta(s => s.posti.every(p => p) && s.posti.filter(p => p.bot).length === 3);
  c.rete.invia({ t: 'avvia' });
  await c.aspetta(s => s.fase === 'partita');

  // gioco la prima carta valida ogni volta che tocca a me, finche' non finisce
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const s = c.stato;
    if (s.fase === 'fine-partita') break;
    if (s.fase === 'fine-mano') { c.rete.invia({ t: 'avanti' }); }
    else if (s.mano && s.mano.turno === s.io.posto && s.mano.valide?.length) {
      c.rete.invia({ t: 'gioca', carta: s.mano.valide[0] });
    }
    await new Promise(r => setTimeout(r, 8));
  }
  assert.equal(c.stato.fase, 'fine-partita', 'la partita deve finire da sola');
  assert.ok(c.stato.classifica?.length === 4, 'quattro in classifica');
  assert.ok(c.stato.partita.esito, 'un esito c\'e\'');
  c.rete.chiudi();
});

await test('le carte degli altri non passano dal canale, nemmeno qui', async () => {
  const c = client();
  c.rete.entra({ t: 'crea', nome: 'Federico' });
  await c.aspetta(s => s.fase === 'attesa');
  for (let i = 0; i < 3; i++) c.rete.invia({ t: 'bot' });
  await c.aspetta(s => s.posti.every(p => p));
  c.rete.invia({ t: 'avvia' });
  await c.aspetta(s => s.fase === 'partita' && s.mano);
  const m = c.stato.mano;
  assert.ok(m.mano.length >= 9, 'la mia mano e\' in chiaro');
  assert.equal(m.conteggi.length, 4, 'degli altri si sa solo quante carte hanno');
  assert.ok(m.conteggi.every(n => n >= 9 && n <= 10), `conteggi strani: ${m.conteggi}`);
  assert.ok(!('mani' in m), 'le mani vere non escono dal motore');
  c.rete.chiudi();
});

await test('chiudere il tavolo ferma i timer: niente partite fantasma', async () => {
  const c = client();
  c.rete.entra({ t: 'crea', nome: 'Federico' });
  await c.aspetta(s => s.fase === 'attesa');
  for (let i = 0; i < 3; i++) c.rete.invia({ t: 'bot' });
  await c.aspetta(s => s.posti.every(p => p));
  c.rete.invia({ t: 'avvia' });
  await c.aspetta(s => s.fase === 'partita');
  c.rete.chiudi();
  assert.equal(c.rete.servitore.stanze.size, 0);
  const quante = c.eventi.length;
  await new Promise(r => setTimeout(r, 200));
  assert.equal(c.eventi.length, quante, 'dopo la chiusura non arriva piu\' niente');
});

await test('due al tavolo: chi ospita e chi arriva vedono lo stesso stato', async () => {
  // È la prova a secco del P2P: là in mezzo, fra i due canali, ci sono due
  // telefoni e una connessione WebRTC — ma il servitore e le sessioni sono questi.
  const padrone = client();
  padrone.rete.entra({ t: 'crea', nome: 'Federico' });
  await padrone.aspetta(s => s.fase === 'attesa');
  const codice = padrone.benvenuto.codice;

  // l'ospite: un secondo canale sullo stesso servitore, come fa _accogli()
  const ricevuti = [];
  const canale = { readyState: 1, send(x) { ricevuti.push(JSON.parse(x)); }, close() { this.readyState = 3; } };
  const sessione = padrone.rete.servitore.sessione(canale);
  sessione.messaggio({ t: 'entra', codice, nome: 'Giada' });

  const suo = ricevuti.filter(m => m.t === 'stato').pop();
  assert.equal(suo.codice, codice);
  assert.equal(suo.io.posto, 1, 'chi arriva si siede al secondo posto');
  assert.equal(suo.io.host, false, 'il padrone di casa resta chi ha aperto');
  assert.equal(suo.posti[0].nome, 'Federico');
  // gli stati arrivano a chi ospita in un microtask: si aspetta, non si indovina
  await padrone.aspetta(s => s.posti[1]?.nome === 'Giada', 2000);

  sessione.chiudi();
  await padrone.aspetta(s => !s.posti[1], 2000);
  padrone.rete.chiudi();
});

await test('la quarta carta resta ferma sul tavolo almeno due secondi', () => {
  // Il conto della presa parte quando la quarta carta viene calata, ma quella
  // carta prima deve volare fino al centro: i due numeri stanno in file diversi
  // (src/stanza.js e public/js/tavolo.js) e se uno cambia senza l'altro si torna
  // al difetto di prima — l'ultimo cala e nessuno vede che cosa ha buttato.
  const tavolo = fs.readFileSync(new URL('../public/js/tavolo.js', import.meta.url), 'utf8');
  const volo = Number(tavolo.match(/duration:\s*(\d+)/)[1]);
  const fermo = RITMO.presaInVista - volo;
  assert.ok(fermo >= 2000, `la carta resta ferma solo ${fermo} ms (volo ${volo}, presa in vista ${RITMO.presaInVista})`);
});

console.log(`\n${passati} test passati`);

// Un test caduto a metà lascia in piedi i timer della stanza (l'oblio di chi
// esce è un minuto): senza questo, il comando resterebbe appeso a guardarli.
process.exit(process.exitCode || 0);
