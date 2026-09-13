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
// COME TAGLIA — e perche' cosi'.
// Il bordo di una carta bianca su pagina bianca non si vede: cercarlo tosava le
// figure. Inseguire il disegno, invece, faceva carte di misure diverse (un due
// e' quasi tutto bianco, un re e' pieno). Quindi qui si ricostruisce il
// RETICOLO: fra una carta e l'altra c'e' una striscia bianca, le strisce danno
// i tagli, i tagli danno il PASSO, e dal passo esce quanto misura una carta su
// quel foglio. Il disegno serve solo a sapere dove sta il centro. Cosi' tutte
// e dieci le carte di un foglio escono identiche, piene fino ai bordi.
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
const PROPORZIONE = 58 / 88;   // una carta siciliana vera: 58 mm per 88

const dim = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);
const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** I tratti pieni di un profilo, saltando i vuoti piu' corti di `unisci`. */
function tratti(profilo, unisci, soglia = 1) {
  const seg = []; let st = -1, vuoto = 0;
  for (let i = 0; i < profilo.length; i++) {
    if (profilo[i] > soglia) { if (st < 0) st = i; vuoto = 0; }
    else if (st >= 0 && ++vuoto >= unisci) { seg.push([st, i - vuoto]); st = -1; vuoto = 0; }
  }
  if (st >= 0) seg.push([st, profilo.length - 1]);
  return seg;
}

/** La misura del foglio: dove passano i tagli fra le carte, riga per riga, e
 *  quanto e' larga una carta (passo meno la striscia bianca). */
function reticolo(righe, profilo, w) {
  const perRiga = [];
  const passi = [], vuoti = [];

  righe.forEach(([y0, y1], r) => {
    const prof = profilo(y0, y1);
    const banda = y1 - y0 + 1;
    const pieni = prof.map((v) => v > Math.max(1, banda * 0.01));
    // via i granelli isolati: in una scansione c'e' sempre sporco lungo i bordi
    for (let x = 0, st = -1; x <= w; x++) {
      if (x < w && pieni[x]) { if (st < 0) st = x; }
      else if (st >= 0) {
        if (x - st < w * 0.01) for (let k = st; k < x; k++) pieni[k] = false;
        st = -1;
      }
    }
    const a = pieni.indexOf(true), b = pieni.lastIndexOf(true);
    const n = ATTESE[r];
    const attesa = (b - a + 1) / n;

    // le strisce bianche dentro la riga
    const strisce = [];
    for (let x = a, st = -1; x <= b + 1; x++) {
      if (x <= b && !pieni[x]) { if (st < 0) st = x; }
      else if (st >= 0) { strisce.push([st, x - 1]); st = -1; }
    }
    // i tagli interni: dove ci si aspetta una carta, sulla striscia piu' larga li' vicino
    const tagli = [];
    for (let i = 1; i < n; i++) {
      const atteso = a + i * attesa;
      const scelta = strisce
        .map((s) => ({ centro: (s[0] + s[1]) / 2, largh: s[1] - s[0] + 1 }))
        .filter((s) => Math.abs(s.centro - atteso) < attesa * 0.3)
        .sort((p, q) => q.largh - p.largh || Math.abs(p.centro - atteso) - Math.abs(q.centro - atteso))[0];
      tagli.push({ centro: scelta ? scelta.centro : atteso, largh: scelta ? scelta.largh : 0 });
    }
    for (let i = 1; i < tagli.length; i++) passi.push(tagli[i].centro - tagli[i - 1].centro);
    for (const t of tagli) if (t.largh) vuoti.push(t.largh);
    perRiga.push({ y0, y1, n, tagli: tagli.map((t) => t.centro), ink: [a, b], pieni });
  });

  // il passo: quello misurato fra due tagli veri; se una riga sola non basta,
  // si torna alla stima grossolana della riga da quattro
  const passo = passi.length ? mediana(passi) : mediana(perRiga.map((r) => (r.ink[1] - r.ink[0] + 1) / r.n));
  const vuoto = vuoti.length ? mediana(vuoti) : 0;
  return { perRiga, larghezza: passo - vuoto, passo };
}

