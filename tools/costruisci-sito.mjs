// COSTRUISCE IL SITO STATICO — node tools/costruisci-sito.mjs [cartella]
//
// Mette in sito/ (o dove gli dici) tutto quello che serve a giocare senza
// nessun server: la pagina, il motore (src/), le carte disegnate, i caratteri.
// La differenza con il sito servito da server.js e' una riga iniettata nella
// pagina — window.CUTICCHIUNE_STATICO — che dice al client di tenersi il
// tavolo in casa (vedi public/js/ambiente.js).
//
// Due cose restano fuori apposta:
//   · public/assets/mazzo/  le scansioni di un mazzo in commercio: si usano in
//     casa, non si pubblicano. Online vanno le carte disegnate da carte.js.
//   · /api/  non esiste: niente albo, niente elenco di tavoli pubblici.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEST = path.resolve(process.argv[2] || path.join(RADICE, 'sito'));
const FUORI = ['assets/mazzo'];          // niente scansioni nel sito pubblico
const TESTI = new Set(['.html', '.css', '.webmanifest']);

/** Gli indirizzi assoluti (/js/app.js) non funzionano sotto un sottodominio di
 *  progetto (fedetrain.github.io/cuticchiune/): diventano relativi. */
function relativizza(testo, profondita) {
  const su = profondita === 0 ? '' : '../'.repeat(profondita);
  return testo
    .replace(/(href|src)="\/(?!\/)/g, `$1="${su}`)
    .replace(/url\('\/(?!\/)/g, `url('${su}`)
    .replace(/"start_url":\s*"\/"/, '"start_url": "./"')
    .replace(/"src":\s*"\/(?!\/)/g, `"src": "${su}`);
}

function copia(da, a, profondita = 0) {
  fs.mkdirSync(a, { recursive: true });
  for (const voce of fs.readdirSync(da, { withFileTypes: true })) {
    const dentro = path.join(da, voce.name);
    const relativo = path.relative(path.join(RADICE, 'public'), dentro).split(path.sep).join('/');
    if (FUORI.includes(relativo)) { console.log(`  · saltato ${relativo} (non si pubblica)`); continue; }
    if (voce.isDirectory()) { copia(dentro, path.join(a, voce.name), profondita + 1); continue; }
    const ext = path.extname(voce.name);
    if (TESTI.has(ext)) {
      fs.writeFileSync(path.join(a, voce.name), relativizza(fs.readFileSync(dentro, 'utf8'), profondita));
    } else {
      fs.copyFileSync(dentro, path.join(a, voce.name));
    }
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
copia(path.join(RADICE, 'public'), DEST);

// il motore, le stesse fonti del server: qui girano nel browser
fs.mkdirSync(path.join(DEST, 'src'), { recursive: true });
for (const f of fs.readdirSync(path.join(RADICE, 'src'))) {
  if (f === 'albo.js') continue;                      // vuole il disco: sul sito non serve
  fs.copyFileSync(path.join(RADICE, 'src', f), path.join(DEST, 'src', f));
}

// l'interruttore: da qui in poi il client sa di essere solo al mondo
const pagina = path.join(DEST, 'index.html');
const html = fs.readFileSync(pagina, 'utf8');
if (!html.includes('CUTICCHIUNE_STATICO')) {
  fs.writeFileSync(pagina, html.replace('<script type="module"',
    '<script>window.CUTICCHIUNE_STATICO = true;</script>\n<script type="module"'));
}

// Pages non deve passare le pagine per Jekyll
fs.writeFileSync(path.join(DEST, '.nojekyll'), '');
// chi apre il link di un tavolo con un percorso che non esiste torna alla home
fs.copyFileSync(pagina, path.join(DEST, '404.html'));

const quanti = (function conta(d) {
  return fs.readdirSync(d, { withFileTypes: true })
    .reduce((n, v) => n + (v.isDirectory() ? conta(path.join(d, v.name)) : 1), 0);
})(DEST);
console.log(`sito pronto in ${path.relative(RADICE, DEST) || DEST} — ${quanti} file`);
