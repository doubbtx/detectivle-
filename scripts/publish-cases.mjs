// Zapisuje sprawy dnia do plików cases/RRRR-MM-DD.json i aktualizuje cases/manifest.json.
// Już opublikowanych plików NIE nadpisuje (chyba że podasz --force, np. przed startem gry).
//
//   node scripts/publish-cases.mjs                 # od sprawy nr 1 do dziś + 60 dni
//   node scripts/publish-cases.mjs --days 90       # do dziś + 90 dni
//   node scripts/publish-cases.mjs --force --from 2026-12-01   # przegeneruj przyszłe dni z zakresu
//   node scripts/publish-cases.mjs --force --i-know            # także dzisiejsze i minione (tylko przed startem!)
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDailyCase, EPOCH, GENERATOR_VERSION } from '../js/generator.js';
import { addDays, localTodayIso, daysBetween } from '../js/time.js';
import { solveCase, qualityIssues } from '../js/solver.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dir = join(root, 'cases');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const force = args.includes('--force');
const iKnow = args.includes('--i-know');
const from = opt('--from', addDays(EPOCH, 1));
const days = Number(opt('--days', 60));
const to = opt('--to', addDays(localTodayIso(), days));

mkdirSync(dir, { recursive: true });
const manifestPath = join(dir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { files: {} };
if (force) {
  // --force przegenerowuje tylko dni z zakresu. Dni do dziś włącznie wymagają --i-know,
  // bo gracze mogli już je widzieć.
  if (from <= localTodayIso() && !iKnow) {
    console.error('Zakres obejmuje dzisiejsze albo minione sprawy. Dodaj --i-know, jeśli na pewno chcesz je zmienić (np. przed startem gry).');
    process.exit(1);
  }
  for (const f of readdirSync(dir)) {
    const iso = f.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && iso >= from && iso <= to) {
      unlinkSync(join(dir, f));
      delete manifest.files[iso];
    }
  }
}

let written = 0;
let kept = 0;
for (let i = 0; i <= daysBetween(from, to); i++) {
  const iso = addDays(from, i);
  const file = join(dir, `${iso}.json`);
  if (existsSync(file)) {
    kept++;
    continue;
  }
  const c = buildDailyCase(iso);
  const issues = qualityIssues(c, solveCase(c));
  if (issues.length) throw new Error(`${iso}: ${issues.join('; ')}`);
  const body = JSON.stringify(c);
  writeFileSync(file, body);
  manifest.files[iso] = { sha256: createHash('sha256').update(body).digest('hex'), fingerprint: c.fingerprint, generatorVersion: GENERATOR_VERSION };
  written++;
}
manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`Zapisano ${written} nowych spraw, zostawiono ${kept} istniejących (${from} … ${to}).`);
