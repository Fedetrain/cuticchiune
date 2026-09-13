// LE CARTE — 40 SVG generati, sul modello del mazzo siciliano tradizionale.
//
// Niente immagini da scaricare: ogni carta è un <svg> costruito qui. Il
// disegno segue i tratti documentati del mazzo siciliano («carte siciliane»,
// pattern spagnolo-portoghese di formato piccolo):
//   · denari: soli d'oro a rosone; l'ASSO porta l'aquila «a volo basso»,
//     il TRE porta la Trinacria fra le monete (la carta più riconoscibile);
//   · coppe: calici d'oro e rosso; l'ASSO è il lebete nuziale, il grande
//     vaso a due anse della Magna Grecia;
//   · spade: scimitarre ricurve che si intrecciano (l'asso è dritto, col
//     fiocco);
//   · bastoni: rami nodosi con le foglie, intrecciati come le spade;
//   · le figure sono a figura intera, come nel pattern spagnolo: la DONNA
//     (che qui prende il posto del fante), il CAVALLO e il RE in piedi;
//   · fra i semi delle carte numerali corrono piccole decorazioni floreali,
//     che riempiono gli spazi vuoti — l'altro tratto tipico del mazzo.
//
// Se nella cartella public/assets/mazzo/ ci sono le foto o le scansioni di un
// mazzo vero (D1.png … B10.png, dorso.png), il client le usa al posto di
// questi disegni: vedi usaImmagini() in fondo e il README.
//
// Coordinate: viewBox 0 0 200 320. Le carte si scalano con il CSS.

const W = 200, H = 320;

const T = {
  carta: '#f6efdc', bordo: '#3b2a12', cornice: '#a8874a',
  oro: '#e0a92a', oroScuro: '#a3720f', oroChiaro: '#f7d977',
  rosso: '#b8332a', rossoScuro: '#7d1e18',
  blu: '#2e4d80', bluScuro: '#1b2e50', bluChiaro: '#7d9bd0', acciaio: '#b9c4d6',
  verde: '#4f7a34', verdeScuro: '#2f4d1e', verdeChiaro: '#86ad5c',
  marrone: '#7a4b22', marroneScuro: '#4a2b10',
  pelle: '#f0c9a0', nero: '#231a10', bianco: '#fbf7ee',
};

// ─────────────────────────────── i semi ───────────────────────────────

/** Un denaro: sole d'oro a rosone, con l'anello a perline e il cuore rosso. */
function denaro(cx, cy, r) {
  const raggi = [], perline = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const x1 = cx + Math.cos(a) * r * 0.3, y1 = cy + Math.sin(a) * r * 0.3;
    const x2 = cx + Math.cos(a) * r * 0.7, y2 = cy + Math.sin(a) * r * 0.7;
    raggi.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${T.oroScuro}" stroke-width="${(r * 0.08).toFixed(1)}" stroke-linecap="round"/>`);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    perline.push(`<circle cx="${(cx + Math.cos(a) * r * 0.87).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.87).toFixed(1)}" r="${(r * 0.05).toFixed(1)}" fill="${T.oroScuro}"/>`);
  }
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${T.oro}" stroke="${T.bordo}" stroke-width="${(r * 0.07).toFixed(1)}"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.78).toFixed(1)}" fill="${T.oroChiaro}" stroke="${T.oroScuro}" stroke-width="${(r * 0.05).toFixed(1)}"/>
    ${raggi.join('')}${perline.join('')}
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.22).toFixed(1)}" fill="${T.rosso}" stroke="${T.bordo}" stroke-width="${(r * 0.05).toFixed(1)}"/>
  </g>`;
}

/** Una coppa: calice con coperchio a cupola, gambo e piede. `s` è la scala. */
function coppa(cx, cy, s = 1) {
  return `<g transform="translate(${cx} ${cy}) scale(${s})" stroke="${T.bordo}" stroke-width="2.4" stroke-linejoin="round">
    <path d="M-17 -20 L17 -20 L15 -4 Q10 10 0 12 Q-10 10 -15 -4 Z" fill="${T.oro}"/>
    <path d="M-17 -20 Q0 -36 17 -20 Z" fill="${T.rosso}"/>
    <circle cx="0" cy="-34" r="3.4" fill="${T.oroChiaro}"/>
    <path d="M-12 -13 L12 -13" stroke="${T.blu}" stroke-width="2.6"/>
    <rect x="-3" y="12" width="6" height="10" fill="${T.oroScuro}"/>
    <path d="M-15 28 Q0 17 15 28 L15 30 L-15 30 Z" fill="${T.blu}"/>
  </g>`;
}

/** Una spada ricurva (scimitarra), punta in alto, elsa d'oro e rossa. */
function spada(cx, cy, s = 1, rot = 0) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})" stroke="${T.bordo}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M0 -60 Q16 -30 7 12 L-4 12 Q-2 -30 0 -60 Z" fill="${T.acciaio}"/>
    <path d="M0 -60 Q16 -30 7 12 L2 12 Q6 -30 0 -60 Z" fill="${T.blu}" stroke="none"/>
    <path d="M-14 12 Q0 8 14 12 L14 17 Q0 14 -14 17 Z" fill="${T.oro}"/>
    <rect x="-3.5" y="17" width="7" height="18" fill="${T.rosso}"/>
    <circle cx="0" cy="39" r="4.5" fill="${T.oro}"/>
  </g>`;
}

