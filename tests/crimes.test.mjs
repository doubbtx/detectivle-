// Testy ramy „inna zbrodnia” (generator v10): rodzaj zbrodni, podpalenie z minutnikiem, zgodność wstecz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDailyCase, buildPracticeCase, buildCase, dailyCrimeType, practiceCrimeType, ARSON_FROM, POISON_FROM, GENERATOR_VERSION,
  dailyTraitVariant,
} from '../js/generator.js';
import { solveCase, qualityIssues, proofDepth, windowStepNeeded } from '../js/solver.js';
import { crimeOf, rulesFor, rulesShortFor, reasonsFor, RULES } from '../js/data.js';
import { buildEpilogue } from '../js/epilogue.js';
import { addDays, weekdayOf, daysBetween } from '../js/time.js';

const dates = Array.from({ length: 400 }, (_, i) => addDays('2026-11-02', i));
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = Array.from({ length: 600 }, (_, i) => [0, 1, 2, 3].map((k) => alphabet[Math.floor(i / 32 ** k) % 32]).join(''));
const arsonDays = dates.filter((d) => dailyCrimeType(d) === 'arson');
const arsonCodes = codes.filter((c) => practiceCrimeType(c) === 'arson').slice(0, 80);
const cache = new Map();
const caseOf = (key) => {
  if (!cache.has(key)) cache.set(key, /^\d{4}-/.test(key) ? buildDailyCase(key) : buildPracticeCase(key));
  return cache.get(key);
};
const arsonCases = () => [...arsonDays.slice(0, 40), ...arsonCodes].map(caseOf);
const factsOf = (c, t) => c.cards.flatMap((k) => (k.facts || []).filter((f) => f.t === t));

test('rodzaj zbrodni: czwartki od 12.11.2026 to podpalenia, co druga środa od 18.11 otrucia, reszta dni kradzieże; w treningu po ok. 1/3', () => {
  assert.equal(GENERATOR_VERSION, 11);
  for (const d of dates) {
    const want = weekdayOf(d) === 4 && d >= ARSON_FROM ? 'arson'
      : weekdayOf(d) === 3 && d >= POISON_FROM && daysBetween(POISON_FROM, d) % 14 === 0 ? 'poison' : 'theft';
    assert.equal(dailyCrimeType(d), want, d);
  }
  assert.equal(dailyCrimeType('2026-11-05'), 'theft'); // pierwszy czwartek jeszcze z kradzieżą
  assert.equal(dailyCrimeType('2026-11-12'), 'arson');
  for (const d of dates.slice(0, 60)) assert.equal(crimeOf(caseOf(d)).id, dailyCrimeType(d), d);
  const share = codes.filter((c) => practiceCrimeType(c) === 'arson').length / codes.length;
  assert.ok(share > 0.27 && share < 0.4, `podpaleń w treningu: ${share}`);
  for (const code of codes.slice(0, 40)) assert.equal(crimeOf(caseOf(code)).id, practiceCrimeType(code), code);
});

test('sprawa dnia 2026-11-02 i inne dni z kradzieżą (bez cechy) są takie same jak przed v10 (poza numerem wersji i odciskiem)', () => {
  // Skróty treści (bez generatorVersion i fingerprint) policzone na generatorze v9 przed dodaniem podpaleń.
  // Uwaga: opublikowany plik cases/2026-11-02.json powstał na generatorze v8 i jest inną sprawą niż ta z v9/v10.
  // W grze 2.11 chroni więc plik (gra czyta go, gdy przechodzi usable() z js/cases.js: ten sam odcisk i to samo
  // jedyne rozwiązanie u obecnego solvera; sprawdza to tests/cases.test.mjs), a ten test pilnuje tylko, żeby
  // generator dla dni z kradzieżą się nie zmienił.
  // Od v11 około 35% dni od środy do niedzieli ma moduł cech (np. 2026-11-07), więc te dni się zmieniły; skrót
  // soboty 2026-11-21 (dzień bez cechy) policzony na generatorze v10.
  assert.ok(dailyTraitVariant('2026-11-07'), '2026-11-07 to od v11 dzień z cechą');
  const want = { '2026-11-02': '763b51a384b726bc', '2026-11-05': 'b5fe898159b7f478', '2026-11-21': '513e255eb55e708d' };
  for (const iso of Object.keys(want)) assert.equal(dailyTraitVariant(iso), null, iso);
  for (const [iso, hash] of Object.entries(want)) {
    const { generatorVersion, fingerprint, ...rest } = buildDailyCase(iso);
    void generatorVersion; void fingerprint;
    assert.equal(createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16), hash, iso);
    assert.equal('crimeType' in rest, false, `${iso}: kradzież nie dostaje nowego pola`);
  }
});

