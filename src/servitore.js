// IL SERVITORE — le stanze e lo smistamento dei messaggi, senza rete.
//
// Non sa se dall'altra parte c'e' un WebSocket, una connessione WebRTC o
// niente del tutto: gli basta un oggetto con `send(stringa)`, `close()` e
// `readyState` (1 = aperto). Cosi' la stessa identica partita gira
//   · su server.js, con `ws`, quattro telefoni veri;
//   · dentro la pagina, contro i bot, senza server (vedi public/js/rete-locale.js);
//   · dentro la pagina di chi apre il tavolo, con gli altri collegati in P2P.
//
// Se questo file cambia, cambiano tutti e tre i modi insieme: e' apposta.

import { Stanza, EMOTE, RITMO } from './stanza.js';
import { codiceStanza, pulisciNome } from './util.js';

export class Servitore {
  /**
   * @param tempi     funzione o oggetto: i tempi della stanza (i test li accorciano)
   * @param link      (codice) => url da mostrare nel benvenuto e nel QR
   * @param onStanza  chiamata quando nasce una stanza
   * @param onChiusa  chiamata quando muore
   * @param onAlbo    il riassunto di fine partita, per chi tiene i conti
   */
  constructor({ tempi = RITMO, link = (c) => `#/s/${c}`, onStanza, onChiusa, onAlbo } = {}) {
    this.stanze = new Map();
    this._tempi = tempi;
    this.link = link;
    this.onStanza = onStanza;
    this.onChiusa = onChiusa;
    this.onAlbo = onAlbo;
  }

  get tempi() { return typeof this._tempi === 'function' ? this._tempi() : this._tempi; }

  nuovaStanza(opzioni = {}) {
    let codice;
    do codice = codiceStanza(); while (this.stanze.has(codice));
    const s = new Stanza({ codice, opzioni, tempi: this.tempi });
    s.onChiusura = () => { this.stanze.delete(s.codice); this.onChiusa?.(s); };
    s.onAlbo = (riassunto) => this.onAlbo?.(riassunto);
    this.stanze.set(codice, s);
    this.onStanza?.(s);
    return s;
  }

  /** Le stanze pubbliche con un posto libero, in attesa. */
  pubblicheAperte() {
    return [...this.stanze.values()].filter(s => s.opzioni.pubblica && s.fase === 'attesa' && s.postiLiberi() > 0);
  }

  /** Le stanze pubbliche come le vuole la home. */
  vetrina() {
    return this.pubblicheAperte().map(s => ({
      codice: s.codice, liberi: s.postiLiberi(),
      nomi: s.posti.map(id => s.giocatori.get(id)?.nome).filter(Boolean),
    }));
  }

  /**
   * Una connessione. `ws` e' il canale verso quel client; `link` sovrascrive
   * quello del servitore (sul server vero dipende dagli header della richiesta).
   * Ritorna { messaggio(m), chiudi() }: chi possiede il canale gli passa i
   * messaggi gia' decodificati e avvisa quando si chiude.
   */
  sessione(ws, { link = this.link } = {}) {
    const servitore = this;
    let stanza = null;
    let io = null;
    const manda = (m) => { try { ws.send(JSON.stringify(m)); } catch {} };

    function entraIn(s, { nome, token }) {
      if (stanza && stanza !== s && io) stanza.esce(ws);
      stanza = s;
      // il benvenuto (con il token) deve arrivare PRIMA del primo stato: il
      // client salva il token e poi disegna
      const { g } = s.entra({
        nome, token, ws,
        primaDelloStato: (giocatore) => manda({ t: 'benvenuto', token: giocatore.token, id: giocatore.id, codice: s.codice, link: link(s.codice), emote: EMOTE }),
      });
      io = g;
    }

    return {
      get stanza() { return stanza; },
      messaggio(m) {
        if (!m || typeof m.t !== 'string') return;
        if (m.t === 'ping') return manda({ t: 'pong', c: m.c, s: Date.now() });

        if (m.t === 'crea') {
          const s = servitore.nuovaStanza({ pubblica: !!m.pubblica });
          return entraIn(s, { nome: m.nome, token: null });
        }
        if (m.t === 'entra') {
          const codice = String(m.codice || '').toUpperCase().trim();
          const s = servitore.stanze.get(codice);
          if (!s) return manda({ t: 'errore', msg: `Nessun tavolo con il codice ${codice || '—'}`, fatale: true });
          return entraIn(s, { nome: m.nome, token: m.token });
        }
        if (m.t === 'pubblica') {
          // abbinamento automatico: la stanza pubblica piu' vecchia con un posto libero, o una nuova
          const aperte = servitore.pubblicheAperte().sort((a, b) => a.creataIl - b.creataIl);
          const s = aperte[0] || servitore.nuovaStanza({ pubblica: true });
          return entraIn(s, { nome: m.nome, token: null });
        }

        if (!stanza || !io) return manda({ t: 'errore', msg: 'Prima entra in un tavolo' });
        const id = io.id;
        switch (m.t) {
          case 'siedi':      return stanza.siedi(id, Number(m.posto));
          case 'alzati':     return stanza.alzati(id);
          case 'pronto':     return stanza.pronto(id, m.valore !== false);
          case 'bot':        return m.on === false ? stanza.rimuoviBot(Number(m.posto), id) : stanza.aggiungiBot(m.posto === undefined ? undefined : Number(m.posto), id);
          case 'caccia':     return stanza.caccia(id, String(m.id || ''));
          case 'opzioni':    return stanza.opzioniDa(id, m.opzioni || {});
          case 'avvia':      return stanza.avvia(id);
          case 'gioca':      return stanza.giocaCarta(id, String(m.carta || ''));
          case 'avanti':     return stanza.avanti(id);
          case 'rivincita':  return stanza.chiediRivincita(id);
          case 'attesa':     return stanza.tornaInAttesa(id);
          case 'chat':       return stanza.chatDa(id, m.testo);
          case 'emote':      return stanza.emoteDa(id, String(m.id || ''));
          case 'nome':       { io.nome = pulisciNome(m.nome, io.nome); return stanza.invia(); }
          default:           return manda({ t: 'errore', msg: `Messaggio sconosciuto: ${m.t}` });
        }
      },
      chiudi() { if (stanza) stanza.esce(ws); },
    };
  }
}

export { EMOTE, RITMO };
