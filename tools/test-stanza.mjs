// TEST DELLA STANZA — node tools/test-stanza.mjs
// Accende il server su una porta libera, collega quattro client WebSocket veri
// e gioca una partita intera. Poi: riconnessione col token, spettatori, bot al
// posto di chi cade, chat, abbinamento pubblico, informazioni nascoste.

import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { server, impostazioni, stanze } from '../server.js';
import { RITMO } from '../src/stanza.js';
import { mazzoNuovo } from '../src/mazzo.js';

process.env.CUTICCHIUNE_ALBO = '/tmp/cuticchiune-albo-test.json';
impostazioni.tempi = { ...RITMO, presaInVista: 30, fineMano: 60, primaCartaBot: 10, cartaBot: 10, graziaCaduto: 700, stanzaVuota: 500 };

let passati = 0;
async function test(nome, fn) {
  try { await fn(); passati++; console.log(`  ✓ ${nome}`); }
  catch (e) { console.error(`  ✗ ${nome}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}
const attendi = (ms) => new Promise(r => setTimeout(r, ms));

class Client {
  constructor(porta) { this.porta = porta; this.stato = null; this.eventi = []; this.errori = []; this.benvenuto = null; this._attese = []; }
  connetti() {
    return new Promise((ok, ko) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.porta}/ws`);
      this.ws.on('open', ok); this.ws.on('error', ko);
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.t === 'stato') this.stato = m;
        else if (m.t === 'benvenuto') this.benvenuto = m;
        else if (m.t === 'errore') this.errori.push(m);
        else if (m.t === 'evento') this.eventi.push(m);
        for (const a of this._attese.splice(0)) { if (a.pred(m)) a.ok(m); else this._attese.push(a); }
      });
    });
  }
  invia(m) { this.ws.send(JSON.stringify(m)); }
  aspetta(pred, ms = 3000) {
    return new Promise((ok, ko) => {
      const t = setTimeout(() => ko(new Error('timeout aspettando ' + pred.toString().slice(0, 60))), ms);
      this._attese.push({ pred, ok: (m) => { clearTimeout(t); ok(m); } });
    });
  }
  /** Aspetta uno stato che soddisfa `pred` (controlla anche quello già ricevuto). */
  aspettaStato(pred, ms = 3000) {
    if (this.stato && pred(this.stato)) return Promise.resolve(this.stato);
    return this.aspetta(m => m.t === 'stato' && pred(m), ms);
  }
  chiudi() { try { this.ws.close(); } catch {} }
}

await new Promise(r => server.listen(0, '127.0.0.1', r));
const porta = server.address().port;
console.log(`server di prova su :${porta}`);

let codice, host, altri = [];

await test('crea un tavolo: chi lo apre è il padrone di casa e siede al posto 0', async () => {
  host = new Client(porta); await host.connetti();
  host.invia({ t: 'crea', nome: 'Federico' });
  await host.aspettaStato(s => s.io && s.io.host);
  codice = host.stato.codice;
  assert.match(codice, /^[A-Z]{4}$/);
  assert.equal(host.stato.io.posto, 0);
  assert.equal(host.stato.fase, 'attesa');
  assert.ok(host.benvenuto.link.endsWith('/s/' + codice));
  assert.ok(Array.isArray(host.benvenuto.emote) && host.benvenuto.emote.length);
});

await test('tre amici entrano col codice e si siedono; il codice sbagliato è rifiutato', async () => {
  const sbagliato = new Client(porta); await sbagliato.connetti();
  sbagliato.invia({ t: 'entra', codice: 'ZZZZ', nome: 'Nessuno' });
  const e = await sbagliato.aspetta(m => m.t === 'errore');
  assert.ok(e.fatale); sbagliato.chiudi();
  for (const nome of ['Turi', 'Cicciu', 'Nzino']) {
    const c = new Client(porta); await c.connetti();
    c.invia({ t: 'entra', codice, nome });
    await c.aspettaStato(s => s.io && s.io.posto >= 0);
    altri.push(c);
  }
  await host.aspettaStato(s => s.posti.every(Boolean));
  assert.deepEqual(host.stato.posti.map(p => p.nome), ['Federico', 'Turi', 'Cicciu', 'Nzino']);
});

await test('un quinto entra come spettatore; ci si può cambiare di posto solo in attesa', async () => {
  const sp = new Client(porta); await sp.connetti();
  sp.invia({ t: 'entra', codice, nome: 'Zia Pina' });
  await sp.aspettaStato(s => s.io && s.io.spettatore);
  assert.equal(sp.stato.io.posto, -1);
  await host.aspettaStato(s => s.spettatori.length === 1);
  // Turi si alza, Zia Pina si siede al suo posto, poi si rialza e Turi torna
  altri[0].invia({ t: 'alzati' });
  await sp.aspettaStato(s => s.posti[1] === null);
  sp.invia({ t: 'siedi', posto: 1 });
  await sp.aspettaStato(s => s.io.posto === 1);
  sp.invia({ t: 'alzati' });
  await sp.aspettaStato(s => s.io.posto === -1);
  altri[0].invia({ t: 'siedi', posto: 1 });
  await altri[0].aspettaStato(s => s.io.posto === 1);
  sp.chiudi();
});

