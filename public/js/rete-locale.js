// LA RETE LOCALE — il tavolo dentro la pagina, senza nessun server.
//
// Ha la stessa faccia di Rete (rete.js): entra(), invia(), on(), chiudi().
// Al posto del WebSocket c'e' un canale finto che passa i messaggi al
// Servitore, che e' lo stesso file che gira sul server vero. Da qui viene la
// partita contro i bot, e da qui parte anche il tavolo P2P (rete-p2p.js).

import { Servitore, RITMO } from '../../src/servitore.js';

/** Un canale finto: e' tutto quello che il servitore si aspetta da un WebSocket. */
export function canaleFinto(ricevi) {
  return {
    readyState: 1,
    send(s) { queueMicrotask(() => ricevi(JSON.parse(s))); },
    close() { this.readyState = 3; },
  };
}

export class ReteLocale extends EventTarget {
  /** `link` serve al benvenuto: e' l'indirizzo da condividere per questo tavolo. */
  constructor({ tempi = RITMO, link = (c) => `${location.origin}${location.pathname}#/s/${c}` } = {}) {
    super();
    this.servitore = new Servitore({ tempi, link });
    this.aperto = false;
    this.ingresso = null;
    this._entrato = false;
    this.sessione = null;
    this._canale = null;
  }

  connetti() {
    if (this.sessione) return;
    this._canale = canaleFinto((m) => this._ricevi(m));
    this.sessione = this.servitore.sessione(this._canale);
    this.aperto = true;
    queueMicrotask(() => {
      this.dispatchEvent(new CustomEvent('aperto'));
      // l'ingresso si manda una volta sola: chi eredita questa classe puo'
      // averlo gia' fatto appena aperta la sessione (vedi rete-p2p.js)
      if (this.ingresso && !this._entrato) { this._entrato = true; this.invia(this.ingresso); }
    });
  }

  _ricevi(m) {
    if (m.t === 'pong') return;
    if (m.t === 'benvenuto' && this.ingresso) {
      this.ingresso = { t: 'entra', codice: m.codice, nome: this.ingresso.nome, token: m.token };
    }
    this.dispatchEvent(new CustomEvent(m.t, { detail: m }));
  }

  invia(m) { if (this.sessione) this.sessione.messaggio(m); }

  entra(m) {
    this.ingresso = m;
    if (this.aperto) { this._entrato = true; this.invia(m); } else this.connetti();
  }

  chiudi() {
    try { this.sessione?.chiudi(); } catch {}
    // le stanze vivono di timer: senza questo il tavolo abbandonato continua a giocare
    for (const s of [...this.servitore.stanze.values()]) s.annullaTutti();
    this.servitore.stanze.clear();
    this.sessione = null; this._canale = null; this.aperto = false; this.ingresso = null; this._entrato = false;
    this.dispatchEvent(new CustomEvent('chiuso'));
  }

  on(tipo, fn) { this.addEventListener(tipo, (e) => fn(e.detail)); }
  calibra() { return Promise.resolve(); }   // stesso orologio: non c'e' niente da correggere
}
