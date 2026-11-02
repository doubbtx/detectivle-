// Wypisuje sprawę jako tekst. Użycie:
//   node scripts/print-case.mjs 2026-11-08            (sprawa dnia)
//   node scripts/print-case.mjs K7Q2                  (trening)
//   dodaj --solution, żeby zobaczyć rozwiązanie
import { buildDailyCase, buildPracticeCase } from '../js/generator.js';
import { solveCase } from '../js/solver.js';
import { fmt } from '../js/time.js';
import { RULES } from '../js/data.js';

const arg = process.argv[2] || '2026-11-02';
const showSolution = process.argv.includes('--solution');
import { existsSync, readFileSync } from 'node:fs';
const frozen = new URL(`../cases/${arg}.json`, import.meta.url);
const isDate = /^\d{4}-\d{2}-\d{2}$/.test(arg);
const c = isDate && existsSync(frozen) ? JSON.parse(readFileSync(frozen, 'utf8')) : isDate ? buildDailyCase(arg) : buildPracticeCase(arg);
const name = (id) => c.suspects.find((s) => s.id === id)?.full;

console.log(`# ${c.title}${c.number ? ` (sprawa #${c.number} · ${c.fingerprint})` : ` (trening ${c.code})`}`);
console.log(`Trudność: ${c.difficulty}/7 · zbrodnia: ${c.crimeDate.label}`);
console.log(`\n${c.intro}`);
console.log(`Okno: ${fmt(c.window.from)}–${fmt(c.window.to)}\n`);
console.log('## Zasady');
RULES.forEach((r, i) => console.log(`${i + 1}. ${r}`));
console.log('');
console.log('## Podejrzani');
for (const s of c.suspects) console.log(`- ${s.full} (${s.role}): ${s.alibi}`);
for (const d of c.desks) {
  console.log(`\n## Biurko: ${d.name}`);
  for (const k of c.cards.filter((x) => x.desk === d.id)) {
    const by = k.by ? ` [dostarczył(a): ${name(k.by)}]` : '';
    console.log(`\n[${k.id}] ${k.title}${k.sub ? ` — ${k.sub}` : ''}${by}`);
    for (const l of k.lines) console.log(`    ${l}`);
  }
}
if (showSolution) {
  const r = solveCase(c);
  console.log(`\n## Rozwiązanie: ${name(c.solution.culprit)}, fałszywka ${c.solution.forged}`);
  console.log(`Powód: ${r.explain.forged.reason}`);
  for (const [id, items] of Object.entries(r.explain.suspects)) {
    console.log(`- ${name(id)}: ${items.map((i) => `${r.describeClear(i)} [${i.refs.join(', ')}]`).join(' | ')}`);
  }
}
