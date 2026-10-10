// Piccoli attrezzi condivisi. Niente `node:crypto`: si usa la Web Crypto, che
// c'e' uguale su Node e nel browser — questo file gira da tutt'e due le parti,
// perche' la stanza puo' stare su un server o dentro una pagina.

/** Codice stanza di 4 lettere, senza quelle che si confondono (I, O, Q, e le cifre 0/1). */
const ALFABETO = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export function codiceStanza(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALFABETO[Math.floor(rnd() * ALFABETO.length)];
  return s;
}

/** n byte casuali in base64url. */
function chiave(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function token() { return chiave(18); }
export function id() { return chiave(6); }
export function now() { return Date.now(); }

/** Nome pulito: niente spazi doppi, massimo 14 caratteri, mai vuoto. */
export function pulisciNome(nome, fallback = 'Anonimu') {
  const n = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return n || fallback;
}

/** Testo di chat: una riga, 140 caratteri. */
export function pulisciTesto(t) {
  return String(t || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 140);
}