/** Un bastone: ramo nodoso con le foglie. */
function bastone(cx, cy, s = 1, rot = 0) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})" stroke="${T.bordo}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M-5 -56 Q-9 -40 -6 -20 Q-9 0 -5 20 Q-8 36 -4 52 L4 52 Q8 36 5 20 Q9 0 6 -20 Q9 -40 5 -56 Z" fill="${T.marrone}"/>
    <path d="M-1 -50 Q-2 0 1 48" stroke="${T.marroneScuro}" stroke-width="2" fill="none"/>
    <circle cx="-5" cy="-22" r="3" fill="${T.marroneScuro}" stroke="none"/>
    <circle cx="5" cy="18" r="3" fill="${T.marroneScuro}" stroke="none"/>
    <path d="M-6 -34 Q-26 -42 -22 -20 Q-10 -24 -6 -34 Z" fill="${T.verde}"/>
    <path d="M6 -8 Q26 -16 22 6 Q10 2 6 -8 Z" fill="${T.verde}"/>
    <path d="M-5 26 Q-22 22 -18 40 Q-8 36 -5 26 Z" fill="${T.verdeChiaro}"/>
  </g>`;
}

// ───────────────────────────── ornamenti ─────────────────────────────

/** Il fiorellino che riempie gli spazi fra i semi. */
function fiore(cx, cy, s = 1, colore = T.rosso) {
  const petali = [0, 90, 180, 270].map(a => `<ellipse cx="0" cy="-7" rx="3.2" ry="6" fill="${colore}" transform="rotate(${a})"/>`).join('');
  return `<g transform="translate(${cx} ${cy}) scale(${s})" stroke="${T.bordo}" stroke-width="1.2">
    <path d="M-16 0 Q-10 -6 -4 0 M16 0 Q10 -6 4 0" fill="none" stroke="${T.verde}" stroke-width="2"/>
    ${petali}<circle cx="0" cy="0" r="2.6" fill="${T.oro}"/>
  </g>`;
}

/** La Trinacria: tre gambe piegate attorno al volto, come sul tre di denari. */
function trinacria(cx, cy, s = 1) {
  const gamba = `<g stroke="${T.bordo}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M0 -10 L4 -30 L20 -40 L36 -34 L38 -26 L26 -30 L14 -24 L10 -8 Z" fill="${T.oro}"/>
    <path d="M36 -34 L44 -36 L46 -30 L38 -26 Z" fill="${T.rosso}"/>
  </g>`;
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    ${[0, 120, 240].map(a => `<g transform="rotate(${a})">${gamba}</g>`).join('')}
    <circle cx="0" cy="0" r="13" fill="${T.pelle}" stroke="${T.bordo}" stroke-width="2"/>
    <path d="M-13 -4 Q-16 -18 -4 -16 M13 -4 Q16 -18 4 -16" fill="none" stroke="${T.verde}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M-10 -8 Q0 -16 10 -8" fill="none" stroke="${T.nero}" stroke-width="2"/>
    <circle cx="-4.5" cy="-2" r="1.5" fill="${T.nero}"/><circle cx="4.5" cy="-2" r="1.5" fill="${T.nero}"/>
    <path d="M-3 6 L3 6" stroke="${T.nero}" stroke-width="1.4"/>
  </g>`;
}

