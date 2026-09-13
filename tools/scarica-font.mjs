// SCARICA I FONT UNA VOLTA SOLA — poi il gioco gira anche senza internet.
//
//   node tools/scarica-font.mjs
//
// Regola del progetto: nessuna dipendenza da CDN. I font OFL vengono messi
// in public/assets/fonts/ e serviti dal server locale. Solo il blocco latin.
// Ruoli: Fraunces (i titoli: un serif morbido con carattere, che a corpo
// grande diventa quasi un'insegna), Figtree (tutto il resto, numeri compresi).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(QUI, '..', 'public', 'assets', 'fonts');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';

const FAMIGLIE = [
  { css: 'Fraunces:opsz,wght@9..144,700;9..144,900', nome: 'fraunces', pesi: ['700', '900'], ofl: 'fraunces' },
  { css: 'Figtree:wght@400;600;800', nome: 'figtree', pesi: ['400', '600', '800'], ofl: 'figtree' },
];

async function scarica(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} su ${url}`);
  return r;
}
async function licenzaDi(nome) {
  return (await scarica(`https://raw.githubusercontent.com/google/fonts/main/ofl/${nome}/OFL.txt`)).text();
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
let totale = 0;
for (const fam of FAMIGLIE) {
  const css = await (await scarica(`https://fonts.googleapis.com/css2?family=${fam.css}&display=swap`)).text();
  const blocchi = css.split('/*').map(b => '/*' + b).filter(b => b.startsWith('/* latin */'));
  for (const b of blocchi) {
    const peso = (b.match(/font-weight:\s*(\d+)/) || [])[1];
    const src = (b.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (!peso || !src || !fam.pesi.includes(peso)) continue;
    // Google serve il font VARIABILE: un solo file copre tutti i pesi richiesti
    const nomeFile = `${fam.nome}.woff2`;
    if (fs.existsSync(path.join(DEST, nomeFile))) continue;
    const buf = Buffer.from(await (await scarica(src)).arrayBuffer());
    fs.writeFileSync(path.join(DEST, nomeFile), buf);
    totale += buf.length;
    console.log(`  ${nomeFile.padEnd(24)} ${(buf.length / 1024).toFixed(1)} KB`);
  }
}
const licenze = [
  'I font in questa cartella sono distribuiti con la SIL Open Font License 1.1.',
  'Sotto, il testo integrale della licenza di ciascuno, come la OFL richiede.',
  'Scaricati con tools/scarica-font.mjs. Sottoinsieme: solo il blocco latin.',
];
for (const fam of FAMIGLIE) licenze.push('', '='.repeat(70), fam.ofl.toUpperCase(), '='.repeat(70), '', await licenzaDi(fam.ofl));
fs.writeFileSync(path.join(DEST, 'LICENZA-OFL.txt'), licenze.join('\n'), 'utf8');
console.log(`\n${(totale / 1024).toFixed(1)} KB in public/assets/fonts/`);
