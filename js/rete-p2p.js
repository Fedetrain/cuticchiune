// LA RETE DEL SITO STATICO — nessun server nostro, da nessuna parte.
//
// Chi apre il tavolo TIENE il tavolo: dentro la sua pagina gira il Servitore,
// lo stesso di server.js. Gli altri tre si collegano al suo telefono in
// WebRTC (PeerJS); del broker pubblico si usa solo la presentazione — le
// carte viaggiano da telefono a telefono.
//
//   apre  →  ReteStatica fa da PADRONE DI CASA: servitore in pagina, in
//            ascolto sull'identita' «appo-carte-CODICE»
//   entra →  fa da OSPITE: apre una connessione a quell'identita' e le passa
//            i messaggi, esattamente come farebbe col WebSocket
//
// Chi apre tiene la partita nella sua pagina: se la chiude, la mano in corso
// finisce. Ma il tavolo no: chi apre quel link e non trova nessuno in ascolto
// se lo riprende, con lo stesso codice (vedi _adotta). Cosi' si puo' uscire a
// mandare l'invito e rientrare dal link. Giocare da soli contro i bot e' lo
// stesso codice senza nessuno collegato.

import { ReteLocale, canaleFinto } from './rete-locale.js';

const PREFISSO = 'appo-carte-';
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
  /** `tavoloDi(codice)`: il gioco e i posti di un tavolo visto prima, per riaprirlo uguale (vedi _adotta). */
  constructor(opzioni = {}) {
    super(opzioni);
    this.tavoloDi = opzioni.tavoloDi || (() => null);
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
    if (!Peer) return this._avviso('Il collegamento fra telefoni non è partito: si gioca contro i bot. Per giocare con gli amici ricarica la pagina.');
    this.peer = new Peer(PREFISSO + codice, { debug: 0 });
    this._tieniVivo();
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
    this._tieniVivo();
    let tentativi = 0;

    // Chi teneva il tavolo puo' essere sparito per un attimo (telefono in tasca,
    // app cambiata): si ribussa un paio di volte prima di darlo per morto.
    const bussa = () => {
      let deciso = false;
      const conn = this.peer.connect(PREFISSO + codice, { reliable: true });
      this.conn = conn;
      const fallita = () => { if (deciso) return; deciso = true; this._nessunaRisposta(codice, ++tentativi, bussa); };
      const attesa = setTimeout(fallita, 7000);
      conn.on('open', () => {
        deciso = true; clearTimeout(attesa); tentativi = 0;
        this.aperto = true;
        this.dispatchEvent(new CustomEvent('aperto'));
        for (const x of this._coda.splice(0)) this._manda(x);
        this._manda(this.ingresso);
      });
      conn.on('data', (raw) => {
        let msg; try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
        this._ricevi(msg);
      });
      conn.on('close', () => {
        clearTimeout(attesa);
        this.aperto = false; this.conn = null;
        this.dispatchEvent(new CustomEvent('chiuso'));
        if (deciso && this.ruolo === 'ospite') setTimeout(() => { if (this.ruolo === 'ospite' && !this.aperto) bussa(); }, 1200);
      });
      conn.on('error', fallita);
      this._ribussa = fallita;
    };

    this.peer.on('open', bussa);
    this.peer.on('error', (e) => {
      if (this.ruolo !== 'ospite') return;
      if (e?.type === 'peer-unavailable') return this._ribussa?.();
      this._errore('Collegamento fallito: prova la stessa rete Wi-Fi, o riapri il tavolo.');
    });
  }

  /** Nessuno risponde a quel codice: si riprova, poi il tavolo lo si tiene noi. */
  _nessunaRisposta(codice, tentativi, bussa) {
    try { this.conn?.close(); } catch {}
    this.conn = null;
    if (tentativi < 3) return void setTimeout(() => { if (this.ruolo === 'ospite') bussa(); }, 1200);
    this._adotta(codice);
  }

  /**
   * Il tavolo non c'e' piu' (chi lo teneva ha chiuso la pagina): invece di
   * sbattere fuori, lo si riapre qui con lo STESSO codice. Cosi' chi ospita
   * puo' chiudere il sito per mandare il link e poi rientrare dal link.
   */
  _adotta(codice) {
    const nome = this.ingresso?.nome;
    // se il tavolo l'avevo gia' visto (l'ho aperto io, o ci giocavo) si riapre
    // con lo stesso gioco e gli stessi posti; se no col gioco di serie, e il
    // padrone lo cambia in lobby
    const { gioco = null, posti = null } = this.tavoloDi(codice) || {};
    try { this.peer?.destroy(); } catch {}
    this.peer = null; this.conn = null; this._ribussa = null;
    this._avviso(`Il tavolo ${codice} non era aperto: ora lo tieni tu.`);
    this._daPadrone({ t: 'crea', codice, nome, pubblica: false, gioco, posti });
  }

  /**
   * Il broker chiude il canale appena la pagina va in secondo piano, e con lui
   * sparisce il nostro indirizzo: al ritorno ci si ripresenta.
   */
  _tieniVivo() {
    const peer = this.peer;
    const sveglia = () => { if (this.peer === peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch {} } };
    peer.on('disconnected', () => setTimeout(sveglia, 500));
    if (!this._sveglia) {
      this._sveglia = () => { if (document.visibilityState === 'visible') this._tieniVivoOra(); };
      document.addEventListener('visibilitychange', this._sveglia);
    }
    this._tieniVivoOra = sveglia;
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
    if (this._sveglia) { document.removeEventListener('visibilitychange', this._sveglia); this._sveglia = null; }
    this._tieniVivoOra = null; this._ribussa = null;
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