test('stare sprawy bez pola crimeType działają jako kradzieże (pliki z cases/)', () => {
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'cases');
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  assert.ok(files.length > 0);
  // Pliki bez pola crimeType (np. opublikowane przed v10) muszą działać jako kradzież;
  // pliki z innym rodzajem zbrodni sprawdza tylko jednoznaczność.
  const theft = [];
  for (const f of files) {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (c.crimeType !== undefined) {
      assert.notEqual(c.crimeType, 'theft', `${f}: kradzież nie zapisuje pola crimeType`);
      assert.deepEqual(solveCase(c).unique, c.solution, f);
      continue;
    }
    theft.push(f);
    assert.equal(crimeOf(c).id, 'theft', f);
    assert.equal(rulesFor(c)[0], RULES[0], f);
    assert.match(rulesShortFor(c)[0][1], /od otwarcia do zamknięcia drzwi/, f);
    const res = solveCase(c);
    assert.deepEqual(res.unique, c.solution, f);
    assert.equal(res.windows.length, 1, f);
    assert.equal(res.explain.window, null, f);
    const e = buildEpilogue(c, res, 'solved');
    assert.ok(e.paragraphs.join(' ').includes('odnaleziono'), f);
  }
  assert.ok(theft.includes('2026-11-02.json'), 'opublikowana sprawa 2026-11-02 jest kradzieżą bez pola crimeType');
});

test('podpalenie: każda sprawa ma jedno rozwiązanie i przechodzi kontrolę jakości (dzienne i treningowe, trudność 1–7)', () => {
  let n = 0;
  for (const c of arsonCases()) {
    const res = solveCase(c);
    assert.equal(res.consistent.length, 1, `${c.date}/${c.code}: ${res.consistent.length}`);
    assert.deepEqual(res.unique, c.solution);
    assert.deepEqual(qualityIssues(c, res), [], `${c.date}/${c.code}`);
    n++;
  }
  for (let d = 1; d <= 7; d++) {
    for (let i = 0; i < 6; i++) {
      const c = buildCase({ seed: `test-arson:${d}:${i}`, date: '2026-05-14', difficulty: d, kind: 'practice', crimeType: 'arson' });
      assert.equal(c.crimeType, 'arson');
      assert.deepEqual(qualityIssues(c), [], `trudność ${d} #${i}`);
      n++;
    }
  }
  assert.ok(n > 100);
});

test('podpalenie: solver sam wybiera okno, a bez opinii biegłego zostają co najmniej dwie hipotezy', () => {
  for (const c of arsonCases()) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    assert.equal(res.windows.length, 1, tag);
    assert.deepEqual({ from: res.windows[0].from, to: res.windows[0].to }, c.window, tag);
    // Solver nie czyta c.window: z podmienionym polem wychodzi to samo okno i rozwiązanie.
    const res2 = solveCase({ ...c, window: { from: 0, to: 1 } });
    assert.deepEqual(res2.unique, c.solution, tag);
    assert.equal(res2.windows[0].from, c.window.from, tag);
    // Bez karty biegłego (nastaw minutnika) oba otwarcia są możliwe.
    const noTimer = { ...c, cards: c.cards.filter((k) => !factsOf({ cards: [k] }, 'timer').length) };
    const res3 = solveCase(noTimer);
    assert.ok(res3.consistent.length >= 2, `${tag}: bez biegłego ${res3.consistent.length} hipotez`);
    assert.equal(res3.windows.length, 2, tag);
    // Hipotezy w dwóch różnych oknach (a nie dwie w jednym).
    assert.equal(new Set(res3.consistent.map((h) => `${h.window.from}-${h.window.to}`)).size, 2, tag);
    // Krok „wybór okna” jest w wyjaśnieniu i w głębokości dowodu.
    const w = res.explain.window;
    assert.ok(w && w.reason && !/undefined|NaN/.test(w.reason), tag);
    const timerCard = c.cards.find((k) => factsOf({ cards: [k] }, 'timer').length);
    assert.ok(w.refs.includes(timerCard.id), tag);
    // Okno nie zmienia werdyktu (w obu otwarciach to samo rozwiązanie), więc krok „wybór okna” nie podbija
    // głębokości dowodu.
    assert.equal(windowStepNeeded(c, res), false, tag);
    assert.equal(c.depth, proofDepth(res, c), tag);
    assert.equal(c.depth, proofDepth({ ...res, explain: { ...res.explain, window: null } }), tag);
  }
});

