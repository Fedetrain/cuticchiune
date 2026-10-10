// IL QR DEL TAVOLO. Col server dietro lo disegna lui (/api/qr). Sul sito
// statico non c'e' nessuno a disegnarlo, quindi lo fa il browser con la
// copia di qrcode-generator che sta in public/vendor/.

import { STATICO } from './ambiente.js';

let caricamento = null;
function caricaLib() {
  if (globalThis.qrcode) return Promise.resolve();
  if (!caricamento) caricamento = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'vendor/qrcode.min.js'; s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
  return caricamento;
}

/** L'indirizzo dell'immagine del QR per questo tavolo (src di un <img>). */
export async function sorgenteQR(codice, link) {
  if (!STATICO) return `/api/qr/${codice}`;
  await caricaLib();
  const q = globalThis.qrcode(0, 'M');
  q.addData(link);
  q.make();
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(q.createSvgTag({ cellSize: 4, margin: 1 }));
}