await test('solo il padrone di casa cambia le opzioni e avvia', async () => {
  altri[0].invia({ t: 'opzioni', opzioni: { timerTurno: 0 } });
  await altri[0].aspetta(m => m.t === 'errore');
  host.invia({ t: 'opzioni', opzioni: { timerTurno: 0, puntiInChiaro: true } });
  await host.aspettaStato(s => s.opzioni.timerTurno === 0);
  altri[1].invia({ t: 'avvia' });
  await altri[1].aspetta(m => m.t === 'errore');
});

const tutti = () => [host, ...altri];

await test('la partita parte: 10 carte a testa, si vede solo la propria mano, apre chi ha il 5 di denari', async () => {
  host.invia({ t: 'avvia' });
  await Promise.all(tutti().map(c => c.aspettaStato(s => s.fase === 'partita' && s.mano)));
  for (const c of tutti()) {
    assert.equal(c.stato.mano.mano.length, 10);
    assert.deepEqual(c.stato.mano.conteggi, [10, 10, 10, 10]);
    const testo = JSON.stringify(c.stato);
    // nessuna carta altrui nel testo: le uniche carte sono le mie
    const carteNelTesto = mazzoNuovo().filter(x => testo.includes(`"${x}"`));
    assert.deepEqual(carteNelTesto.sort(), c.stato.mano.mano.slice().sort());
  }
  const chiApre = host.stato.mano.turno;
  const c = tutti()[chiApre];
  assert.ok(c.stato.mano.mano.includes('D5'), 'apre chi ha il 5 di denari');
});

await test('una carta fuori seme viene rifiutata; il giro completo chiude la presa', async () => {
  const chiApre = host.stato.mano.turno;
  const primo = tutti()[chiApre];
  primo.invia({ t: 'gioca', carta: 'D5' });
  await Promise.all(tutti().map(c => c.aspettaStato(s => s.mano.tavolo.length === 1)));
  const secondo = tutti()[(chiApre + 1) % 4];
  const mano = secondo.stato.mano;
  const fuori = mano.mano.find(x => !mano.valide.includes(x));
  if (fuori) {
    secondo.invia({ t: 'gioca', carta: fuori });
    const e = await secondo.aspetta(m => m.t === 'errore');
    assert.match(e.msg, /seme/i);
  }
  // giochiamo il resto della presa con carte valide
  for (let k = 1; k < 4; k++) {
    const c = tutti()[(chiApre + k) % 4];
    await c.aspettaStato(s => s.mano.turno === s.io.posto);
    c.invia({ t: 'gioca', carta: c.stato.mano.valide[0] });
  }
  const ev = await host.aspetta(m => m.t === 'evento' && m.tipo === 'presa');
  assert.equal(ev.carte.length, 4);
  await host.aspettaStato(s => s.mano.numeroPresa === 1 && s.mano.tavolo.length === 0);
});

await test('riconnessione col token: stessa mano, stesso posto, si continua', async () => {
  const c = altri[2];
  const posto = c.stato.io.posto, token = c.benvenuto.token, manoPrima = c.stato.mano.mano.slice();
  c.chiudi();
  await host.aspettaStato(s => s.posti[posto].presente === false);
  const c2 = new Client(porta); await c2.connetti();
  c2.invia({ t: 'entra', codice, token, nome: 'Nzino' });
  await c2.aspettaStato(s => s.io && s.io.posto === posto);
  // se nel frattempo è scattata la grazia, il bot può aver giocato una carta per lui: la mano è la stessa, meno al più una
  assert.ok(c2.stato.mano.mano.every(x => manoPrima.includes(x)) && c2.stato.mano.mano.length >= manoPrima.length - 1, 'stessa mano al rientro');
  altri[2] = c2;
  await host.aspettaStato(s => s.posti[posto].presente === true);
});

await test('chi cade resta in automatico: il bot gioca per lui, e al ritorno riprende', async () => {
  const c = altri[1];
  const posto = c.stato.io.posto, token = c.benvenuto.token;
  c.chiudi();
  await host.aspettaStato(s => s.posti[posto].automatico === true, 4000);
  // il gioco va avanti: gli altri giocano, il bot gioca per il caduto
  const inizio = host.stato.mano.numeroPresa;
  for (let giri = 0; giri < 40 && host.stato.mano.numeroPresa < inizio + 2; giri++) {
    for (const cl of tutti()) {
      if (cl === c) continue;
      if (cl.stato?.mano?.turno === cl.stato?.io?.posto && cl.stato.mano.valide.length) cl.invia({ t: 'gioca', carta: cl.stato.mano.valide[0] });
    }
    await attendi(60);
  }
  assert.ok(host.stato.mano.numeroPresa >= inizio + 2, 'la partita è andata avanti con il bot');
  const c2 = new Client(porta); await c2.connetti();
  c2.invia({ t: 'entra', codice, token, nome: 'Turi' });
  await c2.aspettaStato(s => s.io && s.io.posto === posto && !s.posti[posto].automatico);
  altri[1] = c2;
});

