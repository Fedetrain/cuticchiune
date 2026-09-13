// LA STANZA — quattro posti, un link, un padrone di casa.
//
// Possiede lo stato autoritativo: i telefoni non parlano mai fra loro, tutto
// passa da qui. Il motore (cuticchiune.js) non sa niente di rete e timer; la
// stanza sì: decide chi è seduto dove, chi è caduto, quando parte il bot,
// quanto si aspetta fra una presa e l'altra.
//
// FASI:  attesa → partita ⇄ fine-mano → fine-partita → (rivincita) attesa
//
// Ogni cambiamento di stato finisce in `invia()` → ogni client riceve una
// foto completa (`stato`) tagliata per lui: la sua mano in chiaro, le altre
// come conteggi. Le animazioni le guidano gli `evento` che precedono lo stato.

import {
  nuovaMano, gioca, mosseValide, vistaMano, risultatoMano,
  nuovaPartita, applicaMano, classifica, N,
} from './cuticchiune.js';
import { scegli, NOMI_BOT } from './bot.js';
import { codiceStanza, token as nuovoToken, id as nuovoId, now, pulisciNome, pulisciTesto } from './util.js';

/** I tempi della stanza, in millisecondi. Un solo posto per cambiarli. */
export const RITMO = {
  presaInVista: 2700,       // la presa resta sul tavolo prima di andare a chi l'ha vinta.
                            // Il conto parte quando la QUARTA carta viene calata, e
                            // il suo volo dura 620 ms (public/js/tavolo.js): restano
                            // due secondi buoni di carta ferma, che è il tempo che
                            // serve per vedere che cosa ha buttato l'ultimo.
  fineMano: 9000,           // il verdetto della mano resta a schermo (il padrone può saltare)
  primaCartaBot: 900,       // il bot «pensa» un attimo prima di giocare
  cartaBot: 1300,
  graziaCaduto: 12000,      // dopo tanto, per chi è caduto gioca il bot
  turnoDefault: 45000,      // timer per mossa, se acceso
  stanzaVuota: 15 * 60000,  // una stanza senza umani per tanto tempo si chiude
};

const OPZIONI_DEFAULT = {
  timerTurno: 45,           // secondi; 0 = spento
  botPerICaduti: true,      // se uno cade, dopo la grazia gioca il bot al suo posto
  puntiInChiaro: false,     // i punti si contano a mente: e' meta' del gioco.
                            // Chi vuole il tabellone lo accende dalle opzioni.
  pubblica: false,          // compare nelle partite pubbliche
};

export const EMOTE = [
  { id: 'talia',    testo: 'Talìa!' },
  { id: 'minchia',  testo: 'Minchia!' },
  { id: 'ammuccia', testo: 'Ammùccia…' },
  { id: 'bravu',    testo: 'Bravu!' },
  { id: 'chiddu',   testo: 'Chi ddu fai?' },
  { id: 'salvu',    testo: 'Mi sarvai!' },
  { id: 'sfurtuna', testo: 'Sfurtuna nìura' },
  { id: 'avanti',   testo: 'Avà, joca!' },
  // le frasi che si sentono davvero al tavolo
  { id: 'banna',    testo: 'A 10 chiamamo a banna' },
  { id: 'rincorsa', testo: 'Ora piglia a rincorsa' },
  { id: 'regalo',   testo: 'All’ultimo c’è regalo' },
  { id: 'sula',     testo: 'Carta a sula, levala allura' },
  { id: 'sarvarisi',testo: 'A prima regola è sarvarisi' },
  { id: 'applauso', testo: 'A mumento c’è applauso' },
  { id: 'taggiusto',testo: 'Ora t’aggiusto io!' },
  { id: 'napoli',   testo: 'Napoliiii' },
  { id: 'soffia',   testo: 'Soffia cca!' },
  { id: 'antenne',  testo: 'Antennee!' },
  { id: 'arso',     testo: 'Arso ncapo, arso no!' },
  { id: 'calano',   testo: 'Minchia comu si calano!' },
  { id: 'accussi',  testo: 'Seee ora ti fazzo sarvare accussì!' },
];

