// IL TAVOLO — disegna lo stato e muove le carte. Questo e' il tavolo «a
// prese» (Cuticchiune, Briscola): una carta a testa nel mezzo, qualcuno
// prende. Il tavolo «a pesca» della Scopa (tavolo-pesca.js) e' figlio di
// questo: targhe, mano, mazzo e voli sono gli stessi.
//
// Due responsabilità, tenute separate:
//   render(stato)  → riconcilia il DOM con la foto del server (idempotente:
//                    non tocca una carta che è già dove deve stare);
//   animazioni     → i voli delle carte (distribuzione, carta giocata, presa
//                    raccolta, pescata) sul livello #volo, con la Web Animations API.
//
// Le posizioni sono relative a ME: io sto in basso, chi gioca dopo di me (in
// senso antiorario) sta alla mia destra, poi in alto, poi a sinistra. In due
// ci si siede uno di fronte all'altro: io in basso, l'altro in alto.

import { elementoCarta, etichetta, nomeSeme } from './carte.js';
import { escape } from './ui.js';
import { scheda, latoDi } from './giochi.js';

const LATI = { 4: ['basso', 'destra', 'alto', 'sinistra'], 2: ['basso', 'alto'] };
const TUTTI_I_LATI = LATI[4];
/** Quanto dura il volo della carta giocata, in ms: la stanza tiene la presa in
 *  vista per RITMO.presaInVista, e la carta deve restare ferma il resto
 *  (tools/test-locale.mjs controlla che restino almeno due secondi). */
