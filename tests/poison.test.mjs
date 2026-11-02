// Testy otrucia (generator v10, część B): okno-chwila, granice okna z kart, jednoznaczność, rozkład.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyCase, buildPracticeCase, buildCase, dailyCrimeType, practiceCrimeType, POISON_FROM,
} from '../js/generator.js';
import { solveCase, qualityIssues, proofDepth, windowStepNeeded } from '../js/solver.js';
import { crimeOf, rulesFor, rulesShortFor, reasonsFor, RULE_MOMENT, shownWindows } from '../js/data.js';
import { buildEpilogue } from '../js/epilogue.js';
import { addDays } from '../js/time.js';

const dates = Array.from({ length: 400 }, (_, i) => addDays('2026-11-02', i));
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = Array.from({ length: 600 }, (_, i) => [0, 1, 2, 3].map((k) => alphabet[Math.floor(i / 32 ** k) % 32]).join(''));
const poisonDays = dates.filter((d) => dailyCrimeType(d) === 'poison');
const poisonCodes = codes.filter((c) => practiceCrimeType(c) === 'poison').slice(0, 70);
const cache = new Map();
const caseOf = (key) => {
  if (!cache.has(key)) cache.set(key, /^\d{4}-/.test(key) ? buildDailyCase(key) : buildPracticeCase(key));
  return cache.get(key);
};
const poisonCases = () => [...poisonDays.slice(0, 20), ...poisonCodes].map(caseOf);
const factsOf = (c, t) => c.cards.flatMap((k) => (k.facts || []).filter((f) => f.t === t));
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

/**
 * Najmniejsza sprawa do sprawdzania pojęcia alibi: czasy dotarcia z kart (bez planu miasta), okno z kart
 * o wymianie wody i z opinii lekarza, świadkowie widzą podejrzanych. Liczby jak w przykładzie z RULE_MOMENT.
 */
function miniCase(seen, crimeType = 'poison') {
  const cards = [
    { id: 'M1', desk: 'M', kind: 'official', title: 'Czasy dotarcia', lines: [], facts: [
      { t: 'travel', place: 'kawiarnia', min: 10 }, { t: 'travel', place: 'pizzeria', min: 25 }, { t: 'travel', place: 'rynek', min: 15 },
    ] },
    { id: 'R1', desk: 'R', kind: 'official', title: 'Zeszyt obsługi', lines: [], facts: [{ t: 'carafe', time: hm('19:20'), kind: 'set' }, { t: 'carafe', time: hm('19:40'), kind: 'visit' }] },
    { id: 'S1', desk: 'S', kind: 'witness', title: 'Zeznanie obsługi', lines: [], facts: [{ t: 'refill', time: hm('19:40') }] },
    { id: 'S2', desk: 'S', kind: 'witness', title: 'Zeznanie poszkodowanego', lines: [], facts: [{ t: 'glass', time: hm('20:20') }, { t: 'glass', time: hm('20:25') }] },
    { id: 'D1', desk: 'D', kind: 'official', title: 'Opinia lekarza', lines: [], facts: [{ t: 'dosed', time: hm('20:20') }] },
    ...seen.map(([who, place, from, to], i) => ({ id: `S${10 + i}`, desk: 'S', kind: 'witness', title: 'Zeznanie', lines: [], facts: [{ t: 'seen', who, place, from: hm(from), to: hm(to ?? from) }] })),
  ];
  return {
    ...(crimeType ? { crimeType } : {}),
    crimeDate: { iso: '2026-11-17', weekday: 2 },
    window: { from: hm('19:40'), to: hm('20:20') },
    suspects: ['s1', 's2', 's3', 's4'].map((id) => ({ id, full: id, f: false })),
    cards,
    innocentLie: false,
  };
}

