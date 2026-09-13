// PUBBLICA IL SITO — node tools/pubblica-sito.mjs
//
// Costruisce sito/ e lo spinge sul branch `gh-pages`, che e' quello che
// GitHub Pages serve. Il branch contiene SOLO il sito compilato: una fotografia
// sola, riscritta ogni volta (niente storia da trascinarsi dietro).
//
// Il modo automatico sarebbe tools/pages.yml.esempio, da rimettere in
// .github/workflows/ — ma quel file si puo' pushare solo con un token che ha
// anche lo scope `workflow`.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITO = path.join(RADICE, 'sito');
const LAVORO = path.join(RADICE, '.gh-pages');   // cartella di lavoro usa e getta
const BRANCH = 'gh-pages';
const git = (...a) => execFileSync('git', a, { cwd: RADICE, stdio: 'inherit' });

execFileSync('node', [path.join(RADICE, 'tools', 'costruisci-sito.mjs')], { stdio: 'inherit' });

fs.rmSync(LAVORO, { recursive: true, force: true });
try { git('worktree', 'remove', '--force', LAVORO); } catch {}
git('worktree', 'add', '--force', '--detach', LAVORO);

// il branch riparte pulito ogni volta: via tutto tranne .git
for (const v of fs.readdirSync(LAVORO)) {
  if (v !== '.git') fs.rmSync(path.join(LAVORO, v), { recursive: true, force: true });
}
fs.cpSync(SITO, LAVORO, { recursive: true });

const gitLi = (...a) => execFileSync('git', a, { cwd: LAVORO, stdio: 'inherit' });
// il branch locale della volta scorsa non serve a niente: la storia vera e'
// quella su origin, e qui ogni pubblicazione riparte da zero
try { git('branch', '-D', BRANCH); } catch {}
gitLi('checkout', '--orphan', BRANCH);
gitLi('add', '-A');
gitLi('-c', 'user.name=Fedetrain', '-c', 'user.email=132400671+Fedetrain@users.noreply.github.com',
  'commit', '-q', '-m', `sito: ${new Date().toISOString().slice(0, 10)}`);
gitLi('push', '-f', 'origin', `${BRANCH}:${BRANCH}`);

git('worktree', 'remove', '--force', LAVORO);
console.log('\nsito pubblicato su gh-pages → https://fedetrain.github.io/cuticchiune/');
