// LA STANZA — un tavolo, un link, un padrone di casa. Qualunque gioco.
//
// Possiede lo stato autoritativo: i telefoni non parlano mai fra loro, tutto
// passa da qui. Il gioco (src/giochi/) non sa niente di rete e timer; la
// stanza si': decide chi e' seduto dove, chi e' caduto, quando parte il bot,
// quanto si aspetta fra una presa e l'altra. Del gioco conosce solo il
// contratto (src/giochi/index.js): mosse valide, gioca, vista, fine mano,
// classifica, bot. Il gioco e i posti (2 o 4) li sceglie il padrone di casa,
// e si possono cambiare finche' la partita non comincia.
//
// FASI:  attesa → partita ⇄ fine-mano → fine-partita → (rivincita) attesa
//
// Ogni cambiamento di stato finisce in `invia()` → ogni client riceve una
// foto completa (`stato`) tagliata per lui: la sua mano in chiaro, le altre
// come conteggi. Le animazioni le guidano gli `evento` che precedono lo stato.

import { GIOCHI, giocoDa, opzioniDiSerie } from './giochi/index.js';
import { NOMI_BOT } from './bot.js';
import { codiceStanza, token as nuovoToken, id as nuovoId, now, pulisciNome, pulisciTesto } from './util.js';

/** I tempi della stanza, in millisecondi. Un solo posto per cambiarli. */
export const RITMO = {
  presaInVista: 2700,       // la presa resta sul tavolo prima di andare a chi l'ha vinta.
                            // Il conto parte quando l'ULTIMA carta viene calata, e
                            // il suo volo dura 620 ms (public/js/tavolo.js): restano
                            // due secondi buoni di carta ferma, che è il tempo che
                            // serve per vedere che cosa ha buttato l'ultimo.
  presaPesca: 1500,         // alla Scopa si prende quasi a ogni carta: la presa si
                            // fa vedere, ma piu' in fretta, o la mano non finisce mai
  fineMano: 9000,           // il verdetto della mano resta a schermo (il padrone può saltare)
  primaCartaBot: 900,       // il bot «pensa» un attimo prima di giocare
  cartaBot: 1300,
  graziaCaduto: 12000,      // dopo tanto, per chi è caduto gioca il bot
  turnoDefault: 45000,      // timer per mossa, se acceso
  stanzaVuota: 15 * 60000,  // una stanza senza umani per tanto tempo si chiude
};

