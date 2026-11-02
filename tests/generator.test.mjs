// Testy generatora i solvera: `npm test` (albo `node --test tests/`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyCase, buildPracticeCase, difficultyForDate } from '../js/generator.js';
import { solveCase, qualityIssues } from '../js/solver.js';
import { addDays } from '../js/time.js';
import { TEAM_DESKS } from '../js/data.js';

const DAYS = 400;
const dates = Array.from({ length: DAYS }, (_, i) => addDays('2026-11-02', i));

test(`każda sprawa dnia (${DAYS} dni) ma dokładnie jedno rozwiązanie i przechodzi kontrolę jakości`, () => {
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    const res = solveCase(c);
    assert.equal(res.consistent.length, 1, `${iso}: ${res.consistent.length} rozwiązań`);
    assert.deepEqual(res.unique, c.solution, `${iso}: solver znalazł inne rozwiązanie`);
    assert.deepEqual(qualityIssues(c, res), [], iso);
  }
});

test('sprawy treningowe z różnych kodów też są poprawne', () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 300; i++) {
    const code = [0, 1, 2, 3].map((k) => alphabet[(i * 7 + k * 13 + i * k) % alphabet.length]).join('');
    const c = buildPracticeCase(code);
    assert.deepEqual(qualityIssues(c), [], code);
  }
});

test('ta sama data daje identyczną sprawę (deterministyczność)', () => {
  for (const iso of dates.slice(0, 20)) {
    assert.equal(JSON.stringify(buildDailyCase(iso)), JSON.stringify(buildDailyCase(iso)));
  }
});

test('trudność: poniedziałek 1, niedziela 7, a w niedzielę jest więcej kart', () => {
  assert.equal(difficultyForDate('2026-11-02'), 1); // poniedziałek
  assert.equal(difficultyForDate('2026-11-08'), 7); // niedziela
  const avg = (wd) => {
    const list = dates.filter((d) => difficultyForDate(d) === wd).map((d) => buildDailyCase(d).cards.length);
    return list.reduce((a, b) => a + b, 0) / list.length;
  };
  assert.ok(avg(7) > avg(1) + 8, `niedziela ${avg(7)} vs poniedziałek ${avg(1)}`);
});

test('solver wykrywa zepsutą sprawę: bez sprzeczności nie ma jednego rozwiązania', () => {
  let checked = 0;
  for (const iso of dates.slice(0, 60)) {
    const c = buildDailyCase(iso);
    const res = solveCase(c);
    const forged = res.evaluated.find((e) => e.card === c.solution.forged);
    // Usuwamy karty, które obalają fałszywkę. Wtedy wszystkie dowody wyglądają na prawdziwe.
    const broken = { ...c, cards: c.cards.filter((k) => !forged.refs.includes(k.id) || k.id === forged.card) };
    const res2 = solveCase(broken);
    assert.notEqual(res2.consistent.length, 1, `${iso}: sprawa bez obalenia nadal ma jedno rozwiązanie`);
    checked++;
  }
  assert.equal(checked, 60);
});

test('solver wykrywa zepsutą sprawę: drugi sprzeczny dowód daje zero rozwiązań', () => {
  for (const iso of dates.slice(0, 40)) {
    const c = buildDailyCase(iso);
    const supplied = c.cards.filter((k) => k.kind === 'supplied' && k.id !== c.solution.forged);
    const victim = supplied[0];
    // Przestawiamy czas na dowodzie niewinnej osoby na 3:33 w nocy, co psuje jego zgodność z faktami.
    const broken = structuredClone(c);
    const card = broken.cards.find((k) => k.id === victim.id);
    const claim = card.facts.find((f) => f.t === 'claim');
    if (claim.kind === 'cinema') claim.start = 3 * 60 + 33;
    else if (claim.kind === 'delivery') claim.stops[0].no = 9999;
    else if (claim.kind === 'train') claim.no = 'X 0000';
    else if (claim.kind === 'photo') { claim.sky = 'day'; claim.time = 23 * 60 + 50; }
    else claim.time = 3 * 60 + 33;
    const res = solveCase(broken);
    assert.equal(res.consistent.length, 0, `${iso}: ${victim.id} (${claim.kind})`);
  }
});

test('przy każdej wielkości ekipy fałszywka i jej obalenie są u różnych graczy', () => {
  for (const iso of dates.slice(0, 100)) {
    const c = buildDailyCase(iso);
    const res = solveCase(c);
    const forged = res.explain.forged;
    const deskOf = (id) => c.cards.find((k) => k.id === id).desk;
    for (const size of [2, 3, 4, 5]) {
      const seat = (d) => TEAM_DESKS[size].findIndex((ds) => ds.includes(d));
      const fSeat = seat(deskOf(forged.card));
      assert.ok(forged.refs.filter((r) => r !== forged.card).some((r) => seat(deskOf(r)) !== fSeat), `${iso} / ${size}`);
    }
  }
});

test('teksty nie zawierają niewypełnionych pól ani „undefined”', () => {
  for (const iso of dates.slice(0, 120)) {
    const c = buildDailyCase(iso);
    const all = [c.title, c.intro, ...c.suspects.map((s) => s.alibi), ...c.cards.flatMap((k) => [k.title, k.sub, ...k.lines])].join('\n');
    assert.ok(!/undefined|NaN|\$\{|null/.test(all), `${iso}: ${all.match(/.*(undefined|NaN|\$\{|null).*/)?.[0]}`);
  }
});