test('otrucie: co druga środa od 18.11.2026 i ok. 1/3 spraw treningowych; reszta bez zmian', () => {
  assert.equal(dailyCrimeType(POISON_FROM), 'poison');
  assert.deepEqual(poisonDays.slice(0, 4), ['2026-11-18', '2026-12-02', '2026-12-16', '2026-12-30']);
  assert.equal(dailyCrimeType('2026-11-25'), 'theft');
  assert.equal(dailyCrimeType('2026-11-11'), 'theft');
  assert.equal(dailyCrimeType('2026-11-02'), 'theft');
  const share = (t) => codes.filter((c) => practiceCrimeType(c) === t).length / codes.length;
  assert.ok(share('poison') > 0.27 && share('poison') < 0.4, `otruć w treningu: ${share('poison')}`);
  assert.ok(share('theft') > 0.27 && share('theft') < 0.4, `kradzieży w treningu: ${share('theft')}`);
  for (const d of poisonDays.slice(0, 6)) assert.equal(crimeOf(caseOf(d)).id, 'poison', d);
  for (const c of poisonCodes.slice(0, 10)) assert.equal(caseOf(c).crimeType, 'poison', c);
});

test('okno-chwila: krótki pobyt gdzie indziej nie oczyszcza, długi albo daleki tak (przykład z zasady)', () => {
  // Okno 19:40–20:20. Kawiarnia 10 min od miejsca zdarzenia, pizzeria 25 min.
  const c = miniCase([
    ['s1', 'kawiarnia', '20:00'], // paragon z 20:00: można było dosypać o 19:45 i o 19:55 być w kawiarni
    ['s2', 'kawiarnia', '19:45', '20:15'], // 19:45 − 10 = 19:35 < 19:40, 20:15 + 10 = 20:25 > 20:20
    ['s3', 'pizzeria', '20:00'], // 20:00 − 25 = 19:35, 20:00 + 25 = 20:25
    ['s4', 'kawiarnia', '19:51', '20:15'], // 19:51 − 10 = 19:41: można było dosypać o 19:40 i zdążyć
  ]);
  const res = solveCase(c);
  assert.deepEqual(res.windows, [{ from: hm('19:40'), to: hm('20:20') }]);
  assert.equal(res.neutralClears.has('s1'), false, 'krótki pobyt w kawiarni nie daje alibi');
  assert.equal(res.neutralClears.has('s2'), true, 'pobyt 19:45–20:15 w kawiarni daje alibi');
  assert.equal(res.neutralClears.has('s3'), true, 'jedna godzina z daleka daje alibi');
  assert.equal(res.neutralClears.has('s4'), false, 'pobyt od 19:51 zostawia chwilę na początku okna');
  // Ta sama sprawa jako kradzież (sprawca w środku przez całe okno): ten sam paragon z 20:00 daje alibi.
  const theft = solveCase(miniCase([['s1', 'kawiarnia', '20:00']], null));
  assert.equal(theft.neutralClears.has('s1'), true);
  // Zasada opisuje dokładnie ten przykład.
  for (const x of ['19:40–20:20', '10 min', '20:00', '19:45 do 20:15', '25 min', 'X − d', 'Y + d']) assert.ok(RULE_MOMENT.includes(x), x);
  assert.equal(rulesFor(caseOf(poisonDays[0]))[1], RULE_MOMENT);
});

test('okno-chwila: bez karty z granicą okna zostaje kilka okien (dolna: wejścia obsługi, górna: szklanki)', () => {
  const noRefill = miniCase([]);
  noRefill.cards = noRefill.cards.filter((k) => k.id !== 'S1');
  assert.deepEqual(solveCase(noRefill).windows.map((w) => [w.from, w.to]), [[hm('19:20'), hm('20:20')], [hm('19:40'), hm('20:20')]]);
  const noDoctor = miniCase([]);
  noDoctor.cards = noDoctor.cards.filter((k) => k.id !== 'D1');
  assert.deepEqual(solveCase(noDoctor).windows.map((w) => [w.from, w.to]), [[hm('19:40'), hm('20:20')], [hm('19:40'), hm('20:25')]]);
});

