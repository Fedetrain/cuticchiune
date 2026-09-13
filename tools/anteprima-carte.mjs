// Genera una pagina con tutte le 40 carte, per guardarle: node tools/anteprima-carte.mjs > out.html
import { svgCarta, svgDorso } from '../public/js/carte.js';
import { mazzoNuovo } from '../src/mazzo.js';
const carte = mazzoNuovo().map(c => `<figure><div class="c">${svgCarta(c)}</div><figcaption>${c}</figcaption></figure>`).join('');
console.log(`<!doctype html><html><head><meta charset="utf-8"><style>
body{background:#1f3a2a;margin:20px;font-family:sans-serif;color:#eee}
.g{display:grid;grid-template-columns:repeat(10,1fr);gap:10px}
.c svg{width:100%;height:auto;border-radius:6px;box-shadow:0 2px 6px #0008}
figcaption{font-size:11px;text-align:center}
</style></head><body><div class="g">${carte}<figure><div class="c">${svgDorso()}</div><figcaption>dorso</figcaption></figure></div></body></html>`);