export class Stanza {
  constructor({ codice = codiceStanza(), rnd = Math.random, tempi = RITMO, opzioni = {} } = {}) {
    this.codice = codice;
    this.rnd = rnd;
    this.tempi = tempi;
    this.creataIl = now();
    this.giocatori = new Map();      // id → giocatore
    this.perToken = new Map();       // token → id
    this.posti = [null, null, null, null];   // id o null
    this.hostId = null;
    this.fase = 'attesa';
    this.opzioni = { ...OPZIONI_DEFAULT, ...opzioni };
    this.partita = null;
    this.mano = null;
    this.numeroMano = 0;
    this.chat = [];
    this.fineMano = null;            // il verdetto della mano appena finita
    this.rivincita = new Set();      // chi ha chiesto la rivincita
    this.diario = [];                // eventi di partita (per l'albo e per il debug)
    this._timers = new Map();        // nome → timeout
    this.scadenzaTurno = null;       // istante-server in cui scade il turno
    this.onChiusura = null;          // callback: la stanza va eliminata
    this.onAlbo = null;              // callback(esito): la partita è finita
    this._ultimoUmano = now();
    this.versione = 0;
  }

  // ─────────────────────────────── utilità ───────────────────────────────

  timer(nome, ms, fn) {
    this.annulla(nome);
    this._timers.set(nome, setTimeout(() => { this._timers.delete(nome); fn(); }, ms));
  }
  annulla(nome) { const t = this._timers.get(nome); if (t) { clearTimeout(t); this._timers.delete(nome); } }
  annullaTutti() { for (const t of this._timers.values()) clearTimeout(t); this._timers.clear(); }

  lista() { return [...this.giocatori.values()]; }
  umani() { return this.lista().filter(g => !g.bot); }
  umaniPresenti() { return this.umani().filter(g => g.presente); }
  postoDi(id) { return this.posti.indexOf(id); }
  seduto(posto) { return this.posti[posto] ? this.giocatori.get(this.posti[posto]) : null; }
  eHost(id) { return this.hostId === id; }
  postiLiberi() { return this.posti.filter(p => p === null).length; }
  /** Tutti e quattro i posti sono occupati da umani presenti o da bot. */
  tavoloCompleto() { return this.posti.every(id => id !== null); }

  // ─────────────────────────────── ingresso ───────────────────────────────

  /**
   * Un client entra (o rientra con il token). Ritorna il giocatore.
   * Chi arriva mentre c'è un posto libero si siede; altrimenti guarda.
   */
  entra({ nome, token, ws, primaDelloStato = null }) {
    if (token && this.perToken.has(token)) {
      const g = this.giocatori.get(this.perToken.get(token));
      if (g) {
        if (g.ws && g.ws !== ws) { try { g.ws.close(4001, 'sostituito'); } catch {} }
        g.ws = ws; g.presente = true; g.cadutoDa = null;
        if (nome) g.nome = pulisciNome(nome, g.nome);
        primaDelloStato?.(g);
        this.annulla(`grazia-${g.id}`);
        this.annulla(`oblio-${g.id}`);
        // in attesa il posto si era liberato: se ce n'è uno, si risiede
        if (this.fase === 'attesa' && this.postoDi(g.id) < 0) {
          const libero = this.posti.indexOf(null);
          if (libero >= 0) this.posti[libero] = g.id;
        }
        // era in automatico: riprende in mano il gioco
        if (g.automatico) { g.automatico = false; this.annulla(`bot-${this.postoDi(g.id)}`); this.riprendiTurno(); }
        this.assicuraHost();
        this.diario.push({ t: now(), tipo: 'rientro', id: g.id });
        this.invia();
        return { g, rientro: true };
      }
    }
    const g = {
      id: nuovoId(), token: nuovoToken(), nome: pulisciNome(nome), ws,
      bot: false, presente: true, cadutoDa: null, automatico: false, pronto: false, entratoIl: now(),
    };
    this.giocatori.set(g.id, g);
    this.perToken.set(g.token, g.id);
    primaDelloStato?.(g);
    if (this.fase === 'attesa') {
      const libero = this.posti.indexOf(null);
      if (libero >= 0) this.posti[libero] = g.id;
    }
    this.assicuraHost();
    this.diario.push({ t: now(), tipo: 'entra', id: g.id, nome: g.nome });
    this.invia();
    return { g, rientro: false };
  }

