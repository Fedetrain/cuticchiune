// IMPORTA IL MAZZO — dallo zip delle carte siciliane alle 40 carte del gioco.
//
//   node tools/importa-mazzo.mjs [cartella-o-zip]
//
// Lo zip "Carte Siciliane" ha 40 png 1000x1600 numerati 1…40, in ordine:
// coppe 1-10, denari 11-20, bastoni 21-30, spade 31-40; dentro ogni decina
// asso, 2…7, donna, cavallo, re. Qui diventano C1…S10 in public/assets/mazzo/,
// webp a 500x800: e' quello che server.js serve e carte.js usa al posto degli SVG.
//
// Serve ffmpeg nel PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.join(RADICE, 'public', 'assets', 'mazzo');
const SEMI = ['C', 'D', 'B', 'S'];   // l'ordine dello zip
const LARG = 500, ALT = 800;

const sorgente = process.argv[2] || path.join(RADICE, 'Carte Siciliane');
if (!statSync(sorgente, { throwIfNoEntry: false })?.isDirectory())
  throw new Error(`cartella non trovata: ${sorgente} (scompatta prima lo zip)`);

const file = new Map();
for (const f of readdirSync(sorgente)) {
  const m = f.match(/^(\d{1,2})\.(png|jpg|jpeg|webp)$/i);
  if (m) file.set(Number(m[1]), path.join(sorgente, f));
}
if (file.size !== 40) throw new Error(`trovate ${file.size} immagini invece di 40`);

mkdirSync(DEST, { recursive: true });
for (let n = 1; n <= 40; n++) {
  const nome = `${SEMI[Math.floor((n - 1) / 10)]}${((n - 1) % 10) + 1}.webp`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file.get(n),
    '-vf', `scale=${LARG}:${ALT}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '85',
    path.join(DEST, nome)]);
}
console.log(`40 carte in ${path.relative(RADICE, DEST)}`);
