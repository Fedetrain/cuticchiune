// LA PARTITA — la barra, il tavolo, i veli di fine mano e fine partita, le
// prese, la chat, il timer. Il tavolo vero e proprio è in tavolo.js.

import { $, escape, toast, apri } from '../ui.js';
import { Tavolo } from '../tavolo.js';
import { elementoCarta, etichetta } from '../carte.js';
import { orologio } from '../rete.js';
import * as audio from '../audio.js';

export function avviaPartita({ rete, esci, stato }) {
  const tavolo = new Tavolo($('#tavolo'), { onGioca: (carta) => rete.invia({ t: 'gioca', carta }), suoni: audio.suoni });
  let fineManoVista = null;
  let finePartitaVista = false;
  let chatAperta = false;
  let timer = null;
  let emote = [];

  $('#btn-ultima-presa').addEventListener('click', () => mostraPrese('ultima'));
  $('#btn-fm-prese').addEventListener('click', () => mostraPrese('mano'));
  $('#btn-avanti').addEventListener('click', () => rete.invia({ t: 'avanti' }));
  $('#btn-rivincita').addEventListener('click', () => rete.invia({ t: 'rivincita' }));
  $('#btn-torna-attesa').addEventListener('click', () => rete.invia({ t: 'attesa' }));
  $('#btn-esci-partita').addEventListener('click', esci);
  $('#btn-chat').addEventListener('click', () => apriChat(!chatAperta));
  $('#chat [data-chiudi="chat"]').addEventListener('click', () => apriChat(false));
  $('#form-chat').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('#in-chat').value.trim(); if (!t) return;
    rete.invia({ t: 'chat', testo: t }); $('#in-chat').value = '';
  });

  function apriChat(v) {
    chatAperta = v; $('#chat').hidden = !v;
    if (v) { $('#chat-nuovi').hidden = true; $('#chat-lista').scrollTop = 1e9; $('#in-chat').focus(); }
  }

  function impostaEmote(lista) {
    emote = lista || [];
    const riga = $('#emote-riga'); riga.innerHTML = '';
    for (const e of emote) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'emote'; b.textContent = e.testo;
      b.addEventListener('click', () => rete.invia({ t: 'emote', id: e.id }));
      riga.appendChild(b);
    }
  }

  function aggiungiChat(riga, sistema = false) {
    const li = document.createElement('li');
    if (sistema) { li.className = 'sistema'; li.textContent = riga; }
    else li.innerHTML = `<b>${escape(riga.nome)}</b> ${escape(riga.testo)}`;
    const lista = $('#chat-lista'); lista.appendChild(li);
    while (lista.children.length > 60) lista.firstChild.remove();
    lista.scrollTop = 1e9;
  }

  // ─────────────────────────────── render ───────────────────────────────

  function render(s, prima) {
    $('#barra-codice').textContent = s.codice;
    $('#barra-mano').textContent = `mano ${s.partita?.numeroMano || 1}`;
    $('#btn-ultima-presa').disabled = !(s.mano && s.mano.ultimaPresa);
    $('#spettatore-banda').hidden = s.io.posto >= 0;
    tavolo.render(s);
    renderFineMano(s);
    renderFinePartita(s);
    aggiornaTimer(s);
    const mio = s.fase === 'partita' && s.mano && s.mano.turno === s.io.posto && !s.presaInVista;
    const primaMio = prima && prima.fase === 'partita' && prima.mano && prima.mano.turno === prima.io.posto && !prima.presaInVista;
    if (mio && !primaMio) audio.suoni.toccaATe();
  }

  function renderFineMano(s) {
    const velo = $('#velo-fine-mano');
    if (s.fase !== 'fine-mano' || !s.fineMano) { velo.hidden = true; fineManoVista = null; return; }
    const f = s.fineMano;
    const nuovo = fineManoVista !== f.numeroMano;
    fineManoVista = f.numeroMano;
    velo.hidden = false;
    const nomi = s.posti.map(p => p?.nome || '—');
    const perdenti = f.perdenti.map(p => nomi[p]);
    const io = s.io.posto;
    $('#fm-numero').textContent = `mano ${f.numeroMano}`;
    $('#fm-titolo').textContent = `Singa a ${perdenti.join(' e ')}`;
    $('#fm-motivo').textContent =
      f.motivo === 'zero-prese' ? (perdenti.length === 1 ? 'Non ha preso nemmeno una volta.' : 'Non hanno preso nemmeno una volta.')
      : f.motivo === 'pareggio' ? `Pari merito in testa con ${f.punti[f.perdenti[0]]} punti: singa a tutti e ${perdenti.length}.`
      : `Ha preso più punti di tutti: ${f.punti[f.perdenti[0]]}.`;
    $('#fm-tabella').innerHTML = `<tr><th>chi</th><th class="num">prese</th><th class="num">punti</th><th class="num">singhe</th></tr>` + [0, 1, 2, 3]
      .sort((a, b) => f.punti[b] - f.punti[a])
      .map(p => {
        const perde = f.perdenti.includes(p);
        return `<tr class="${perde ? 'perde' : ''} ${p === io ? 'io' : ''}"><td>${escape(nomi[p])}${p === io ? ' <em>tu</em>' : ''}</td><td class="num">${f.nPrese[p]}</td><td class="num">${f.punti[p]}</td><td class="num">${f.singhe[p] - (perde ? 1 : 0)}${perde ? ' <span class="segno">+1</span>' : ''}</td></tr>`;
      }).join('');
    // i tre punti dell'ultima presa vanno detti, se no la tabella non torna
    const ultima = f.bonusUltima != null ? ` L'ultima presa l'ha pigliata ${nomi[f.bonusUltima]}: tre punti in più.` : '';
    $('#fm-prossima').textContent = `Prossima mano: apre ${nomi[f.prossimoApre]}.${ultima}`;
    $('#btn-avanti').hidden = !s.io.host;
    if (nuovo) { if (f.perdenti.includes(io)) audio.suoni.perso(); else audio.suoni.singa(); }
  }

  function renderFinePartita(s) {
    const velo = $('#velo-fine-partita');
    if (s.fase !== 'fine-partita' || !s.classifica) { velo.hidden = true; finePartitaVista = false; return; }
    velo.hidden = false;
    const esito = s.partita.esito;
    const io = s.io.posto;
    const perde = s.classifica.filter(r => r.perde);
    $('#fp-titolo').textContent = perde.length === 1 ? `Perde ${perde[0].nome}` : `Perdono ${perde.map(r => r.nome).join(' e ')}`;
    $('#fp-motivo').textContent = esito.motivo === 'dieci-singhe'
      ? 'Dieci singhe: la partita finisce qui.'
      : (esito.franchi.length
        ? `Due giocatori a cinque singhe nella stessa mano. ${s.posti[esito.franchi[0]]?.nome || ''} esce franco con ${s.partita.singhe[esito.franchi[0]]}.`
        : 'Due giocatori a cinque singhe: finisce qui.');
    $('#fp-classifica').innerHTML = s.classifica.map((r, i) =>
      `<li class="${r.perde ? 'perde' : (r.franco ? 'franco' : 'salvo')}"><span class="pos">${i + 1}</span><span class="nome">${escape(r.nome)}${r.posto === io ? ' <em>tu</em>' : ''}</span><span class="esito">${r.perde ? 'perde' : r.franco ? 'esce franco' : 'si salva'}</span><span class="singhe">${r.singhe}</span></li>`).join('');
    $('#btn-torna-attesa').hidden = !s.io.host;
    $('#btn-rivincita').hidden = s.io.posto < 0;
    const umani = s.posti.filter(g => g && !g.bot && g.presente).length;
    $('#fp-rivincita').textContent = s.rivincita.length ? `Rivincita: ${s.rivincita.length} su ${umani} pronti` : '';
    $('#btn-rivincita').disabled = s.rivincita.includes(s.io.id);
    if (!finePartitaVista && io >= 0) { if (perde.some(r => r.posto === io)) audio.suoni.perso(); else audio.suoni.salvo(); }
    finePartitaVista = true;
  }

  function mostraPrese(cosa) {
    const s = stato(); if (!s) return;
    const nomi = s.posti.map(p => p?.nome || '—');
    const corpo = $('#prese-corpo'); corpo.innerHTML = '';
    const righe = cosa === 'ultima' ? (s.mano?.ultimaPresa ? [s.mano.ultimaPresa] : []) : (s.fineMano?.storico || []);
    $('#prese-titolo').textContent = cosa === 'ultima' ? 'Ultima presa' : `Le prese della mano ${s.fineMano?.numeroMano || ''}`;
    for (const presa of righe) {
      const r = document.createElement('div'); r.className = 'presa-riga';
      const chi = document.createElement('span'); chi.className = 'chi'; chi.textContent = nomi[presa.vincitore];
      const carte = document.createElement('div'); carte.className = 'carte-piccole';
      for (const c of presa.carte) {
        const el = elementoCarta(c.carta); el.title = `${etichetta(c.carta)} — ${nomi[c.posto]}`;
        if (c.posto === presa.vincitore) el.classList.add('vincente');
        carte.appendChild(el);
      }
      const punti = document.createElement('span'); punti.className = 'punti'; punti.textContent = `${presa.punti} pt`;
      r.append(chi, carte, punti); corpo.appendChild(r);
    }
    if (!righe.length) corpo.innerHTML = '<p class="nota">Ancora nessuna presa.</p>';
    apri('velo-prese');
  }

  function aggiornaTimer(s) {
    cancelAnimationFrame(timer);
    const mio = s.fase === 'partita' && s.mano && s.mano.turno === s.io.posto && s.scadenzaTurno && !s.presaInVista;
    if (!mio) return;
    const totale = s.opzioni.timerTurno * 1000;
    let ultimoTic = -1;
    const passo = () => {
      const resta = orologio.fraQuanto(s.scadenzaTurno);
      tavolo.aggiornaTempo(resta / totale);
      const sec = Math.ceil(resta / 1000);
      if (sec <= 5 && sec !== ultimoTic && sec > 0) { ultimoTic = sec; audio.suoni.tic(); }
      if (resta > 0) timer = requestAnimationFrame(passo);
    };
    passo();
  }

  // ─────────────────────────────── eventi ───────────────────────────────

  function evento(ev) {
    const s = stato();
    switch (ev.tipo) {
      case 'distribuzione':
        setTimeout(() => tavolo.animaDistribuzione(), 60);
        aggiungiChat(`Mano ${ev.numeroMano}: apre ${s?.posti[ev.apre]?.nome || ''}`, true);
        break;
      case 'carta':
        tavolo.animaCartaGiocata(ev);
        if (ev.automatico && s?.posti[ev.posto] && !s.posti[ev.posto].bot) toast(`Per ${s.posti[ev.posto].nome} ha giocato il bot`);
        break;
      case 'presa':
        tavolo.ricordaPresa(ev);
        break;
      case 'tempo-scaduto':
        if (s && ev.posto === s.io.posto) toast('Tempo scaduto: ha giocato il bot per te', true);
        break;
      case 'chat':
        aggiungiChat(ev);
        if (ev.da !== s?.io.id) {
          if (!chatAperta) { $('#chat-nuovi').hidden = false; audio.suoni.messaggio(); }
          if (ev.posto >= 0) tavolo.fumetto(ev.posto, ev.testo.length > 28 ? ev.testo.slice(0, 26) + '…' : ev.testo);
        }
        break;
      case 'emote':
        tavolo.fumetto(ev.posto, ev.emote.testo);
        aggiungiChat({ nome: ev.nome, testo: ev.emote.testo });
        break;
    }
  }

  return { render, evento, impostaEmote, apriChat };
}