  esce(ws) {
    const g = this.lista().find(x => x.ws === ws);
    if (!g) return;
    g.ws = null; g.presente = false; g.cadutoDa = now();
    this._ultimoUmano = now();
    if (this.fase === 'attesa') {
      // in attesa chi se ne va libera il posto (torna con lo stesso token, si risiede)
      const p = this.postoDi(g.id);
      if (p >= 0) this.posti[p] = null;
      g.pronto = false;
      // dopo un po' lo si dimentica del tutto
      this.timer(`oblio-${g.id}`, 60000, () => { if (!g.presente) { this.giocatori.delete(g.id); this.perToken.delete(g.token); this.assicuraHost(); this.invia(); } });
    } else if (this.opzioni.botPerICaduti && this.postoDi(g.id) >= 0) {
      // in partita: grazia, poi gioca il bot al suo posto
      this.timer(`grazia-${g.id}`, this.tempi.graziaCaduto, () => {
        if (g.presente) return;
        g.automatico = true;
        this.diario.push({ t: now(), tipo: 'automatico', id: g.id });
        this.invia();
        this.riprendiTurno();
      });
    }
    this.assicuraHost();
    if (this.umaniPresenti().length === 0) {
      this.timer('chiusura', this.tempi.stanzaVuota, () => this.chiudi());
    }
    this.invia();
  }

  assicuraHost() {
    const h = this.hostId ? this.giocatori.get(this.hostId) : null;
    if (h && h.presente && !h.bot) return;
    const candidato = this.umaniPresenti().sort((a, b) => a.entratoIl - b.entratoIl)[0];
    this.hostId = candidato ? candidato.id : (h ? h.id : null);
  }

  chiudi() {
    this.annullaTutti();
    for (const g of this.lista()) { try { g.ws?.close(4002, 'stanza chiusa'); } catch {} }
    this.onChiusura?.(this);
  }

  // ─────────────────────────────── in attesa ───────────────────────────────

  siedi(id, posto) {
    const g = this.giocatori.get(id);
    if (!g || this.fase !== 'attesa') return this.errore(id, 'Ora non ci si può sedere');
    if (posto < 0 || posto >= N) return;
    if (this.posti[posto] && this.posti[posto] !== id) {
      const occupante = this.giocatori.get(this.posti[posto]);
      // un bot si può cacciare per sedersi al suo posto
      if (!occupante?.bot) return this.errore(id, 'Posto occupato');
      this.rimuoviBot(posto);
    }
    const prima = this.postoDi(id);
    if (prima >= 0) this.posti[prima] = null;
    this.posti[posto] = id;
    g.pronto = false;
    this.invia();
  }

  alzati(id) {
    const p = this.postoDi(id);
    if (p < 0 || this.fase !== 'attesa') return;
    this.posti[p] = null;
    const g = this.giocatori.get(id); if (g) g.pronto = false;
    this.invia();
  }

  aggiungiBot(posto, daId) {
    if (this.fase !== 'attesa') return;
    if (daId && !this.eHost(daId)) return this.errore(daId, 'Solo chi ha aperto il tavolo può aggiungere un bot');
    if (posto === undefined) posto = this.posti.indexOf(null);
    if (posto < 0 || this.posti[posto]) return;
    const usati = new Set(this.lista().map(g => g.nome));
    const nome = NOMI_BOT.find(n => !usati.has(n)) || `Cumpari ${posto + 1}`;
    const b = { id: `bot-${nuovoId()}`, token: null, nome, ws: null, bot: true, presente: true, pronto: true, entratoIl: now() };
    this.giocatori.set(b.id, b);
    this.posti[posto] = b.id;
    this.invia();
  }