test('otrucie: jedno rozwiązanie i kontrola jakości (dzienne, treningowe, trudność 1–7)', () => {
  let n = 0;
  for (const c of poisonCases()) {
    const res = solveCase(c);
    const tag = `${c.date}/${c.code}`;
    assert.equal(c.crimeType, 'poison', tag);
    assert.equal(res.consistent.length, 1, `${tag}: ${res.consistent.length}`);
    assert.deepEqual(res.unique, c.solution, tag);
    assert.deepEqual(qualityIssues(c, res), [], tag);
    n++;
  }
  for (let d = 1; d <= 7; d++) {
    for (let i = 0; i < 5; i++) {
      const c = buildCase({ seed: `test-poison:${d}:${i}`, date: '2026-05-14', difficulty: d, kind: 'practice', crimeType: 'poison' });
      assert.equal(c.crimeType, 'poison');
      assert.deepEqual(qualityIssues(c), [], `trudność ${d} #${i}`);
      if (d <= 2) assert.equal(c.forgeMode, 'table');
      else assert.equal(c.forgeMode, 'self', `trudność ${d}: otrucie bez alibi krzyżowego`);
      n++;
    }
  }
  assert.ok(n > 100);
});

test('otrucie: granice okna z kart; bez zeznania obsługi albo bez opinii lekarza co najmniej dwie hipotezy', () => {
  for (const c of poisonCases()) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    assert.equal(res.windows.length, 1, tag);
    assert.deepEqual({ from: res.windows[0].from, to: res.windows[0].to }, c.window, tag);
    assert.equal(factsOf(c, 'refill')[0].time, c.window.from, tag);
    assert.equal(factsOf(c, 'dosed')[0].time, c.window.to, tag);
    // Solver nie czyta c.window.
    const res2 = solveCase({ ...c, window: { from: 0, to: 1 } });
    assert.deepEqual(res2.unique, c.solution, tag);
    for (const t of ['refill', 'dosed']) {
      const cut = { ...c, cards: c.cards.filter((k) => !(k.facts || []).some((f) => f.t === t)) };
      const r = solveCase(cut);
      assert.ok(r.windows.length >= 2, `${tag}: bez ${t} okien ${r.windows.length}`);
      assert.ok(r.consistent.length >= 2, `${tag}: bez ${t} hipotez ${r.consistent.length}`);
      // Każda z tych hipotez wskazuje tego samego sprawcę i tę samą fałszywkę (okno nie zmienia rozwiązania).
      assert.ok(r.consistent.every((h) => h.culprit === c.solution.culprit && h.forged === c.solution.forged), tag);
    }
    // Krok „okno” jest w wyjaśnieniu i w głębokości dowodu.
    const w = res.explain.window;
    assert.ok(w && w.moment && w.reason && !/undefined|NaN/.test(w.reason), tag);
    assert.equal(w.refs.length, 2, tag);
    assert.equal(windowStepNeeded(c, res), false, tag);
    assert.equal(c.depth, proofDepth(res, c), tag);
    assert.equal(c.depth, proofDepth({ ...res, explain: { ...res.explain, window: null } }), tag);
    assert.equal(c.carafe.visits.length, 2, tag);
    assert.equal(c.carafe.glasses.length, 2, tag);
    assert.ok(c.carafe.visits.includes(c.window.from), tag);
    assert.ok(c.carafe.glasses.includes(c.window.to), tag);
    assert.deepEqual(shownWindows(c), [{ from: c.carafe.set, to: c.carafe.glasses[1] }], tag);
    // Zeznanie barmana (jeśli jest) nie mówi samo, że nie ma znaczenia.
    assert.ok(!c.cards.some((k) => /nikt nie zaniósł/.test(k.lines.join(' '))), tag);
  }
});

test('otrucie: granic okna nie widać z kolejności godzin (wymiana wody i szklanka ze środkiem raz pierwsze, raz drugie)', () => {
  const cs = [...poisonCases(), ...Array.from({ length: 120 }, (_, i) => buildCase({ seed: `t-order:${i}`, date: addDays('2026-02-01', i), difficulty: 3 + (i % 5), kind: 'practice', crimeType: 'poison' }))];
  const firstVisit = cs.filter((c) => c.window.from === c.carafe.visits[0]).length / cs.length;
  const firstGlass = cs.filter((c) => c.window.to === c.carafe.glasses[0]).length / cs.length;
  assert.ok(firstVisit > 0.35 && firstVisit < 0.65, `wymiana wody przy pierwszym wejściu: ${firstVisit}`);
  assert.ok(firstGlass > 0.35 && firstGlass < 0.65, `środek w pierwszej szklance: ${firstGlass}`);
  const bar = cs.filter((c) => c.cards.some((k) => k.sub === 'barman' || k.sub === 'barmanka')).length / cs.length;
  assert.ok(bar > 0.3 && bar < 0.7, `zeznanie barmana w ${bar} spraw`);
  // Ulotka nie podaje czasu działania (nie przeczy opinii lekarza), a zaśnięcie wypada 10–28 min po szklance ze środkiem.
  for (const c of cs) {
    assert.ok(!c.cards.some((k) => /Działa po/.test(k.lines.join(' '))), c.code || c.date);
    assert.ok(c.carafe.asleep - c.window.to >= 10 && c.carafe.asleep - c.window.to <= 28, c.code || c.date);
  }
});

