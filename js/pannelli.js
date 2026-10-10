// I PANNELLI DI FINE MANO E DI FINE PARTITA — uno per gioco.
//
// Ogni gioco racconta la sua mano a modo suo: al Cuticchiune la singa, alla
// Briscola chi ha passato i 60, alla Scopa carte, denari, settebello,
// primiera e scope con chi prende ogni punto. Qui si costruisce solo il
// contenuto; quando mostrare il velo e che suono fare lo decide partita.js.
//
// fineMano(s)   → { numero, titolo, motivo, tabella, nota, prese, esito }
// finePartita(s) → { titolo, motivo, righe: [{ classe, nome, esito, punti }] }
// `esito` dice al chiamante se per me la mano e' andata bene: 'bene' | 'male' | 'pari'.

import { escape } from './ui.js';
import { etichetta } from './carte.js';
import { scheda, latoDi, nomeLato } from './giochi.js';

const io = (s) => s.io.posto;
const nomi = (s) => s.posti.map(p => p?.nome || '—');
const tu = (s, p) => (p === io(s) ? ' <em>tu</em>' : '');

/** «a te», «a voi», «a Turi e Nzino». */
function aChi(s, lato) {
  const n = nomeLato(s, lato);
  return n === 'tu' ? 'te' : n;
}
/** Il lato in testa da solo, o null se in testa sono pari. */
function unicoPrimo(valori) {
  const max = Math.max(...valori);
  const primi = valori.flatMap((v, i) => (v === max ? [i] : []));
  return primi.length === 1 ? primi[0] : null;
}
function esitoPer(s, latoVincente) {
  if (latoVincente === null) return 'pari';
  if (io(s) < 0) return 'pari';
  return latoDi(s, io(s)) === latoVincente ? 'bene' : 'male';
}

// ─────────────────────────────── Cuticchiune ───────────────────────────────

function fineCuticchiune(s) {
  const f = s.fineMano, r = f.risultato, rp = f.riepilogo;
  const n = nomi(s);
  const perdenti = r.perdenti.map(p => n[p]);
  const motivo = r.motivo === 'zero-prese'
    ? (perdenti.length === 1 ? 'Non ha preso nemmeno una volta.' : 'Non hanno preso nemmeno una volta.')
    : r.motivo === 'pareggio' ? `Pari merito in testa con ${r.punti[r.perdenti[0]]} punti: singa a tutti e ${perdenti.length}.`
    : `Ha preso più punti di tutti: ${r.punti[r.perdenti[0]]}.`;
  const tabella = `<tr><th>chi</th><th class="num">prese</th><th class="num">punti</th><th class="num">singhe</th></tr>` + [0, 1, 2, 3]
    .sort((a, b) => r.punti[b] - r.punti[a])
    .map(p => {
      const perde = r.perdenti.includes(p);
      return `<tr class="${perde ? 'perde' : ''} ${p === io(s) ? 'io' : ''}"><td>${escape(n[p])}${tu(s, p)}</td><td class="num">${r.nPrese[p]}</td><td class="num">${r.punti[p]}</td><td class="num">${rp.singhe[p] - (perde ? 1 : 0)}${perde ? ' <span class="segno">+1</span>' : ''}</td></tr>`;
    }).join('');
  // i tre punti dell'ultima presa vanno detti, se no la tabella non torna
  const ultima = rp.bonusUltima != null ? ` L'ultima presa l'ha pigliata ${n[rp.bonusUltima]}: tre punti in più.` : '';
  return {
    titolo: `Singa a ${perdenti.join(' e ')}`,
    motivo,
    tabella,
    nota: `Prossima mano: apre ${n[rp.prossimoApre]}.${ultima}`,
    prese: true,
    esito: r.perdenti.includes(io(s)) ? 'male' : 'bene',
  };
}