  rimuoviBot(posto, daId) {
    if (daId && !this.eHost(daId)) return this.errore(daId, 'Solo chi ha aperto il tavolo può togliere un bot');
    const id = this.posti[posto];
    const g = id && this.giocatori.get(id);
    if (!g || !g.bot || this.fase !== 'attesa') return;
    this.giocatori.delete(id);
    this.posti[posto] = null;
    this.invia();
  }

  caccia(daId, id) {
    if (!this.eHost(daId) || id === daId) return;
    const g = this.giocatori.get(id);
    if (!g) return;
    if (g.bot) return this.rimuoviBot(this.postoDi(id), daId);
    if (this.fase !== 'attesa') return this.errore(daId, 'In partita non si caccia nessuno');
    const p = this.postoDi(id); if (p >= 0) this.posti[p] = null;
    this.giocatori.delete(id); this.perToken.delete(g.token);
    try { g.ws?.send(JSON.stringify({ t: 'cacciato' })); g.ws?.close(4003, 'cacciato'); } catch {}
    this.invia();
  }

  pronto(id, valore = true) {
    const g = this.giocatori.get(id);
    if (!g || this.fase !== 'attesa' || this.postoDi(id) < 0) return;
    g.pronto = !!valore;
    this.invia();
    this.avviaSeTuttiPronti();
  }

  opzioniDa(id, nuove) {
    if (!this.eHost(id)) return this.errore(id, 'Solo chi ha aperto il tavolo cambia le opzioni');
    if (this.fase !== 'attesa') return this.errore(id, 'Le opzioni si cambiano prima di iniziare');
    const o = { ...this.opzioni };
    if (typeof nuove.timerTurno === 'number') o.timerTurno = Math.max(0, Math.min(180, Math.round(nuove.timerTurno)));
    if (typeof nuove.botPerICaduti === 'boolean') o.botPerICaduti = nuove.botPerICaduti;
    if (typeof nuove.puntiInChiaro === 'boolean') o.puntiInChiaro = nuove.puntiInChiaro;
    if (typeof nuove.pubblica === 'boolean') o.pubblica = nuove.pubblica;
    this.opzioni = o;
    this.invia();
  }

  /** Il padrone di casa avvia: i posti vuoti li prendono i bot. */
  avvia(id) {
    if (!this.eHost(id)) return this.errore(id, 'Solo chi ha aperto il tavolo può iniziare');
    if (this.fase !== 'attesa') return;
    if (this.umaniPresenti().filter(g => this.postoDi(g.id) >= 0).length === 0) return this.errore(id, 'Siediti prima di iniziare');
    for (let p = 0; p < N; p++) if (!this.posti[p]) this.aggiungiBot(p);
    this.iniziaPartita();
  }

  avviaSeTuttiPronti() {
    if (!this.tavoloCompleto()) return;
    const tutti = this.posti.every(id => this.giocatori.get(id)?.pronto);
    if (tutti) this.iniziaPartita();
  }

  // ─────────────────────────────── la partita ───────────────────────────────

  iniziaPartita() {
    this.partita = nuovaPartita();
    this.numeroMano = 0;
    this.rivincita.clear();
    for (const g of this.lista()) g.pronto = false;
    this.diario.push({ t: now(), tipo: 'inizio', posti: this.posti.map(id => this.giocatori.get(id)?.nome) });
    this.iniziaMano();
  }

  iniziaMano() {
    this.numeroMano++;
    this.mano = nuovaMano({ apre: this.partita.prossimoApre, rnd: this.rnd });
    this.fase = 'partita';
    this.fineMano = null;
    this.evento({ t: 'evento', tipo: 'distribuzione', numeroMano: this.numeroMano, apre: this.mano.apre });
    this.invia();
    this.avviaTurno();
  }

