// LA HOME — il nome, e tre modi di entrare: apri un tavolo, entra con il
// codice, cerca una partita pubblica.

import { $, escape, toast, mem } from '../ui.js';
import { STATICO } from '../ambiente.js';

export function avviaHome({ rete, entraCon }) {
  const inNome = $('#in-nome');
  inNome.value = mem.nome;

  function nome() {
    const n = inNome.value.trim();
    if (!n) { inNome.focus(); toast('Scrivi come ti chiami', true); return null; }
    mem.nome = n;
    return n;
  }
  function errore(msg) { const e = $('#errore-home'); e.textContent = msg || ''; e.hidden = !msg; }

  $('#btn-crea').addEventListener('click', () => { const n = nome(); if (!n) return; errore(''); rete.entra({ t: 'crea', nome: n }); });
  $('#btn-mostra-codice').addEventListener('click', () => {
    const b = $('#blocco-codice'); b.hidden = !b.hidden;
    if (!b.hidden) $('#in-codice').focus();
  });
  $('#form-home').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = nome(); if (!n) return;
    const codice = $('#in-codice').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(codice)) { errore('Il codice è di quattro lettere.'); return; }
    entraCon(codice, n);
  });
  $('#btn-pubblica').addEventListener('click', () => { const n = nome(); if (!n) return; errore(''); rete.entra({ t: 'pubblica', nome: n }); });

  // il ventaglio di carte lo disegna app.js (disegnaOrnamenti), perche' va
  // rifatto quando arriva il mazzo fotografico

  // Sul sito statico non esiste un elenco di tavoli aperti: nessuno lo tiene.
  // Si entra con il codice che ti passa chi ha aperto, e basta.
  if (STATICO) {
    $('#btn-pubblica').hidden = true;
    $('#pubbliche').hidden = true;
  }

  async function caricaPubbliche() {
    if (STATICO) return;
    try {
      const lista = await fetch('/api/pubbliche').then(r => r.json());
      const ul = $('#lista-pubbliche'); ul.innerHTML = '';
      for (const s of lista) {
        const li = document.createElement('li');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tavolo-pubblico';
        b.innerHTML = `<span class="nomi">${escape(s.nomi.join(', ') || 'tavolo vuoto')}</span><span class="liberi">${s.liberi} post${s.liberi === 1 ? 'o' : 'i'}</span>`;
        b.addEventListener('click', () => { const n = nome(); if (n) entraCon(s.codice, n); });
        li.appendChild(b); ul.appendChild(li);
      }
      $('#pubbliche').hidden = lista.length === 0;
    } catch { $('#pubbliche').hidden = true; }
  }

  async function caricaAlbo() {
    const corpo = $('#albo-corpo');
    if (STATICO) {
      corpo.innerHTML = `<p class="nota">Qui l'albo non c'è: senza un server, fra una partita e l'altra non resta nessuno a tenere i conti.</p>`;
      return;
    }
    try {
      const lista = await fetch('/api/albo').then(r => r.json());
      if (!lista.length) { corpo.innerHTML = '<p class="nota">Nessuna partita finita, ancora.</p>'; return; }
      corpo.innerHTML = `<table class="tabella"><tr><th>chi</th><th class="num">partite</th><th class="num">salvo</th><th class="num">perso</th><th class="num">singhe a partita</th></tr>
        ${lista.map(g => `<tr><td>${escape(g.nome)}</td><td class="num">${g.partite}</td><td class="num">${g.salvezze}</td><td class="num">${g.perdite}</td><td class="num">${g.media}</td></tr>`).join('')}</table>`;
    } catch { corpo.innerHTML = '<p class="nota">L\'albo non risponde.</p>'; }
  }

  return { nome, errore, caricaPubbliche, caricaAlbo, inNome };
}
