// RITAGLIA I FOGLI — node tools/ritaglia-fogli.mjs <cartella-coi-fogli> [--prova]
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
// COME TAGLIA. Il bordo di carta bianca su pagina bianca non si vede: cercarlo
// e' stato l'errore della prima versione, e le figure venivano tosate. Qui si
// guarda solo il DISEGNO: in ogni riga i disegni delle carte sono separati da
// strisce di bianco, quindi si trovano quelle, e ogni carta diventa il suo
// riquadro di inchiostro. Poi tutte le carte si riscalano dello STESSO fattore
// (se no un asso verrebbe grande come un re) e si centrano su fondo bianco.
//
// --prova non ritaglia: disegna i riquadri sul foglio e dice dove guardarli.
// Serve ffmpeg.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.join(RADICE, 'public', 'assets', 'mazzo');
const SEMI = { denari: 'D', coppe: 'C', spade: 'S', bastoni: 'B' };
const ATTESE = [4, 4, 2];      // quante carte per riga
const SOGLIA = 235;            // sotto = inchiostro
const LARG = 500, ALT = 800;   // la carta finita
const PIENO = 0.88;            // quanta altezza occupa il disegno di una figura

const dim = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);

/** I tratti pieni di un profilo: dove c'e' inchiostro, saltando le strisce
 *  vuote piu' corte di `unisci` (dentro una carta il bianco c'e' eccome). */
function tratti(profilo, unisci, soglia = 1) {
  const seg = []; let st = -1, vuoto = 0;
  for (let i = 0; i < profilo.length; i++) {
    if (profilo[i] > soglia) { if (st < 0) st = i; vuoto = 0; }
    else if (st >= 0 && ++vuoto >= unisci) { seg.push([st, i - vuoto]); st = -1; vuoto = 0; }
  }
  if (st >= 0) seg.push([st, profilo.length - 1]);
  return seg;
}

/**
 * Da dove a dove arriva il disegno, buttando via le righine.
 *
 * Dentro il riquadro di una carta finisce quasi sempre il BORDO stampato della
 * carta accanto: una riga sottile, staccata dal disegno, che nel ritaglio si
 * vede come un graffio. Qui il contenuto si divide in gruppi separati da
 * bianco, e i gruppi troppo sottili per essere un disegno si buttano.
 */
function estremi(da, a, quanto, lato) {
  const gruppi = []; let st = -1, vuoto = 0;
  for (let i = da; i <= a; i++) {
    if (quanto(i) > Math.max(1, lato * 0.01)) { if (st < 0) st = i; vuoto = 0; }
    else if (st >= 0 && ++vuoto >= 3) { gruppi.push([st, i - vuoto]); st = -1; vuoto = 0; }
  }
  if (st >= 0) gruppi.push([st, a]);
  if (!gruppi.length) return [da, a];
  // Il bordo della carta accanto si riconosce da due cose insieme: e' STRETTO
  // (due o tre pixel) ed e' LUNGO quanto tutta la carta. Nessun pezzo di
  // disegno e' fatto cosi' — nemmeno la casetta dell'asso, che e' larga.
  const veri = gruppi.filter(([p, q]) => {
    let piena = 0;
    for (let i = p; i <= q; i++) piena = Math.max(piena, quanto(i));
    return !(q - p + 1 <= Math.max(6, lato * 0.035) && piena >= lato * 0.6);
  });
  return veri.length ? [veri[0][0], veri[veri.length - 1][1]] : [da, a];
}