test('podpalenie: dwa otwarcia przed zapłonem, w widełki minutnika trafia dokładnie jedno, raz pierwsze, raz drugie', () => {
  const pos = [0, 0];
  for (const c of arsonCases()) {
    const tag = `${c.date}/${c.code}`;
    assert.equal(c.openings.length, 2, tag);
    const [o1, o2] = c.openings;
    assert.ok(o1.to < o2.from && o2.to < c.ignition, tag);
    const tm = factsOf(c, 'timer')[0];
    assert.equal(factsOf(c, 'ignition')[0].time, c.ignition, tag);
    const a = c.ignition - tm.max;
    const b = c.ignition - tm.min;
    const hit = c.openings.filter((o) => o.to >= a && o.from <= b);
    assert.equal(hit.length, 1, tag);
    assert.deepEqual(hit[0], c.window, tag);
    const other = c.openings.find((o) => o !== hit[0]);
    assert.ok(other.to <= a - 3 || other.from >= b + 3, `${tag}: drugie otwarcie za blisko widełek`);
    pos[c.openings.indexOf(hit[0])]++;
  }
  const share = pos[0] / (pos[0] + pos[1]);
  assert.ok(share > 0.3 && share < 0.7, `rozstrzygające pierwsze: ${pos[0]}, drugie: ${pos[1]}`);
});

test('podpalenie: kilka osób ma prawdziwe alibi na samą godzinę zapłonu, sprawca tylko czasem', () => {
  let culprit = 0;
  let inno = 0;
  let n = 0;
  for (const c of arsonCases()) {
    const owners = {};
    for (const f of factsOf(c, 'cardowner')) owners[`${f.place}#${f.card}`] = f.who;
    const near = new Set();
    for (const f of [...factsOf(c, 'seen'), ...factsOf(c, 'cardlog')]) {
      const who = f.t === 'seen' ? f.who : owners[`${f.place}#${f.card}`];
      if (who && f.from <= c.ignition + 10 && f.to >= c.ignition - 10) near.add(who);
    }
    if (near.has(c.solution.culprit)) culprit++;
    inno += [...near].filter((x) => x !== c.solution.culprit).length;
    n++;
  }
  assert.ok(inno / n >= 1.5, `niewinni z alibi na zapłon: ${(inno / n).toFixed(2)} na sprawę`);
  assert.ok(culprit / n > 0.2 && culprit / n < 0.75, `sprawca z alibi na zapłon: ${culprit}/${n}`);
});

test('podpalenie: teksty bez kradzieży, z ciepłym zakończeniem i bez pustych pól', () => {
  for (const c of arsonCases().slice(0, 60)) {
    const res = solveCase(c);
    const tag = `${c.date}/${c.code}`;
    const ep = buildEpilogue(c, res, 'solved');
    const fail = buildEpilogue(c, res, 'failed');
    const all = [
      c.title, c.intro, ...c.suspects.map((s) => s.alibi), ...c.cards.flatMap((k) => [k.title, k.sub, ...k.lines]),
      ...rulesFor(c), ...rulesShortFor(c).map((x) => x[1]), ...reasonsFor(c, 'cinema').map((x) => x[1]),
      ...ep.paragraphs, ep.quote, ...fail.paragraphs, res.explain.window.reason, res.explain.forged.reason,
    ].join('\n');
    assert.ok(!/kradzie|ukrad|skradzion|złodziej|łup/i.test(all), `${tag}: ${all.match(/.*(kradzie|ukrad|skradzion|złodziej|łup).*/i)?.[0]}`);
    assert.ok(!/undefined|NaN|\$\{|null/.test(all), `${tag}: ${all.match(/.*(undefined|NaN|\$\{|null).*/)?.[0]}`);
    assert.match(ep.paragraphs.join(' '), /Nikt nie ucierpiał/, tag);
    assert.match(c.intro, /nikt nie ucierpiał/, tag);
    assert.equal(c.stolen, undefined, tag);
    // Karty okna (rejestr alarmu, czujka, opinia biegłego) są jawne, bez koperty.
    const win = c.cards.filter((k) => (k.facts || []).some((f) => ['opening', 'ignition', 'timer'].includes(f.t)));
    assert.equal(win.length, 3, tag);
    assert.ok(win.every((k) => !k.action), tag);
    assert.ok(c.cards.some((k) => k.kind === 'witness' && k.title === `Zeznanie: ${c.owner.full}`), `${tag}: brak zeznania właściciela`);
  }
});

test('podpalenie na trudności 1–2: fałszywka tabelowa, rozstrzygające otwarcie w całości w widełkach', () => {
  for (const d of [1, 2]) {
    for (let i = 0; i < 10; i++) {
      const c = buildCase({ seed: `test-easy:${d}:${i}`, date: '2026-05-14', difficulty: d, kind: 'practice', crimeType: 'arson' });
      const res = solveCase(c);
      assert.equal(c.forgeMode, 'table');
      assert.ok(res.explain.forged.reasonCodes.length && !res.explain.forged.physical, `trudność ${d} #${i}`);
      const tm = factsOf(c, 'timer')[0];
      assert.ok(c.window.from >= c.ignition - tm.max && c.window.to <= c.ignition - tm.min, `trudność ${d} #${i}: okno w widełkach`);
    }
  }
});