export const VOLO_CARTA = 620;
const ridotto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Tavolo {
  constructor(radice, { onGioca, suoni }) {
    this.el = radice;
    this.onGioca = onGioca;
    this.suoni = suoni;
    this.posti = Object.fromEntries(TUTTI_I_LATI.map(l => [l, radice.querySelector(`.posto[data-lato="${l}"]`)]));
    this.slots = Object.fromEntries(TUTTI_I_LATI.map(l => [l, radice.querySelector(`.slot[data-lato="${l}"]`)]));
    this.miaMano = radice.querySelector('#mia-mano');
    this.volo = radice.querySelector('#volo');
    this.suggerimento = radice.querySelector('#suggerimento');
    this.centro = radice.querySelector('#centro');
    this.mazzo = radice.querySelector('#mazzo');
    this.mioPosto = 0;
    this.n = 4;
    this.scelta = null;
    this.ultimo = null;
    this._presaDaAnimare = null;
    this._distribuendo = false;
  }

  /** Il lato dello schermo in cui sta il posto `p`. */
  lato(p) { const lati = LATI[this.n] || LATI[4]; return lati[((p - this.mioPosto) % this.n + this.n) % this.n]; }
  latiInUso() { return LATI[this.n] || LATI[4]; }

  /** Chi deve giocare, se si sta giocando e la presa non e' in vista; se no -1. */
  turnoDi(s) { return s.fase === 'partita' && s.mano && !s.pausa ? s.mano.turno : -1; }
  /** Tocca a me: ho almeno una mossa valida. */
  mioTurno(s) { return s.fase === 'partita' && !s.pausa && !!s.mano?.valide?.length; }

  // ─────────────────────────────── render ───────────────────────────────

  render(s) {
    this.mioPosto = s.io.posto >= 0 ? s.io.posto : 0;
    this.n = s.posti.length;
    this.el.classList.toggle('spettatore', s.io.posto < 0);
    this.el.classList.toggle('a-due', this.n === 2);
    for (const l of TUTTI_I_LATI) this.posti[l].hidden = !this.latiInUso().includes(l);
    this.animaPescata(s);
    for (let p = 0; p < this.n; p++) this.renderTarga(p, s);
    this.renderMazzo(s);
    this.renderCentro(s);
    this.renderMiaMano(s);
    this.renderSuggerimento(s);
    this.ultimo = s;
  }

  renderTarga(p, s) {
    const lato = this.lato(p);
    const posto = this.posti[lato];
    const targa = posto.querySelector('.targa');
    const g = s.posti[p];
    const m = s.mano;
    const io = p === s.io.posto;
    const inTurno = this.turnoDi(s) === p;
    const info = m ? scheda(s.gioco.id).targa(s, p) : { dati: [], tacche: null };
    const compagno = !!s.gioco.squadre && !io && s.io.posto >= 0 && latoDi(s, p) === latoDi(s, s.io.posto);

    targa.classList.toggle('in-turno', inTurno);
    targa.classList.toggle('assente', !!g && !g.presente && !g.automatico);
    targa.classList.toggle('automatico', !!g && !!g.automatico);
    targa.classList.toggle('io', io);
    targa.classList.toggle('compagno', compagno);
    targa.classList.toggle('pericolo', (info.tacche || 0) >= 4);

    // La targa si costruisce UNA volta e poi si aggiorna solo dove cambia.
    // Rifarla con innerHTML a ogni stato (e gli stati arrivano a ogni carta)
    // buttava via e ricreava le targhe ogni volta: niente transizioni, un
    // tremolio a ogni giocata, e la barra del tempo che ripartiva da capo.
    if (!targa.firstElementChild) {
      targa.innerHTML = `<span class="nome"></span>
        <span class="dati"></span>
        <span class="singhe"></span>
        <span class="barra-tempo" aria-hidden="true" hidden><i></i></span>`;
    }
    const eNome = targa.querySelector('.nome');
    // il compagno conta piu' dell'essere un bot: a coppie e' la prima cosa da sapere
    const extra = compagno ? 'compagno' : (g?.bot ? 'bot' : '');
    const nome = (g ? g.nome : 'vuoto') + '·' + extra;
    if (eNome.dataset.v !== nome) {
      eNome.dataset.v = nome;
      eNome.innerHTML = `${escape(g ? g.nome : 'vuoto')}${extra ? `<small>${extra}</small>` : ''}`;
    }
    const eDati = targa.querySelector('.dati');
    const firma = info.dati.map(d => `${d.etichetta}:${d.v}`).join('|');
    if (eDati.dataset.v !== firma) {
      eDati.dataset.v = firma;
      eDati.innerHTML = info.dati.map(d => `<span class="dato" title="${escape(d.titolo || '')}"><b>${escape(String(d.v))}</b>${escape(d.etichetta)}</span>`).join('');
    }
    const eSinghe = targa.querySelector('.singhe');
    const tacche = info.tacche ?? 0;
    eSinghe.hidden = info.tacche == null;
    if (eSinghe.dataset.v !== String(tacche)) {
      eSinghe.dataset.v = String(tacche);
      eSinghe.replaceChildren(...tally(tacche));
      eSinghe.title = `${tacche} singhe`;
      eSinghe.setAttribute('aria-label', `${tacche} singhe`);
    }
    targa.querySelector('.barra-tempo').hidden = !(io && s.scadenzaTurno && inTurno);

    const manoAltrui = posto.querySelector('.mano-altrui');
    if (manoAltrui) {
      const n = m ? m.conteggi[p] : 0;
      while (manoAltrui.children.length > n) manoAltrui.lastChild.remove();
      while (manoAltrui.children.length < n) manoAltrui.appendChild(elementoCarta(null, false));
      const verticale = lato === 'sinistra' || lato === 'destra';
      const passo = n > 6 ? 1 : 1.6;   // tre carte stanno larghe, dieci si stringono
      [...manoAltrui.children].forEach((c, i) => {
        const k = (i - (n - 1) / 2) * passo;
        c.style.transform = verticale
          ? `translate(-50%, ${k * 4}px) rotate(${lato === 'sinistra' ? 90 + k * 3 : -90 - k * 3}deg)`
          : `translate(calc(-50% + ${k * 5}px), ${Math.abs(k) * 1.2}px) rotate(${k * 3}deg)`;
        c.style.zIndex = i;
      });
    }
  }

  /**
   * Il mazzo, se il gioco ne ha uno: le carte coperte con il conto e, alla
   * Briscola, la briscola scoperta di traverso sotto. Finito il mazzo resta
   * il seme di briscola scritto: chi l'ha pescata ce l'ha in mano, ma il
   * seme comanda fino all'ultima carta.
   */
  renderMazzo(s) {
    const m = s.mano;
    const el = this.mazzo;
    if (!el) return;
    const conto = m && typeof m.mazzo === 'number' ? m.mazzo : null;
    el.hidden = !m || (conto === null) || (!conto && !m.briscola);
    if (el.hidden) return;
    if (!el.firstElementChild) {
      el.innerHTML = `<div class="sotto"></div><div class="pila"></div><span class="conto"></span><span class="seme-briscola"></span>`;
    }
    const sotto = el.querySelector('.sotto');
    const br = m.briscola && conto > 0 ? m.briscola : null;
    if (sotto.dataset.v !== String(br)) {
      sotto.dataset.v = String(br);
      sotto.replaceChildren(...(br ? [elementoCarta(br, true)] : []));
      if (br) sotto.firstElementChild.setAttribute('aria-label', `briscola: ${etichetta(br)}`);
    }
    const pila = el.querySelector('.pila');
    const quante = Math.min(4, Math.ceil((conto - (br ? 1 : 0)) / 6));
    while (pila.children.length > quante) pila.lastChild.remove();
    while (pila.children.length < quante) pila.appendChild(elementoCarta(null, false));
    [...pila.children].forEach((c, i) => { c.style.transform = `translate(${i * -1.5}px, ${i * -1.5}px)`; });
    const eConto = el.querySelector('.conto');
    eConto.hidden = !conto;
    eConto.textContent = String(conto);
    eConto.title = `${conto} carte nel mazzo`;
    const seme = el.querySelector('.seme-briscola');
    seme.hidden = !m.briscola;
    seme.textContent = m.briscola ? `briscola a ${nomeSeme(m.semeBriscola || m.briscola[0])}` : '';
    el.classList.toggle('finito', !conto);
  }

  /** Le carte in mezzo. In pausa: quelle di prima, piu' l'ultima calata (pausa.esito). */
  renderCentro(s) {
    const m = s.mano;
    let tavolo = m ? m.tavolo : [];
    const presa = s.pausa?.esito?.presa;
    if (s.pausa && m) tavolo = [...tavolo, { posto: s.pausa.esito.posto, carta: s.pausa.esito.carta }];
    const vincitore = presa && !Array.isArray(presa) ? presa.vincitore : null;
    if (tavolo.length === 0 && this._presaDaAnimare && TUTTI_I_LATI.some(l => this.slots[l].firstChild)) {
      this.animaPresa(this._presaDaAnimare);
      this._presaDaAnimare = null;
    }
    for (const l of TUTTI_I_LATI) {
      const slot = this.slots[l];
      const voce = tavolo.find(t => this.lato(t.posto) === l);
      const attuale = slot.firstElementChild;
      if (!voce) { if (attuale && !attuale.classList.contains('in-volo')) attuale.remove(); continue; }
      if (attuale && attuale.dataset.carta === voce.carta) {
        attuale.classList.toggle('vincente', vincitore === voce.posto);
        continue;
      }
      if (attuale) attuale.remove();
      const el = elementoCarta(voce.carta, true);
      el.classList.toggle('vincente', vincitore === voce.posto);
      slot.appendChild(el);
    }
  }

  renderMiaMano(s) {
    const m = s.mano;
    const mano = m ? m.mano : [];
    const valide = new Set(m ? m.valide.map(v => v.carta) : []);
    const mioTurno = this.mioTurno(s);
    this.miaMano.classList.toggle('attesa', !mioTurno);
    const presenti = new Map([...this.miaMano.children].map(c => [c.dataset.carta, c]));
    for (const [codice, el] of presenti) if (!mano.includes(codice)) el.remove();
    let prev = null;
    const n = mano.length;
    // quanto si sovrappongono: abbastanza da stare nella larghezza del tavolo
    const w = this.larghezzaCarta();
    const disponibile = this.miaMano.clientWidth - 64;   // le carte esterne ruotano verso fuori: serve aria ai lati
    const sovrapp = n > 1 ? Math.max(n <= 3 ? -0.08 : 0.42, 1 - (disponibile - w) / ((n - 1) * w)) : 0;
    this.miaMano.style.setProperty('--sovrapp', String(-Math.min(0.72, sovrapp)));
    mano.forEach((codice, i) => {
      let el = presenti.get(codice);
      if (!el) {
        el = elementoCarta(codice, true);
        el.addEventListener('click', () => this.tocca(codice));
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', etichetta(codice));
        el.tabIndex = 0;
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.tocca(codice); } });
      }
      if (prev ? prev.nextElementSibling !== el : this.miaMano.firstElementChild !== el) {
        this.miaMano.insertBefore(el, prev ? prev.nextElementSibling : this.miaMano.firstElementChild);
      }
      // il ventaglio: ogni carta ruota un po' e le esterne scendono
      const k = i - (n - 1) / 2;
      el.style.setProperty('--rot', `${(k * Math.min(4, 36 / Math.max(1, n))).toFixed(2)}deg`);
      el.style.setProperty('--giu', `${(k * k * 0.45).toFixed(1)}px`);
      el.classList.toggle('non-valida', mioTurno && !valide.has(codice));
      el.classList.toggle('scelta', this.scelta === codice && mioTurno);
      el.style.zIndex = this.scelta === codice && mioTurno ? '2' : '';
      el.setAttribute('aria-disabled', mioTurno && !valide.has(codice) ? 'true' : 'false');
      prev = el;
    });
    if (!mioTurno) this.scelta = null;
    this.apriVentaglio();
  }

  /** Il testo sotto le carte: di chi e' il turno, cosa si deve fare, chi prende. */
  testoSuggerimento(s) {
    const m = s.mano;
    if (s.fase !== 'partita' || !m) return '';
    const presa = s.pausa?.esito?.presa;
    if (presa && !Array.isArray(presa)) {
      const chi = s.posti[presa.vincitore];
      return `<b>${escape(chi?.nome || '')}</b> prende · ${presa.punti} punt${presa.punti === 1 ? 'o' : 'i'}`;
    }
    if (this.mioTurno(s)) {
      // l'obbligo di seme si vede da solo: le carte valide non sono tutta la mano
      const obbligo = m.semeApertura && m.valide.length < m.mano.length;
      if (!m.tavolo.length) return 'Tocca a te · apri tu';
      return obbligo ? `Tocca a te · rispondi a <b>${nomeSeme(m.semeApertura)}</b>` : 'Tocca a te';
    }
    if (m.turno >= 0 && !s.pausa) return `gioca <b>${escape(s.posti[m.turno]?.nome || '')}</b>`;
    return '';
  }

  renderSuggerimento(s) {
    this.suggerimento.innerHTML = this.testoSuggerimento(s);
    this.suggerimento.classList.toggle('mio', this.mioTurno(s));
  }

  // ─────────────────────────────── interazione ───────────────────────────────

  tocca(codice) {
    const s = this.ultimo; if (!s || !s.mano) return;
    if (!this.mioTurno(s)) return;
    const el = this.miaMano.querySelector(`[data-carta="${codice}"]`);
    if (!s.mano.valide.some(v => v.carta === codice)) {
      el?.classList.remove('trema'); void el?.offsetWidth; el?.classList.add('trema');
      this.suoni?.no();
      return;
    }
    if (this.scelta === codice) { this.scelta = null; this.onGioca({ carta: codice }); return; }
    this.scelta = codice;
    this.apriVentaglio();
  }

  /**
   * Il ventaglio si apre sulla carta scelta: quella si alza, le altre si
   * scostano di lato. Nel ventaglio chiuso di un re si vede solo una striscia,
   * e non si capisce se e' di spade o di mazze: cosi' invece si vede tutta.
   */
  apriVentaglio() {
    const carte = [...this.miaMano.children];
    const scelto = carte.findIndex(c => c.dataset.carta === this.scelta);
    carte.forEach((c, i) => {
      c.classList.toggle('scelta', i === scelto);
      c.classList.toggle('scostata-sx', scelto >= 0 && i < scelto);
      c.classList.toggle('scostata-dx', scelto >= 0 && i > scelto);
    });
  }

  /** Si cambia gioco fra una partita e l'altra: la mano disegnata da un tavolo non serve all'altro. */
  sgombra() {
    this.miaMano.replaceChildren();
    this.volo.replaceChildren();
    for (const l of TUTTI_I_LATI) this.slots[l]?.replaceChildren();
    this.scelta = null; this.ultimo = null; this._presaDaAnimare = null;
  }

  // ─────────────────────────────── animazioni ───────────────────────────────

  rettangolo(el) {
    const r = el.getBoundingClientRect(), t = this.el.getBoundingClientRect();
    return { x: r.left - t.left, y: r.top - t.top, w: r.width, h: r.height };
  }
  centroDi(el) { const r = this.rettangolo(el); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
  larghezzaCarta() { return parseFloat(getComputedStyle(this.el).getPropertyValue('--carta-w')) || 60; }

  /** Dove sta la mano di chi siede al posto `p`: la mia, o il mazzetto coperto. */
  manoDi(p) {
    const lato = this.lato(p);
    return lato === 'basso' ? this.miaMano : (this.posti[lato].querySelector('.mano-altrui') || this.posti[lato]);
  }

  /** Una carta vola da `da` a `a` (centri, in coordinate del tavolo) e sparisce. */
  vola(codice, faccia, da, a, { durata = 380, ritardo = 0, rotazione = 0, scala = 1, scalaFine = 1, svanisce = false } = {}) {
    const el = elementoCarta(codice, faccia);
    el.classList.add('in-volo');
    const w = this.larghezzaCarta(), h = w * 1.6;
    el.style.left = `${da.x - w / 2}px`; el.style.top = `${da.y - h / 2}px`;
    this.volo.appendChild(el);
    if (ridotto()) { el.remove(); return Promise.resolve(); }
    const anim = el.animate([
      { transform: `translate(0,0) rotate(${rotazione}deg) scale(${scala})`, opacity: 1 },
      { transform: `translate(${a.x - da.x}px, ${a.y - da.y}px) rotate(0deg) scale(${scalaFine})`, opacity: svanisce ? 0.15 : 1 },
    ], { duration: durata, delay: ritardo, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    // se la scheda va in secondo piano le animazioni si fermano: la carta va via comunque
    const rete = setTimeout(() => el.remove(), durata + ritardo + 400);
    return anim.finished.then(() => { clearTimeout(rete); el.remove(); }).catch(() => el.remove());
  }

  /** La distribuzione: dal centro a ogni posto, tante carte coperte quante ne ha ognuno, a raffica. */
  async animaDistribuzione() {
    const s = this.ultimo;
    if (ridotto() || !s?.mano) return;
    this.suoni?.distribuisci();
    const da = this.centroDi(this.mazzo && !this.mazzo.hidden ? this.mazzo : this.centro);
    const promesse = [];
    const quante = Math.max(...s.mano.conteggi);
    this._distribuendo = true;
    for (let i = 0; i < quante; i++) {
      for (let p = 0; p < this.n; p++) {
        if (i >= s.mano.conteggi[p]) continue;
        promesse.push(this.vola(null, false, da, this.centroDi(this.manoDi(p)), { durata: 260, ritardo: (i * this.n + p) * 28, rotazione: -20 + Math.random() * 40, scala: 0.9 }));
      }
    }
    this.miaMano.style.opacity = '0';
    await Promise.all(promesse);
    this._distribuendo = false;
    this.miaMano.style.transition = 'opacity 300ms';
    this.miaMano.style.opacity = '1';
    this.suoni?.gira();
    setTimeout(() => { this.miaMano.style.transition = ''; }, 400);
  }

  /**
   * Si pesca dal mazzo (Briscola dopo ogni presa, Scopa quando finisce il
   * giro): fra uno stato e l'altro della stessa mano qualcuno ha piu' carte
   * di prima. Una carta coperta vola dal mazzo a ognuno, nell'ordine in cui
   * si pesca: da chi tocca adesso, in giro.
   */
  animaPescata(s) {
    const prima = this.ultimo;
    if (ridotto() || this._distribuendo || !prima?.mano || !s.mano || !this.mazzo) return;
    if (s.fase !== 'partita' || prima.partita?.numeroMano !== s.partita?.numeroMano) return;
    const da = this.mazzo.hidden ? null : this.centroDi(this.mazzo);
    if (!da) return;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const p = ((s.mano.turno >= 0 ? s.mano.turno : 0) + i) % this.n;
      const piu = (s.mano.conteggi[p] || 0) - (prima.mano.conteggi[p] || 0);
      for (let j = 0; j < piu; j++) {
        this.vola(null, false, da, this.centroDi(this.manoDi(p)), { durata: 320, ritardo: (k++) * 90, scala: 0.9 });
      }
    }
    if (k) this.suoni?.distribuisci();
  }

  /** Una carta giocata vola dalla mano di chi l'ha giocata allo slot. */
  animaCartaGiocata(ev) {
    const lato = this.lato(ev.posto);
    const slot = this.slots[lato];
    if (!slot || slot.firstElementChild?.dataset.carta === ev.carta) return;
    const origine = lato === 'basso'
      ? this.miaMano.querySelector(`[data-carta="${ev.carta}"]`) || this.miaMano
      : this.manoDi(ev.posto);
    const da = this.centroDi(origine);
    const a = this.centroDi(slot);
    this.suoni?.scivola();
    if (lato === 'basso') this.miaMano.querySelector(`[data-carta="${ev.carta}"]`)?.remove();
    slot.replaceChildren();
    const el = elementoCarta(ev.carta, true);
    el.classList.add('in-volo');
    slot.appendChild(el);
    if (ridotto()) { el.classList.remove('in-volo'); return; }
    const giro = lato === 'sinistra' ? -60 : lato === 'destra' ? 60 : lato === 'alto' ? 180 : 0;
    const anim = el.animate([
      { transform: `translate(${da.x - a.x}px, ${da.y - a.y}px) rotate(${giro}deg) scale(0.94)`, opacity: 0.55, offset: 0 },
      { transform: `translate(${(da.x - a.x) * 0.08}px, ${(da.y - a.y) * 0.08}px) rotate(${giro * 0.06}deg) scale(1.05)`, opacity: 1, offset: 0.72 },
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 1 },
    ], { duration: VOLO_CARTA, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    const rete = setTimeout(() => el.classList.remove('in-volo'), VOLO_CARTA + 480);
    anim.finished.finally(() => { clearTimeout(rete); el.classList.remove('in-volo'); });
  }

  /** L'evento di una carta giocata: il volo, e la presa da raccogliere quando la pausa finisce. */
  evento(ev) {
    if (ev.tipo !== 'carta') return;
    this.animaCartaGiocata(ev);
    if (ev.presa && !Array.isArray(ev.presa)) this._presaDaAnimare = ev.presa;
  }

  /** Le carte della presa volano verso chi ha preso e spariscono. */
  animaPresa(presa) {
    const lato = this.lato(presa.vincitore);
    const a = this.centroDi(this.posti[lato]);
    this.suoni?.raccogli();
    const ordine = [lato, ...TUTTI_I_LATI.filter(l => l !== lato)];
    ordine.forEach((l, i) => {
      const el = this.slots[l].firstElementChild;
      if (!el) return;
      const da = this.centroDi(el);
      el.remove();
      this.vola(el.dataset.carta, true, da, a, { durata: 460, ritardo: i * 45, scalaFine: 0.72, svanisce: true });
    });
  }

  /** Un fumetto vicino alla targa. */
  fumetto(posto, testo) {
    const lato = posto >= 0 ? this.lato(posto) : 'alto';
    const el = document.createElement('div');
    el.className = 'fumetto';
    el.textContent = testo;
    this.posti[lato].appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }

  /** La barra del tempo sotto la mia targa. */
  aggiornaTempo(frazione) {
    const b = this.posti.basso.querySelector('.barra-tempo i');
    if (!b) return;
    b.style.transform = `scaleX(${Math.max(0, Math.min(1, frazione))})`;
    this.posti.basso.querySelector('.targa').classList.toggle('tempo-poco', frazione < 0.25);
  }
}

/** Le singhe come tacche: quattro tratti e il quinto di traverso.
 *  Nodi, non stringa: la targa si riempie con textContent/replaceChildren e
 *  una stringa di <i> ci finirebbe dentro come testo, marcata a vista. */
function tally(n) {
  const tacche = [];
  for (let i = 1; i <= n; i++) {
    const t = document.createElement('i');
    if (i % 5 === 0) t.className = 'quinta';
    tacche.push(t);
  }
  return tacche;
}