// ─────────────────────────── layout delle carte numerali ───────────────────────────

const GRIGLIA = {
  2: [[100, 84], [100, 236]],
  3: [[100, 74], [100, 160], [100, 246]],
  4: [[62, 86], [138, 86], [62, 234], [138, 234]],
  5: [[62, 84], [138, 84], [100, 160], [62, 236], [138, 236]],
  6: [[62, 78], [138, 78], [62, 160], [138, 160], [62, 242], [138, 242]],
  7: [[62, 74], [138, 74], [100, 116], [62, 160], [138, 160], [62, 246], [138, 246]],
};

/** Le decorazioni fra i semi (denari e coppe). */
function ornamentiGriglia(v) {
  if (v === 2) return fiore(100, 160, 1.2) + fiore(56, 160, 0.8) + fiore(144, 160, 0.8);
  if (v === 3) return fiore(56, 117, 0.8) + fiore(144, 117, 0.8) + fiore(56, 203, 0.8) + fiore(144, 203, 0.8);
  if (v === 4) return fiore(100, 160, 1.2) + fiore(100, 86, 0.8) + fiore(100, 234, 0.8);
  if (v === 5) return fiore(100, 122, 0.7) + fiore(100, 198, 0.7);
  if (v === 6) return fiore(100, 119, 0.85) + fiore(100, 201, 0.85);
  if (v === 7) return fiore(100, 204, 0.85);
  return '';
}

/** Spade e bastoni intrecciati: coppie inclinate che si incrociano al centro; col dispari, uno dritto. */
function intreccio(n, disegna) {
  const out = [];
  const inclinazione = 22;
  const scala = n <= 3 ? 1.12 : n <= 5 ? 1.02 : 0.94;
  const passo = n <= 3 ? 26 : n <= 5 ? 20 : 15;
  const dispari = n % 2 === 1;
  const pari = dispari ? n - 1 : n;
  for (let k = 0; k < pari; k++) {
    const i = Math.floor(k / 2);
    const lato = k % 2 === 0 ? -1 : 1;
    out.push(disegna(100 + lato * passo * (i + 0.5), 160 + (i % 2 === 0 ? -1 : 1) * 6, scala, -lato * inclinazione));
  }
  if (dispari) out.push(disegna(100, 160, scala * 1.04, 0));
  if (n >= 2) out.push(fiore(100, n % 2 ? 236 : 232, 0.75, T.oro));
  return out.join('');
}

// ─────────────────────────────── le figure ───────────────────────────────

const VESTI = {
  D: { veste: T.oro, manto: T.rosso, dettaglio: T.blu },
  C: { veste: T.rosso, manto: T.blu, dettaglio: T.oro },
  S: { veste: T.blu, manto: T.rosso, dettaglio: T.oro },
  B: { veste: T.verde, manto: T.marrone, dettaglio: T.oro },
};

function simboloInMano(seme, x, y, s = 1) {
  if (seme === 'D') return denaro(x, y, 13 * s);
  if (seme === 'C') return coppa(x, y, 0.5 * s);
  if (seme === 'S') return spada(x, y, 0.6 * s, -20);
  return bastone(x, y, 0.6 * s, -20);
}

