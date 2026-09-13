// L'APP — il filo che tiene insieme le schermate.
//
//   home  →  lobby  →  partita  (fine mano e fine partita sono veli sopra)
//
// Il server è la verità: ogni `stato` ridisegna la schermata giusta. Gli
// `evento` servono alle animazioni e ai suoni, che partono prima del ridisegno.

import { Rete } from './rete.js';
import { ReteStatica } from './rete-p2p.js';
import { STATICO, linkDi, scriviUrl, codiceDaUrl } from './ambiente.js';
import { $, $$, mostraSchermo, collegaVeli, toast, mem } from './ui.js';
import { usaImmagini, elementoCarta } from './carte.js';
import * as audio from './audio.js';
import { avviaHome } from './schermi/home.js';
import { avviaLobby } from './schermi/lobby.js';
import { avviaPartita } from './schermi/partita.js';

// Con un server dietro si parla col server. Sul sito statico (GitHub Pages) il
// tavolo sta nella pagina di chi lo apre e gli altri arrivano in WebRTC.
const rete = STATICO ? new ReteStatica({ link: linkDi }) : new Rete();
let stato = null;
let benvenuto = null;
let faseVista = null;

// ─────────────────────────────── audio ───────────────────────────────

function aggiornaAudio() {
  $$('[data-audio]').forEach(b => {
    b.setAttribute('aria-pressed', String(audio.stato.acceso));
    b.title = audio.stato.acceso ? 'Audio acceso' : 'Audio spento';
    const onde = b.querySelector('.onde'); if (onde) onde.style.opacity = audio.stato.acceso ? '1' : '0.2';
  });
}
$$('[data-audio]').forEach(b => b.addEventListener('click', () => { audio.accendi(!audio.stato.acceso); aggiornaAudio(); if (audio.stato.acceso) audio.suoni.gira(); }));
if (mem.audio) audio.accendi(true);
aggiornaAudio();

// ─────────────────────────────── le schermate ───────────────────────────────

function entraCon(codice, nome) {
  home.errore('');
  rete.entra({ t: 'entra', codice, nome, token: mem.token(codice) });
}

function esci() {
  rete.chiudi();
  stato = null; benvenuto = null; faseVista = null;
  mem.ultimo = null;
  scriviUrl(null);
  mostraSchermo('home');
  home.caricaPubbliche();
  setTimeout(() => rete.connetti(), 200);
}

const home = avviaHome({ rete, entraCon });
const lobby = avviaLobby({ rete, esci, benvenuto: () => benvenuto });
const partita = avviaPartita({ rete, esci, stato: () => stato });
collegaVeli({ albo: () => home.caricaAlbo() });

// la scala di forza nelle regole, con le carte vere
$('#scala-forza').append(...['D3', 'D2', 'D1', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4'].map(c => elementoCarta(c)));

// ─────────────────────────────── messaggi dal server ───────────────────────────────

rete.on('benvenuto', (m) => {
  benvenuto = m;
  partita.impostaEmote(m.emote);
  mem.salvaToken(m.codice, m.token);
  mem.ultimo = m.codice;
  scriviUrl(m.codice);
});

rete.on('errore', (m) => {
  if (m.fatale) {
    home.errore(m.msg); mostraSchermo('home');
    rete.ingresso = null; mem.ultimo = null; scriviUrl(null);
    return;
  }
  toast(m.msg, true);
});

rete.on('cacciato', () => { toast('Sei stato mandato via dal tavolo', true); esci(); });

rete.on('stato', (s) => {
  const prima = stato;
  stato = s;
  if (s.fase === 'attesa') { mostraSchermo('lobby'); lobby.render(s); }
  else {
    if (faseVista === 'attesa' || faseVista === null) mostraSchermo('partita');
    partita.render(s, prima);
  }
  faseVista = s.fase;
});

rete.on('evento', (ev) => partita.evento(ev));
rete.addEventListener('chiuso', () => { if (stato) toast('Connessione persa, riprovo…', true); });
rete.addEventListener('aperto', () => { if (stato && faseVista) toast('Di nuovo al tavolo'); });

// ─────────────────────────────── avvio ───────────────────────────────

rete.connetti();

// il mazzo fotografico, se c'è, senza fermare l'avvio
fetch('/api/mazzo').then(r => r.json()).then(m => { if (m?.completo) usaImmagini(m.immagini); }).catch(() => {});

const daUrl = codiceDaUrl();
if (daUrl) {
  const codice = daUrl;
  $('#in-codice').value = codice; $('#blocco-codice').hidden = false;
  if (mem.nome) entraCon(codice, mem.nome);
  else { home.inNome.focus(); toast(`Tavolo ${codice}: scrivi il nome ed entra`); }
} else if (!STATICO && mem.ultimo && mem.token(mem.ultimo) && mem.nome) {
  // ero a un tavolo: ci riprovo in silenzio (se non esiste più, l'errore fatale mi riporta qui)
  // Sul sito statico no: il tavolo di chi ospita muore quando ricarica la pagina,
  // e riprovarci da soli vorrebbe dire aprire la home con un errore ogni volta.
  entraCon(mem.ultimo, mem.nome);
}
home.caricaPubbliche();

// Sul sito statico il tavolo sta nell'indirizzo dopo il #: se cambia (un amico
// ti manda un altro link mentre la pagina e' gia' aperta) il browser non
// ricarica niente da solo, e resteresti fermo al tavolo di prima.
if (STATICO) addEventListener('hashchange', () => { if (codiceDaUrl() !== stato?.codice) location.reload(); });

setInterval(() => { if ($('#home').classList.contains('attivo')) home.caricaPubbliche(); }, 8000);
