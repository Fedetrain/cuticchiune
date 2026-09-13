// LA LOBBY — il codice, l'invito (link e QR), il tavolino con i quattro posti,
// le opzioni del padrone di casa, e il bottone che fa partire tutto.

import { $, $$, escape, toast } from '../ui.js';
import { sorgenteQR } from '../qr.js';

const LATO_DEL_POSTO = ['sud', 'est', 'nord', 'ovest'];

export function avviaLobby({ rete, esci, benvenuto }) {
  $('#btn-esci-lobby').addEventListener('click', esci);
  $('#btn-copia').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(benvenuto().link); toast('Link copiato'); }
    catch { toast('Copia a mano: ' + benvenuto().link, true); }
  });
  $('#btn-condividi').addEventListener('click', async () => {
    const b = benvenuto();
    try { await navigator.share({ title: 'Cuticchiune', text: `Vieni a giocare a Cuticchiune: tavolo ${b.codice}`, url: b.link }); } catch {}
  });
  $('#btn-inizia').addEventListener('click', () => rete.invia({ t: 'avvia' }));
  $('#btn-pronto').addEventListener('click', (e) => rete.invia({ t: 'pronto', valore: e.currentTarget.dataset.pronto !== '1' }));
  for (const [id, chiave] of [['opz-punti', 'puntiInChiaro'], ['opz-bot', 'botPerICaduti'], ['opz-pubblica', 'pubblica']]) {
    $(`#${id}`).addEventListener('change', (e) => rete.invia({ t: 'opzioni', opzioni: { [chiave]: e.target.checked } }));
  }
  $('#opz-timer').addEventListener('change', (e) => rete.invia({ t: 'opzioni', opzioni: { timerTurno: Number(e.target.value) } }));

  function render(s) {
    const b = benvenuto();
    $('#lobby-codice').textContent = s.codice;
    $('#lobby-link').textContent = b?.link ? b.link.replace(/^https?:\/\//, '') : '';
    const qr = $('#lobby-qr');
    if (qr.dataset.codice !== s.codice && b?.link) {
      qr.dataset.codice = s.codice;
      sorgenteQR(s.codice, b.link).then(src => { qr.src = src; }).catch(() => { qr.hidden = true; });
    }
    $('#btn-condividi').hidden = !navigator.share;

    // i quattro posti attorno al tavolino
    for (let p = 0; p < 4; p++) {
      const sedia = $(`.sedia[data-lato="${LATO_DEL_POSTO[p]}"]`);
      const g = s.posti[p];
      const io = g && g.id === s.io.id;
      sedia.className = `sedia ${g ? 'occupata' : 'libera'} ${io ? 'io' : ''} ${g?.bot ? 'bot' : ''}`;
      sedia.innerHTML = '';
      if (!g) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'sedia-libera';
        b.innerHTML = `<span class="num">${p + 1}</span><span>${s.io.posto >= 0 ? 'spostati qui' : 'siediti'}</span>`;
        b.addEventListener('click', () => rete.invia({ t: 'siedi', posto: p }));
        sedia.appendChild(b);
        if (s.io.host) {
          const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'sedia-azione'; bb.title = 'Metti un bot'; bb.setAttribute('aria-label', 'metti un bot'); bb.textContent = '+ bot';
          bb.addEventListener('click', () => rete.invia({ t: 'bot', posto: p }));
          sedia.appendChild(bb);
        }
      } else {
        const stato = g.bot ? 'bot' : (!g.presente ? 'caduto' : (s.host === g.id ? 'padrone di casa' : (g.pronto ? 'pronto' : 'aspetta')));
        const div = document.createElement('div'); div.className = 'sedia-nome';
        div.innerHTML = `<span class="num">${p + 1}</span><strong>${escape(g.nome)}${io ? ' <em>tu</em>' : ''}</strong><span class="stato">${stato}</span>`;
        sedia.appendChild(div);
        if (s.io.host && !io) {
          const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'sedia-azione'; bb.title = g.bot ? 'Togli il bot' : 'Manda via'; bb.setAttribute('aria-label', bb.title); bb.textContent = g.bot ? 'togli' : 'manda via';
          bb.addEventListener('click', () => rete.invia({ t: 'caccia', id: g.id }));
          sedia.appendChild(bb);
        } else if (io) {
          const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'sedia-azione'; bb.textContent = 'alzati';
          bb.addEventListener('click', () => rete.invia({ t: 'alzati' }));
          sedia.appendChild(bb);
        }
      }
    }

    $$('#lobby-opzioni input, #lobby-opzioni select').forEach(i => { i.disabled = !s.io.host; });
    $('#opz-timer').value = String(s.opzioni.timerTurno);
    $('#opz-punti').checked = s.opzioni.puntiInChiaro;
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
    pronto.textContent = mioPronto ? 'Pronto — annulla' : 'Sono pronto';
    $('#lobby-stato').textContent = s.io.host
      ? (liberi ? `${umani} al tavolo · ${liberi === 1 ? 'il posto vuoto lo prende' : `i ${liberi} posti vuoti li prendono`} i bot` : 'Tavolo completo')
      : (s.io.posto >= 0 ? 'Aspetta che il padrone di casa inizi, o dichiarati pronto' : 'Il tavolo è pieno: guardi la partita');
  }

  return { render };
}