/** I riquadri di inchiostro delle dieci carte di un foglio. */
function riquadri(file) {
  const [w, h] = dim(file);
  const g = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: w * h + 1e6 });
  const inchiostro = (x, y) => g[y * w + x] < SOGLIA;
  const perColonna = (x, y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) if (inchiostro(x, y)) n++; return n; };
  const perRiga = (y, x0, x1) => { let n = 0; for (let x = x0; x <= x1; x++) if (inchiostro(x, y)) n++; return n; };

  // le tre righe del foglio
  // fra una riga e l'altra qualche granello c'e' sempre: una riga vale solo se
  // l'inchiostro occupa almeno il 2% della larghezza del foglio
  // Quanto e' larga la striscia bianca fra due righe cambia da foglio a foglio:
  // si prova a stringere finche' le righe non sono tre.
  const profRighe = Array.from({ length: h }, (_, y) => perRiga(y, 0, w - 1));
  let righe = [];
  for (const salto of [0.02, 0.015, 0.01, 0.007, 0.004, 0.002]) {
    righe = tratti(profRighe, Math.max(2, Math.round(h * salto)), w * 0.02)
      .filter(([a, b]) => b - a >= h * 0.12);
    if (righe.length === 3) break;
  }
  if (righe.length !== 3) throw new Error(`${path.basename(file)}: trovate ${righe.length} righe invece di 3`);

  const box = [];
  righe.forEach(([y0, y1], r) => {
    const n = ATTESE[r];
    const prof = Array.from({ length: w }, (_, x) => perColonna(x, y0, y1));
    // Dove finisce una carta e comincia la vicina? Si sa piu' o meno — le carte
    // sono uguali e in fila — e si sa dove ci sono strisce bianche. Quindi: si
    // parte dalle posizioni attese e ognuna scivola sulla striscia bianca piu'
    // vicina. Le strisce dentro una carta sono lontane dall'attesa e non danno
    // fastidio; se la striscia giusta manca, si taglia dove ci si aspettava.
    // colonne con disegno: un pelo di soglia, e via i granelli isolati — in un
    // foglio scansionato c'e' sempre una riga di sporco lungo il bordo, e se la
    // si prende per una carta il taglio parte da li' e sballa tutta la riga
    const banda = y1 - y0 + 1;
    const pieni = prof.map((v) => v > Math.max(1, banda * 0.01));
    for (let x = 0, st = -1; x <= w; x++) {
      if (x < w && pieni[x]) { if (st < 0) st = x; }
      else if (st >= 0) {
        if (x - st < w * 0.01) for (let k = st; k < x; k++) pieni[k] = false;
        st = -1;
      }
    }
    const a = pieni.indexOf(true), b = pieni.lastIndexOf(true);
    const passo = (b - a + 1) / n;
    const strisce = [];
    for (let x = a, st = -1; x <= b + 1; x++) {
      if (x <= b && !pieni[x]) { if (st < 0) st = x; }
      else if (st >= 0) { strisce.push([st, x - 1]); st = -1; }
    }
    const tagli = [a - 1];
    for (let i = 1; i < n; i++) {
      const atteso = a + i * passo;
      const vicina = strisce
        .map((s) => ({ centro: (s[0] + s[1]) / 2, largh: s[1] - s[0] + 1 }))
        .filter((s) => Math.abs(s.centro - atteso) < passo * 0.3)
        .sort((p, q) => q.largh - p.largh || Math.abs(p.centro - atteso) - Math.abs(q.centro - atteso))[0];
      tagli.push(Math.round(vicina ? vicina.centro : atteso));
    }
    tagli.push(b + 1);
    const carte = Array.from({ length: n }, (_, i) => [tagli[i] + 1, tagli[i + 1]]);

    for (let [x0, x1] of carte) {
      // Stretto sul disegno: il bianco fra una carta e l'altra non serve, la
      // carta finita lo rimette da sola, uguale per tutte. E si buttano le
      // righine isolate: sono il BORDO della carta accanto, non roba nostra —
      // una riga sottile con solo bianco dietro.
      [x0, x1] = estremi(x0, x1, (x) => perColonna(x, y0, y1), y1 - y0 + 1);
      const [su, giu] = estremi(y0, y1, (y) => perRiga(y, x0, x1), x1 - x0 + 1);
      box.push([x0, x1, su, giu]);
    }
  });
  return box;
}

function prova(file, box) {
  const fuori = path.join(os.tmpdir(), `riquadri-${path.basename(file, path.extname(file))}.png`);
  const rettangoli = box.map(([x0, x1, y0, y1]) =>
    `drawbox=x=${x0}:y=${y0}:w=${x1 - x0 + 1}:h=${y1 - y0 + 1}:color=red:t=3`).join(',');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', rettangoli, fuori]);
  console.log(`  prova: ${fuori}`);
}

// ─────────────────────────────── il lavoro ───────────────────────────────

const sorgente = path.resolve(process.argv[2] || RADICE);
const soloProva = process.argv.includes('--prova');
mkdirSync(DEST, { recursive: true });

const fogli = [];
for (const f of readdirSync(sorgente)) {
  const seme = Object.keys(SEMI).find((s) => f.toLowerCase().includes(s) && /\.(jpg|jpeg|png)$/i.test(f));
  if (seme) fogli.push({ seme, file: path.join(sorgente, f), box: riquadri(path.join(sorgente, f)) });
}
if (!fogli.length) throw new Error(`nessun foglio in ${sorgente}`);

if (soloProva) {
  for (const { file, box } of fogli) prova(file, box);
  process.exit(0);
}

// Una scala per foglio, uguale per le sue dieci carte: i quattro fogli sono
// scansionati a risoluzioni diverse, e una scala sola farebbe i bastoni giganti
// e le coppe piccole. La misura la da la mediana delle altezze (un asso storto
// non sposta nulla), con un tetto perche' la carta piu' larga ci stia dentro.
let fatte = 0;
for (const { seme, file, box } of fogli) {
  const alte = box.map(([, , a, b]) => b - a + 1).sort((x, y) => x - y);
  const larghe = Math.max(...box.map(([a, b]) => b - a + 1));
  const scala = Math.min((ALT * PIENO) / alte[Math.floor(alte.length / 2)], (LARG * 0.94) / larghe);

  box.forEach(([x0, x1, y0, y1], i) => {
    const larg = Math.round((x1 - x0 + 1) * scala);
    const alt = Math.round((y1 - y0 + 1) * scala);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf',
      `crop=${x1 - x0 + 1}:${y1 - y0 + 1}:${x0}:${y0},scale=${larg}:${alt}:flags=lanczos,` +
      `pad=${LARG}:${ALT}:(ow-iw)/2:(oh-ih)/2:white`,
      '-c:v', 'libwebp', '-quality', '88', path.join(DEST, `${SEMI[seme]}${i + 1}.webp`)]);
    fatte++;
  });
  console.log(`${seme} → ${SEMI[seme]}1…${SEMI[seme]}10`);
}
console.log(`${fatte} carte in ${path.relative(RADICE, DEST)}`);
if (fatte !== 40) process.exitCode = 1;
