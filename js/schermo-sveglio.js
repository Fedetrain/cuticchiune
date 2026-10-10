// LO SCHERMO CHE NON SI SPEGNE — mentre si gioca.
//
// Una mano dura minuti e chi aspetta il suo turno non tocca niente: il
// telefono si oscura e si blocca proprio mentre gli altri calano. La Screen
// Wake Lock API tiene acceso lo schermo finché serve, e si rilascia da sola
// quando la pagina va in secondo piano — quindi va richiesta di nuovo quando
// si torna. Il browser può dire di no (batteria scarica, o API assente): in
// quel caso non succede niente, il gioco funziona uguale.

let blocco = null;
let voluto = false;

async function prendi() {
  if (!voluto || blocco || !('wakeLock' in navigator)) return;
  try {
    blocco = await navigator.wakeLock.request('screen');
    blocco.addEventListener('release', () => { blocco = null; });
  } catch {
    blocco = null;      // niente drammi: e' un di piu', non una funzione del gioco
  }
}

/** true mentre si e' al tavolo, false quando si esce. */
export function tieniSveglio(sì) {
  voluto = !!sì;
  if (voluto) prendi();
  else if (blocco) { const b = blocco; blocco = null; b.release().catch(() => {}); }
}

// tornando dalla schermata di blocco o da un'altra scheda il lock e' sparito
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') prendi();
});
