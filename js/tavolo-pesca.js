// IL TAVOLO A PESCA — Scopa e Scopone. Le carte scoperte stanno in mezzo,
// la mano in basso, il mazzo di lato; ogni lato ha il suo mucchio di prese
// accanto alla targa, con le scope girate di traverso sopra, come si fa al
// tavolo vero.
//
// E' figlio del tavolo a prese (tavolo.js): targhe, ventaglio, mazzo,
// distribuzione e pescata sono quelli. Cambiano il centro, il tocco (una
// carta puo' prendere in piu' modi: allora si sceglie da un foglietto) e i
// voli (la carta va sopra quelle che prende, poi tutte al mucchio).
//
// La stanza, quando una carta prende, tiene la presa in vista: per la pausa
// manda il tavolo di PRIMA, e in `pausa.esito` la carta e le carte prese.
// Finita la pausa arriva il tavolo vero, e quello che manca vola al mucchio.

import { Tavolo } from './tavolo.js';
import { elementoCarta, etichetta } from './carte.js';
import { escape } from './ui.js';
import { latoDi, postoMucchio, conArticolo } from './giochi.js';
import { valoreDi } from '../src/mazzo.js';

const ridotto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class TavoloPesca extends Tavolo {
  constructor(radice, opzioni) {
    super(radice, opzioni);
    this.tavola = radice.querySelector('#tavola');
    this.carteTavola = this.tavola.querySelector('.tavola-carte');
    this.sopra = this.tavola.querySelector('.tavola-sopra');
    this.suggerimento = this.tavola.querySelector('.suggerimento');
    this.foglio = radice.querySelector('#foglio-prese');
    this.scopeCarte = {};        // lato → carte che hanno fatto scopa in questa mano
    this.numeroMano = null;
    this.foglio.querySelector('[data-annulla]').addEventListener('click', () => { this.chiudiFoglio(); this.scelta = null; this.apriVentaglio(); this.evidenzia(); });
  }

  // ─────────────────────────────── render ───────────────────────────────

  render(s) {
    if (s.partita?.numeroMano !== this.numeroMano) { this.numeroMano = s.partita?.numeroMano; this.scopeCarte = {}; }
    super.render(s);
    this.renderMucchi(s);
    if (!this.mioTurno(s)) this.chiudiFoglio();
  }

  /** Il mucchio di un lato, accanto alla targa di chi lo tiene (giochi.js, postoMucchio). */
  mucchioDi(lato) {
    const s = this.ultimo;
    return s ? this.posti[this.lato(postoMucchio(s, lato))]?.querySelector('.mucchio') : null;
  }

  /** I mucchi: quante carte ha preso ogni lato, e le scope di traverso. Le carte prese non si mostrano. */
  renderMucchi(s) {
    const m = s.mano;
    const usati = new Set();
    const lati = s.gioco.squadre || Array.from({ length: this.n }, (_, i) => [i]);
    lati.forEach((_, lato) => {
      const el = this.posti[this.lato(postoMucchio(s, lato))]?.querySelector('.mucchio');
      if (!el) return;
      usati.add(el);
      const carte = m?.prese?.[lato]?.length || 0;
      const scope = m?.scope?.[lato] || 0;
      const note = this.scopeCarte[lato] || [];
      const firma = `${carte}|${scope}|${note.join(',')}`;
      el.hidden = !m;
      if (el.dataset.v === firma) return;
      el.dataset.v = firma;
      el.replaceChildren();
      if (carte) el.appendChild(elementoCarta(null, false));
      for (let i = 0; i < scope; i++) {
        const c = elementoCarta(note[i] || null, !!note[i]);
        c.classList.add('di-traverso');
        c.style.setProperty('--i', String(i));
        el.appendChild(c);
      }
      const conto = document.createElement('span');
      conto.className = 'conto';
      conto.textContent = String(carte);
      el.appendChild(conto);
      el.title = `${carte} carte prese${scope ? `, ${scope} scop${scope === 1 ? 'a' : 'e'}` : ''}`;
      el.classList.toggle('vuoto', !carte);
    });
    for (const el of this.el.querySelectorAll('.mucchio')) if (!usati.has(el)) el.hidden = true;
  }

  /** Le carte in mezzo, nell'ordine in cui ci sono arrivate. */
  renderCentro(s) {
    const m = s.mano;
    const tavolo = m ? m.tavolo : [];
    const pausa = s.pausa?.esito || null;
    const prima = this.ultimo?.pausa?.esito || null;

    // quello che non c'e' piu': se era la presa in vista, vola al mucchio di chi ha preso
    const presenti = new Map([...this.carteTavola.children].map(c => [c.dataset.carta, c]));
    const via = [...presenti.entries()].filter(([c]) => !tavolo.includes(c) && !(pausa && pausa.presa.length === 0 && c === pausa.carta)).map(([, el]) => el);
    const calata = this.sopra.firstElementChild;
    if (!pausa) {
      const chi = prima && prima.presa.length ? prima.posto : null;
      if (calata && !calata.classList.contains('andata')) via.push(calata);
      if (chi !== null && s.fase === 'partita') this.alMucchio(via.filter(el => !el.classList.contains('andata')), latoDi(s, chi));
      for (const el of via) el.remove();
      this.sopra.replaceChildren();
    } else {
      for (const el of via) el.remove();
    }

    // le carte che ci sono, in ordine
    let prev = null;
    for (const c of tavolo) {
      let el = presenti.get(c);
      if (!el || !el.isConnected) { el = elementoCarta(c, true); el.classList.add('appena'); }
      if (prev ? prev.nextElementSibling !== el : this.carteTavola.firstElementChild !== el) {
        this.carteTavola.insertBefore(el, prev ? prev.nextElementSibling : this.carteTavola.firstElementChild);
      }
      prev = el;
    }

    // in pausa: la carta calata sopra la prima che prende (o in fila, se non prende niente)
    if (pausa) {
      if (pausa.presa.length) {
        if (!this.sopra.firstElementChild || this.sopra.firstElementChild.dataset.carta !== pausa.carta) {
          this.sopra.replaceChildren(this.cartaSopra(pausa.carta, pausa.presa[0]));
        }
      } else if (!this.carteTavola.querySelector(`[data-carta="${pausa.carta}"]`)) {
        this.carteTavola.appendChild(elementoCarta(pausa.carta, true));
      }
    }
    for (const el of this.carteTavola.children) el.classList.toggle('presa', !!pausa && pausa.presa.includes(el.dataset.carta));
    this.tavola.classList.toggle('vuota', tavolo.length === 0 && !pausa);
    this.evidenzia();
  }

  /** Un elemento carta messo sopra la carta `sopraA` del tavolo, un po' spostato: ci e' appena caduto. */
  cartaSopra(carta, sopraA) {
    const el = elementoCarta(carta, true);
    el.classList.add('calata');
    const bersaglio = this.carteTavola.querySelector(`[data-carta="${sopraA}"]`);
    const r = bersaglio ? this.relativo(bersaglio, this.sopra) : { x: 0, y: 0 };
    el.style.left = `${r.x + 10}px`;
    el.style.top = `${r.y + 8}px`;
    return el;
  }
  relativo(el, rispetto) {
    const a = el.getBoundingClientRect(), b = rispetto.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top };
  }

  /** Le carte del tavolo che la carta scelta puo' prendere: si accendono. */
  evidenzia(forti = null) {
    const s = this.ultimo;
    const prendibili = new Set();
    if (s?.mano && this.scelta && this.mioTurno(s)) {
      for (const v of s.mano.valide) if (v.carta === this.scelta) v.presa.forEach(c => prendibili.add(c));
    }
    for (const el of this.carteTavola.children) {
      el.classList.toggle('prendibile', prendibili.has(el.dataset.carta));
      el.classList.toggle('prendibile-forte', !!forti && forti.includes(el.dataset.carta));
    }
  }

  testoSuggerimento(s) {
    const m = s.mano;
    if (s.fase !== 'partita' || !m) return '';
    const nome = (p) => escape(s.posti[p]?.nome || '');
    const e = s.pausa?.esito;
    if (e) {
      const parti = [];
      if (e.scopa) parti.push(`<b>${nome(e.posto)}</b> fa scopa`);
      else if (e.presa.length) parti.push(`<b>${nome(e.posto)}</b> prende ${e.presa.length === 1 ? 'una carta' : `${e.presa.length} carte`}`);
      if (e.restanti) parti.push(`le ${e.restanti.carte.length} rimaste vanno a <b>${nome(e.restanti.posto)}</b>`);
      return parti.join(' · ');
    }
    if (this.mioTurno(s)) return 'Tocca a te';
    if (m.turno >= 0) return `gioca <b>${nome(m.turno)}</b>`;
    return '';
  }

  // ─────────────────────────────── interazione ───────────────────────────────

  /**
   * Tocco una carta: se prende in un modo solo, si alza e al secondo tocco
   * parte (come al tavolo a prese); se prende in piu' modi si apre il
   * foglietto con le scelte, e la scelta e' gia' la conferma.
   */
  tocca(codice) {
    const s = this.ultimo; if (!s || !s.mano || !this.mioTurno(s)) return;
    const mosse = s.mano.valide.filter(v => v.carta === codice);
    const el = this.miaMano.querySelector(`[data-carta="${codice}"]`);
    if (!mosse.length) {
      el?.classList.remove('trema'); void el?.offsetWidth; el?.classList.add('trema');
      this.suoni?.no();
      return;
    }
    if (mosse.length > 1) {
      this.scelta = codice;
      this.apriVentaglio();
      this.evidenzia();
      this.apriFoglio(codice, mosse);
      return;
    }
    this.chiudiFoglio();
    if (this.scelta === codice) { this.scelta = null; this.onGioca(mosse[0]); return; }
    this.scelta = codice;
    this.apriVentaglio();
    this.evidenzia();
  }

  /** Il foglietto delle prese: una riga per ogni modo di prendere con quella carta. */
  apriFoglio(carta, mosse) {
    const f = this.foglio;
    f.querySelector('.foglio-titolo').textContent = `Scegli cosa prendere con ${conArticolo(etichetta(carta))}`;
    const lista = f.querySelector('.foglio-scelte');
    lista.replaceChildren();
    for (const mossa of mosse) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scelta-presa';
      b.setAttribute('aria-label', `Prendi ${mossa.presa.map(etichetta).join(' e ')}`);
      const carte = document.createElement('span'); carte.className = 'carte-piccole';
      for (const c of mossa.presa) carte.appendChild(elementoCarta(c, true));
      const somma = document.createElement('span'); somma.className = 'somma';
      somma.textContent = mossa.presa.length > 1 ? mossa.presa.map(valoreDi).join(' + ') : 'pari';
      b.append(carte, somma);
      b.addEventListener('click', () => { this.chiudiFoglio(); this.scelta = null; this.onGioca(mossa); });
      for (const ev of ['pointerenter', 'focus']) b.addEventListener(ev, () => this.evidenzia(mossa.presa));
      for (const ev of ['pointerleave', 'blur']) b.addEventListener(ev, () => this.evidenzia());
      lista.appendChild(b);
    }
    f.hidden = false;
    lista.firstElementChild?.focus({ preventScroll: true });
  }
  chiudiFoglio() { if (this.foglio && !this.foglio.hidden) this.foglio.hidden = true; }

  /** La stanza ha risposto «con questa carta puoi prendere in piu' modi»: si sceglie. */
  mostraScelte(scelte) { if (scelte?.length) { this.scelta = scelte[0].carta; this.apriVentaglio(); this.apriFoglio(scelte[0].carta, scelte); } }

  sgombra() {
    super.sgombra();
    this.carteTavola.replaceChildren();
    this.sopra.replaceChildren();
    this.chiudiFoglio();
    this.scopeCarte = {}; this.numeroMano = null;
  }

  // ─────────────────────────────── animazioni ───────────────────────────────

  /**
   * Una carta giocata. Se prende, vola sopra la prima carta che prende e
   * resta li' per la pausa; se non prende, va in fila con le altre. A fine
   * mano (dopo l'ultima carta non arriva un'altra pausa da guardare: arriva il
   * pannello) la presa e le carte rimaste vanno ai mucchi subito qui.
   */
  evento(ev) {
    if (ev.tipo !== 'carta') return;
    const s = this.ultimo;
    if (!s) return;
    const lato = this.lato(ev.posto);
    const origine = lato === 'basso' ? (this.miaMano.querySelector(`[data-carta="${ev.carta}"]`) || this.miaMano) : this.manoDi(ev.posto);
    const da = this.centroDi(origine);
    if (lato === 'basso') this.miaMano.querySelector(`[data-carta="${ev.carta}"]`)?.remove();
    this.suoni?.scivola();
    let el;
    if (ev.presa.length) {
      el = this.cartaSopra(ev.carta, ev.presa[0]);
      this.sopra.replaceChildren(el);
      for (const c of this.carteTavola.children) c.classList.toggle('presa', ev.presa.includes(c.dataset.carta));
    } else {
      el = elementoCarta(ev.carta, true);
      this.carteTavola.appendChild(el);
      this.tavola.classList.remove('vuota');
    }
    if (!ridotto()) {
      const a = this.centroDi(el);
      el.animate([
        { transform: `translate(${da.x - a.x}px, ${da.y - a.y}px) scale(0.92)`, opacity: 0.6 },
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
      ], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    if (ev.scopa) {
      const l = latoDi(s, ev.posto);
      (this.scopeCarte[l] ||= []).push(ev.carta);
      setTimeout(() => this.timbro(ev.posto), 420);
    }
    if (ev.fine || ev.restanti || this.ultimaCarta(s, ev)) {
      // ultima carta della mano: la presa al mucchio, poi le rimaste a chi ha preso per ultimo
      setTimeout(() => {
        if (ev.presa.length) {
          const prese = [...this.carteTavola.children].filter(c => ev.presa.includes(c.dataset.carta));
          const sopra = this.sopra.firstElementChild;
          this.alMucchio([...prese, ...(sopra ? [sopra] : [])], latoDi(s, ev.posto));
        }
      }, 900);
      if (ev.restanti) {
        setTimeout(() => {
          const rimaste = [...this.carteTavola.children].filter(c => ev.restanti.carte.includes(c.dataset.carta) && !c.classList.contains('andata'));
          this.alMucchio(rimaste, latoDi(s, ev.restanti.posto));
        }, 1500);
      }
    }
  }

  /** Era l'ultima carta della mano: nessuno ha piu' carte e il mazzo e' vuoto. */
  ultimaCarta(s, ev) {
    const m = s.mano;
    if (!m || m.mazzo) return false;
    return m.conteggi.reduce((a, b) => a + b, 0) <= 1 && m.conteggi[ev.posto] <= 1;
  }

  /** Delle carte del tavolo volano al mucchio di un lato; restano in pagina invisibili finche' lo stato non le toglie. */
  alMucchio(elementi, lato) {
    if (!elementi.length) return;
    const mucchio = this.mucchioDi(lato);
    const a = mucchio && !mucchio.hidden ? this.centroDi(mucchio) : this.centroDi(this.posti.basso);
    this.suoni?.raccogli();
    elementi.forEach((el, i) => {
      if (el.classList.contains('andata')) return;
      const da = this.centroDi(el);
      el.classList.add('andata');
      this.vola(el.dataset.carta, true, da, a, { durata: 440, ritardo: i * 40, scalaFine: 0.5, svanisce: true });
    });
  }

  /** La scritta della scopa, sopra il tavolo, per un momento. */
  timbro(posto) {
    const s = this.ultimo;
    const el = document.createElement('div');
    el.className = 'timbro';
    el.setAttribute('role', 'status');
    el.innerHTML = `<strong>Scopa</strong><span>${escape(s?.posti[posto]?.nome || '')}</span>`;
    this.tavola.appendChild(el);
    this.suoni?.singa();
    setTimeout(() => el.remove(), 1700);
  }
}