/** Il volto, alla maniera delle xilografie: occhi a punto, naso a tratto, bocca ferma. */
function volto(cx, cy, r, capelli, barba = null) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${T.pelle}"/>
    ${capelli}
    ${barba || ''}
    <circle cx="${cx - r * 0.36}" cy="${cy - r * 0.05}" r="1.7" fill="${T.nero}" stroke="none"/>
    <circle cx="${cx + r * 0.36}" cy="${cy - r * 0.05}" r="1.7" fill="${T.nero}" stroke="none"/>
    <path d="M${cx} ${cy} L${cx + 1} ${cy + r * 0.33}" fill="none" stroke-width="1.4"/>
    <path d="M${cx - r * 0.25} ${cy + r * 0.58} L${cx + r * 0.25} ${cy + r * 0.58}" fill="none" stroke-width="1.4"/>`;
}

/** La Donna: in piedi, veste lunga, velo e corpetto, il fiore in una mano e il seme nell'altra. */
function donna(seme) {
  const v = VESTI[seme];
  return `<g stroke="${T.bordo}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M40 274 L160 274" fill="none" stroke="${T.cornice}" stroke-width="2"/>
    <path d="M58 270 L142 270 L128 150 L72 150 Z" fill="${v.veste}"/>
    <path d="M72 150 L128 150 L124 206 L76 206 Z" fill="${v.manto}"/>
    <path d="M80 176 Q100 190 120 176 M80 190 Q100 204 120 190" fill="none" stroke="${v.dettaglio}" stroke-width="2.6"/>
    <path d="M76 150 L124 150 L118 96 L82 96 Z" fill="${v.dettaglio}"/>
    <path d="M90 96 L110 96 L106 150 L94 150 Z" fill="${T.bianco}"/>
    <path d="M72 156 Q48 176 52 220 L66 218 Q66 186 80 166 Z" fill="${v.manto}"/>
    <path d="M128 156 Q152 176 148 220 L134 218 Q134 186 120 166 Z" fill="${v.manto}"/>
    <circle cx="58" cy="224" r="7" fill="${T.pelle}"/>
    <circle cx="142" cy="224" r="7" fill="${T.pelle}"/>
    <path d="M78 92 Q78 52 100 50 Q122 52 122 92 L122 118 L112 118 L112 92 L88 92 L88 118 L78 118 Z" fill="${T.bianco}"/>
    ${volto(100, 76, 19, `<path d="M82 70 Q100 46 118 70 Q112 60 100 60 Q88 60 82 70 Z" fill="${T.nero}"/>`)}
    <path d="M140 218 Q156 200 152 182" fill="none" stroke="${T.verde}" stroke-width="3"/>
    ${fiore(152, 178, 1.1)}
    ${simboloInMano(seme, 56, 200, 1.05)}
  </g>`;
}

/** Il Cavallo: cavaliere in sella, di profilo verso destra, il seme alzato. */
function cavallo(seme) {
  const v = VESTI[seme];
  return `<g stroke="${T.bordo}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M40 270 L160 270" fill="none" stroke="${T.cornice}" stroke-width="2"/>
    <path d="M44 244 L50 206 Q58 184 84 186 L128 186 Q138 178 146 160 L154 142 Q164 128 176 134 Q184 146 176 158 L170 170 L164 184 Q158 208 150 216 L148 256 L138 256 L136 220 L124 224 L122 256 L112 256 L110 226 L82 226 L78 256 L68 256 L66 228 Q54 228 50 244 Z" fill="${T.bianco}"/>
    <path d="M146 160 Q134 148 128 156 Q138 160 146 160 Z" fill="${T.bianco}"/>
    <path d="M154 142 Q146 132 142 142" fill="${T.bianco}"/>
    <path d="M128 186 Q140 166 150 150" fill="none" stroke="${T.marrone}" stroke-width="3"/>
    <path d="M144 150 Q160 146 172 152" fill="none" stroke="${T.rosso}" stroke-width="2.2"/>
    <circle cx="168" cy="146" r="2" fill="${T.nero}" stroke="none"/>
    <path d="M50 210 Q36 224 40 244" fill="none" stroke="${T.nero}" stroke-width="3.2"/>
    <path d="M76 192 L126 192 L130 210 L72 210 Z" fill="${v.manto}"/>
    <path d="M84 194 L120 194 L118 122 L86 122 Z" fill="${v.veste}"/>
    <path d="M92 130 L92 186 M112 130 L112 186" fill="none" stroke="${v.dettaglio}" stroke-width="2.4"/>
    <path d="M120 186 L128 212 L120 220" fill="none" stroke-width="3.2"/>
    <path d="M86 130 L74 150 L84 156" fill="none" stroke-width="3"/>
    ${volto(102, 104, 15, `<path d="M86 100 L120 100 L118 84 L88 84 Z" fill="${v.manto}"/><path d="M86 100 L120 100" fill="none" stroke="${v.dettaglio}" stroke-width="2"/>`)}
    <path d="M118 140 L146 118" fill="none" stroke-width="3"/>
    ${simboloInMano(seme, 154, 108, 1)}
  </g>`;
}

/** Il Re: in piedi, a figura intera, corona, barba, manto lungo, scettro e seme. */
function re(seme) {
  const v = VESTI[seme];
  return `<g stroke="${T.bordo}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M40 274 L160 274" fill="none" stroke="${T.cornice}" stroke-width="2"/>
    <path d="M54 270 L146 270 L138 128 L62 128 Z" fill="${v.manto}"/>
    <path d="M74 128 L126 128 L124 270 L76 270 Z" fill="${v.veste}"/>
    <path d="M80 150 L120 150 M80 166 L120 166 M80 182 L120 182" fill="none" stroke="${v.dettaglio}" stroke-width="2.6"/>
    <path d="M74 128 L126 128 L126 140 L74 140 Z" fill="${T.bianco}"/>
    <path d="M62 132 Q40 160 44 210 L58 208 Q58 168 70 146 Z" fill="${v.manto}"/>
    <path d="M138 132 Q160 160 156 210 L142 208 Q142 168 130 146 Z" fill="${v.manto}"/>
    <circle cx="50" cy="214" r="7" fill="${T.pelle}"/>
    <circle cx="150" cy="214" r="7" fill="${T.pelle}"/>
    <path d="M50 206 L50 150" fill="none" stroke="${T.oroScuro}" stroke-width="4"/>
    <path d="M42 150 L58 150 L50 136 Z" fill="${T.oro}"/>
    <path d="M84 118 Q100 130 116 118 L118 96 L82 96 Z" fill="${T.bianco}"/>
    ${volto(100, 92, 19, `<path d="M79 60 L83 40 L92 54 L100 34 L108 54 L117 40 L121 60 Z" fill="${T.oro}"/><circle cx="100" cy="40" r="3" fill="${T.rosso}" stroke="none"/><circle cx="84" cy="44" r="2" fill="${T.rosso}" stroke="none"/><circle cx="116" cy="44" r="2" fill="${T.rosso}" stroke="none"/><path d="M81 82 Q100 66 119 82 Q110 76 100 76 Q90 76 81 82 Z" fill="${T.nero}"/>`,
      `<path d="M84 104 Q86 128 100 132 Q114 128 116 104 Q108 112 100 111 Q92 112 84 104 Z" fill="${T.bianco}"/>`)}
    ${simboloInMano(seme, 150, 196, 1.05)}
  </g>`;
}

// ─────────────────────────────── gli assi ───────────────────────────────

function asso(seme) {
  if (seme === 'D') {
    return `<g>
      ${denaro(100, 210, 44)}
      <g stroke="${T.bordo}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" fill="${T.marroneScuro}">
        <path d="M100 96 L94 106 L100 118 L106 106 Z"/>
        <path d="M100 118 Q84 112 72 118 Q50 118 30 104 Q40 122 60 128 Q42 130 24 126 Q46 142 70 140 Q56 150 44 152 Q70 156 86 146 L94 160 L100 172 L106 160 L114 146 Q130 156 156 152 Q144 150 130 140 Q154 142 176 126 Q158 130 140 128 Q160 122 170 104 Q150 118 128 118 Q116 112 100 118 Z"/>
        <path d="M86 146 L100 172 L114 146 Q106 150 100 150 Q94 150 86 146 Z" fill="${T.marrone}"/>
        <path d="M92 98 Q86 92 80 96 Q88 100 92 104 Z" fill="${T.oro}"/>
      </g>
      <circle cx="97" cy="104" r="1.5" fill="${T.oroChiaro}"/>
      ${fiore(44, 60, 0.9)}${fiore(156, 60, 0.9)}
    </g>`;
  }
  if (seme === 'C') {
    return `<g stroke="${T.bordo}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M62 120 L138 120 L132 186 Q124 220 100 224 Q76 220 68 186 Z" fill="${T.oro}"/>
      <path d="M66 140 L134 140 M70 158 L130 158" fill="none" stroke="${T.rosso}" stroke-width="4"/>
      <path d="M72 172 L128 172" fill="none" stroke="${T.blu}" stroke-width="3"/>
      <path d="M62 120 Q100 88 138 120 Z" fill="${T.rosso}"/>
      <path d="M80 112 Q100 96 120 112" fill="none" stroke="${T.oroChiaro}" stroke-width="3"/>
      <circle cx="100" cy="86" r="7" fill="${T.oroChiaro}"/>
      <path d="M62 130 Q28 128 34 166 Q40 196 70 190" fill="none" stroke="${T.oroScuro}" stroke-width="7"/>
      <path d="M138 130 Q172 128 166 166 Q160 196 130 190" fill="none" stroke="${T.oroScuro}" stroke-width="7"/>
      <rect x="94" y="224" width="12" height="16" fill="${T.oroScuro}"/>
      <path d="M70 258 Q100 236 130 258 L130 264 L70 264 Z" fill="${T.blu}"/>
      ${fiore(44, 60, 0.9)}${fiore(156, 60, 0.9)}
    </g>`;
  }
  if (seme === 'S') {
    return `<g stroke="${T.bordo}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M100 42 L110 70 L110 200 L90 200 L90 70 Z" fill="${T.acciaio}"/>
      <path d="M100 42 L110 70 L110 200 L100 200 Z" fill="${T.bluChiaro}" stroke="none"/>
      <path d="M100 66 L100 196" fill="none" stroke="${T.blu}" stroke-width="2"/>
      <path d="M66 200 Q100 190 134 200 L134 210 Q100 202 66 210 Z" fill="${T.oro}"/>
      <rect x="92" y="210" width="16" height="42" rx="3" fill="${T.rosso}"/>
      <circle cx="100" cy="262" r="9" fill="${T.oro}"/>
      <path d="M70 130 Q100 110 130 130 Q100 150 70 130 Z" fill="${T.rosso}"/>
      <path d="M70 130 L54 150 L68 146 Z M130 130 L146 150 L132 146 Z" fill="${T.rosso}"/>
      ${fiore(44, 60, 0.9)}${fiore(156, 60, 0.9)}
    </g>`;
  }
  return `<g stroke="${T.bordo}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
    ${bastone(100, 160, 2.05, 0)}
    <path d="M72 180 Q100 164 128 180 Q100 196 72 180 Z" fill="${T.rosso}"/>
    <path d="M72 180 L56 200 L70 196 Z M128 180 L144 200 L130 196 Z" fill="${T.rosso}"/>
    ${fiore(44, 60, 0.9)}${fiore(156, 60, 0.9)}
  </g>`;
}

// ─────────────────────────────── la carta ───────────────────────────────

const NOME_VALORE = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: 'D', 9: 'C', 10: 'R' };
const COLORE_INDICE = { D: T.oroScuro, C: T.rossoScuro, S: T.bluScuro, B: T.verdeScuro };

function cornice() {
  return `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="14" fill="${T.carta}" stroke="${T.bordo}" stroke-width="3"/>
  <rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="8" fill="none" stroke="${T.cornice}" stroke-width="1.6"/>`;
}

function indice(seme, v) {
  const testo = NOME_VALORE[v];
  const colore = COLORE_INDICE[seme];
  const mini = seme === 'D' ? denaro(0, 0, 7) : seme === 'C' ? coppa(0, 0, 0.28) : seme === 'S' ? spada(0, 0, 0.26, 0) : bastone(0, 0, 0.26, 0);
  const blocco = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <text x="0" y="0" font-family="'Figtree','Helvetica Neue',Arial,sans-serif" font-weight="800" font-size="28" fill="${colore}" text-anchor="middle">${testo}</text>
    <g transform="translate(0 20)">${mini}</g>
  </g>`;
  return blocco(26, 40, 0) + blocco(W - 26, H - 40, 180);
}