  /** Chi deve giocare adesso: se è un bot (o un caduto in automatico), lo fa lui. */
  avviaTurno() {
    const m = this.mano;
    if (!m || m.finita || this.fase !== 'partita') return;
    const g = this.seduto(m.turno);
    this.annulla('turno');
    this.scadenzaTurno = null;
    if (!g) return;
    const automatico = g.bot || g.automatico;
    if (automatico) {
      const ritardo = m.tavolo.length === 0 && m.numeroPresa === 0 ? this.tempi.primaCartaBot : this.tempi.cartaBot;
      this.timer(`bot-${m.turno}`, ritardo, () => this.giocaCarta(g.id, scegli(m, m.turno, this.rnd), true));
      return;
    }
    if (this.opzioni.timerTurno > 0) {
      const ms = this.opzioni.timerTurno * 1000;
      this.scadenzaTurno = now() + ms;
      this.timer('turno', ms, () => {
        // tempo scaduto: gioca il bot per lui, una volta sola (non lo mette in automatico)
        if (this.mano && this.mano.turno === this.postoDi(g.id)) {
          this.evento({ t: 'evento', tipo: 'tempo-scaduto', posto: this.mano.turno });
          this.giocaCarta(g.id, scegli(this.mano, this.mano.turno, this.rnd), true);
        }
      });
      this.invia();
    }
  }

  riprendiTurno() {
    if (this.fase === 'partita' && this.mano && !this.mano.finita && this.mano.tavolo.length < N) this.avviaTurno();
  }

  giocaCarta(id, carta, automatico = false) {
    if (this.fase !== 'partita' || !this.mano) return this.errore(id, 'Non si sta giocando');
    const posto = this.postoDi(id);
    if (posto < 0) return this.errore(id, 'Stai guardando, non giocando');
    if (this._presaInVista) return this.errore(id, 'Aspetta che la presa vada via');
    const e = gioca(this.mano, posto, carta);
    if (!e.ok) return this.errore(id, e.errore);
    this.annulla('turno'); this.annulla(`bot-${posto}`);
    this.scadenzaTurno = null;
    this.evento({ t: 'evento', tipo: 'carta', posto, carta, automatico });

    if (!e.presa) { this.invia(); this.avviaTurno(); return; }

    // la presa resta in vista, poi va a chi l'ha vinta
    this._presaInVista = e.presa;
    this.evento({ t: 'evento', tipo: 'presa', ...e.presa });
    this.invia();
    this.timer('presa', this.tempi.presaInVista, () => {
      this._presaInVista = null;
      if (e.fine) return this.chiudiMano(e.fine);
      this.invia();
      this.avviaTurno();
    });
  }

  chiudiMano(risultato) {
    const esito = applicaMano(this.partita, risultato, this.mano);
    this.fineMano = {
      numeroMano: this.numeroMano,
      ...risultato,
      singhe: this.partita.singhe.slice(),
      prossimoApre: this.partita.prossimoApre,
      prese: this.mano.prese.map(p => p.slice()),
      storico: this.mano.storico,
      bonusUltima: this.mano.bonusUltima,   // chi ha pigliato l’ultima presa (+3)
    };
    this.diario.push({ t: now(), tipo: 'mano', numero: this.numeroMano, ...risultato, singhe: this.partita.singhe.slice() });
    if (esito) {
      this.fase = 'fine-partita';
      this.evento({ t: 'evento', tipo: 'fine-partita', esito });
      this.invia();
      this.onAlbo?.(this.riassuntoPartita());
      return;
    }
    this.fase = 'fine-mano';
    this.evento({ t: 'evento', tipo: 'fine-mano', ...risultato });
    this.invia();
    this.timer('fine-mano', this.tempi.fineMano, () => this.iniziaMano());
  }

  /** Il padrone di casa salta l'attesa fra una mano e l'altra. */
  avanti(id) {
    if (!this.eHost(id)) return;
    if (this.fase === 'fine-mano') { this.annulla('fine-mano'); this.iniziaMano(); }
  }

  riassuntoPartita() {
    const cl = classifica(this.partita);
    return {
      codice: this.codice,
      finitaIl: now(),
      mani: this.numeroMano,
      esito: this.partita.esito,
      classifica: cl.map(r => ({ ...r, nome: this.seduto(r.posto)?.nome, bot: !!this.seduto(r.posto)?.bot })),
    };
  }

