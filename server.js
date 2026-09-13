// CUTICCHIUNE — un solo processo: file statici, WebSocket, le stanze.
//
//   npm start            → http://localhost:3838
//   PORT=4000 npm start
//
// Il link della stanza è  http://<ip>:<porta>/s/CODICE  — chi lo apre entra
// direttamente. Il QR in lobby porta allo stesso link.

import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

import { Servitore, RITMO } from './src/servitore.js';
import { Albo } from './src/albo.js';

const RADICE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PORTA = Number(process.env.PORT || 3838);

// ────────────────────── rete di sicurezza del processo ──────────────────────
// Un bug a metà partita non deve buttare giù quattro telefoni.
process.on('uncaughtException', (e, origine) => { console.error(`⚠ eccezione non gestita (${origine}) — si prosegue:`); console.error(e?.stack || e); });
process.on('unhandledRejection', (e) => { console.error('⚠ promise rifiutata senza catch — si prosegue:'); console.error(e?.stack || e); });

// ──────────────────────────────── le stanze ────────────────────────────────

const albo = new Albo(process.env.CUTICCHIUNE_ALBO || path.join(RADICE, 'dati', 'albo.json'));
/** I test accorciano i tempi da qui, prima di creare stanze. */
const impostazioni = { tempi: RITMO };

// Le stanze e lo smistamento dei messaggi stanno in src/servitore.js: sono gli
// stessi che girano dentro la pagina quando il gioco e' su GitHub Pages, senza
// nessun server. Qui il servitore ha davanti dei WebSocket veri.
const servitore = new Servitore({
  tempi: () => impostazioni.tempi,
  onStanza: (s) => console.log(`  + stanza ${s.codice}`),
  onChiusa: (s) => console.log(`  ✕ stanza ${s.codice} chiusa`),
  onAlbo: (riassunto) => albo.registra(riassunto),
});
const stanze = servitore.stanze;
const nuovaStanza = (opzioni) => servitore.nuovaStanza(opzioni);

// ──────────────────────────────── http ────────────────────────────────

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(RADICE, 'public'), { maxAge: '1h', etag: true }));
// il motore: le stesse fonti che usa il server, servite anche al browser —
// e' cosi' che la pagina sa giocare da sola contro i bot e fare da tavolo in P2P
app.use('/src', express.static(path.join(RADICE, 'src'), { maxAge: '1h', etag: true }));

// il link della stanza: stessa pagina, il client legge il codice dall'URL
app.get('/s/:codice', (req, res) => res.sendFile(path.join(RADICE, 'public', 'index.html')));

// il QR del link (SVG): lo mostra la lobby
app.get('/api/qr/:codice', async (req, res) => {
  const codice = String(req.params.codice || '').toUpperCase().slice(0, 4);
  const link = linkStanza(req, codice);
  try {
    const svg = await QRCode.toString(link, { type: 'svg', margin: 1, color: { dark: '#1a1408', light: '#00000000' }, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(500).send('QR non generato'); }
});

// stanze pubbliche aperte (per la home)
app.get('/api/pubbliche', (req, res) => res.json(servitore.vetrina()));

// l'albo d'oro
app.get('/api/albo', (req, res) => res.json(albo.classifica()));

// il mazzo fotografico, se c'è: public/assets/mazzo/D1.png … B10.png (+ dorso.png).
// Con tutte e 40 le carte il client usa le foto al posto dei disegni SVG.
app.get('/api/mazzo', (req, res) => res.json(mazzoFotografico()));
function mazzoFotografico() {
  const cartella = path.join(RADICE, 'public', 'assets', 'mazzo');
  const immagini = {};
  try {
    for (const f of fs.readdirSync(cartella)) {
      const m = f.match(/^([DCSB](?:[1-9]|10)|dorso)\.(png|jpg|jpeg|webp|svg)$/i);
      if (m) immagini[m[1] === 'dorso' ? 'dorso' : m[1].toUpperCase()] = `/assets/mazzo/${f}`;
    }
  } catch {}
  const carte = Object.keys(immagini).filter(k => k !== 'dorso').length;
  return { immagini, carte, completo: carte === 40 };
}

// diagnostica minima
app.get('/api/stato', (req, res) => {
  res.json({ stanze: [...stanze.values()].map(s => ({ codice: s.codice, fase: s.fase, umani: s.umaniPresenti().length, pubblica: s.opzioni.pubblica })) });
});

function linkStanza(req, codice) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}/s/${codice}`;
}

const server = http.createServer(app);

// ──────────────────────────────── websocket ────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const sessione = servitore.sessione(ws, { link: (codice) => `${proto}://${host}/s/${codice}` });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    sessione.messaggio(m);
  });
  ws.on('close', () => sessione.chiudi());
  ws.on('error', () => {});
});

// ping di sopravvivenza: un telefono che va in tasca chiude il socket senza dirlo
const battito = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 25000);
wss.on('close', () => clearInterval(battito));

// ──────────────────────────────── avvio ────────────────────────────────

function indirizziLocali() {
  const out = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) out.push({ nome, ip: i.address });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(RADICE, 'server.js')) {
  server.listen(PORTA, () => {
    fs.mkdirSync(path.join(RADICE, 'dati'), { recursive: true });
    console.log('\n  CUTICCHIUNE — carte siciliane, quattro giocatori, ognuno per sé\n');
    console.log(`  locale:   http://localhost:${PORTA}`);
    for (const a of indirizziLocali()) console.log(`  in rete:  http://${a.ip}:${PORTA}   (${a.nome})`);
    console.log('\n  Apri il link, crea un tavolo, condividi il codice o il QR.\n');
  });
}

export { app, server, stanze, nuovaStanza, impostazioni };
