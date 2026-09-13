// UI — le piccole cose che servono a tutte le schermate: selettori, toast,
// veli, memoria locale, la sanificazione del testo.

export const $ = (sel, radice = document) => radice.querySelector(sel);
export const $$ = (sel, radice = document) => [...radice.querySelectorAll(sel)];

export function escape(t) {
  return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Uno schermo alla volta: home, lobby, partita. */
export function mostraSchermo(id) {
  $$('.schermo').forEach(s => s.classList.toggle('attivo', s.id === id));
  window.scrollTo(0, 0);
}

export function apri(id) { const el = $(`#${id}`); if (el) el.hidden = false; }
export function chiudi(id) { const el = $(`#${id}`); if (el) el.hidden = true; }

/** I bottoni con data-apri / data-chiudi funzionano da soli. */
export function collegaVeli(onApri = {}) {
  $$('[data-apri]').forEach(b => b.addEventListener('click', () => { onApri[b.dataset.apri]?.(); apri(b.dataset.apri); }));
  $$('[data-chiudi]').forEach(b => b.addEventListener('click', () => chiudi(b.dataset.chiudi)));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $$('.velo:not([hidden]), .cassetto:not([hidden])').forEach(v => { v.hidden = true; });
  });
}

let toastTimer = null;
export function toast(testo, brutto = false) {
  const t = $('#toast');
  t.textContent = testo;
  t.classList.toggle('brutto', brutto);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/** La memoria locale del telefono: nome, token per stanza, ultima stanza. */
const PREFISSO = 'cuticchiune_';
const leggi = (k) => { try { return localStorage.getItem(PREFISSO + k); } catch { return null; } };
const scrivi = (k, v) => { try { v === null ? localStorage.removeItem(PREFISSO + k) : localStorage.setItem(PREFISSO + k, v); } catch {} };
export const mem = {
  get nome() { return leggi('nome') || ''; },
  set nome(v) { scrivi('nome', v); },
  token(codice) { return leggi(`token_${codice}`); },
  salvaToken(codice, token) { scrivi(`token_${codice}`, token); },
  get ultimo() { return leggi('ultimo'); },
  set ultimo(v) { scrivi('ultimo', v || null); },
  get audio() { return leggi('audio') === '1'; },
  set audio(v) { scrivi('audio', v ? '1' : '0'); },
};
