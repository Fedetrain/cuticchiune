// LA RETE DEL SITO STATICO — nessun server nostro, da nessuna parte.
//
// Chi apre il tavolo TIENE il tavolo: dentro la sua pagina gira il Servitore,
// lo stesso di server.js. Gli altri tre si collegano al suo telefono in
// WebRTC (PeerJS); del broker pubblico si usa solo la presentazione — le
// carte viaggiano da telefono a telefono.
//
//   apre  →  ReteStatica fa da PADRONE DI CASA: servitore in pagina, in
//            ascolto sull'identita' «cuticchiune-CODICE»
//   entra →  fa da OSPITE: apre una connessione a quell'identita' e le passa
//            i messaggi, esattamente come farebbe col WebSocket
//
// Chi apre deve restare nella pagina: se la chiude, il tavolo finisce. E'
// il prezzo di non avere un server. Giocare da soli contro i bot e' lo stesso
// codice senza nessuno collegato.

import { ReteLocale, canaleFinto } from './rete-locale.js';

const PREFISSO = 'cuticchiune-';
let caricamento = null;

/** Carica PeerJS una volta sola: prima la copia nostra, poi la CDN come rete di scorta. */
function caricaPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (caricamento) return caricamento;
  const prova = (src) => new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => ok(window.Peer); s.onerror = ko;
    document.head.appendChild(s);
  });
  caricamento = prova('vendor/peerjs.min.js')
    .catch(() => prova('https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.5/peerjs.min.js'));
  return caricamento;
}

export class ReteStatica extends ReteLocale {
  constructor(opzioni = {}) {
    super(opzioni);
    this.ruolo = null;        // 'padrone' | 'ospite'
    this.peer = null;
    this.conn = null;         // solo da ospite: il canale verso il padrone di casa
    this.ospiti = new Set();
    this._coda = [];
  }

  entra(m) {
    this.ingresso = m;
    if (m.t === 'entra' && !this.servitore.stanze.has(String(m.codice || '').toUpperCase())) {
      return this._daOspite(m);
    }
    return this._daPadrone(m);
  }

  // ───────────────────────── padrone di casa ─────────────────────────

  _daPadrone(m) {
    this.ruolo = 'padrone';
    super.connetti();
    this._entrato = true;      // la sessione c'e' gia': si entra subito, senza aspettare il microtask
    super.invia(m);
    const codice = this.servitore.stanze.keys().next().value;
    if (codice) this._ascolta(codice);
  }

  /** Si mette in ascolto con l'identita' del tavolo, cosi' il codice basta a trovarlo. */
  async _ascolta(codice) {
    const Peer = await caricaPeer().catch(() => null);
    if (!Peer) return this._avviso('Niente collegamento fra telefoni: si gioca contro i bot.');
    this.peer = new Peer(PREFISSO + codice, { debug: 0 });
    this.peer.on('error', (e) => {
      if (e?.type === 'unavailable-id') this._avviso(`Il codice ${codice} e' gia' in uso nel mondo: apri un altro tavolo.`);
      else if (e?.type === 'peer-unavailable') return;   // un ospite se n'e' andato
      else this._avviso('Il collegamento fra telefoni non funziona: si gioca contro i bot.');
    });
    this.peer.on('connection', (conn) => this._accogli(conn));
  }

  /** Un ospite bussa: gli si dà un canale finto e il servitore non vede differenza. */
  _accogli(conn) {
    let sessione = null;
    const canale = {
      readyState: 1,
      send(s) { try { conn.send(s); } catch {} },
      close() { this.readyState = 3; try { conn.close(); } catch {} },
    };
    conn.on('open', () => {
      sessione = this.servitore.sessione(canale, { link: this.servitore.link });
      this.ospiti.add(conn);
    });
    conn.on('data', (raw) => {
      let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
      sessione?.messaggio(m);
    });
    conn.on('close', () => { canale.readyState = 3; sessione?.chiudi(); this.ospiti.delete(conn); });
    conn.on('error', () => { canale.readyState = 3; sessione?.chiudi(); this.ospiti.delete(conn); });
  }

  // ───────────────────────────── ospite ─────────────────────────────

  async _daOspite(m) {
    this.ruolo = 'ospite';
    const codice = String(m.codice || '').toUpperCase();
    const Peer = await caricaPeer().catch(() => null);
    if (!Peer) return this._errore('Questo browser non riesce a collegarsi al tavolo.');
    this.peer = new Peer({ debug: 0 });
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFISSO + codice, { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        this.aperto = true;
        this.dispatchEvent(new CustomEvent('aperto'));
        for (const x of this._coda.splice(0)) this._manda(x);
        this._manda(this.ingresso);
      });
      conn.on('data', (raw) => {
        let msg; try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
        this._ricevi(msg);
      });
      conn.on('close', () => { this.aperto = false; this.conn = null; this.dispatchEvent(new CustomEvent('chiuso')); });
      conn.on('error', () => this._errore('Il tavolo non risponde piu\'.'));
    });
    this.peer.on('error', (e) => {
      if (e?.type === 'peer-unavailable') return this._errore(`Nessun tavolo con il codice ${codice}`, true);
      this._errore('Collegamento fallito: prova la stessa rete Wi-Fi, o riapri il tavolo.');
    });
  }

  _manda(m) { try { this.conn?.send(JSON.stringify(m)); } catch {} }

  // ───────────────────────────── comune ─────────────────────────────

  invia(m) {
    if (this.ruolo === 'ospite') {
      if (this.conn && this.aperto) this._manda(m); else this._coda.push(m);
      return;
    }
    super.invia(m);
  }

  connetti() { if (this.ruolo) return; /* si decide al primo entra() */ }

  chiudi() {
    for (const c of this.ospiti) { try { c.close(); } catch {} }
    this.ospiti.clear();
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = null; this.conn = null; this.ruolo = null; this._coda = [];
    super.chiudi();
  }

  _errore(msg, fatale = false) { this.dispatchEvent(new CustomEvent('errore', { detail: { t: 'errore', msg, fatale } })); }
  _avviso(msg) { this.dispatchEvent(new CustomEvent('errore', { detail: { t: 'errore', msg, fatale: false } })); }
}