  /** Dopo la fine: chi vuole rigiocare lo dice; quando tutti gli umani seduti lo hanno detto si riparte. */
  chiediRivincita(id) {
    if (this.fase !== 'fine-partita') return;
    if (this.postoDi(id) < 0) return;
    this.rivincita.add(id);
    const umaniSeduti = this.posti.map(x => this.giocatori.get(x)).filter(g => g && !g.bot && g.presente);
    if (umaniSeduti.every(g => this.rivincita.has(g.id))) {
      this.iniziaPartita();
      return;
    }
    this.invia();
  }

  /** Torna in attesa: si può cambiare posto, aggiungere gente. */
  tornaInAttesa(id) {
    if (!this.eHost(id) || this.fase !== 'fine-partita') return;
    this.annullaTutti();
    this.fase = 'attesa';
    this.partita = null; this.mano = null; this.fineMano = null; this.rivincita.clear();
    for (const g of this.lista()) g.pronto = g.bot;
    this.invia();
  }

  // ─────────────────────────────── chat ed emote ───────────────────────────────

  chatDa(id, testo) {
    const g = this.giocatori.get(id);
    const t = pulisciTesto(testo);
    if (!g || !t) return;
    const riga = { id: nuovoId(), da: g.id, nome: g.nome, posto: this.postoDi(g.id), testo: t, quando: now() };
    this.chat.push(riga); if (this.chat.length > 40) this.chat.shift();
    this.evento({ t: 'evento', tipo: 'chat', ...riga });
  }

  emoteDa(id, emoteId) {
    const g = this.giocatori.get(id);
    const e = EMOTE.find(x => x.id === emoteId);
    if (!g || !e) return;
    const adesso = now();
    if (g._ultimaEmote && adesso - g._ultimaEmote < 1500) return;   // niente raffiche
    g._ultimaEmote = adesso;
    this.evento({ t: 'evento', tipo: 'emote', da: g.id, nome: g.nome, posto: this.postoDi(g.id), emote: e });
  }

  // ─────────────────────────────── uscita verso i client ───────────────────────────────

  errore(id, msg) {
    const g = this.giocatori.get(id);
    if (g?.ws) this.mandaA(g, { t: 'errore', msg });
  }

  mandaA(g, msg) {
    if (!g.ws || g.ws.readyState !== 1) return;
    try { g.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch {}
  }

  evento(ev) {
    const s = JSON.stringify({ ...ev, at: now() });
    for (const g of this.lista()) this.mandaA(g, s);
  }

  /** Lo stato pubblico, uguale per tutti. */
  statoPubblico() {
    return {
      codice: this.codice,
      fase: this.fase,
      versione: ++this.versione,
      host: this.hostId,
      opzioni: this.opzioni,
      posti: this.posti.map(id => {
        const g = id ? this.giocatori.get(id) : null;
        return g ? { id: g.id, nome: g.nome, bot: g.bot, presente: g.presente, pronto: g.pronto, automatico: !!g.automatico } : null;
      }),
      spettatori: this.lista().filter(g => !g.bot && this.postoDi(g.id) < 0).map(g => ({ id: g.id, nome: g.nome, presente: g.presente })),
      partita: this.partita ? { singhe: this.partita.singhe, numeroMano: this.numeroMano, mani: this.partita.mani, finita: this.partita.finita, esito: this.partita.esito } : null,
      fineMano: this.fineMano,
      classifica: this.fase === 'fine-partita' && this.partita ? this.riassuntoPartita().classifica : null,
      rivincita: [...this.rivincita],
      scadenzaTurno: this.scadenzaTurno,
      presaInVista: !!this._presaInVista,
      chat: this.chat.slice(-20),
      ora: now(),
    };
  }

  statoPer(g) {
    const pub = this.statoPubblico();
    const posto = this.postoDi(g.id);
    const mano = this.mano ? vistaMano(this.mano, posto) : null;
    if (mano && !this.opzioni.puntiInChiaro && this.fase === 'partita') mano.punti = null;
    return { t: 'stato', ...pub, io: { id: g.id, posto, host: this.eHost(g.id), spettatore: posto < 0, nome: g.nome }, mano };
  }

  invia() {
    for (const g of this.lista()) if (g.ws) this.mandaA(g, this.statoPer(g));
  }
}
