// IL SUONO — tutto sintetizzato con la Web Audio API, nessun file.
//
// Un mazzo di carte fa pochi rumori, e tutti corti: lo sfregamento di una
// carta che scivola sulla tovaglia, lo schiocco quando la si gira, il colpo
// secco della presa che si raccoglie. Più un richiamo per «tocca a te» e due
// stinger di fine partita. Parte muto: si accende dal bottone, e la scelta
// resta salvata.

import { mem } from './ui.js';

let ctx = null, master = null;
export const stato = { acceso: false };

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function accendi(v) { stato.acceso = v; if (v) ac(); mem.audio = v; }
export function vibra(schema) { try { navigator.vibrate?.(schema); } catch {} }

function tono({ f = 440, f2 = null, a = 0.004, d = 0.15, tipo = 'sine', vol = 0.4, quando = 0 }) {
  const c = ac(); if (!c || !stato.acceso) return;
  const t = c.currentTime + quando;
  const o = c.createOscillator(), g = c.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05);
}

function rumore({ d = 0.2, vol = 0.3, quando = 0, da = 1200, a = 400, q = 0.9, tipo = 'bandpass' }) {
  const c = ac(); if (!c || !stato.acceso) return;
  const t = c.currentTime + quando;
  const n = Math.floor(c.sampleRate * d);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const dati = buf.getChannelData(0);
  for (let i = 0; i < n; i++) dati[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 1.5;
  const src = c.createBufferSource(); src.buffer = buf;
  const filtro = c.createBiquadFilter(); filtro.type = tipo; filtro.Q.value = q;
  filtro.frequency.setValueAtTime(da, t); filtro.frequency.exponentialRampToValueAtTime(Math.max(40, a), t + d);
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(filtro); filtro.connect(g); g.connect(master); src.start(t);
}

export const suoni = {
  scivola() { rumore({ d: 0.16, vol: 0.22, da: 2400, a: 700, q: 0.7 }); },
  gira() { rumore({ d: 0.05, vol: 0.28, da: 3200, a: 1200, q: 1.4 }); tono({ f: 1800, f2: 900, d: 0.03, tipo: 'square', vol: 0.05 }); },
  distribuisci() { for (let i = 0; i < 8; i++) rumore({ d: 0.07, vol: 0.14, quando: i * 0.075, da: 2600, a: 900, q: 0.8 }); },
  raccogli() { rumore({ d: 0.12, vol: 0.3, da: 500, a: 120, q: 0.6, tipo: 'lowpass' }); tono({ f: 160, f2: 70, d: 0.14, tipo: 'triangle', vol: 0.25 }); },
  toccaATe() { tono({ f: 660, d: 0.12, tipo: 'sine', vol: 0.22 }); tono({ f: 880, d: 0.22, tipo: 'sine', vol: 0.22, quando: 0.11 }); vibra(40); },
  no() { tono({ f: 220, f2: 160, d: 0.12, tipo: 'square', vol: 0.08 }); vibra([20, 30, 20]); },
  singa() { rumore({ d: 0.22, vol: 0.28, da: 4000, a: 2500, q: 2 }); rumore({ d: 0.12, vol: 0.2, quando: 0.18, da: 3800, a: 2600, q: 2 }); vibra([60, 40, 60]); },
  salvo() { [523, 659, 784].forEach((f, i) => tono({ f, d: 0.35, tipo: 'triangle', vol: 0.22, quando: i * 0.12 })); },
  perso() { tono({ f: 392, f2: 370, d: 0.3, tipo: 'sawtooth', vol: 0.1 }); tono({ f: 311, f2: 280, d: 0.5, tipo: 'sawtooth', vol: 0.1, quando: 0.3 }); },
  messaggio() { tono({ f: 1200, d: 0.06, tipo: 'sine', vol: 0.12 }); },
  tic() { tono({ f: 1000, d: 0.03, tipo: 'square', vol: 0.06 }); },
};
