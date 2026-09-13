# CUTICCHIUNE

Il gioco di carte siciliane a **quattro giocatori, ognuno per sé**, ispirato al
Tressette ma con l'obiettivo rovesciato: si vince **non prendendo** — ma chi non
prende nemmeno una volta perde a prescindere.

Un progetto a sé, in questa cartella: non c'entra con `_private/gioco-ndrina`.

Una stanza, un link, quattro telefoni. Nessun account, nessuna installazione:
si apre il link, si scrive il nome, si gioca.

```
npm install
npm start          →  http://localhost:3838
```

Il server stampa anche l'indirizzo in rete locale (`http://192.168.x.x:3838`):
chi è sulla stessa Wi-Fi apre quello. Per giocare da fuori casa basta mettere
il processo dietro un qualunque reverse proxy con WebSocket (il link della
stanza rispetta `X-Forwarded-Host` e `X-Forwarded-Proto`).

---

## Come si gioca online

| Cosa | Come |
|---|---|
| **Apri un tavolo** | scrivi il nome, «Apri un tavolo». Sei il padrone di casa |
| **Invita** | la lobby mostra il **codice** (4 lettere), il **link** (`/s/CODICE`), il **QR** e il bottone *Condividi* |
| **Entra** | dal link si entra diretti; oppure «Entra con il codice» |
| **Partita pubblica** | «Cerca una partita pubblica»: ti mette al primo tavolo pubblico con un posto libero, o ne apre uno |
| **Posti vuoti** | li prendono i **bot** («Turi», «Cicciu», «Nzino»…). Il padrone può aggiungerli a mano o lasciare che «Inizia» li chiami |
| **Spettatori** | chi arriva a tavolo pieno guarda; alla partita dopo può sedersi |
| **Cade la linea** | si rientra dallo stesso link con lo stesso posto e le stesse carte. Dopo 12 s il **bot gioca al posto di chi è caduto**, e gli restituisce la mano appena torna |
| **Opzioni** (padrone) | tempo per mossa (0/20/45/90 s), punti in chiaro durante la mano, bot per i caduti, tavolo pubblico |
| **Al tavolo** | chat, otto emote in siciliano che compaiono come fumetti, «ultima presa», le prese della mano, le regole sempre a portata |
| **Fine partita** | classifica, chi si salva, chi perde, chi «esce franco»; **Rivincita** (quando tutti gli umani seduti la chiedono) o «Torna al tavolo» per cambiare posti |
| **Albo** | il server tiene in `dati/albo.json` partite, salvezze e singhe di ogni nome umano |
| **Audio** | tutto sintetizzato (Web Audio, nessun file): la carta che scivola, la presa, «tocca a te», la singa. Parte muto, si accende dal bottone |

Tutto funziona **senza internet**: i font sono serviti in locale (OFL), le
carte sono SVG generati, non c'è un solo CDN.

---

## Lo stile

Una terrazza siciliana a mezzogiorno: la **calce** delle pareti come fondo, il
**cobalto** delle maioliche per il tavolo e le azioni, un **limone** per «tocca a
te» e per la carta scelta, la **terracotta** solo per la singa. Il bordo del
tavolo, i biglietti e i pannelli portano la stessa piastrella di maiolica,
ripetuta. Le carte d'avorio sono l'unica cosa antica, e sul blu risaltano.
Titoli in **Fraunces**, testo in **Figtree** (entrambi OFL, in locale).
La mano è un ventaglio; la targa di chi deve giocare diventa gialla.

---

## Le regole (come implementate)

- **Mazzo**: 40 carte siciliane, 4 semi (denari, coppe, spade, bastoni), valori
  asso, 2–7, donna, cavallo, re. **10 carte a testa**, niente tallone.
- **Punti presa**: asso **3**; due, tre, donna, cavallo, re **1**; 4-5-6-7 **0**.
  In tutto il mazzo **32 punti**. *(La specifica dice «35»: la somma della sua
  stessa tabella fa 32 — 4 semi × (3+1+1+1+1+1). Si è seguita la tabella.)*
- **Forza** (chi prende): **tre > due > asso > re > cavallo > donna > 7 > 6 > 5 > 4**.
  L'asso vale più di tutti ma nella presa è solo terzo.
- **Obbligo di seme**: se hai il seme d'apertura devi rispondere; se non ce
  l'hai giochi quello che vuoi, ma una carta fuori seme **non prende mai**.
  Niente briscola.
