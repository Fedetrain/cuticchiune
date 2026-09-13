// SCREENSHOT — node tools/screenshot.mjs
// Accende il server, apre Chromium (quello di Playwright) e fotografa le
// schermate vere: home, lobby, tavolo in partita, fine mano, fine partita —
// su telefono e su schermo largo. Le immagini vanno in screenshot/.
// Serve anche come collaudo del client: ogni errore JavaScript nella console
// del browser fa fallire il comando.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { server, impostazioni } from '../server.js';
import { RITMO } from '../src/stanza.js';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(QUI, '..', 'screenshot');
fs.mkdirSync(DEST, { recursive: true });

const veloce = process.argv.includes('--lento') ? RITMO : { ...RITMO, presaInVista: 700, fineMano: 1200, primaCartaBot: 250, cartaBot: 260, graziaCaduto: 3000 };
impostazioni.tempi = veloce;
process.env.CUTICCHIUNE_ALBO = '/tmp/cuticchiune-albo-screenshot.json';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

await new Promise(r => server.listen(0, '127.0.0.1', r));
const porta = server.address().port;
const base = `http://127.0.0.1:${porta}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const errori = [];
const attendi = (ms) => new Promise(r => setTimeout(r, ms));
// un errore qui dentro deve far uscire il comando, non lasciare il server appeso
process.on('unhandledRejection', (e) => { console.error('✖ ' + (e?.message || e)); process.exit(1); });

async function pagina(viewport, nome) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errori.push(`[${nome}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errori.push(`[${nome}] console: ${m.text()}`); });
  return p;
}
async function foto(p, nome) { await p.screenshot({ path: path.join(DEST, nome + '.png') }); console.log(`  📷 ${nome}.png`); }

/** Gioca da umano finché `pred` non è vera (guarda il DOM, come farebbe una persona). */
async function giocaFinche(p, pred, maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (await p.evaluate(pred)) return true;
    const giocata = await p.evaluate(() => {
      const sugg = (document.querySelector('#suggerimento')?.textContent || '').toLowerCase();
      if (!sugg.includes('tocca a te')) return false;
      const c = document.querySelector('#mia-mano .carta:not(.non-valida)');
      if (!c) return false;
      c.click(); c.click();
      return true;
    });
    // il padrone salta l'attesa di fine mano
    await p.evaluate(() => { const b = document.querySelector('#btn-avanti'); if (b && !b.hidden && !b.closest('[hidden]')) b.click(); });
    await attendi(giocata ? 120 : 80);
  }
  return false;
}

let arrivato = [];
try { await flusso(); }
catch (e) { console.error('✖ ' + (e?.message || e)); await browser.close().catch(() => {}); process.exit(1); }

async function flusso() {
// ── telefono ──
const tel = await pagina({ width: 390, height: 844 }, 'telefono');
await tel.goto(base + '/');
await tel.waitForSelector('#home.attivo');
await attendi(400);
await foto(tel, '01-home-telefono');

await tel.fill('#in-nome', 'Federico');
await tel.click('#btn-crea');
await tel.waitForSelector('#lobby.attivo');
await attendi(500);
await foto(tel, '02-lobby-telefono');

const codice = await tel.textContent('#lobby-codice');

// ── un amico entra dal link, su schermo largo ──
const pc = await pagina({ width: 1280, height: 800 }, 'pc');
await pc.goto(`${base}/s/${codice}`);
await pc.waitForSelector('#home.attivo');
await pc.fill('#in-nome', 'Turi');
await pc.click('#blocco-codice button');
await pc.waitForSelector('#lobby.attivo');
await attendi(400);

// il padrone aggiunge due bot
for (let i = 0; i < 2; i++) { await tel.click('.sedia.libera .sedia-azione'); await attendi(150); }
await attendi(400);
await foto(tel, '03-lobby-completa-telefono');
await foto(pc, '04-lobby-pc');
await pc.click('#lobby [data-apri="regole"]');
await attendi(300);
await foto(pc, '04b-regole-pc');
await pc.click('#regole [data-chiudi="regole"]');

await tel.click('#btn-inizia');
await tel.waitForSelector('#partita.attivo');
await attendi(1800);   // la distribuzione
await foto(tel, '05-distribuzione-telefono');

// aspetto un momento con carte sul tavolo e il turno a me
const conCarte = () => document.querySelectorAll('.slot .carta').length >= 2 && (document.querySelector('#suggerimento')?.textContent || '').toLowerCase().includes('tocca a te');
await Promise.all([giocaFinche(tel, conCarte, 40000), giocaFinche(pc, conCarte, 40000)]);
await attendi(300);
await foto(tel, '06-partita-telefono');
await foto(pc, '07-partita-pc');

// scelgo una carta (alzata) per la foto
await tel.evaluate(() => { const c = document.querySelector('#mia-mano .carta:not(.non-valida)'); c?.click(); });
await attendi(400);
await foto(tel, '08-carta-scelta-telefono');

// gioco fino alla fine della mano, su entrambe le pagine
arrivato = await Promise.all([
  giocaFinche(tel, () => !document.querySelector('#velo-fine-mano').hidden, 90000),
  giocaFinche(pc, () => !document.querySelector('#velo-fine-mano').hidden, 90000),
]);
await attendi(600);
await foto(tel, '09-fine-mano-telefono');
await foto(pc, '10-fine-mano-pc');

// apro la chat e mando un emote, per la foto dei fumetti
await pc.click('#btn-chat');
await pc.click('#emote-riga .emote');
await attendi(500);
await foto(pc, '11-chat-pc');
await pc.click('#chat [data-chiudi="chat"]');

// fino alla fine della partita
await Promise.all([
  giocaFinche(tel, () => !document.querySelector('#velo-fine-partita').hidden, 240000),
  giocaFinche(pc, () => !document.querySelector('#velo-fine-partita').hidden, 240000),
]);
await attendi(600);
await foto(tel, '12-fine-partita-telefono');
await foto(pc, '13-fine-partita-pc');
}

await browser.close();
server.close();
if (errori.length) { console.error('\n✖ errori nel browser:\n  ' + errori.join('\n  ')); process.exit(1); }
console.log(`\nfatto: ${arrivato.every(Boolean) ? 'partita giocata fino in fondo' : 'ATTENZIONE: la mano non è finita in tempo'}, nessun errore nel browser.`);
process.exit(0);