/** Le opzioni del tavolo, uguali per tutti i giochi. Quelle del gioco le dice il gioco. */
const OPZIONI_DEFAULT = {
  timerTurno: 45,           // secondi; 0 = spento
  botPerICaduti: true,      // se uno cade, dopo la grazia gioca il bot al suo posto
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

/** Due prese sono la stessa se hanno le stesse carte, in qualunque ordine. */
function stessoInsieme(a = [], b = []) {
  return a.length === b.length && a.slice().sort().join() === b.slice().sort().join();
}

/**
 * La vista di un posto mentre la presa e' in vista: la foto di PRIMA della
 * mossa, con la carta giocata tolta dalla mano di chi l'ha giocata. Il
 * client la disegna sul tavolo leggendo `pausa.esito`. Usa solo i campi che
 * ogni vista ha per contratto (mano, valide, conteggi).
 */
function vistaInPausa(prima, posto, esito) {
  const base = prima[posto] ?? prima[-1];
  const v = { ...base, valide: [] };
  if (posto === esito.posto && Array.isArray(base.mano)) v.mano = base.mano.filter(c => c !== esito.carta);
  if (Array.isArray(base.conteggi)) {
    v.conteggi = base.conteggi.slice();
    v.conteggi[esito.posto] = Math.max(0, v.conteggi[esito.posto] - 1);
  }
  return v;
}

export class Stanza {
  constructor({ codice = codiceStanza(), rnd = Math.random, tempi = RITMO, opzioni = {}, gioco = null, posti = null } = {}) {
    this.codice = codice;
    this.rnd = rnd;
    this.tempi = tempi;
    this.creataIl = now();
    this.gioco = giocoDa(gioco);
    this.n = this.gioco.posti.includes(Number(posti)) ? Number(posti) : this.gioco.posti[0];
    this.opzioniGioco = opzioniDiSerie(this.gioco);
    this.giocatori = new Map();      // id → giocatore
    this.perToken = new Map();       // token → id
    this.posti = Array(this.n).fill(null);   // id o null
    this.hostId = null;
    this.fase = 'attesa';
    this.opzioni = { ...OPZIONI_DEFAULT, ...opzioni };
    this.partita = null;
    this.mano = null;
    this.numeroMano = 0;
    this.mosseMano = 0;              // mosse giocate nella mano: la prima il bot la pensa di piu'
    this.esitoPartita = null;        // quello che ha detto applicaMano quando la partita e' finita
    this.chat = [];
    this.fineMano = null;            // il verdetto della mano appena finita
    this.rivincita = new Set();      // chi ha chiesto la rivincita
    this.diario = [];                // eventi di partita (per l'albo e per il debug)
    this._timers = new Map();        // nome → timeout
    this._pausa = null;              // la presa in vista: { esito, prima }
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
  /** Tutti i posti sono occupati da umani presenti o da bot. */
  tavoloCompleto() { return this.posti.every(id => id !== null); }

  /** Di chi e' il turno: il posto che ha almeno una mossa valida, o -1. Il
   *  contratto non dice dove il gioco tiene il turno: lo si chiede cosi'. */
  turno() {
    if (!this.mano) return -1;
    for (let p = 0; p < this.n; p++) if (this.gioco.mosseValide(this.mano, p).length) return p;
    return -1;
  }

  // ─────────────────────────────── ingresso ───────────────────────────────

  /**
   * Un client entra (o rientra con il token). Ritorna il giocatore.
   * Chi arriva mentre c'è un posto libero si siede; altrimenti guarda.
   */
  entra({ nome, token, ws, primaDelloStato = null }) {
    // C'era gente, se n'e' andata tutta, il tavolo era in conto alla rovescia:
    // se qualcuno torna il conto va fermato, o la stanza si chiude in mezzo
    // alla partita appena ricominciata.
    this.annulla('chiusura');
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
    // se ne e' andato mentre si aspettava il suo si' alla rivincita: adesso
    // mancava lui e basta, e gli altri restavano fermi per sempre
    if (this.fase === 'fine-partita') this.forseRivincita();
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
    if (!(posto >= 0 && posto < this.n)) return;
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
    if (!(posto >= 0 && posto < this.n) || this.posti[posto]) return;
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

  /** Le opzioni del tavolo (`nuove`) e quelle del gioco (`delGioco`): solo il padrone, solo prima. */
  opzioniDa(id, nuove = {}, delGioco = {}) {
    if (!this.eHost(id)) return this.errore(id, 'Solo chi ha aperto il tavolo cambia le opzioni');
    if (this.fase !== 'attesa') return this.errore(id, 'Le opzioni si cambiano prima di iniziare');
    const o = { ...this.opzioni };
    if (typeof nuove.timerTurno === 'number') o.timerTurno = Math.max(0, Math.min(180, Math.round(nuove.timerTurno)));
    if (typeof nuove.botPerICaduti === 'boolean') o.botPerICaduti = nuove.botPerICaduti;
    if (typeof nuove.pubblica === 'boolean') o.pubblica = nuove.pubblica;
    this.opzioni = o;
    const og = { ...this.opzioniGioco };
    for (const [k, v] of Object.entries(delGioco || {})) {
      const descr = this.gioco.opzioni?.[k];
      if (descr && descr.valori.includes(v)) og[k] = v;
    }
    this.opzioniGioco = og;
    this.invia();
  }

  /**
   * Il padrone cambia gioco o numero di posti, prima di iniziare. Chi resta
   * senza sedia (da 4 a 2) si siede dove c'e' posto, o al posto di un bot;
   * se no guarda. Se i posti crescono, chi guardava si siede.
   */
  cambiaGioco(id, { gioco: idGioco, posti } = {}) {
    if (!this.eHost(id)) return this.errore(id, 'Solo chi ha aperto il tavolo sceglie il gioco');
    if (this.fase !== 'attesa') return this.errore(id, 'Il gioco si cambia prima di iniziare la partita');
    if (idGioco !== undefined && !GIOCHI[idGioco]) return this.errore(id, 'Questo gioco non c\'è. Scegline uno dall\'elenco.');
    const nuovo = idGioco !== undefined ? GIOCHI[idGioco] : this.gioco;
    const chiesti = Number(posti);
    const n = nuovo.posti.includes(chiesti) ? chiesti : (nuovo.posti.includes(this.n) ? this.n : nuovo.posti[0]);
    if (nuovo !== this.gioco) this.opzioniGioco = opzioniDiSerie(nuovo);
    this.gioco = nuovo;
    this.riposiziona(n);
    this.invia();
  }

  riposiziona(n) {
    if (n === this.n) return;
    const nuovi = Array(n).fill(null);
    const fuori = [];
    this.posti.forEach((id, p) => { if (!id) return; if (p < n) nuovi[p] = id; else fuori.push(id); });
    for (const id of fuori) {
      const g = this.giocatori.get(id);
      if (!g || g.bot) { this.giocatori.delete(id); continue; }
      let posto = nuovi.indexOf(null);
      if (posto < 0) {
        // un umano vale piu' di un bot: se non c'e' sedia, la libera un bot
        posto = nuovi.findIndex(x => this.giocatori.get(x)?.bot);
        if (posto >= 0) this.giocatori.delete(nuovi[posto]);
      }
      if (posto >= 0) nuovi[posto] = id;
    }
    // i posti sono cresciuti: chi guardava si siede, in ordine d'arrivo
    const spettatori = this.umaniPresenti().filter(g => !nuovi.includes(g.id)).sort((a, b) => a.entratoIl - b.entratoIl);
    for (const g of spettatori) {
      const libero = nuovi.indexOf(null);
      if (libero < 0) break;
      nuovi[libero] = g.id;
    }
    this.posti = nuovi;
    this.n = n;
    for (const g of this.umani()) g.pronto = false;
  }

  /** Il padrone di casa avvia: i posti vuoti li prendono i bot. */
  avvia(id) {
    if (!this.eHost(id)) return this.errore(id, 'Solo chi ha aperto il tavolo può iniziare');
    if (this.fase !== 'attesa') return;
    if (this.umaniPresenti().filter(g => this.postoDi(g.id) >= 0).length === 0) return this.errore(id, 'Siediti prima di iniziare');
    for (let p = 0; p < this.n; p++) if (!this.posti[p]) this.aggiungiBot(p);
    this.iniziaPartita();
  }

  avviaSeTuttiPronti() {
    if (!this.tavoloCompleto()) return;
    const tutti = this.posti.every(id => this.giocatori.get(id)?.pronto);
    if (tutti) this.iniziaPartita();
  }

  // ─────────────────────────────── la partita ───────────────────────────────

  iniziaPartita() {
    this.partita = this.gioco.nuovaPartita({ n: this.n, opzioni: { ...this.opzioniGioco } });
    this.numeroMano = 0;
    this.esitoPartita = null;
    this.rivincita.clear();
    for (const g of this.lista()) g.pronto = false;
    this.diario.push({ t: now(), tipo: 'inizio', gioco: this.gioco.id, posti: this.posti.map(id => this.giocatori.get(id)?.nome) });
    this.iniziaMano();
  }

  iniziaMano() {
    this.numeroMano++;
    this.mano = this.gioco.nuovaMano(this.partita, { rnd: this.rnd });
    this.mosseMano = 0;
    this._pausa = null;
    this.fase = 'partita';
    this.fineMano = null;
    this.evento({ t: 'evento', tipo: 'distribuzione', numeroMano: this.numeroMano, apre: this.turno() });
    this.invia();
    this.avviaTurno();
  }

  /** Chi deve giocare adesso: se è un bot (o un caduto in automatico), lo fa lui. */
  avviaTurno() {
    if (!this.mano || this.fase !== 'partita' || this._pausa) return;
    const turno = this.turno();
    this.annulla('turno');
    this.scadenzaTurno = null;
    if (turno < 0) return;
    const g = this.seduto(turno);
    if (!g) return;
    if (g.bot || g.automatico) {
      const ritardo = this.mosseMano === 0 ? this.tempi.primaCartaBot : this.tempi.cartaBot;
      this.timer(`bot-${turno}`, ritardo, () => this.giocaMossa(g.id, this.mossaBot(turno), true));
      return;
    }
    if (this.opzioni.timerTurno > 0) {
      const ms = this.opzioni.timerTurno * 1000;
      this.scadenzaTurno = now() + ms;
      this.timer('turno', ms, () => {
        // tempo scaduto: gioca il bot per lui, una volta sola (non lo mette in automatico)
        if (this.mano && this.turno() === this.postoDi(g.id)) {
          this.evento({ t: 'evento', tipo: 'tempo-scaduto', posto: this.postoDi(g.id) });
          this.giocaMossa(g.id, this.mossaBot(this.postoDi(g.id)), true);
        }
      });
      this.invia();
    }
  }

  /**
   * La mossa del bot. Se la scelta non torna (una mossa che il bot non sa
   * valutare, o un errore nel bot) si gioca comunque la prima valida: una
   * mano ferma perche' nessuno cala piu' e' il peggio che possa capitare al tavolo.
   */
  mossaBot(posto) {
    const valide = this.gioco.mosseValide(this.mano, posto);
    let scelta = null;
    try { scelta = this.gioco.bot(this.mano, posto, this.rnd); }
    catch (e) { console.warn(`⚠ il bot di ${this.gioco.id} si e' inceppato: ${e.message}`); }
    return valide.find(v => v.carta === scelta?.carta && (scelta.presa == null || stessoInsieme(v.presa, scelta.presa))) || valide[0];
  }

  riprendiTurno() {
    if (this.fase === 'partita' && this.mano && !this._pausa) this.avviaTurno();
  }

  /** La foto di ogni posto (e dello spettatore, -1) prima di una mossa. */
  fotografa() {
    const foto = {};
    for (let p = -1; p < this.n; p++) foto[p] = this.gioco.vista(this.mano, p, this.partita);
    return foto;
  }

  /**
   * Una mossa: `{ carta }`, o `{ carta, presa }` nei giochi a pesca.
   *
   * LA PRESA RESTA IN VISTA. Il gioco, appena una presa si chiude, sgombera
   * il tavolo: e' giusto per le regole, ma lo stato che parte subito dopo
   * direbbe «sul tavolo non c'e' niente», e la carta di chi ha chiuso non si
   * vedrebbe mai. Quando una mossa toglie carte dal tavolo (il tavolo dopo
   * non e' quello di prima piu' la carta giocata) la stanza si ferma: per
   * tutta la pausa ognuno riceve la foto di PRIMA, senza la carta giocata,
   * e in `pausa.esito` che cosa e' successo. Il client mette la carta sul
   * tavolo e mostra chi prende; finita la pausa arriva lo stato vero.
   */
  giocaMossa(id, mossa, automatico = false) {
    if (this.fase !== 'partita' || !this.mano) return this.errore(id, 'Non si sta giocando');
    const posto = this.postoDi(id);
    if (posto < 0) return this.errore(id, 'Stai guardando, non giocando');
    if (this._pausa) return this.errore(id, 'Aspetta che la presa vada via');
    const prima = this.fotografa();
    const e = this.gioco.gioca(this.mano, posto, mossa);
    if (!e.ok) return this.errore(id, e.errore, e.scelte ? { scelte: e.scelte } : null);
    this.mosseMano++;
    this.annulla('turno'); this.annulla(`bot-${posto}`);
    this.scadenzaTurno = null;
    const { ok, fine, ...esito } = e;
    this.evento({ t: 'evento', tipo: 'carta', automatico, ...esito });

    const dopo = this.gioco.vista(this.mano, -1, this.partita);
    const sgombera = dopo.tavolo.length !== prima[-1].tavolo.length + 1;
    if (!sgombera && !fine) { this.invia(); this.avviaTurno(); return; }

    this._pausa = { esito, prima };
    this.invia();
    const ms = fine || this.gioco.famiglia !== 'pesca' ? this.tempi.presaInVista : this.tempi.presaPesca;
    this.timer('pausa', ms, () => {
      this._pausa = null;
      if (fine) return this.chiudiMano(fine);
      this.invia();
      this.avviaTurno();
    });
  }

  chiudiMano(risultato) {
    const esito = this.gioco.applicaMano(this.partita, this.mano);
    this.fineMano = {
      numeroMano: this.numeroMano,
      risultato,
      esito: esito || null,
      classifica: this.classificaConNomi(),
      riepilogo: this.gioco.riepilogo ? this.gioco.riepilogo(this.mano, this.partita) : null,
    };
    this.diario.push({ t: now(), tipo: 'mano', numero: this.numeroMano, risultato });
    if (esito) {
      this.esitoPartita = esito;
      this.fase = 'fine-partita';
      this.evento({ t: 'evento', tipo: 'fine-partita', esito });
      this.invia();
      this.onAlbo?.(this.riassuntoPartita());
      return;
    }
    this.fase = 'fine-mano';
    this.evento({ t: 'evento', tipo: 'fine-mano', risultato });
    this.invia();
    this.timer('fine-mano', this.tempi.fineMano, () => this.iniziaMano());
  }

  /** Il padrone di casa salta l'attesa fra una mano e l'altra. */
  avanti(id) {
    if (!this.eHost(id)) return;
    if (this.fase === 'fine-mano') { this.annulla('fine-mano'); this.iniziaMano(); }
  }

  /** La classifica del gioco, con i nomi di chi siede in ogni lato. */
  classificaConNomi() {
    if (!this.partita) return null;
    return this.gioco.classifica(this.partita).map(r => {
      const nomi = r.posti.map(p => this.seduto(p)?.nome || '—');
      return { ...r, nomi, nome: nomi.join(' e '), bot: r.posti.every(p => !!this.seduto(p)?.bot) };
    });
  }

  riassuntoPartita() {
    return {
      gioco: this.gioco.id,
      posti: this.n,
      codice: this.codice,
      finitaIl: now(),
      mani: this.numeroMano,
      esito: this.esitoPartita,
      classifica: this.gioco.classifica(this.partita).map(r => ({
        ...r,
        giocatori: r.posti.map(p => ({ nome: this.seduto(p)?.nome, bot: !!this.seduto(p)?.bot })),
      })),
    };
  }

  /** Dopo la fine: chi vuole rigiocare lo dice; quando tutti gli umani seduti lo hanno detto si riparte. */
  chiediRivincita(id) {
    if (this.fase !== 'fine-partita') return;
    if (this.postoDi(id) < 0) return;
    this.rivincita.add(id);
    if (this.forseRivincita()) return;
    this.invia();
  }

  /** Si riparte quando tutti gli umani ancora seduti e presenti hanno detto sì. */
  forseRivincita() {
    if (this.fase !== 'fine-partita') return false;
    const umaniSeduti = this.posti.map(x => this.giocatori.get(x)).filter(g => g && !g.bot && g.presente);
    if (!umaniSeduti.length || !umaniSeduti.every(g => this.rivincita.has(g.id))) return false;
    this.iniziaPartita();
    return true;
  }

  /** Torna in attesa: si può cambiare posto, gioco, aggiungere gente. */
  tornaInAttesa(id) {
    if (!this.eHost(id) || this.fase !== 'fine-partita') return;
    this.annullaTutti();
    this.fase = 'attesa';
    this.partita = null; this.mano = null; this.fineMano = null; this.esitoPartita = null; this._pausa = null;
    this.rivincita.clear();
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

  /** `altro`: campi in piu' per il client, es. le `scelte` di presa. */
  errore(id, msg, altro = null) {
    const g = this.giocatori.get(id);
    if (g?.ws) this.mandaA(g, { t: 'errore', msg, ...(altro || {}) });
  }

  mandaA(g, msg) {
    if (!g.ws || g.ws.readyState !== 1) return;
    try { g.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch {}
  }

  evento(ev) {
    const s = JSON.stringify({ ...ev, at: now() });
    for (const g of this.lista()) this.mandaA(g, s);
  }

  /** Il gioco in breve, per la lobby e il tavolo: niente funzioni, solo dati. */
  descriviGioco() {
    const g = this.gioco;
    return { id: g.id, nome: g.nome, famiglia: g.famiglia, posti: this.n, ammessi: g.posti.slice(), squadre: g.squadre(this.n), opzioni: g.opzioni || {} };
  }

  /** Lo stato pubblico, uguale per tutti. */
  statoPubblico() {
    return {
      codice: this.codice,
      fase: this.fase,
      versione: ++this.versione,
      host: this.hostId,
      gioco: this.descriviGioco(),
      opzioni: this.opzioni,
      opzioniGioco: this.opzioniGioco,
      posti: this.posti.map(id => {
        const g = id ? this.giocatori.get(id) : null;
        return g ? { id: g.id, nome: g.nome, bot: g.bot, presente: g.presente, pronto: g.pronto, automatico: !!g.automatico } : null;
      }),
      spettatori: this.lista().filter(g => !g.bot && this.postoDi(g.id) < 0).map(g => ({ id: g.id, nome: g.nome, presente: g.presente })),
      partita: this.partita ? { numeroMano: this.numeroMano, finita: !!this.esitoPartita, esito: this.esitoPartita, classifica: this.classificaConNomi() } : null,
      fineMano: this.fineMano,
      classifica: this.fase === 'fine-partita' && this.partita ? this.classificaConNomi() : null,
      rivincita: [...this.rivincita],
      scadenzaTurno: this.scadenzaTurno,
      pausa: this._pausa ? { esito: this._pausa.esito } : null,
      chat: this.chat.slice(-20),
      ora: now(),
    };
  }

  statoPer(g) {
    const pub = this.statoPubblico();
    const posto = this.postoDi(g.id);
    let mano = null;
    if (this.mano) {
      mano = this._pausa
        ? vistaInPausa(this._pausa.prima, posto, this._pausa.esito)
        : this.gioco.vista(this.mano, posto, this.partita);
    }
    return { t: 'stato', ...pub, io: { id: g.id, posto, host: this.eHost(g.id), spettatore: posto < 0, nome: g.nome }, mano };
  }

  invia() {
    for (const g of this.lista()) if (g.ws) this.mandaA(g, this.statoPer(g));
  }
}
