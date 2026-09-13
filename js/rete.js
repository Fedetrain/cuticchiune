// LA RETE — un WebSocket, la riconnessione da solo, il token della stanza.
//
// Il server manda gli istanti nel SUO orologio (scadenzaTurno, ora): il client
// stima lo scarto con un ping-pong e converte, così il timer non dipende
// dall'ora del telefono.

export const orologio = {
  scarto: 0,
  campioni: [],
  ora() { return Date.now() + this.scarto; },
  fraQuanto(serverTs) { return serverTs - this.ora(); },
};

export class Rete extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.aperto = false;
    this.tentativi = 0;
    this.ingresso = null;          // il messaggio da rimandare quando ci si riconnette
    this.codaPing = new Map();
    this._calibra = null;
    this._chiusoApposta = false;
  }

  connetti() {
    this._chiusoApposta = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try { this.ws = new WebSocket(`${proto}://${location.host}/ws`); }
    catch { return this._riprova(); }

    this.ws.addEventListener('open', () => {
      this.aperto = true; this.tentativi = 0;
      this.calibra(5).then(() => { clearInterval(this._calibra); this._calibra = setInterval(() => this.calibra(2), 30000); });
      if (this.ingresso) this.invia(this.ingresso);
      this.dispatchEvent(new CustomEvent('aperto'));
    });
    this.ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') return this._pong(m);
      if (m.t === 'benvenuto' && this.ingresso) {
        // da qui in poi si rientra col token, non più con «crea»
        this.ingresso = { t: 'entra', codice: m.codice, nome: this.ingresso.nome, token: m.token };
      }
      this.dispatchEvent(new CustomEvent(m.t, { detail: m }));
    });
    this.ws.addEventListener('close', () => {
      this.aperto = false; clearInterval(this._calibra);
      this.dispatchEvent(new CustomEvent('chiuso'));
      if (!this._chiusoApposta) this._riprova();
    });
    this.ws.addEventListener('error', () => {});
  }

  _riprova() {
    const attesa = Math.min(8000, 500 * Math.pow(1.7, this.tentativi++));
    setTimeout(() => { if (!this._chiusoApposta) this.connetti(); }, attesa);
  }

  chiudi() { this._chiusoApposta = true; this.ingresso = null; try { this.ws?.close(); } catch {} }

  invia(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  /** Entra (o crea): il messaggio viene ricordato per la riconnessione. */
  entra(m) {
    this.ingresso = m;
    if (this.aperto) this.invia(m);
    else if (!this.ws || this.ws.readyState > 1) this.connetti();
  }

  on(tipo, fn) { this.addEventListener(tipo, (e) => fn(e.detail)); }

  _pong(m) {
    const partenza = this.codaPing.get(m.c);
    if (partenza === undefined) return;
    this.codaPing.delete(m.c);
    const arrivo = Date.now();
    const rtt = arrivo - partenza;
    orologio.campioni.push({ rtt, scarto: (m.s + rtt / 2) - arrivo });
    orologio.campioni.sort((a, b) => a.rtt - b.rtt);
    orologio.campioni = orologio.campioni.slice(0, 5);
    orologio.scarto = orologio.campioni[0].scarto;
  }

  calibra(n = 3) {
    return new Promise((ok) => {
      let fatti = 0;
      const uno = () => {
        const c = Math.random().toString(36).slice(2);
        this.codaPing.set(c, Date.now());
        this.invia({ t: 'ping', c });
        if (++fatti < n) setTimeout(uno, 120); else setTimeout(ok, 300);
      };
      uno();
    });
  }
}