- **Chi apre**: la prima mano chi ha il **5 di denari**. Poi: un solo perdente →
  apre lui; due o più → apre chi sta a destra di chi non ha perso *(se i
  non-perdenti sono due, si prende come riferimento il migliore: meno punti,
  a parità meno prese)*.
- **La singa**: a fine mano, se tutti hanno preso almeno una volta perde chi ha
  **più punti** (a pari merito, tutti i pari); se uno o più non hanno **mai
  preso**, la singa la prendono loro, a prescindere dai punti.
- **Fine partita**: un giocatore a **10 singhe**, oppure **due giocatori a 5**.
  Ordine dei controlli: prima «due arrivano a 5 in questa mano» (finisce per
  loro, chi era già oltre le 5 **esce franco**), poi «due a 5 o più» (perdono
  entrambi), poi le 10 singhe.

Sono tutte in `src/cuticchiune.js`, e `tools/test-cuticchiune.mjs` le
verifica una per una, compreso l'«esce franco».

---

## Le carte

Le 40 carte sono **SVG generati** in `public/js/carte.js`, disegnate sul modello
del mazzo siciliano tradizionale: i **denari** sono soli d'oro a rosone,
l'**asso di denari** porta l'**aquila a volo basso**, il **tre di denari** la
**Trinacria**; le **coppe** sono calici d'oro e rosso e l'**asso di coppe** è il
**lebete nuziale** a due anse; le **spade** sono scimitarre ricurve intrecciate
(l'asso dritto, col fiocco); i **bastoni** rami nodosi con le foglie,
intrecciati; le **figure** sono a figura intera — la **Donna** al posto del
fante, il **Cavallo**, il **Re** in piedi — e fra i semi delle carte numerali
corrono le decorazioni floreali tipiche del mazzo.

Non sono scansioni, ed e' una scelta che conta: i disegni dei mazzi in
commercio sono coperti da diritti, quindi **online vanno gli SVG**, che sono
roba nostra.

Per giocare in casa il gioco accetta comunque un **mazzo fotografico**: metti
in `public/assets/mazzo/` una immagine per carta (`D1 … B10`, png/jpg/webp,
piu' `dorso`; vedi il `LEGGIMI.txt` li' dentro) e con tutte e 40 presenti il
client le usa al posto dei disegni. `GET /api/mazzo` dice quante ne ha trovate.
Se le immagini sono un foglio per seme o una cartella numerata,
`npm run mazzo -- <cartella>` le ritaglia e le rinomina.

Quella cartella resta **fuori dal sito statico**: `tools/costruisci-sito.mjs`
la salta apposta. Se il progetto finisce in un repo pubblico, va tolta anche da
li' — online ci vanno solo gli SVG.

Per guardare le 40 carte tutte insieme:
`node tools/anteprima-carte.mjs > carte.html`.

---

## Online senza server: il sito statico (GitHub Pages)

Il gioco sa girare **anche senza `server.js`**. Il motore (`src/`) non sa cosa
sia un WebSocket: parla con un canale qualunque, e `src/servitore.js` — le
stanze e lo smistamento dei messaggi — è lo stesso file nei due mondi.

```
npm run sito        →  sito/   (tutto quello che serve, da servire come file)
```

Dentro `sito/` la pagina ha una riga in più, `window.CUTICCHIUNE_STATICO`, e da
lì il client cambia strada (`public/js/ambiente.js`):

| | con `server.js` | sito statico |
|---|---|---|
| dove sta la stanza | nel processo Node | **nella pagina di chi apre il tavolo** |
| come parlano i telefoni | WebSocket | **WebRTC** fra i browser (`public/js/rete-p2p.js`) |
| chi li fa incontrare | il server | il broker pubblico di PeerJS: solo la presentazione, le carte vanno dirette |
| link del tavolo | `/s/CODICE` | `#/s/CODICE` (Pages non sa rispondere a un percorso inventato) |
| QR | lo disegna il server | lo disegna il browser (`public/vendor/qrcode.min.js`) |
| albo, tavoli pubblici | ci sono | non ci sono: nessuno tiene i conti |

**Cosa cambia per chi gioca.** Contro i bot non cambia niente. In quattro:
chi apre il tavolo è il tavolo, e deve restare nella pagina — se la chiude o
ricarica, la partita finisce. Su certe reti (NAT chiusi, alcune reti aziendali
o certi operatori mobili) il collegamento diretto può non riuscire: lì serve
un server, e `server.js` è ancora la strada buona.

Il deploy è automatico: `.github/workflows/pages.yml` costruisce e pubblica a
ogni push su `main`. Da accendere una volta in **Settings → Pages → Source:
GitHub Actions**. Attenzione: **Pages su un repo privato è a pagamento**.

`tools/costruisci-sito.mjs` lascia fuori apposta `public/assets/mazzo/`: le
scansioni di un mazzo in commercio si usano in casa, non si pubblicano.

---

## Struttura

```
server.js               un solo processo: statici, WebSocket, stanze, QR, albo
src/mazzo.js            le 40 carte, punti e forza (condiviso con il client)
src/cuticchiune.js      il motore puro: mano, presa, singhe, fine partita
src/bot.js              «u Cumpari»: il bot, con le soglie tarate a tavolino
src/stanza.js           posti, token, fasi, timer, bot per i caduti, chat
src/albo.js             l'albo in JSON (solo col server: vuole il disco)
src/servitore.js        le stanze e lo smistamento dei messaggi, senza sapere di che rete si tratta
public/index.html       home · lobby · partita · veli (fine mano, fine partita, prese, regole, albo) · chat
public/css/base.css     i token (calce, cobalto, limone, terracotta), i font, i bottoni, le carte
public/css/home.css     il sole, il ventaglio, i fregi
public/css/lobby.css    il biglietto d'invito e il tavolino con le sedie
public/css/tavolo.css   la tovaglia cobalto col bordo di maioliche, le targhe, il ventaglio in mano
public/css/pannelli.css fine mano, fine partita, prese, regole, albo, chat
public/js/app.js        il filo: rete → schermata giusta
public/js/ui.js         selettori, toast, veli, memoria locale
public/js/rete.js       WebSocket con riconnessione e orologio del server
public/js/rete-locale.js  il tavolo dentro la pagina: canale finto, stesso servitore
public/js/rete-p2p.js     il sito statico: chi apre e' il tavolo, gli altri arrivano in WebRTC
public/js/ambiente.js     col server o da soli: link, indirizzi, /api o niente
public/js/qr.js           il QR, dal server o disegnato qui
public/vendor/            roba di altri tenuta in casa: PeerJS e qrcode-generator (MIT)
public/js/carte.js      i 40 SVG + il mazzo fotografico opzionale
public/js/tavolo.js     disegna lo stato e muove le carte (distribuzione, giocata, presa)
public/js/schermi/      home.js · lobby.js · partita.js
public/js/audio.js      i suoni, sintetizzati
tools/test-cuticchiune.mjs   regole, bot, mille mani, partite intere
tools/test-stanza.mjs        server vero + 4 client WebSocket: partita completa, riconnessione, spettatori, pubblico
tools/screenshot.mjs         Chromium: fotografa home/lobby/tavolo/fine mano/fine partita e gioca una partita intera
tools/test-locale.mjs        il tavolo dentro la pagina: partita intera contro i bot, due sessioni sullo stesso servitore
tools/costruisci-sito.mjs    costruisce sito/ per GitHub Pages
tools/importa-mazzo.mjs      dai png di un mazzo vero alle 40 carte di public/assets/mazzo/
tools/scarica-font.mjs       i font OFL, una volta sola
```

```
npm test             motore + stanza + tavolo nella pagina
npm run sito         costruisce il sito statico in sito/
npm run mazzo        importa un mazzo fotografico (vedi sotto)
npm run screenshot   le foto in screenshot/ (serve Chromium: CHROMIUM=/percorso se non è quello di Playwright)
```

---

## Protocollo (per chi vuole farci un altro client)

Client → server: `crea {nome, pubblica?}` · `entra {codice, nome, token?}` ·
`pubblica {nome}` · `siedi {posto}` · `alzati` · `pronto {valore}` ·
`bot {posto?, on?}` · `caccia {id}` · `opzioni {opzioni}` · `avvia` ·
`gioca {carta}` · `avanti` · `rivincita` · `attesa` · `chat {testo}` ·
`emote {id}` · `ping {c}`.

Server → client: `benvenuto {token, id, codice, link, emote}` · `stato {…}`
(la foto completa, con la **sola** mano del destinatario in chiaro) ·
`evento {tipo: distribuzione | carta | presa | fine-mano | fine-partita |
tempo-scaduto | chat | emote}` · `errore {msg, fatale?}` · `pong`.

Una carta è una stringa: seme (`D` `C` `S` `B`) + valore (`1`…`10`), es. `D5`.