function finePartitaCuticchiune(s) {
  const esito = s.partita.esito;
  const perde = s.classifica.filter(r => r.perde);
  const franco = esito.franchi?.length ? s.classifica.find(r => r.posti[0] === esito.franchi[0]) : null;
  return {
    titolo: perde.length === 1 ? `Perde ${perde[0].nome}` : `Perdono ${perde.map(r => r.nome).join(' e ')}`,
    motivo: esito.motivo === 'dieci-singhe'
      ? 'Dieci singhe: la partita finisce qui.'
      : (franco ? `Due giocatori a cinque singhe nella stessa mano. ${franco.nome} esce franco con ${franco.singhe}.` : 'Due giocatori a cinque singhe: finisce qui.'),
    righe: s.classifica.map(r => ({
      classe: r.perde ? 'perde' : (r.franco ? 'franco' : 'salvo'),
      nome: `${escape(r.nome)}${tu(s, r.posti[0])}`,
      esito: r.perde ? 'perde' : r.franco ? 'esce franco' : 'si salva',
      punti: r.singhe,
    })),
    male: perde.some(r => r.posti.includes(io(s))),
  };
}

// ─────────────────────────────── Briscola ───────────────────────────────

function fineBriscola(s) {
  const f = s.fineMano, r = f.risultato, rp = f.riepilogo;
  const v = r.vincitore;
  const n = nomi(s);
  const lati = r.lati;
  const tabella = `<tr><th>chi</th><th class="num">prese</th><th class="num">punti</th><th class="num">mani vinte</th></tr>` + lati
    .map((posti, lato) => ({ posti, lato }))
    .sort((a, b) => r.punti[b.lato] - r.punti[a.lato])
    .map(({ posti, lato }) => {
      const vince = v === lato;
      const mio = posti.includes(io(s));
      const prese = posti.reduce((t, p) => t + (r.nPrese[p] || 0), 0);
      const chi = posti.map(p => escape(n[p])).join(' e ') + (mio ? ` <em>${posti.length > 1 ? 'voi' : 'tu'}</em>` : '');
      return `<tr class="${vince ? 'vince' : ''} ${mio ? 'io' : ''}"><td>${chi}</td><td class="num">${prese}</td><td class="num">${r.punti[lato]}</td><td class="num">${rp.maniVinte[lato] - (vince ? 1 : 0)}${vince ? ' <span class="segno buono">+1</span>' : ''}</td></tr>`;
    }).join('');
  return {
    titolo: v === null ? 'Mano patta' : `Mano a ${aChi(s, v)}`,
    motivo: v === null ? '60 a 60: la mano non conta per la partita.' : `${r.punti[v]} punti su 120.`,
    tabella,
    nota: `Prossima mano: distribuisce ${n[rp.prossimoMazziere]}. Si vince a ${s.opzioniGioco.maniVittoria} mani.`,
    prese: true,
    esito: esitoPer(s, v),
  };
}

// ─────────────────────────────── Scopa e Scopone ───────────────────────────────

function fineScopa(s) {
  const r = s.fineMano.risultato;
  const { voci, assegnati, puntiMano } = r;
  const lati = r.lati.map((_, i) => i);
  const primo = unicoPrimo(puntiMano);
  const testa = lati.map(l => `<th class="num">${escape(nomeLato(s, l, { maiuscola: true }))}</th>`).join('');
  const cella = (l, valore, prende) => `<td class="num ${prende ? 'prende' : ''}">${valore}${prende ? '<span class="punto" aria-label="prende il punto">1</span>' : ''}</td>`;
  const riga = (nome, valori, chiPrende) => `<tr><td>${nome}</td>${lati.map(l => cella(l, valori[l], chiPrende === l)).join('')}</tr>`;
  const inPartita = s.fineMano.classifica;
  const puntiPartita = lati.map(l => inPartita.find(x => x.lato === l)?.punti ?? 0);
  const tabella = `<tr><th></th>${testa}</tr>`
    + riga('Carte', voci.carte, assegnati.carte)
    + riga('Denari', voci.denari, assegnati.denari)
    + riga('Settebello', lati.map(l => (voci.settebello === l ? 'sì' : '')), assegnati.settebello)
    + riga('Primiera', voci.primiera, assegnati.primiera)
    + `<tr><td>Scope</td>${lati.map(l => `<td class="num ${voci.scope[l] ? 'prende' : ''}">${voci.scope[l]}${voci.scope[l] ? `<span class="punto">${voci.scope[l]}</span>` : ''}</td>`).join('')}</tr>`
    + `<tr class="totale"><td>Punti della mano</td>${lati.map(l => `<td class="num">${puntiMano[l]}</td>`).join('')}</tr>`
    + `<tr><td>In partita</td>${lati.map(l => `<td class="num">${puntiPartita[l]}</td>`).join('')}</tr>`;
  const restanti = s.mano?.restanti;
  const nota = [
    restanti ? `Le ${restanti.carte.length} carte rimaste in tavola sono andate a ${escape(s.posti[restanti.posto]?.nome || '')}.` : '',
    `Si vince a ${s.opzioniGioco.puntiVittoria} punti.`,
  ].filter(Boolean).join(' ');
  return {
    titolo: primo === null ? `Mano pari: ${puntiMano.join(' a ')}` : `Mano a ${aChi(s, primo)}: ${puntiMano[primo]} a ${Math.max(...puntiMano.filter((_, i) => i !== primo))}`,
    motivo: '',
    tabella,
    nota,
    prese: false,
    esito: esitoPer(s, primo),
  };
}