function corpo(seme, v) {
  if (v === 1) return asso(seme);
  if (v === 8) return donna(seme);
  if (v === 9) return cavallo(seme);
  if (v === 10) return re(seme);
  if (seme === 'D') {
    if (v === 3) return GRIGLIA[3].filter((_, i) => i !== 1).map(([x, y]) => denaro(x, y, 28)).join('') + trinacria(100, 160, 0.95) + ornamentiGriglia(3);
    return GRIGLIA[v].map(([x, y]) => denaro(x, y, v <= 3 ? 28 : 23)).join('') + ornamentiGriglia(v);
  }
  if (seme === 'C') return GRIGLIA[v].map(([x, y]) => coppa(x, y, v <= 3 ? 1.1 : 0.92)).join('') + ornamentiGriglia(v);
  if (seme === 'S') return intreccio(v, spada);
  return intreccio(v, bastone);
}

const cache = new Map();

/** L'SVG completo (stringa) di una carta, es. svgCarta('D1'). */
export function svgCarta(codice) {
  if (cache.has(codice)) return cache.get(codice);
  const seme = codice[0], v = Number(codice.slice(1));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${etichetta(codice)}">${cornice()}${corpo(seme, v)}${indice(seme, v)}</svg>`;
  cache.set(codice, svg);
  return svg;
}

