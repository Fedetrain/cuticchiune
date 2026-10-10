// LA PARTITA — la barra, il tavolo, i veli di fine mano e fine partita, le
// prese, la chat, il timer. Il tavolo vero e proprio e' in tavolo.js (giochi
// a prese) e in tavolo-pesca.js (Scopa e Scopone): stanno sullo stesso
// pezzo di pagina, e lavora quello della famiglia del gioco in corso.

import { $, escape, toast, apri } from '../ui.js';
import { Tavolo } from '../tavolo.js';
import { TavoloPesca } from '../tavolo-pesca.js';
import { elementoCarta, etichetta } from '../carte.js';
import { orologio } from '../rete.js';
import { scheda } from '../giochi.js';
import { fineMano, finePartita, righePrese } from '../pannelli.js';
import * as audio from '../audio.js';

export function avviaPartita({ rete, esci, stato }) {
  const radice = $('#tavolo');
  const onGioca = (mossa) => rete.invia({ t: 'gioca', ...mossa });
  const tavoli = {
    prese: new Tavolo(radice, { onGioca, suoni: audio.suoni }),
    pesca: new TavoloPesca(radice, { onGioca, suoni: audio.suoni }),
  };
  let famiglia = null;
  let fineManoVista = null;
  let finePartitaVista = false;
  let chatAperta = false;
  let timer = null;
  let emote = [];

  const tavolo = () => tavoli[famiglia] || tavoli.prese;

  $('#btn-ultima-presa').addEventListener('click', () => mostraPrese('ultima'));
  $('#btn-fm-prese').addEventListener('click', () => mostraPrese('mano'));
  $('#btn-avanti').addEventListener('click', () => rete.invia({ t: 'avanti' }));
  $('#btn-rivincita').addEventListener('click', () => rete.invia({ t: 'rivincita' }));
  $('#btn-torna-attesa').addEventListener('click', () => rete.invia({ t: 'attesa' }));
  $('#btn-esci-partita').addEventListener('click', esci);
  // lo stato vero e' il pannello: con Escape (ui.js) si chiude senza passare
  // di qui, e il bottone sarebbe rimasto a credere che fosse ancora aperto
  $('#btn-chat').addEventListener('click', () => apriChat($('#chat').hidden));
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
    const fam = s.gioco.famiglia === 'pesca' ? 'pesca' : 'prese';
    if (fam !== famiglia) {
      tavoli[fam].sgombra();
      famiglia = fam;
      radice.classList.toggle('famiglia-pesca', fam === 'pesca');
      radice.classList.toggle('famiglia-prese', fam === 'prese');
      radice.querySelectorAll('.targa').forEach(t => t.replaceChildren());
    }
    $('#barra-codice').textContent = s.codice;
    // il nome del gioco solo dove c'e' spazio: sul telefono la barra e' gia' piena
    $('#barra-mano').innerHTML = `<span class="solo-largo">${escape(s.gioco.nome)} · </span>mano ${s.partita?.numeroMano || 1}`;
    $('#barra-mano').title = s.gioco.nome;
    $('#btn-ultima-presa').hidden = fam !== 'prese';
    $('#btn-ultima-presa').disabled = !righePrese(s, 'ultima').length;
    $('#spettatore-banda').hidden = s.io.posto >= 0;
    tavolo().render(s);
    renderFineMano(s);
    renderFinePartita(s);
    aggiornaTimer(s);
    const mio = tavolo().mioTurno(s);
    const primaMio = prima && prima.fase === 'partita' && !prima.pausa && !!prima.mano?.valide?.length;
    if (mio && !primaMio) audio.suoni.toccaATe();
  }

  function renderFineMano(s) {
    const velo = $('#velo-fine-mano');
    if (s.fase !== 'fine-mano' || !s.fineMano) { velo.hidden = true; fineManoVista = null; return; }
    const f = s.fineMano;
    const nuovo = fineManoVista !== f.numeroMano;
    fineManoVista = f.numeroMano;
    velo.hidden = false;
    const p = fineMano(s);
    $('#fm-numero').textContent = `${s.gioco.nome} · mano ${f.numeroMano}`;
    $('#fm-titolo').textContent = p.titolo;
    $('#fm-motivo').textContent = p.motivo;
    $('#fm-motivo').hidden = !p.motivo;
    $('#fm-tabella').innerHTML = p.tabella;
    $('#fm-tabella').classList.toggle('conto-scopa', s.gioco.famiglia === 'pesca');
    $('#fm-prossima').innerHTML = p.nota;
    $('#btn-fm-prese').hidden = !p.prese;
    $('#btn-avanti').hidden = !s.io.host;
    if (nuovo) {
      if (p.esito === 'male') audio.suoni.perso();
      else if (p.esito === 'bene') audio.suoni.salvo();
      else audio.suoni.singa();
    }
  }

  function renderFinePartita(s) {
    const velo = $('#velo-fine-partita');
    if (s.fase !== 'fine-partita' || !s.classifica) { velo.hidden = true; finePartitaVista = false; return; }
    velo.hidden = false;
    const p = finePartita(s);
    const etich = scheda(s.gioco.id).punti;
    $('#fp-titolo').textContent = p.titolo;
    $('#fp-motivo').textContent = p.motivo;
    $('#fp-classifica').innerHTML = p.righe.map((r, i) =>
      `<li class="${r.classe}"><span class="pos">${i + 1}</span><span class="nome">${r.nome}</span><span class="esito">${r.esito}</span><span class="punti" data-etichetta="${escape(r.etichetta || etich)}">${r.punti}</span></li>`).join('');
    $('#btn-torna-attesa').hidden = !s.io.host;
    $('#btn-rivincita').hidden = s.io.posto < 0;
    // Da soli coi bot la partita nuova parte col bottone, e il bottone lo dice.
    // In compagnia serve il sì di tutti gli umani seduti: si aspetta, e si vede
    // quanti mancano.
    const umani = s.posti.filter(g => g && !g.bot && g.presente).length;
    const solo = umani <= 1;
    $('#btn-rivincita').textContent = solo ? 'Inizia una nuova partita' : 'Chiedi la rivincita';
    $('#fp-rivincita').textContent = solo ? ''
      : s.rivincita.length ? `Rivincita: ${s.rivincita.length} su ${umani} pronti. Si riparte quando ci sono tutti.`
      : 'La rivincita parte quando la chiedono tutti.';
    $('#btn-rivincita').disabled = s.rivincita.includes(s.io.id);
    if (!finePartitaVista && s.io.posto >= 0) { if (p.male) audio.suoni.perso(); else audio.suoni.salvo(); }
    finePartitaVista = true;
  }

  function mostraPrese(cosa) {
    const s = stato(); if (!s) return;
    const nomi = s.posti.map(p => p?.nome || '—');
    const corpo = $('#prese-corpo'); corpo.innerHTML = '';
    const righe = righePrese(s, cosa);
    $('#prese-titolo').textContent = cosa === 'ultima' ? 'Ultima presa' : `Le prese della mano ${s.fineMano?.numeroMano || ''}`;
    for (const presa of righe) {
      const r = document.createElement('div'); r.className = 'presa-riga';
      const chi = document.createElement('span'); chi.className = 'chi'; chi.textContent = nomi[presa.vincitore];
      const carte = document.createElement('div'); carte.className = 'carte-piccole';
      for (const c of presa.carte) {
        const el = elementoCarta(c.carta); el.title = `${etichetta(c.carta)}, di ${nomi[c.posto]}`;
        if (c.posto === presa.vincitore) el.classList.add('vincente');
        carte.appendChild(el);
      }
      const punti = document.createElement('span'); punti.className = 'punti'; punti.textContent = `${presa.punti} pt`;
      r.append(chi, carte, punti); corpo.appendChild(r);
    }
    if (!righe.length) corpo.innerHTML = '<p class="nota">Qui compaiono le prese della mano, e nessuno ha ancora preso. Torna a guardare dopo la prima presa.</p>';
    apri('velo-prese');
  }

  function aggiornaTimer(s) {
    cancelAnimationFrame(timer);
    const mio = tavolo().mioTurno(s) && s.scadenzaTurno;
    if (!mio) return;
    const totale = s.opzioni.timerTurno * 1000;
    let ultimoTic = -1;
    const passo = () => {
      const resta = orologio.fraQuanto(s.scadenzaTurno);
      tavolo().aggiornaTempo(resta / totale);
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
        setTimeout(() => tavolo().animaDistribuzione(), 60);
        aggiungiChat(`Mano ${ev.numeroMano}: apre ${s?.posti[ev.apre]?.nome || ''}`, true);
        break;
      case 'carta':
        tavolo().evento(ev);
        if (ev.automatico && s?.posti[ev.posto] && !s.posti[ev.posto].bot) toast(`Per ${s.posti[ev.posto].nome} ha giocato il bot.`);
        break;
      case 'tempo-scaduto':
        if (s && ev.posto === s.io.posto) toast('Tempo scaduto: ha giocato il bot per te.', true);
        break;
      case 'chat':
        aggiungiChat(ev);
        if (ev.da !== s?.io.id) {
          if (!chatAperta) { $('#chat-nuovi').hidden = false; audio.suoni.messaggio(); }
          if (ev.posto >= 0) tavolo().fumetto(ev.posto, ev.testo.length > 28 ? ev.testo.slice(0, 26) + '…' : ev.testo);
        }
        break;
      case 'emote':
        if (ev.posto >= 0) tavolo().fumetto(ev.posto, ev.emote.testo);
        aggiungiChat({ nome: ev.nome, testo: ev.emote.testo });
        break;
    }
  }

  /** La stanza ha detto «scegli quale presa»: si apre il foglietto. */
  function mostraScelte(scelte) { tavoli.pesca.mostraScelte(scelte); }

  return { render, evento, impostaEmote, apriChat, mostraScelte };
}