test('otrucie: niewinni mają alibi na całe okno, fałszywka też, a sprawcę często widać krótko w oknie', () => {
  let n = 0;
  const kinds = {};
  for (const c of poisonCases()) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    const forged = res.evaluated.find((e) => e.card === c.solution.forged);
    assert.ok(res.givesAlibi(forged), `${tag}: fałszywka nie osłania okna`);
    kinds[forged.kind] = (kinds[forged.kind] || 0) + 1;
    for (const s of c.suspects) {
      if (s.id === c.solution.culprit) continue;
      const items = res.explain.suspects[s.id];
      assert.ok(items.length, `${tag}: ${s.full} bez alibi`);
      // Każde alibi niewinnego wyklucza każdą chwilę okna (pojęcie alibi z okna-chwili).
      for (const it of items) {
        // Brak cechy ze śladu (sprawy z cechą) wyklucza osobę bez pobytu z godziną.
        if (it.type === 'trait') continue;
        assert.ok(it.from - it.travel < c.window.from && (it.away || it.to + it.travel > c.window.to), `${tag}: ${res.describeClear(it)}`);
      }
    }
    n++;
  }
  assert.ok(Object.keys(kinds).length >= 4, `rodzaje fałszywek: ${JSON.stringify(kinds)}`);
});

// Regresja (krytyczne): krótki pobyt w oknie zdradzał sprawcę (ok. 18% sprawców wobec 3% niewinnych).
test('otrucie: krótki pobyt w oknie (bez alibi) mają sprawcy i niewinni tak samo często', () => {
  const cs = [...poisonCases(), ...Array.from({ length: 330 }, (_, i) => buildCase({ seed: `t-short:${i}`, date: addDays('2026-02-01', i), difficulty: 3 + (i % 5), kind: 'practice', crimeType: 'poison' }))];
  const at = { c: [0, 0], i: [0, 0] };
  for (const c of cs) {
    const res = solveCase(c);
    const W1 = c.window.from;
    const W2 = c.window.to;
    for (const s of c.suspects) {
      const clears = res.neutralClears.get(s.id) || [];
      // Pobyt jednej godziny z karty niezależnej (świadek, kamera), który nie daje alibi, w oknie albo do 5 min obok.
      const short = (lo, hi) => factsOf(c, 'seen').some((f) => f.who === s.id && f.from === f.to && f.from >= lo && f.from <= hi
        && !clears.some((x) => x.place === f.place && x.from === f.from));
      const k = s.id === c.solution.culprit ? 'c' : 'i';
      at[k][0] += short(W1, W2) ? 1 : 0;
      at[k][1] += short(W1 - 5, W2 + 5) ? 1 : 0;
    }
  }
  const pc = at.c.map((x) => x / cs.length);
  const pi = at.i.map((x) => x / (4 * cs.length));
  assert.ok(Math.abs(pc[0] - pi[0]) < 0.05, `w oknie: sprawca ${pc[0].toFixed(3)}, niewinni ${pi[0].toFixed(3)}`);
  assert.ok(Math.abs(pc[1] - pi[1]) < 0.05, `okno ± 5 min: sprawca ${pc[1].toFixed(3)}, niewinni ${pi[1].toFixed(3)}`);
  assert.ok(pc[0] > 0.08, `sprawca w oknie: ${pc[0]}`);
});

