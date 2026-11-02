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
    const proof = res.explain.forged.proofRefs;
    // Usuwamy karty, które obalają fałszywkę (tabela albo pobyt widziany gdzie indziej).
    const broken = { ...c, cards: c.cards.filter((k) => !proof.includes(k.id)) };
    const res2 = solveCase(broken);
    assert.notEqual(res2.consistent.length, 1, `${iso}: sprawa bez obalenia nadal ma jedno rozwiązanie`);
    checked++;
  }
  assert.equal(checked, 60);
});

test('solver wykrywa zepsutą sprawę: drugi sprzeczny dowód daje zero rozwiązań', () => {
  for (const iso of dates.slice(0, 40)) {
    const c = buildDailyCase(iso);
    const supplied = c.cards.filter((k) => k.kind === 'supplied' && k.id !== c.solution.forged && k.id !== c.lieCard);
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

// Niezależna od solvera kontrola: prawdziwe pobyty każdej osoby muszą dać się pogodzić.
function staysOf(c) {
  const travel = {};
  const owners = {};
  const films = [];
  for (const k of c.cards) {
    for (const f of k.facts || []) {
      if (f.t === 'travel') travel[f.place] = f.min;
      if (f.t === 'cardowner') owners[`${f.place}#${f.card}`] = f.who;
      if (f.t === 'screening') films.push(f);
    }
  }
  const stays = {};
  const add = (who, st) => { (stays[who] = stays[who] || []).push(st); };
  for (const k of c.cards) {
    for (const f of k.facts || []) {
      if (f.t === 'seen') add(f.who, { place: f.place, from: f.from, to: f.to, card: k.id });
      if (f.t === 'cardlog') add(owners[`${f.place}#${f.card}`], { place: f.place, from: f.from, to: f.to, card: k.id });
      if (f.t === 'claim' && k.id !== c.solution.forged && k.id !== c.lieCard) {
        if (f.kind === 'train') {
          add(f.who, { place: 'dworzec', from: f.time, to: f.time, card: k.id });
          add(f.who, { place: '@away', from: f.time + 1, to: 1e9, card: k.id });
        } else if (f.kind === 'cinema') {
          const sc = films.find((x) => x.film === f.film && x.start === f.start);
          add(f.who, { place: 'kino', from: f.start, to: f.start + sc.dur, card: k.id });
        } else if (f.kind === 'delivery') {
          for (const st of f.stops) add(f.who, { place: st.place, from: st.time, to: st.time, card: k.id });
        } else {
          add(f.who, { place: f.place || f.stop, from: f.time, to: f.time, card: k.id });
        }
      }
    }
  }
  return { stays, travel };
}

test('prawdziwe pobyty każdej osoby są fizycznie spójne (osobna implementacja)', () => {
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    const { stays, travel } = staysOf(c);
    for (const [who, list] of Object.entries(stays)) {
      if (!c.suspects.some((s) => s.id === who)) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.place === b.place) continue;
          const overlap = a.from <= b.to && b.from <= a.to;
          assert.ok(!overlap, `${iso}: ${who} jest w dwóch miejscach naraz (${a.card}, ${b.card})`);
          const [x, y] = a.to < b.from ? [a, b] : [b, a];
          if (travel[x.place] === undefined || travel[y.place] === undefined) continue;
          assert.ok(y.from - x.to >= Math.abs(travel[x.place] - travel[y.place]), `${iso}: ${who} nie zdąży z ${x.card} do ${y.card}`);
        }
      }
    }
    // Sprawca: żaden jego prawdziwy pobyt nie wyklucza obecności na miejscu zbrodni.
    for (const st of stays[c.solution.culprit] || []) {
      if (travel[st.place] === undefined) continue;
      assert.ok(!(st.from < c.window.to + travel[st.place] && st.to > c.window.from - travel[st.place]), `${iso}: prawdziwy pobyt sprawcy ${st.card} daje mu alibi`);
    }
  }
});

test('każdy z 7 rodzajów dowodów pojawia się jako fałszywka i jako prawdziwy dowód', () => {
  const forged = {};
  const real = {};
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    for (const k of c.cards) {
      for (const f of k.facts || []) {
        if (f.t !== 'claim') continue;
        const bucket = k.id === c.solution.forged ? forged : real;
        bucket[f.kind] = (bucket[f.kind] || 0) + 1;
      }
    }
  }
  for (const kind of ['train', 'receipt', 'photo', 'cinema', 'delivery', 'parking', 'bus']) {
    assert.ok((forged[kind] || 0) >= dates.length * 0.02, `fałszywka ${kind}: ${forged[kind] || 0}`);
    assert.ok((real[kind] || 0) >= dates.length * 0.05, `prawdziwy ${kind}: ${real[kind] || 0}`);
  }
});

