// LA LOBBY — il codice, l'invito (link e QR), il tavolino con i posti (due,
// uno di fronte all'altro, o quattro), le opzioni del padrone di casa (il
// gioco, quanti si gioca, le opzioni del gioco e del tavolo) e il bottone
// che fa partire tutto.

import { $, $$, escape, toast } from '../ui.js';
import { sorgenteQR } from '../qr.js';
import { GIOCHI, etichettaOpzione, latoDi } from '../giochi.js';

/** Dove sta ogni posto attorno al tavolino. In due ci si siede di fronte. */
const LATO_DEL_POSTO = { 4: ['sud', 'est', 'nord', 'ovest'], 2: ['sud', 'nord'] };

export function avviaLobby({ rete, esci, benvenuto }) {
  let ultimo = null;
  $('#btn-esci-lobby').addEventListener('click', esci);
  $('#btn-copia').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(benvenuto().link); toast('Link copiato.'); }
    catch { toast('Il link non si è copiato da solo. Copialo a mano: ' + benvenuto().link, true); }
  });
  $('#btn-condividi').addEventListener('click', async () => {
    const b = benvenuto();
    const gioco = ultimo?.gioco?.nome || 'carte';
    try { await navigator.share({ title: 'Appò Carte', text: `Vieni a giocare a ${gioco} su Appò Carte: tavolo ${b.codice}`, url: b.link }); } catch {}
  });
  $('#btn-inizia').addEventListener('click', () => rete.invia({ t: 'avvia' }));
  $('#btn-pronto').addEventListener('click', (e) => rete.invia({ t: 'pronto', valore: e.currentTarget.dataset.pronto !== '1' }));
  for (const [id, chiave] of [['opz-bot', 'botPerICaduti'], ['opz-pubblica', 'pubblica']]) {
    $(`#${id}`).addEventListener('change', (e) => rete.invia({ t: 'opzioni', opzioni: { [chiave]: e.target.checked } }));
  }
  $('#opz-timer').addEventListener('change', (e) => rete.invia({ t: 'opzioni', opzioni: { timerTurno: Number(e.target.value) } }));

  // il gioco si sceglie da un elenco: e' lo stesso registro del server
  const scegliGioco = $('#opz-gioco');
  for (const g of Object.values(GIOCHI)) {
    const o = document.createElement('option'); o.value = g.id; o.textContent = g.nome;
    scegliGioco.appendChild(o);
  }
  scegliGioco.addEventListener('change', (e) => rete.invia({ t: 'gioco', gioco: e.target.value }));

  /** Le opzioni del gioco, scritte dalla descrizione che manda la stanza: un elenco o un si'/no. */
  function disegnaOpzioniGioco(s) {
    const box = $('#opz-gioco-proprie');
    const firma = `${s.gioco.id}|${JSON.stringify(s.opzioniGioco)}|${s.io.host}`;
    if (box.dataset.v === firma) return;
    box.dataset.v = firma;
    box.replaceChildren();
    for (const [chiave, descr] of Object.entries(s.gioco.opzioni || {})) {
      const label = document.createElement('label');
      label.className = 'opzione';
      const testo = document.createElement('span'); testo.textContent = etichettaOpzione(chiave, descr);
      label.appendChild(testo);
      const valore = s.opzioniGioco[chiave];
      if (descr.valori.every(v => typeof v === 'boolean')) {
        const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!valore; c.disabled = !s.io.host;
        c.addEventListener('change', () => rete.invia({ t: 'opzioni', delGioco: { [chiave]: c.checked } }));
        label.appendChild(c);
      } else {
        const sel = document.createElement('select'); sel.disabled = !s.io.host;
        for (const v of descr.valori) { const o = document.createElement('option'); o.value = String(v); o.textContent = String(v); sel.appendChild(o); }
        sel.value = String(valore);
        sel.addEventListener('change', () => rete.invia({ t: 'opzioni', delGioco: { [chiave]: descr.valori.find(v => String(v) === sel.value) } }));
        label.appendChild(sel);
      }
      box.appendChild(label);
    }
  }

  function render(s) {
    ultimo = s;
    const b = benvenuto();
    const n = s.posti.length;
    $('#lobby-codice').textContent = s.codice;
    $('#lobby-gioco').textContent = `${s.gioco.nome} · in ${n}${s.gioco.squadre ? ', a coppie' : ''}`;
    $('#lobby-link').textContent = b?.link ? b.link.replace(/^https?:\/\//, '') : '';
    const qr = $('#lobby-qr');
    if (qr.dataset.codice !== s.codice && b?.link) {
      qr.dataset.codice = s.codice;
      sorgenteQR(s.codice, b.link).then(src => { qr.src = src; }).catch(() => { qr.hidden = true; });
    }
    $('#btn-condividi').hidden = !navigator.share;

    // i posti attorno al tavolino: in due solo nord e sud
    const tavolino = $('.tavolino');
    tavolino.classList.toggle('a-due', n === 2);
    const lati = LATO_DEL_POSTO[n] || LATO_DEL_POSTO[4];
    for (const lato of ['sud', 'est', 'nord', 'ovest']) $(`.sedia[data-lato="${lato}"]`).hidden = !lati.includes(lato);
    for (let p = 0; p < n; p++) {
      const sedia = $(`.sedia[data-lato="${lati[p]}"]`);
      const g = s.posti[p];
      const io = g && g.id === s.io.id;
      const coppia = s.gioco.squadre ? `<span class="coppia coppia-${latoDi(s, p)}">coppia ${'AB'[latoDi(s, p)] || latoDi(s, p) + 1}</span>` : '';
      sedia.className = `sedia ${g ? 'occupata' : 'libera'} ${io ? 'io' : ''} ${g?.bot ? 'bot' : ''}`;
      sedia.innerHTML = '';
      if (!g) {
        const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'sedia-libera';
        bt.innerHTML = `<span class="num">${p + 1}</span><span>${s.io.posto >= 0 ? 'spostati qui' : 'siediti'}</span>${coppia}`;
        bt.addEventListener('click', () => rete.invia({ t: 'siedi', posto: p }));
        sedia.appendChild(bt);
        if (s.io.host) {
          const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'sedia-azione'; bb.title = 'Fai sedere un bot a questo posto'; bb.textContent = 'metti un bot';
          bb.addEventListener('click', () => rete.invia({ t: 'bot', posto: p }));
          sedia.appendChild(bb);
        }
      } else {
        const stato = g.bot ? 'bot' : (!g.presente ? 'caduto' : (s.host === g.id ? 'padrone di casa' : (g.pronto ? 'pronto' : 'aspetta')));
        const div = document.createElement('div'); div.className = 'sedia-nome';
        div.innerHTML = `<span class="num">${p + 1}</span><strong>${escape(g.nome)}${io ? ' <em>tu</em>' : ''}</strong><span class="stato">${stato}</span>${coppia}`;
        sedia.appendChild(div);
        if (s.io.host && !io) {
          const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'sedia-azione'; bb.textContent = g.bot ? 'togli il bot' : 'manda via';
          bb.title = g.bot ? 'Libera il posto del bot' : `Manda via ${g.nome} dal tavolo`;
          bb.addEventListener('click', () => rete.invia({ t: 'caccia', id: g.id }));
          sedia.appendChild(bb);
        } else if (io) {
          const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'sedia-azione'; bb.textContent = 'alzati';
          bb.addEventListener('click', () => rete.invia({ t: 'alzati' }));
          sedia.appendChild(bb);
        }
      }
    }

    // le opzioni: il gioco e i posti, quelle del gioco, quelle del tavolo
    scegliGioco.value = s.gioco.id;
    const sceltaPosti = $('#opz-posti');
    const firmaPosti = `${s.gioco.ammessi.join(',')}|${n}|${s.io.host}`;
    if (sceltaPosti.dataset.v !== firmaPosti) {
      sceltaPosti.dataset.v = firmaPosti;
      sceltaPosti.innerHTML = s.gioco.ammessi.map(k => `<button type="button" role="radio" data-posti="${k}" aria-checked="${k === n}" ${s.io.host && s.gioco.ammessi.length > 1 ? '' : 'disabled'}>in ${k}</button>`).join('');
      sceltaPosti.querySelectorAll('[data-posti]').forEach(bt => bt.addEventListener('click', () => rete.invia({ t: 'gioco', posti: Number(bt.dataset.posti) })));
    }
    disegnaOpzioniGioco(s);
    $$('#lobby-opzioni .opzioni-tavolo input, #lobby-opzioni .opzioni-tavolo select, #opz-gioco').forEach(i => { i.disabled = !s.io.host; });
    $('#opz-timer').value = String(s.opzioni.timerTurno);
    $('#opz-bot').checked = s.opzioni.botPerICaduti;
    $('#opz-pubblica').checked = s.opzioni.pubblica;
    $('#lobby-opzioni').classList.toggle('sola-lettura', !s.io.host);

    const sp = $('#lobby-spettatori');
    sp.hidden = s.spettatori.length === 0;
    sp.textContent = s.spettatori.length ? `Guardano: ${s.spettatori.map(x => x.nome).join(', ')}` : '';

    const liberi = s.posti.filter(g => !g).length;
    const umani = s.posti.filter(g => g && !g.bot).length;
    $('#btn-inizia').hidden = !s.io.host;
    $('#btn-inizia').disabled = s.io.posto < 0;
    const pronto = $('#btn-pronto');
    pronto.hidden = s.io.host || s.io.posto < 0;
    const mioPronto = !!s.posti.find(p => p && p.id === s.io.id)?.pronto;
    pronto.dataset.pronto = mioPronto ? '1' : '0';
    pronto.textContent = mioPronto ? 'Annulla il pronto' : 'Sono pronto';
    $('#lobby-stato').textContent = s.io.host
      ? (liberi ? `${umani} al tavolo · ${liberi === 1 ? 'il posto vuoto lo prende un bot' : `i ${liberi} posti vuoti li prendono i bot`}` : 'Tavolo completo')
      : (s.io.posto >= 0 ? 'Aspetta che il padrone di casa inizi, o dichiarati pronto' : 'Il tavolo è pieno: guardi la partita');
  }

  return { render };
}
