// L'ALBO — chi si è salvato, chi ha perso, quante singhe. Un file JSON,
// scritto a fine partita. I bot non entrano nell'albo.

import fs from 'node:fs';
import path from 'node:path';

export class Albo {
  constructor(file) {
    this.file = file;
    this.dati = { partite: [], giocatori: {} };
    try { this.dati = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  }

  registra(riassunto) {
    const { classifica, esito, mani, codice, finitaIl } = riassunto;
    this.dati.partite.push({ codice, finitaIl, mani, motivo: esito?.motivo, classifica: classifica.map(r => ({ nome: r.nome, singhe: r.singhe, perde: r.perde, franco: r.franco, bot: r.bot })) });
    if (this.dati.partite.length > 500) this.dati.partite.shift();
    for (const r of classifica) {
      if (r.bot || !r.nome) continue;
      const g = this.dati.giocatori[r.nome] || { partite: 0, salvezze: 0, perdite: 0, singhe: 0, franchi: 0 };
      g.partite++; g.singhe += r.singhe;
      if (r.perde) g.perdite++; else g.salvezze++;
      if (r.franco) g.franchi++;
      this.dati.giocatori[r.nome] = g;
    }
    this.salva();
  }

  salva() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.dati, null, 1), 'utf8');
    } catch (e) { console.warn(`⚠ albo non salvato: ${e.message}`); }
  }

  classifica() {
    return Object.entries(this.dati.giocatori)
      .map(([nome, g]) => ({ nome, ...g, media: g.partite ? +(g.singhe / g.partite).toFixed(1) : 0 }))
      .sort((a, b) => b.salvezze - a.salvezze || a.media - b.media || b.partite - a.partite)
      .slice(0, 30);
  }
}