test('od piątku: dwa fałszywe dowody, a kłamca ma inne potwierdzone alibi', () => {
  let lieDays = 0;
  let lieAlibi = 0;
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    const res = solveCase(c);
    const contradicted = res.evaluated.filter((e) => e.contradicted).map((e) => e.card);
    if (difficultyForDate(iso) >= 5) {
      lieDays++;
      assert.equal(c.innocentLie, true, iso);
      // Od piątku fałszywka sprawcy zgadza się z tabelami (zdradza ją fizyczna niemożliwość),
      // więc jedyną sprzecznością z tabelą jest kłamstwo niewinnej osoby: pułapka.
      assert.deepEqual(contradicted, [c.lieCard], `${iso}: sprzeczne ${contradicted}`);
      assert.equal(res.explain.forged.physical, true, iso);
      const lie = res.explain.lies[0];
      assert.equal(lie.card, c.lieCard, iso);
      assert.notEqual(lie.who, c.solution.culprit, iso);
      // Kłamca ma inne, potwierdzone alibi (z kart prawdziwych), więc kłamstwo nie może być fałszywką.
      assert.ok(lie.cleared.length > 0, `${iso}: kłamca bez innego alibi`);
      assert.ok(lie.cleared.every((it) => !it.refs.includes(c.lieCard) && !it.refs.includes(c.solution.forged)), iso);
      if (lie.alibi) lieAlibi++;
    } else {
      // pn–wt: fałszywka kłóci się z tabelą; śr–czw: nic nie kłóci się z tabelą (zdradza ją fizyczna niemożliwość).
      assert.equal(contradicted.length, difficultyForDate(iso) <= 2 ? 1 : 0, `${iso}: sprzeczne ${contradicted}`);
      assert.ok(!c.innocentLie, iso);
    }
  }
  assert.ok(lieDays > 100);
  // Zwykle kłamstwo wygląda na alibi (brak skrótu „jedyny dowód bez alibi to kłamstwo”), ale nie zawsze.
  assert.ok(lieAlibi > lieDays * 0.5 && lieAlibi < lieDays * 0.9, `kłamstw z alibi: ${lieAlibi}/${lieDays}`);
});

test('od środy fałszywkę obala fizyczna niemożliwość, a w weekend alibi krzyżowe', () => {
  for (const iso of dates) {
    const d = difficultyForDate(iso);
    if (d < 3) continue;
    const c = buildDailyCase(iso);
    const res = solveCase(c);
    const f = res.explain.forged;
    assert.equal(f.physical, true, iso);
    assert.ok(f.proofRefs.length >= 1, iso);
    if (d >= 6) {
      assert.equal(c.forgeMode, 'cross', iso);
      assert.notEqual(f.about, c.solution.culprit, `${iso}: alibi krzyżowe dotyczy innej osoby`);
      const card = c.cards.find((k) => k.id === c.solution.forged);
      assert.ok(card.facts.find((x) => x.t === 'claim').with?.length === 1, `${iso}: wspólny dowód`);
    } else {
      assert.equal(c.forgeMode, 'self', iso);
      assert.equal(f.about, c.solution.culprit, iso);
    }
  }
});

test('głębokość dowodu: pn–wt co najmniej 2 karty, śr–czw co najmniej 3, pt–nd co najmniej 5', () => {
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    const d = difficultyForDate(iso);
    const min = d <= 2 ? 2 : d <= 4 ? 3 : 5;
    assert.ok(c.depth >= min, `${iso}: głębokość ${c.depth} < ${min}`);
  }
});

test('w weekend kartę obalającą trzeba zlecić (zapieczętowane nagranie albo rejestr)', () => {
  let n = 0;
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    if (c.forgeMode !== 'cross') continue;
    n++;
    const res = solveCase(c);
    const proof = res.explain.forged.proofRefs.map((id) => c.cards.find((k) => k.id === id));
    const nonTravel = proof.filter((k) => !(k.facts || []).some((f) => f.t === 'travel'));
    assert.ok(nonTravel.length > 0 && nonTravel.every((k) => k.action), `${iso}: ${nonTravel.map((k) => k.id)}`);
  }
  assert.ok(n > 50);
});
