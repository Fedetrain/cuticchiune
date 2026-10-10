// LA HOME — il nome, e la scelta del gioco: una riga per gioco con quanti
// si gioca, una frase su cosa si fa, e l'azione. Poi due modi di entrare in
// un tavolo che c'e' gia': il codice, o un tavolo pubblico.

import { $, escape, toast, mem } from '../ui.js';
import { STATICO } from '../ambiente.js';
import { GIOCHI, scheda, quantiGiocatori } from '../giochi.js';

export function avviaHome({ rete, entraCon }) {
  const inNome = $('#in-nome');
  inNome.value = mem.nome;
  /** I posti scelti per ogni gioco: si ricordano, cosi' chi gioca sempre in due non li cambia ogni volta. */
  const postiScelti = Object.fromEntries(Object.values(GIOCHI).map(g => [g.id, g.posti.includes(mem.postiDi(g.id)) ? mem.postiDi(g.id) : g.posti[0]]));
  let pubbliche = [];

  function nome() {
    const n = inNome.value.trim();
    if (!n) { inNome.focus(); toast('Scrivi il tuo nome, poi scegli il gioco.', true); return null; }
    mem.nome = n;
    return n;
  }
  function errore(msg) { const e = $('#errore-home'); e.textContent = msg || ''; e.hidden = !msg; }

  // ── la scelta del gioco ──
  function disegnaGiochi() {
    const ul = $('#lista-giochi');
    ul.replaceChildren();
    for (const g of Object.values(GIOCHI)) {
      const sch = scheda(g.id);
      const li = document.createElement('li');
      li.className = 'riga-gioco';
      li.dataset.gioco = g.id;
      const scelta = g.posti.length > 1
        ? `<div class="scelta-posti" role="radiogroup" aria-label="Quanti giocatori a ${escape(g.nome)}">${g.posti.map(n =>
            `<button type="button" role="radio" data-posti="${n}" aria-checked="${n === postiScelti[g.id]}">in ${n}</button>`).join('')}</div>`
        : '';
      const quante = pubbliche.filter(t => t.gioco === g.id).length;
      li.innerHTML = `
        <div class="riga-testa"><h3>${escape(g.nome)}</h3><span class="quanti">${escape(quantiGiocatori(g))}</span></div>
        ${sch.frase ? `<p class="frase">${escape(sch.frase)}</p>` : ''}
        <div class="riga-azioni">
          ${scelta}
          <button type="button" class="bottone secondario piccolo apri">Apri un tavolo</button>
        </div>
        ${STATICO ? '' : `<button type="button" class="bottone terziario piccolo cerca">${quante ? `Entra in un tavolo pubblico (${quante} apert${quante === 1 ? 'o' : 'i'})` : 'Cerca un tavolo pubblico'}</button>`}`;
      li.querySelectorAll('[data-posti]').forEach(b => b.addEventListener('click', () => {
        postiScelti[g.id] = Number(b.dataset.posti);
        mem.salvaPostiDi(g.id, postiScelti[g.id]);
        li.querySelectorAll('[data-posti]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      }));
      li.querySelector('.apri').addEventListener('click', () => {
        const n = nome(); if (!n) return;
        errore('');
        mem.ultimoGioco = g.id;
        rete.entra({ t: 'crea', nome: n, gioco: g.id, posti: postiScelti[g.id] });
      });
      li.querySelector('.cerca')?.addEventListener('click', () => {
        const n = nome(); if (!n) return;
        errore('');
        mem.ultimoGioco = g.id;
        rete.entra({ t: 'pubblica', nome: n, gioco: g.id, posti: postiScelti[g.id] });
      });
      ul.appendChild(li);
    }
  }
  disegnaGiochi();

  // ── entrare con il codice ──
  $('#btn-mostra-codice').addEventListener('click', () => {
    const b = $('#blocco-codice'); b.hidden = !b.hidden;
    if (!b.hidden) $('#in-codice').focus();
  });
  $('#blocco-codice').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = nome(); if (!n) return;
    const codice = $('#in-codice').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(codice)) { errore('Il codice ha quattro lettere. Controlla quello che ti hanno mandato.'); return; }
    entraCon(codice, n);
  });
  $('#form-home').addEventListener('submit', (e) => e.preventDefault());

  // il ventaglio di carte lo disegna app.js (disegnaOrnamenti), perche' va
  // rifatto quando arriva il mazzo fotografico

  // Sul sito statico non esiste un elenco di tavoli aperti: nessuno lo tiene.
  // Si entra con il codice che ti passa chi ha aperto, e basta.
  if (STATICO) $('#pubbliche').hidden = true;

  async function caricaPubbliche() {
    if (STATICO) return;
    try {
      const lista = await fetch('/api/pubbliche').then(r => r.json());
      const cambiata = JSON.stringify(lista.map(t => t.gioco)) !== JSON.stringify(pubbliche.map(t => t.gioco));
      pubbliche = lista;
      if (cambiata) disegnaGiochi();
      const ul = $('#lista-pubbliche'); ul.innerHTML = '';
      for (const s of lista) {
        const li = document.createElement('li');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tavolo-pubblico';
        b.innerHTML = `<span class="nomi"><b>${escape(s.nomeGioco)} in ${s.posti}</b> · ${escape(s.nomi.join(', ') || 'tavolo vuoto')}</span><span class="liberi">${s.liberi} post${s.liberi === 1 ? 'o libero' : 'i liberi'}</span>`;
        b.addEventListener('click', () => { const n = nome(); if (n) entraCon(s.codice, n); });
        li.appendChild(b); ul.appendChild(li);
      }
      $('#pubbliche').hidden = lista.length === 0;
    } catch { $('#pubbliche').hidden = true; }
  }

  // ── l'albo, un gioco alla volta ──
  async function caricaAlbo(id = mem.ultimoGioco || Object.keys(GIOCHI)[0]) {
    const corpo = $('#albo-corpo');
    schede($('#albo-schede'), id, caricaAlbo);
    const g = GIOCHI[id];
    if (STATICO) {
      corpo.innerHTML = `<p class="nota">Qui l'albo non c'è: senza un server, fra una partita e l'altra non resta nessuno a tenere i conti.</p>`;
      return;
    }
    try {
      const lista = await fetch(`/api/albo?gioco=${encodeURIComponent(id)}`).then(r => r.json());
      if (!lista.length) {
        corpo.innerHTML = `<p class="nota">Qui vanno le partite di ${escape(g.nome)} finite su questo server, e non ce n'è ancora una. Apri un tavolo di ${escape(g.nome)} per giocare la prima.</p>`;
        return;
      }
      corpo.innerHTML = `<table class="tabella"><tr><th>chi</th><th class="num">partite</th><th class="num">vinte</th><th class="num">${escape(scheda(id).albo)}</th></tr>
        ${lista.map(r => `<tr><td>${escape(r.nome)}</td><td class="num">${r.partite}</td><td class="num">${r.vinte}</td><td class="num">${r.media}</td></tr>`).join('')}</table>`;
    } catch { corpo.innerHTML = '<p class="nota">L\'albo non si è caricato: il server non risponde. Riprova fra poco.</p>'; }
  }

  return { nome, errore, caricaPubbliche, caricaAlbo, inNome };
}

/** Una fila di linguette, una per gioco: serve all'albo e alle regole. */
export function schede(contenitore, scelto, onScegli) {
  if (!contenitore) return;
  if (!contenitore.firstElementChild) {
    for (const g of Object.values(GIOCHI)) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.gioco = g.id; b.textContent = scheda(g.id).breve || g.nome;
      b.addEventListener('click', () => onScegli(g.id));
      contenitore.appendChild(b);
    }
  }
  for (const b of contenitore.children) {
    b.setAttribute('aria-selected', String(b.dataset.gioco === scelto));
    // il pannello si apre dopo questa chiamata: si scorre quando c'e'
    if (b.dataset.gioco === scelto) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }
}
