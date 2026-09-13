// RITAGLIA I FOGLI — node tools/ritaglia-fogli.mjs <cartella-coi-quattro-fogli>
//
// Da quattro scansioni, una per seme, alle 40 carte singole di
// public/assets/mazzo/ (webp 500x800, il formato che il gioco si aspetta).
//
// I fogli sono questi, e sono liberi: Wikimedia Commons, «Carte da gioco
// siciliane» di Matsoftware, CC BY-SA 3.0 — un file per seme, dieci carte
// disposte 4 + 4 + 2 (asso…sette, donna, cavallo, re):
//   https://commons.wikimedia.org/wiki/File:Carte_da_gioco_siciliane_-_denari.jpg
//   ...coppe.jpg   ...spade.jpg   ...bastoni.jpg
// Il nome del file dice il seme. Ritagliare e riscalare sono modifiche: vanno
// dichiarate, ed e' per questo che il sito porta i CREDITI.
//
// Le carte vicine sul foglio si toccano — fra loro non c'e' banda bianca da
// cercare — quindi le righe si dividono in parti uguali. Serve ffmpeg.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.join(RADICE, 'public', 'assets', 'mazzo');
const SEMI = { denari: 'D', coppe: 'C', spade: 'S', bastoni: 'B' };
const ATTESE = [4, 4, 2];      // quante carte per riga
const SOGLIA = 235;            // sotto = pixel "non bianco"
const LARG = 500, ALT = 800;

const dim = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);

/** Bande piene di un profilo, unendo i buchi piccoli e riassorbendo i frammenti
 *  staccati (il bordo di una carta che si separa dal corpo). */
function bande(profilo, lim, minLungh, unisciSotto) {
  const seg = []; let st = -1;
  for (let i = 0; i < profilo.length; i++) {
    if (profilo[i] > lim && st < 0) st = i;
    else if (profilo[i] <= lim && st >= 0) { seg.push([st, i - 1]); st = -1; }
  }
  if (st >= 0) seg.push([st, profilo.length - 1]);
  const uniti = [];
  for (const s of seg) {
    const ult = uniti[uniti.length - 1];
    if (ult && s[0] - ult[1] <= unisciSotto) ult[1] = s[1]; else uniti.push([...s]);
  }
  const grandi = uniti.filter((s) => s[1] - s[0] >= minLungh);
  for (const s of uniti) {
    if (grandi.includes(s)) continue;
    const g = grandi.find((g) => Math.abs(g[0] - s[1]) <= minLungh / 2 || Math.abs(s[0] - g[1]) <= minLungh / 2);
    if (g) { g[0] = Math.min(g[0], s[0]); g[1] = Math.max(g[1], s[1]); }
  }
  return grandi;
}

function riquadri(file) {
  const [w, h] = dim(file);
  const g = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: w * h + 1e6 });
  const scuro = (x, y) => g[y * w + x] < SOGLIA;
  const colonna = (x, y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) if (scuro(x, y)) n++; return n; };

  const pr = new Array(h);
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (scuro(x, y)) n++; pr[y] = n; }
  const righe = bande(pr, w * 0.02, h * 0.12, 10);
  if (righe.length !== 3) throw new Error(`${path.basename(file)}: trovate ${righe.length} righe invece di 3`);

  const estensioni = righe.map(([y0, y1]) => {
    const pc = Array.from({ length: w }, (_, x) => colonna(x, y0, y1));
    const b = bande(pc, (y1 - y0) * 0.02, w * 0.09, 6);
    return b.length ? [b[0][0], b[b.length - 1][1]] : [0, w - 1];
  });
  // le due righe da 4 stanno sullo stesso reticolo: si prende il bordo piu'
  // esterno delle due, perche' in una riga la prima carta puo' essere quasi
  // tutta bianca (l'asso di coppe) e sfuggire al profilo
  const q4 = estensioni.filter((_, i) => ATTESE[i] === 4);
  const unione = [Math.min(...q4.map((e) => e[0])), Math.max(...q4.map((e) => e[1]))];

  const box = [];
  righe.forEach(([y0, y1], r) => {
    const [x0b, x1b] = ATTESE[r] === 4 ? unione : estensioni[r];
    const passo = (x1b - x0b + 1) / ATTESE[r];
    for (let i = 0; i < ATTESE[r]; i++) {
      let a = Math.round(x0b + i * passo), b = Math.round(x0b + (i + 1) * passo) - 1;
      while (a < b && colonna(a, y0, y1) < (y1 - y0) * 0.01) a++;   // stringi sul contenuto vero
      while (b > a && colonna(b, y0, y1) < (y1 - y0) * 0.01) b--;
      const m = Math.round((b - a) * 0.02);                          // un filo di bianco attorno
      box.push([Math.max(0, a - m), Math.min(w - 1, b + m), y0, y1]);
    }
  });
  return box;
}

const sorgente = path.resolve(process.argv[2] || RADICE);
mkdirSync(DEST, { recursive: true });
let fatte = 0;
for (const f of readdirSync(sorgente)) {
  const seme = Object.keys(SEMI).find((s) => f.toLowerCase().includes(s) && /\.(jpg|jpeg|png)$/i.test(f));
  if (!seme) continue;
  const file = path.join(sorgente, f);
  riquadri(file).forEach(([x0, x1, y0, y1], i) => {
    const nome = `${SEMI[seme]}${i + 1}.webp`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf',
      `crop=${x1 - x0 + 1}:${y1 - y0 + 1}:${x0}:${y0},scale=${LARG}:${ALT}:flags=lanczos,` +
      `pad=${LARG}:${ALT}:(ow-iw)/2:(oh-ih)/2:white`,
      '-c:v', 'libwebp', '-quality', '88', path.join(DEST, nome)]);
    fatte++;
  });
  console.log(`${seme} → ${SEMI[seme]}1…${SEMI[seme]}10`);
}
console.log(`${fatte} carte in ${path.relative(RADICE, DEST)}`);
if (fatte !== 40) process.exitCode = 1;
