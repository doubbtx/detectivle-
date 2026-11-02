// Śledztwo w terminalu (do testów na ślepo): pokazuje tylko odkryte karty,
// zapieczętowane otwiera na żądanie i liczy godziny śledztwa jak gra (tryb solo).
//
//   node scripts/investigate.mjs 2026-11-06 --session /tmp/s.json            # akta i lista kart
//   node scripts/investigate.mjs 2026-11-06 --session /tmp/s.json --open R4  # zleć czynność
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDailyCase, buildPracticeCase } from '../js/generator.js';
import { investigationBudget } from '../js/solver.js';
import { rulesFor, DESK_DEFS } from '../js/data.js';
import { fmt } from '../js/time.js';

const args = process.argv.slice(2);
const arg = args[0];
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const sessionPath = opt('--session');
if (!arg || !sessionPath) {
  console.log('Użycie: node scripts/investigate.mjs <data|kod> --session <plik.json> [--open ID ...]');
  process.exit(1);
}
const frozen = new URL(`../cases/${arg}.json`, import.meta.url);
const isDate = /^\d{4}-\d{2}-\d{2}$/.test(arg);
const c = isDate && existsSync(frozen) ? JSON.parse(readFileSync(frozen, 'utf8')) : isDate ? buildDailyCase(arg) : buildPracticeCase(arg);
const session = existsSync(sessionPath) ? JSON.parse(readFileSync(sessionPath, 'utf8')) : { unlocked: [] };
const name = (id) => c.suspects.find((s) => s.id === id)?.full;
const budget = investigationBudget(c, ['D', 'S', 'M', 'Z', 'R']);
const used = () => c.cards.filter((k) => k.action && session.unlocked.includes(k.id)).reduce((a, k) => a + k.action.cost, 0);
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const printCard = (k) => {
  console.log(`\n[${k.id}] ${k.title}${k.sub ? ` — ${k.sub}` : ''}${k.by ? ` [dostarczył(a): ${name(k.by)}]` : ''}`);
  for (const l of k.lines) console.log(`    ${l}`);
};

const toOpen = args.flatMap((a, i) => (a === '--open' ? [args[i + 1]] : []));
if (toOpen.length) {
  for (const id of toOpen) {
    const k = c.cards.find((x) => x.id === id);
    if (!k) { console.log(`Nie ma karty ${id}.`); continue; }
    if (!k.action) { console.log(`Karta ${id} nie jest zapieczętowana.`); printCard(k); continue; }
    if (!session.unlocked.includes(id)) session.unlocked.push(id);
    console.log(`Zlecono: ${k.action.label} (${k.action.cost} min).`);
    printCard(k);
  }
  writeFileSync(sessionPath, JSON.stringify(session));
  console.log(`\nGodziny śledztwa: ${hm(used())} z ${hm(budget)} h${used() > budget ? ' (NADGODZINY)' : ''}`);
  process.exit(0);
}

console.log(`# ${c.title}`);
console.log(`Trudność: ${c.difficulty}/7 · kradzież: ${c.crimeDate.label}\n`);
console.log(c.intro);
console.log(`Okno: ${fmt(c.window.from)}–${fmt(c.window.to)}\n`);
console.log('## Zasady');
rulesFor(c).forEach((r, i) => console.log(`${i + 1}. ${r}`));
if (c.innocentLie) console.log('UWAGA: w tej sprawie kłamią dwie osoby. Tylko jedno kłamstwo daje alibi na czas kradzieży.');
console.log('\n## Podejrzani');
for (const s of c.suspects) console.log(`- ${s.full} (${s.role}): ${s.alibi}`);
for (const d of DESK_DEFS) {
  console.log(`\n## Biurko: ${d.name}`);
  for (const k of c.cards.filter((x) => x.desk === d.id)) {
    if (k.action && !session.unlocked.includes(k.id)) console.log(`\n[${k.id}] ${k.title}${k.sub ? ` — ${k.sub}` : ''}  (ZAPIECZĘTOWANE: ${k.action.label}, ${k.action.cost} min)`);
    else printCard(k);
  }
}
console.log(`\nGodziny śledztwa: ${hm(used())} z ${hm(budget)} h. Każde rozpoczęte pół godziny nadgodzin to +1 min do czasu.`);
