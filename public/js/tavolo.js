// IL TAVOLO — disegna lo stato e muove le carte.
//
// Due responsabilità, tenute separate:
//   render(stato)  → riconcilia il DOM con la foto del server (idempotente:
//                    non tocca una carta che è già dove deve stare);
//   animazioni     → i voli delle carte (distribuzione, carta giocata, presa
//                    raccolta) sul livello #volo, con la Web Animations API.
//
// Le posizioni sono relative a ME: io sto in basso, chi gioca dopo di me (in
// senso antiorario) sta alla mia destra, poi in alto, poi a sinistra.

import { elementoCarta, etichetta, nomeSeme } from './carte.js';
import { escape } from './ui.js';

const LATI = ['basso', 'destra', 'alto', 'sinistra'];
const ridotto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Tavolo {
  constructor(radice, { onGioca, suoni }) {
    this.el = radice;
    this.onGioca = onGioca;
    this.suoni = suoni;
    this.posti = Object.fromEntries(LATI.map(l => [l, radice.querySelector(`.posto[data-lato="${l}"]`)]));
    this.slots = Object.fromEntries(LATI.map(l => [l, radice.querySelector(`.slot[data-lato="${l}"]`)]));
    this.miaMano = radice.querySelector('#mia-mano');
    this.volo = radice.querySelector('#volo');
    this.suggerimento = radice.querySelector('#suggerimento');
    this.centro = radice.querySelector('#centro');
    this.mioPosto = 0;
    this.scelta = null;
    this.ultimo = null;
    this._presaDaAnimare = null;
  }

  /** Il lato dello schermo in cui sta il posto `p`. */
  lato(p) { return LATI[((p - this.mioPosto) % 4 + 4) % 4]; }

  // ─────────────────────────────── render ───────────────────────────────

  render(s) {
    this.mioPosto = s.io.posto >= 0 ? s.io.posto : 0;
    this.el.classList.toggle('spettatore', s.io.posto < 0);
    for (let p = 0; p < 4; p++) this.renderTarga(p, s);
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
    const singhe = s.partita ? s.partita.singhe[p] : 0;
    const inTurno = s.fase === 'partita' && m && m.turno === p && !s.presaInVista;
    const punti = m && m.punti ? m.punti[p] : null;
    const nPrese = m ? m.nPrese[p] : 0;
    const io = p === s.io.posto;

    targa.classList.toggle('in-turno', inTurno);
    targa.classList.toggle('assente', !!g && !g.presente && !g.automatico);
    targa.classList.toggle('automatico', !!g && !!g.automatico);
    targa.classList.toggle('io', io);
    targa.classList.toggle('pericolo', singhe >= 4);

    // La targa si costruisce UNA volta e poi si aggiorna solo dove cambia.
    // Rifarla con innerHTML a ogni stato (e gli stati arrivano a ogni carta)
    // buttava via e ricreava quattro targhe per volta: niente transizioni, un
    // tremolio a ogni giocata, e la barra del tempo che ripartiva da capo.
    if (!targa.firstElementChild) {
      targa.innerHTML = `<span class="nome"></span>
        <span class="dati">
          <span class="dato prese" title="prese fatte in questa mano" hidden><b></b>prese</span>
          <span class="dato punti" title="punti presi in questa mano" hidden><b></b>punti</span>
          <span class="singhe"></span>
        </span>
        <span class="barra-tempo" aria-hidden="true" hidden><i></i></span>`;
    }
    const eNome = targa.querySelector('.nome');
    const nome = (g ? g.nome : 'vuoto') + (g?.bot ? '·bot' : '');
    if (eNome.dataset.v !== nome) {
      eNome.dataset.v = nome;
      eNome.innerHTML = `${escape(g ? g.nome : 'vuoto')}${g?.bot ? '<small>bot</small>' : ''}`;
    }
    const ePrese = targa.querySelector('.prese');
    ePrese.hidden = !m;
    if (m && ePrese.firstElementChild.textContent !== String(nPrese)) ePrese.firstElementChild.textContent = nPrese;
    const ePunti = targa.querySelector('.punti');
    ePunti.hidden = !(m && punti !== null);
    if (m && punti !== null && ePunti.firstElementChild.textContent !== String(punti)) ePunti.firstElementChild.textContent = punti;
    const eSinghe = targa.querySelector('.singhe');
    if (eSinghe.dataset.v !== String(singhe)) {
      eSinghe.dataset.v = String(singhe);
      eSinghe.textContent = tally(singhe);
      eSinghe.title = `${singhe} singhe`;
      eSinghe.setAttribute('aria-label', `${singhe} singhe`);
    }
    targa.querySelector('.barra-tempo').hidden = !(io && s.scadenzaTurno && inTurno);

    const manoAltrui = posto.querySelector('.mano-altrui');
    if (manoAltrui) {
      const n = m ? m.conteggi[p] : 0;
      while (manoAltrui.children.length > n) manoAltrui.lastChild.remove();
      while (manoAltrui.children.length < n) manoAltrui.appendChild(elementoCarta(null, false));
      const verticale = lato === 'sinistra' || lato === 'destra';
      [...manoAltrui.children].forEach((c, i) => {
        const k = i - (n - 1) / 2;
        c.style.transform = verticale
          ? `translate(-50%, ${k * 4}px) rotate(${lato === 'sinistra' ? 90 + k * 3 : -90 - k * 3}deg)`
          : `translate(calc(-50% + ${k * 5}px), ${Math.abs(k) * 1.2}px) rotate(${k * 3}deg)`;
        c.style.zIndex = i;
      });
    }
  }

  renderCentro(s) {
    const m = s.mano;
    const tavolo = m ? m.tavolo : [];
    const vincitore = m && m.tavolo.length === 4 && s.presaInVista ? m.ultimaPresa?.vincitore : null;
    if (tavolo.length === 0 && this._presaDaAnimare && LATI.some(l => this.slots[l].firstChild)) {
      this.animaPresa(this._presaDaAnimare);
      this._presaDaAnimare = null;
    }
    for (const l of LATI) {
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
    const valide = new Set(m ? m.valide : []);
    const mioTurno = s.fase === 'partita' && m && m.turno === s.io.posto && !s.presaInVista;
    this.miaMano.classList.toggle('attesa', !mioTurno);
    const presenti = new Map([...this.miaMano.children].map(c => [c.dataset.carta, c]));
    for (const [codice, el] of presenti) if (!mano.includes(codice)) el.remove();
    let prev = null;
    const n = mano.length;
    // quanto si sovrappongono: abbastanza da stare nella larghezza del tavolo
    const w = this.larghezzaCarta();
    const disponibile = this.miaMano.clientWidth - 64;   // le carte esterne ruotano verso fuori: serve aria ai lati
    const sovrapp = n > 1 ? Math.max(0.42, 1 - (disponibile - w) / ((n - 1) * w)) : 0;
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

  renderSuggerimento(s) {
    const m = s.mano;
    let testo = '';
    if (s.fase === 'partita' && m) {
      const mioTurno = m.turno === s.io.posto && !s.presaInVista;
      if (s.presaInVista && m.ultimaPresa) {
        const chi = s.posti[m.ultimaPresa.vincitore];
        testo = `<b>${escape(chi?.nome || '')}</b> prende · ${m.ultimaPresa.punti} punt${m.ultimaPresa.punti === 1 ? 'o' : 'i'}`;
      } else if (mioTurno) {
        testo = m.semeApertura ? `Tocca a te · rispondi a <b>${nomeSeme(m.semeApertura)}</b>` : 'Tocca a te · apri tu';
      } else if (m.turno >= 0) {
        testo = `gioca <b>${escape(s.posti[m.turno]?.nome || '')}</b>`;
      }
    }
    this.suggerimento.innerHTML = testo;
    this.suggerimento.classList.toggle('mio', !!(s.fase === 'partita' && m && m.turno === s.io.posto && !s.presaInVista));
  }

  // ─────────────────────────────── interazione ───────────────────────────────

  tocca(codice) {
    const s = this.ultimo; if (!s || !s.mano) return;
    const mioTurno = s.fase === 'partita' && s.mano.turno === s.io.posto && !s.presaInVista;
    if (!mioTurno) return;
    const el = this.miaMano.querySelector(`[data-carta="${codice}"]`);
    if (!s.mano.valide.includes(codice)) {
      el?.classList.remove('trema'); void el?.offsetWidth; el?.classList.add('trema');
      this.suoni?.no();
      return;
    }
    if (this.scelta === codice) { this.scelta = null; this.onGioca(codice); return; }
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

  // ─────────────────────────────── animazioni ───────────────────────────────

  rettangolo(el) {
    const r = el.getBoundingClientRect(), t = this.el.getBoundingClientRect();
    return { x: r.left - t.left, y: r.top - t.top, w: r.width, h: r.height };
  }
  centroDi(el) { const r = this.rettangolo(el); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
  larghezzaCarta() { return parseFloat(getComputedStyle(this.el).getPropertyValue('--carta-w')) || 60; }

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

  /** La distribuzione: dal centro a ogni posto, dieci carte coperte, a raffica. */
  async animaDistribuzione() {
    if (ridotto()) return;
    this.suoni?.distribuisci();
    const da = this.centroDi(this.centro);
    const promesse = [];
    for (let i = 0; i < 10; i++) {
      for (let p = 0; p < 4; p++) {
        const lato = this.lato(p);
        const bersaglio = lato === 'basso' ? this.miaMano : this.posti[lato].querySelector('.mano-altrui') || this.posti[lato];
        promesse.push(this.vola(null, false, da, this.centroDi(bersaglio), { durata: 260, ritardo: (i * 4 + p) * 28, rotazione: -20 + Math.random() * 40, scala: 0.9 }));
      }
    }
    this.miaMano.style.opacity = '0';
    await Promise.all(promesse);
    this.miaMano.style.transition = 'opacity 300ms';
    this.miaMano.style.opacity = '1';
    this.suoni?.gira();
    setTimeout(() => { this.miaMano.style.transition = ''; }, 400);
  }

  /** Una carta giocata vola dalla mano di chi l'ha giocata allo slot. */
  animaCartaGiocata(ev) {
    const lato = this.lato(ev.posto);
    const slot = this.slots[lato];
    if (slot.firstElementChild?.dataset.carta === ev.carta) return;
    const origine = lato === 'basso'
      ? this.miaMano.querySelector(`[data-carta="${ev.carta}"]`) || this.miaMano
      : this.posti[lato].querySelector('.mano-altrui') || this.posti[lato];
    const da = this.centroDi(origine);
    const a = this.centroDi(slot);
    this.suoni?.scivola();
    if (lato === 'basso') this.miaMano.querySelector(`[data-carta="${ev.carta}"]`)?.remove();
    const el = elementoCarta(ev.carta, true);
    el.classList.add('in-volo');
    slot.appendChild(el);
    if (ridotto()) { el.classList.remove('in-volo'); return; }
    const giro = lato === 'sinistra' ? -60 : lato === 'destra' ? 60 : lato === 'alto' ? 180 : 0;
    const anim = el.animate([
      { transform: `translate(${da.x - a.x}px, ${da.y - a.y}px) rotate(${giro}deg) scale(0.94)`, opacity: 0.55, offset: 0 },
      { transform: `translate(${(da.x - a.x) * 0.08}px, ${(da.y - a.y) * 0.08}px) rotate(${giro * 0.06}deg) scale(1.05)`, opacity: 1, offset: 0.72 },
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 1 },
    ], { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    const rete = setTimeout(() => el.classList.remove('in-volo'), 1100);
    anim.finished.finally(() => { clearTimeout(rete); el.classList.remove('in-volo'); });
  }

  ricordaPresa(ev) { this._presaDaAnimare = ev; }

  /** Le quattro carte volano verso chi ha preso e spariscono. */
  animaPresa(ev) {
    const lato = this.lato(ev.vincitore);
    const a = this.centroDi(this.posti[lato]);
    this.suoni?.raccogli();
    const ordine = [this.lato(ev.vincitore), ...LATI.filter(l => l !== this.lato(ev.vincitore))];
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

/** Le singhe come tacche: quattro tratti e il quinto di traverso. */
function tally(n) {
  let s = '';
  for (let i = 1; i <= n; i++) s += `<i class="${i % 5 === 0 ? 'quinta' : ''}"></i>`;
  return s;
}