// ─────────────────────────────── generico ───────────────────────────────

/** Un gioco senza pannello suo: i punti della mano, se li dice, e la classifica. */
function fineGenerica(s) {
  const cl = s.fineMano.classifica || [];
  return {
    titolo: `Fine della mano ${s.fineMano.numeroMano}`,
    motivo: '',
    tabella: `<tr><th>chi</th><th class="num">${scheda(s.gioco.id).punti}</th></tr>` + cl.map(r => `<tr><td>${escape(r.nome)}</td><td class="num">${r.punti}</td></tr>`).join(''),
    nota: '',
    prese: false,
    esito: 'pari',
  };
}

function finePartitaGenerica(s) {
  const cl = s.classifica;
  const vincitori = cl.filter(r => r.vince);
  const mio = io(s) >= 0 ? cl.find(r => r.posti.includes(io(s))) : null;
  let titolo;
  if (mio?.vince) titolo = mio.posti.length > 1 ? 'Avete vinto la partita' : 'Hai vinto la partita';
  else if (vincitori.length) titolo = `${vincitori[0].posti.length > 1 ? 'Vincono' : 'Vince'} ${vincitori.map(r => r.nome).join(' e ')}`;
  else titolo = 'Partita finita';
  const etich = scheda(s.gioco.id).punti;
  let motivo = '';
  const e = s.partita.esito;
  // i numeri nell'ordine della classifica qui sotto, se no «0 a 1» sopra a chi ha vinto
  const inOrdine = cl.map(r => r.punti).join(' a ');
  if (s.gioco.id === 'briscola' && e) {
    motivo = `Mani vinte: ${inOrdine}.${e.patte ? ` Mani patte: ${e.patte}.` : ''}`;
  } else if (e?.punti) {
    motivo = `Punti: ${inOrdine}. Si giocava a ${s.opzioniGioco.puntiVittoria}.`;
  }
  return {
    titolo,
    motivo,
    righe: cl.map(r => ({
      classe: r.vince ? 'salvo' : 'perde',
      nome: `${escape(r.nome)}${r.posti.includes(io(s)) ? ` <em>${r.posti.length > 1 ? 'voi' : 'tu'}</em>` : ''}`,
      esito: r.vince ? 'vince' : 'perde',
      punti: r.punti,
      etichetta: etich,
    })),
    male: !!mio && !mio.vince,
  };
}

const FINE_MANO = { cuticchiune: fineCuticchiune, briscola: fineBriscola, scopa: fineScopa, scopone: fineScopa };
const FINE_PARTITA = { cuticchiune: finePartitaCuticchiune };

export function fineMano(s) { return (FINE_MANO[s.gioco.id] || fineGenerica)(s); }
export function finePartita(s) { return (FINE_PARTITA[s.gioco.id] || finePartitaGenerica)(s); }

/** Le prese di una mano (Cuticchiune, Briscola): righe { chi, carte, punti }. */
export function righePrese(s, cosa) {
  const presa = s.pausa?.esito?.presa;
  if (cosa === 'ultima') {
    const ultima = presa && !Array.isArray(presa) ? presa : s.mano?.ultimaPresa;
    return ultima ? [ultima] : [];
  }
  return s.fineMano?.riepilogo?.storico || [];
}
export { etichetta };