await test('chat ed emote arrivano a tutti', async () => {
  altri[0].invia({ t: 'chat', testo: 'Talìa chi carti!' });
  const m = await host.aspetta(x => x.t === 'evento' && x.tipo === 'chat');
  assert.equal(m.testo, 'Talìa chi carti!'); assert.equal(m.nome, 'Turi');
  altri[0].invia({ t: 'emote', id: 'minchia' });
  const e = await host.aspetta(x => x.t === 'evento' && x.tipo === 'emote');
  assert.equal(e.emote.testo, 'Minchia!');
});

await test('la partita si gioca fino in fondo: mani, singhe, fine, classifica, albo', async () => {
  const t0 = Date.now();
  let ultimoMano = -1;
  while (host.stato.fase !== 'fine-partita') {
    if (Date.now() - t0 > 60000) throw new Error('la partita non finisce');
    for (const cl of tutti()) {
      const s = cl.stato;
      if (s?.fase === 'partita' && s.mano && s.mano.turno === s.io.posto && !s.presaInVista && s.mano.valide.length) {
        cl.invia({ t: 'gioca', carta: s.mano.valide[Math.floor(Math.random() * s.mano.valide.length)] });
      }
    }
    if (host.stato.fase === 'fine-mano' && host.stato.fineMano.numeroMano !== ultimoMano) {
      ultimoMano = host.stato.fineMano.numeroMano;
      const f = host.stato.fineMano;
      assert.equal(f.punti.reduce((a, b) => a + b, 0), 32);
      assert.ok(f.perdenti.length >= 1);
      assert.equal(f.singhe.reduce((a, b) => a + b, 0), host.stato.partita.mani.reduce((a, m) => a + m.perdenti.length, 0));
      host.invia({ t: 'avanti' });   // il padrone salta l'attesa
    }
    await attendi(25);
  }
  const s = host.stato;
  assert.ok(s.classifica && s.classifica.length === 4);
  assert.ok(s.partita.esito.perdenti.length >= 1);
  const singheMax = Math.max(...s.partita.singhe);
  assert.ok(singheMax >= 5, 'qualcuno è arrivato ad almeno 5 singhe');
  console.log(`    (finita in ${s.partita.numeroMano} mani, motivo ${s.partita.esito.motivo}, singhe ${s.partita.singhe.join('/')})`);
  const r = await fetch(`http://127.0.0.1:${porta}/api/albo`).then(x => x.json());
  assert.ok(r.find(g => g.nome === 'Federico'), 'l albo registra gli umani');
});

await test('rivincita: quando tutti gli umani seduti la chiedono si riparte', async () => {
  for (const cl of tutti()) cl.invia({ t: 'rivincita' });
  await host.aspettaStato(s => s.fase === 'partita' && s.partita.numeroMano === 1);
  assert.deepEqual(host.stato.partita.singhe, [0, 0, 0, 0]);
});

await test('abbinamento pubblico: due sconosciuti finiscono allo stesso tavolo; il QR e la lista rispondono', async () => {
  const a = new Client(porta); await a.connetti(); a.invia({ t: 'pubblica', nome: 'Sconosciuto 1' });
  await a.aspettaStato(s => s.io && s.io.posto === 0);
  assert.equal(a.stato.opzioni.pubblica, true);
  const lista = await fetch(`http://127.0.0.1:${porta}/api/pubbliche`).then(x => x.json());
  assert.ok(lista.find(x => x.codice === a.stato.codice));
  const b = new Client(porta); await b.connetti(); b.invia({ t: 'pubblica', nome: 'Sconosciuto 2' });
  await b.aspettaStato(s => s.io && s.io.posto === 1);
  assert.equal(b.stato.codice, a.stato.codice);
  const qr = await fetch(`http://127.0.0.1:${porta}/api/qr/${a.stato.codice}`);
  assert.equal(qr.headers.get('content-type').split(';')[0], 'image/svg+xml');
  assert.ok((await qr.text()).includes('<svg'));
  // il padrone aggiunge due bot e avvia: parte con 2 umani e 2 bot
  a.invia({ t: 'bot' }); await a.aspettaStato(s => s.posti[2]?.bot);
  a.invia({ t: 'avvia' });
  await a.aspettaStato(s => s.fase === 'partita' && s.posti.every(Boolean));
  assert.equal(a.stato.posti.filter(p => p.bot).length, 2);
  a.chiudi(); b.chiudi();
});

await test('la pagina del link serve l app; una stanza senza umani si chiude da sola', async () => {
  const r = await fetch(`http://127.0.0.1:${porta}/s/${codice}`);
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes('<html'));
  const n = stanze.size;
  for (const cl of tutti()) cl.chiudi();
  await attendi(900);
  assert.ok(stanze.size < n, 'almeno una stanza si è chiusa');
});

server.close();
await attendi(50);
console.log(`\n${passati} test passati${process.exitCode ? ', CON ERRORI' : ''}`);
process.exit(process.exitCode || 0);