/** I riquadri delle dieci carte di un foglio: tutti della stessa misura. */
function riquadri(file) {
  const [w, h] = dim(file);
  const g = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: w * h + 1e6 });
  const inchiostro = (x, y) => g[y * w + x] < SOGLIA;
  const colonna = (x, y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) if (inchiostro(x, y)) n++; return n; };
  const riga = (y, x0, x1) => { let n = 0; for (let x = x0; x <= x1; x++) if (inchiostro(x, y)) n++; return n; };

  // le tre righe: quanto e' larga la striscia bianca fra una e l'altra cambia
  // da foglio a foglio, quindi si stringe finche' le righe non sono tre
  const profRighe = Array.from({ length: h }, (_, y) => riga(y, 0, w - 1));
  let righe = [];
  for (const salto of [0.02, 0.015, 0.01, 0.007, 0.004, 0.002]) {
    righe = tratti(profRighe, Math.max(2, Math.round(h * salto)), w * 0.02)
      .filter(([a, b]) => b - a >= h * 0.12);
    if (righe.length === 3) break;
  }
  if (righe.length !== 3) throw new Error(`${path.basename(file)}: trovate ${righe.length} righe invece di 3`);

  const { perRiga, larghezza, passo } = reticolo(righe,
    (y0, y1) => Array.from({ length: w }, (_, x) => colonna(x, y0, y1)), w);
  const misure = [];
  for (const { y0, y1, n, tagli, pieni } of perRiga) {
    // i centri delle carte: dai tagli, allungando di un passo ai lati — e' cosi'
    // che si ritrovano anche i bordi esterni, che nel bianco non si vedono
    // ai lati si allunga di un PASSO intero (carta + striscia bianca): allungare
    // della sola carta stringerebbe il reticolo di mezza striscia per parte
    const bordi = [tagli[0] - passo, ...tagli, tagli[tagli.length - 1] + passo];
    const centri = Array.from({ length: n }, (_, i) => (bordi[i] + bordi[i + 1]) / 2);

    centri.forEach((cxGriglia, i) => {
      // La misura viene dal reticolo, il CENTRO dal disegno di questa carta: il
      // reticolo dice quanto e' grande una carta, ma di mezzo pixel si sposta —
      // e mezzo pixel sul foglio diventa una fetta di cavallo nel ritaglio.
      const da = Math.max(0, Math.round(bordi[i])), a2 = Math.min(w - 1, Math.round(bordi[i + 1]));
      let primo = -1, ultimo = -1;
      for (let x = da; x <= a2; x++) if (pieni[x]) { if (primo < 0) primo = x; ultimo = x; }
      const cxDisegno = primo < 0 ? cxGriglia : (primo + ultimo) / 2;
      // ci si fida del disegno solo se non si allontana troppo dal reticolo
      const cx = Math.abs(cxDisegno - cxGriglia) < larghezza * 0.15 ? cxDisegno : cxGriglia;

      const dentro0 = Math.max(0, Math.round(cx - larghezza / 2));
      const dentro1 = Math.min(w - 1, Math.round(cx + larghezza / 2));
      let su = y0, giu = y1;
      while (su < giu && riga(su, dentro0, dentro1) <= Math.max(1, (dentro1 - dentro0) * 0.02)) su++;
      while (giu > su && riga(giu, dentro0, dentro1) <= Math.max(1, (dentro1 - dentro0) * 0.02)) giu--;
      misure.push({ cx, cy: (su + giu) / 2, largo: ultimo - primo + 1, alto: giu - su + 1 });
    });
  }

  // La misura definitiva della carta: quella del reticolo, ma mai piu' stretta
  // del disegno piu' largo del foglio (il cavallo) ne' piu' bassa del disegno
  // piu' alto (il re), se no restano senza testa e senza piedi. Si guarda il
  // nono su dieci, non il massimo, per non farsi rovinare i conti da un
  // riquadro sporco — e un filo di margine attorno.
  const quasiMax = (quali) => {
    const v = misure.map(quali).sort((a, b) => a - b);
    return v[Math.floor(v.length * 0.9)];
  };
  // ...ma senza esagerare: una carta non puo' essere piu' larga del passo (se
  // lo fosse, le carte si sovrapporrebbero), e non puo' essere molto piu' alta
  // di quanto dice la sua proporzione. Senza questi due tetti basta un riquadro
  // sporco — mezza carta della riga accanto — per far crescere tutto il mazzo.
  const fra = (v, min, max) => Math.min(Math.max(v, min), max);
  const largo = fra(quasiMax((m) => m.largo) * 1.03, larghezza, passo * 0.98);
  const alto = fra(quasiMax((m) => m.alto) * 1.04, largo / PROPORZIONE, (largo / PROPORZIONE) * 1.12);

  return misure.map(({ cx, cy }) => {
    const x = Math.min(Math.max(cx, largo / 2), w - largo / 2);
    const y = Math.min(Math.max(cy, alto / 2), h - alto / 2);
    return [Math.round(x - largo / 2), Math.round(x + largo / 2),
      Math.round(y - alto / 2), Math.round(y + alto / 2)];
  });
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

// Il riquadro E' la carta: si porta a 500x800 e basta. La carta vera e' un filo
// piu' larga in proporzione (58x88 contro 5x8): quel 5% si schiaccia qui, non si
// vede, e in cambio tutte le carte escono uguali e piene.
let fatte = 0;
for (const { seme, file, box } of fogli) {
  box.forEach(([x0, x1, y0, y1], i) => {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf',
      `crop=${x1 - x0 + 1}:${y1 - y0 + 1}:${x0}:${y0},scale=${LARG}:${ALT}:flags=lanczos`,
      '-c:v', 'libwebp', '-quality', '88', path.join(DEST, `${SEMI[seme]}${i + 1}.webp`)]);
    fatte++;
  });
  console.log(`${seme} → ${SEMI[seme]}1…${SEMI[seme]}10`);
}
console.log(`${fatte} carte in ${path.relative(RADICE, DEST)}`);
if (fatte !== 40) process.exitCode = 1;