/** Il dorso: losanghe cobalto e oro con la cornice avorio, la Trinacria al centro. */
export function svgDorso() {
  if (cache.has('dorso')) return cache.get('dorso');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs>
      <pattern id="losanghe" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="24" height="24" fill="${T.blu}"/>
        <rect x="0" y="0" width="12" height="12" fill="${T.bluScuro}"/>
        <rect x="12" y="12" width="12" height="12" fill="${T.bluScuro}"/>
        <circle cx="12" cy="12" r="2.2" fill="${T.oro}"/>
      </pattern>
    </defs>
    <rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="14" fill="${T.carta}" stroke="${T.bordo}" stroke-width="3"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="8" fill="url(#losanghe)" stroke="${T.oroScuro}" stroke-width="2"/>
    <circle cx="100" cy="160" r="28" fill="${T.carta}" stroke="${T.oroScuro}" stroke-width="2"/>
    ${trinacria(100, 160, 0.5)}
  </svg>`;
  cache.set('dorso', svg);
  return svg;
}

const NOMI_SEMI = { D: 'Denari', C: 'Coppe', S: 'Spade', B: 'Bastoni' };
const NOMI_VALORI = { 1: 'Asso', 2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque', 6: 'Sei', 7: 'Sette', 8: 'Donna', 9: 'Cavallo', 10: 'Re' };
export function etichetta(codice) { return `${NOMI_VALORI[Number(codice.slice(1))]} di ${NOMI_SEMI[codice[0]]}`; }
export function nomeSeme(seme) { return NOMI_SEMI[seme]; }

// ─────────────────────── il mazzo fotografico, se c'è ───────────────────────

let immagini = {};
export function usaImmagini(mappa) { immagini = mappa || {}; }
export function haImmagini() { return Object.keys(immagini).length >= 40; }

function fronte(codice) {
  if (immagini[codice]) return `<img src="${immagini[codice]}" alt="${etichetta(codice)}" draggable="false">`;
  return svgCarta(codice);
}
function retro() {
  if (immagini.dorso) return `<img src="${immagini.dorso}" alt="" draggable="false">`;
  return svgDorso();
}

/** Un elemento DOM .carta pronto da mettere in pagina. `faccia`: true = scoperta. */
export function elementoCarta(codice, faccia = true) {
  const el = document.createElement('div');
  el.className = 'carta' + (faccia ? '' : ' coperta');
  if (codice) el.dataset.carta = codice;
  el.innerHTML = `<div class="carta-fronte">${faccia && codice ? fronte(codice) : ''}</div><div class="carta-retro">${retro()}</div>`;
  return el;
}