// Regresja (krytyczne): alibi z dwóch doręczeń liczonych razem było niezgodne z zasadą chwili.
test('okno-chwila: dwa pobyty z jednej karty nie składają się w alibi; fałszywka daje alibi jednym pobytem', () => {
  // Okno 19:40–20:20; kurier: ul. Kwiatowa o 19:50 (dojście 20 min: 19:50 + 20 = 20:10, nie po końcu okna)
  // i ul. Polna o 20:15 (dojście 20 min: 20:15 − 20 = 19:55, nie przed początkiem). Razem wykluczałyby każdą
  // chwilę okna, ale według zasady żaden pobyt sam alibi nie daje.
  const c = miniCase([]);
  c.cards[0].facts.push({ t: 'travel', place: 'kwiatowa', min: 20 }, { t: 'travel', place: 'polna', min: 20 });
  c.cards.push(
    { id: 'D2', desk: 'D', kind: 'supplied', by: 's1', title: 'Aplikacja kurierska', lines: [], facts: [{ t: 'claim', kind: 'delivery', who: 's1', stops: [{ place: 'kwiatowa', time: hm('19:50'), no: 3 }, { place: 'polna', time: hm('20:15'), no: 5 }] }] },
    { id: 'M2', desk: 'M', kind: 'official', title: 'Numeracja', lines: [], facts: [{ t: 'street', street: 'kwiatowa', parity: 'all', max: 40 }, { t: 'street', street: 'polna', parity: 'all', max: 40 }] },
  );
  const res = solveCase(c);
  const e = res.evaluated.find((x) => x.card === 'D2');
  assert.equal(e.contradicted, false);
  assert.equal(res.givesAlibi(e), false, 'dwa doręczenia razem nie dają alibi');
  // W wygenerowanych sprawach każda pozycja „alibi” to jeden pobyt spełniający wzór z zasady.
  for (const g of poisonCases()) {
    const r = solveCase(g);
    const f = r.evaluated.find((x) => x.card === g.solution.forged);
    const one = f.sightings.some((x) => { const d = r.travel.get(x.place)?.min; return d !== undefined && x.from - d < g.window.from && (x.away || x.to + d > g.window.to); });
    assert.ok(one, `${g.date}/${g.code}: fałszywka nie daje alibi jednym pobytem`);
  }
});

test('otrucie: teksty bez kradzieży, ciepłe zakończenie, jawne karty okna, bez pustych pól', () => {
  for (const c of poisonCases().slice(0, 50)) {
    const res = solveCase(c);
    const tag = `${c.date}/${c.code}`;
    const ep = buildEpilogue(c, res, 'solved');
    const fail = buildEpilogue(c, res, 'failed');
    const all = [
      c.title, c.intro, ...c.suspects.map((s) => `${s.role} ${s.alibi}`), ...c.cards.flatMap((k) => [k.title, k.sub, ...k.lines]),
      ...rulesFor(c), ...rulesShortFor(c).map((x) => x[1]), ...reasonsFor(c, 'cinema').map((x) => x[1]),
      ...ep.paragraphs, ep.quote, ...fail.paragraphs, res.explain.window.reason, res.explain.forged.reason,
    ].join('\n');
    assert.ok(!/kradzie|ukrad|skradzion|złodziej|łup|minutnik|podpal/i.test(all), `${tag}: ${all.match(/.*(kradzie|ukrad|skradzion|złodziej|łup|minutnik|podpal).*/i)?.[0]}`);
    assert.ok(!/undefined|NaN|\$\{|null/.test(all), `${tag}: ${all.match(/.*(undefined|NaN|\$\{|null).*/)?.[0]}`);
    assert.match(ep.paragraphs.join(' '), /Nikt nie ucierpiał/, tag);
    assert.match(c.intro, /nikt nie ucierpiał/, tag);
    assert.doesNotMatch(c.intro, /\d{4}\. O /, `${tag}: zdanie bez orzeczenia`);
    assert.match(c.intro, /środek nasenny/, tag);
    assert.equal(c.stolen, undefined, tag);
    const win = c.cards.filter((k) => (k.facts || []).some((f) => ['carafe', 'refill', 'glass', 'dosed'].includes(f.t)));
    assert.equal(win.length, 4, tag);
    assert.ok(win.every((k) => !k.action), `${tag}: karta okna w kopercie`);
    assert.ok(rulesShortFor(c).some(([, r]) => /Krótki pobyt/.test(r)), tag);
  }
});
