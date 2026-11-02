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
  // Plan miasta: niezależnie od solvera liczymy przecznice z oznaczeń pól („J7”).
  const cell = (label) => ['ABCDEFGHIJKLMNOPQRST'.indexOf(label[0]), Number(label.slice(1))];
  const grid = c.cards.flatMap((k) => k.facts || []).find((f) => f.t === 'grid');
  const cells = {};
  for (const k of c.cards) {
    for (const f of k.facts || []) {
      if (f.t === 'travel') travel[f.place] = f.min;
      if (f.t === 'pos') {
        cells[f.place] = cell(f.cell);
        const [sx, sy] = cell(grid.scene);
        travel[f.place] = (Math.abs(cells[f.place][0] - sx) + Math.abs(cells[f.place][1] - sy)) * grid.perCell;
      }
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
  const between = (a, b) => (grid && cells[a] && cells[b]
    ? (Math.abs(cells[a][0] - cells[b][0]) + Math.abs(cells[a][1] - cells[b][1])) * grid.perCell
    : Math.abs(travel[a] - travel[b]));
  return { stays, travel, between };
}

test('prawdziwe pobyty każdej osoby są fizycznie spójne (osobna implementacja)', () => {
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    const { stays, travel, between } = staysOf(c);
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
          assert.ok(y.from - x.to >= between(x.place, y.place), `${iso}: ${who} nie zdąży z ${x.card} do ${y.card}`);
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
  let weekendCross = 0;
  let weekendSelf = 0;
  for (const iso of dates) {
    const d = difficultyForDate(iso);
    if (d < 3) continue;
    const c = buildDailyCase(iso);
    const res = solveCase(c);
    const f = res.explain.forged;
    assert.equal(f.physical, true, iso);
    assert.ok(f.proofRefs.length >= 1, iso);
    if (d >= 6) {
      // Weekend: zawsze dwa wspólne dowody; fałszywką jest jeden z nich (alibi krzyżowe) albo zwykły dowód sprawcy.
      assert.equal(res.evaluated.filter((e) => e.with.length).length, 2, `${iso}: wspólne dowody`);
      const card = c.cards.find((k) => k.id === c.solution.forged);
      const joint = card.facts.find((x) => x.t === 'claim').with?.length === 1;
      if (c.forgeMode === 'cross') {
        weekendCross++;
        assert.ok(joint, `${iso}: wspólny dowód`);
        assert.notEqual(f.about, c.solution.culprit, `${iso}: alibi krzyżowe dotyczy innej osoby`);
      } else {
        weekendSelf++;
        assert.equal(c.forgeMode, 'self', iso);
        assert.ok(!joint, `${iso}: zwykły dowód`);
        assert.equal(f.about, c.solution.culprit, iso);
      }
    } else {
      assert.equal(c.forgeMode, 'self', iso);
      assert.equal(f.about, c.solution.culprit, iso);
    }
  }
  // Około 40% weekendów bez alibi krzyżowego: z akt nie widać, który z trzech dowodów jest fałszywy.
  const share = weekendSelf / (weekendSelf + weekendCross);
  assert.ok(share > 0.25 && share < 0.55, `weekend bez alibi krzyżowego: ${weekendSelf}/${weekendSelf + weekendCross}`);
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
    const nonTravel = proof.filter((k) => !(k.facts || []).some((f) => f.t === 'travel' || f.t === 'grid'));
    assert.ok(nonTravel.length > 0 && nonTravel.every((k) => k.action), `${iso}: ${nonTravel.map((k) => k.id)}`);
  }
  assert.ok(n > 50);
});

test('etykieta nagrania podaje okno czasowe, w którym leży zapisana chwila', () => {
  const toMin = (h, m) => Number(h) * 60 + Number(m);
  let n = 0;
  for (const iso of dates.slice(0, 120)) {
    const c = buildDailyCase(iso);
    for (const k of c.cards.filter((x) => x.title === 'Monitoring miejski' && x.action)) {
      const t = /(\d{1,2}):(\d{2})/.exec(k.lines[1]);
      const w = /(\d{1,2}):(\d{2})–(\d{1,2}):(\d{2})$/.exec(k.action.label);
      assert.ok(t && w, `${iso} ${k.id}: ${k.action.label}`);
      const tm = toMin(t[1], t[2]);
      assert.ok(toMin(w[1], w[2]) <= tm && tm <= toMin(w[3], w[4]), `${iso} ${k.id}`);
      n++;
    }
  }
  assert.ok(n > 50);
});

test('alibi krzyżowe: dwa symetryczne wspólne dowody, a kłamca nie jest osobą z fałszywki', () => {
  let n = 0;
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    if (c.forgeMode !== 'cross') continue;
    n++;
    const res = solveCase(c);
    const joint = res.evaluated.filter((e) => e.with.length);
    assert.equal(joint.length, 2, `${iso}: wspólnych dowodów ${joint.length}`);
    const forged = joint.find((e) => e.card === c.solution.forged);
    const decoy = joint.find((e) => e !== forged);
    assert.ok(forged && decoy, iso);
    // Właściciel prawdziwego wspólnego dowodu nie ma innego dowodu z alibi (tak jak sprawca).
    const alibiCards = (who) => res.evaluated.filter((e) => e.who === who && e.card !== c.lieCard && e.sightings.some((st) => {
      const tr = res.travel.get(st.place);
      return tr && st.from < c.window.to + tr.min && st.to > c.window.from - tr.min;
    })).length;
    assert.equal(alibiCards(decoy.who), alibiCards(forged.who), `${iso}: ${alibiCards(decoy.who)} vs ${alibiCards(forged.who)}`);
    // Partnerzy obu wspólnych dowodów nie mają własnych dowodów, a kłamca nie jest żadnym z nich.
    for (const p of [forged.with[0], decoy.with[0]]) {
      assert.equal(res.evaluated.filter((e) => e.who === p).length, 0, `${iso}: partner ${p} ma własny dowód`);
      assert.notEqual(res.explain.lies[0].who, p, `${iso}: kłamca to partner wspólnego dowodu`);
    }
  }
  assert.ok(n > 50);
});

test('w raporcie zawsze co najmniej 4 dowody od podejrzanych do wyboru', () => {
  for (const iso of dates) {
    const c = buildDailyCase(iso);
    const n = c.cards.filter((k) => k.kind === 'supplied').length;
    assert.ok(n >= 4, `${iso}: tylko ${n} dowody`);
  }
});

// --- Szczegóły sprawdzane w tabelach (generator v9) -------------------------------------------
const NEW_WAYS = ['receipt-price', 'receipt-card', 'receipt-number', 'photo-show', 'photo-clock', 'bus-vehicle'];
const WAY_TABLE = { 'receipt-price': 'pricelist', 'receipt-card': 'bankcard', 'receipt-number': 'fiscal', 'photo-show': 'shows', 'photo-clock': 'shows', 'bus-vehicle': 'vehicle' };
const built = new Map();
const caseOf = (iso) => {
  if (!built.has(iso)) built.set(iso, buildDailyCase(iso));
  return built.get(iso);
};
const factsOf = (c, t) => c.cards.flatMap((k) => (k.facts || []).filter((f) => f.t === t));

test('nowe sposoby obalenia: każdy występuje w fałszywkach pn–wt i w kłamstwach, razem ok. 40% fałszywek tabelowych', () => {
  const forged = {};
  const lies = {};
  let table = 0;
  for (const iso of dates) {
    const c = caseOf(iso);
    const res = solveCase(c);
    if (difficultyForDate(iso) <= 2) {
      table++;
      const code = res.explain.forged.reasonCodes[0];
      forged[code] = (forged[code] || 0) + 1;
      // Obalenie wskazuje dokładnie tę tabelę, która ma ten szczegół.
      if (WAY_TABLE[code]) {
        const proof = res.explain.forged.proofRefs.map((id) => c.cards.find((k) => k.id === id));
        assert.ok(proof.length === 1 && proof[0].facts.some((f) => f.t === WAY_TABLE[code]), `${iso}: ${code} obala ${proof.map((k) => k.title)}`);
      }
    }
    for (const lie of res.explain.lies) lies[lie.reasonCodes[0]] = (lies[lie.reasonCodes[0]] || 0) + 1;
  }
  for (const code of NEW_WAYS) assert.ok((forged[code] || 0) >= 4, `fałszywka ${code}: ${forged[code] || 0}`);
  for (const code of NEW_WAYS.filter((x) => x !== 'bus-vehicle')) assert.ok((lies[code] || 0) >= 2, `kłamstwo ${code}: ${lies[code] || 0}`);
  const fresh = NEW_WAYS.reduce((a, k) => a + (forged[k] || 0), 0);
  assert.ok(fresh >= table * 0.33 && fresh <= table * 0.55, `nowe sposoby: ${fresh}/${table}`);
  // Dotychczasowe sposoby dalej się pojawiają.
  for (const code of ['closed-early', 'train-day', 'no-screening', 'zone-ended', 'no-number', 'photo-dry', 'bus-no-departure']) {
    assert.ok((forged[code] || 0) >= 1, `stary sposób ${code}: ${forged[code] || 0}`);
  }
});

test('szczegół jest na każdej karcie danego rodzaju (także prawdziwej), a suma paragonu zgadza się z pozycjami', () => {
  for (const iso of dates.slice(0, 200)) {
    const c = caseOf(iso);
    for (const k of c.cards.filter((x) => x.kind === 'supplied')) {
      const cl = k.facts.find((f) => f.t === 'claim');
      if (cl.kind === 'receipt') {
        assert.ok(k.lines.some((l) => /godz\. \d{1,2}:\d{2} · nr \d{4}$/.test(l)), `${iso} ${k.id}: brak numeru paragonu`);
        assert.ok(k.lines.some((l) => /^płatność( kartą …\d{4}|: GOTÓWKA| dzielona, 2 karty: .*…\d{4}.*…\d{4})/.test(l)), `${iso} ${k.id}: brak płatności`);
        const money = (x) => Math.round(Number(x.replace(',', '.')) * 100);
        const itemLines = k.lines.filter((l) => /\d+,\d{2}$/.test(l) && !l.startsWith('SUMA'));
        const sum = itemLines.reduce((a, l) => a + money(l.match(/(\d+,\d{2})$/)[1]), 0);
        assert.equal(money(k.lines.find((l) => l.startsWith('SUMA')).match(/(\d+,\d{2})$/)[1]), sum, `${iso} ${k.id}: suma`);
        assert.equal(itemLines.length, cl.items.length, `${iso} ${k.id}`);
      }
      if (cl.kind === 'photo' && cl.place === 'plac') assert.ok(typeof cl.show === 'boolean' && k.lines.some((l) => /pokaz/.test(l)), `${iso} ${k.id}: brak opisu pokazu`);
      if (cl.kind === 'photo' && cl.place === 'rynek') assert.ok(cl.clock && k.lines.some((l) => /ratusz/.test(l)), `${iso} ${k.id}: brak opisu zegara`);
      if (cl.kind === 'bus') assert.ok(k.lines[k.lines.length - 1] === `wóz nr ${cl.car}`, `${iso} ${k.id}: brak numeru wozu`);
    }
  }
});

test('tabele ze szczegółami pojawiają się też w sprawach, w których nie są potrzebne', () => {
  const noise = {};
  for (const iso of dates) {
    const c = caseOf(iso);
    const res = solveCase(c);
    const used = new Set([res.explain.forged, ...res.explain.lies].flatMap((x) => x.reasonCodes).map((code) => WAY_TABLE[code]).filter(Boolean));
    for (const t of ['pricelist', 'bankcard', 'fiscal', 'shows', 'vehicle']) {
      if (!used.has(t) && factsOf(c, t).length) noise[t] = (noise[t] || 0) + 1;
    }
  }
  for (const t of ['pricelist', 'bankcard', 'fiscal', 'shows', 'vehicle']) assert.ok((noise[t] || 0) >= dates.length * 0.25, `${t} jako szum: ${noise[t] || 0}`);
});

test('raport kas obejmuje co najmniej dwa lokale, a cennik i bank więcej osób i lokali niż sama fałszywka', () => {
  for (const iso of dates.slice(0, 200)) {
    const c = caseOf(iso);
    const fiscal = factsOf(c, 'fiscal');
    if (fiscal.length) assert.ok(new Set(fiscal.map((f) => f.place)).size >= 2, `${iso}: raport kas`);
    const lists = factsOf(c, 'pricelist');
    if (lists.length) assert.ok(lists.length >= 3, `${iso}: cennik ${lists.length} lokali`);
    const bank = factsOf(c, 'bankcard');
    if (bank.length) {
      assert.ok(bank.length >= 3 && bank.some((f) => !f.who), `${iso}: bank`);
      assert.equal(new Set(bank.map((f) => f.no)).size, bank.length, `${iso}: powtórzona końcówka karty`);
    }
  }
});

test('solver obala każdy szczegół niezależnie od generatora (podmiana jednego pola w prawdziwym dowodzie)', () => {
  const hits = {};
  for (const iso of dates.slice(0, 250)) {
    const c = caseOf(iso);
    const res0 = solveCase(c);
    for (const e of res0.evaluated.filter((x) => !x.contradicted && x.card !== c.solution.forged)) {
      const broken = structuredClone(c);
      const card = broken.cards.find((k) => k.id === e.card);
      const cl = card.facts.find((f) => f.t === 'claim');
      const cases = [];
      if (cl.kind === 'receipt') {
        const pr = factsOf(c, 'price').find((f) => f.place === cl.place && cl.items.some((it) => it.n === f.item));
        if (pr) cases.push(['receipt-price', (x) => { const it = x.items.find((i) => i.n === pr.item); it.p = (it.p / it.q === pr.after ? pr.before : pr.after) * it.q; }]);
        const other = factsOf(c, 'bankcard').find((f) => f.who !== cl.who);
        if (cl.cards && !cl.with && other && factsOf(c, 'bankcard').some((f) => f.no === cl.cards[0])) cases.push(['receipt-card', (x) => { x.cards = [other.no]; }]);
        const rows = factsOf(c, 'fiscal').filter((f) => f.place === cl.place);
        const later = rows.find((r) => r.time > cl.time + 3);
        if (later) cases.push(['receipt-number', (x) => { x.rno = later.no + 1; }]);
      }
      if (cl.kind === 'photo' && typeof cl.show === 'boolean' && factsOf(c, 'shows').length) cases.push(['photo-show', (x) => { x.show = !x.show; }]);
      if (cl.kind === 'photo' && cl.clock && factsOf(c, 'clocklight').length) cases.push(['photo-clock', (x) => { x.clock = x.clock === 'lit' ? 'scaffold' : 'lit'; }]);
      if (cl.kind === 'bus' && factsOf(c, 'vehicle').some((v) => v.car === cl.car)) {
        const v = factsOf(c, 'vehicle').find((f) => f.car !== cl.car && !f.runs.some((r) => r.line === cl.line && r.from <= cl.time && cl.time <= r.to));
        if (v) cases.push(['bus-vehicle', (x) => { x.car = v.car; }]);
      }
      for (const [code, mutate] of cases) {
        const b = structuredClone(broken);
        mutate(b.cards.find((k) => k.id === e.card).facts.find((f) => f.t === 'claim'));
        const ev = solveCase(b).evaluated.find((x) => x.card === e.card);
        assert.ok(ev.contradicted && ev.reasonCodes.includes(code), `${iso} ${e.card}: ${code} nie wykryty`);
        assert.ok(ev.reason && !/undefined|NaN/.test(ev.reason), `${iso} ${e.card}: ${ev.reason}`);
        hits[code] = (hits[code] || 0) + 1;
      }
    }
  }
  for (const code of NEW_WAYS) assert.ok((hits[code] || 0) >= 5, `sprawdzono ${code}: ${hits[code] || 0}`);
});

test('pn–wt rodzaj dowodu z alibi nie zdradza fałszywki', () => {
  const by = {};
  let cands = 0;
  let n = 0;
  for (const iso of dates) {
    if (difficultyForDate(iso) > 2) continue;
    const c = caseOf(iso);
    const res = solveCase(c);
    n++;
    for (const e of res.evaluated) {
      const ok = e.sightings.some((s) => { const t = res.travel.get(s.place)?.min; return t !== undefined && s.from < c.window.to + t && s.to > c.window.from - t; });
      if (!ok) continue;
      cands++;
      const x = (by[e.kind] ||= [0, 0]);
      x[1]++;
      if (e.card === c.solution.forged) x[0]++;
    }
  }
  const base = n / cands;
  for (const [kind, [f, all]] of Object.entries(by)) {
    if (all < 25) continue;
    assert.ok(Math.abs(f / all - base) < 0.15, `${kind}: ${f}/${all} wobec średnio ${base.toFixed(2)}`);
  }
});

// --- Regresje po przeglądzie kroku 1 (generator v9) ----------------------------------------------
test('tabela ze szczegółem leży zawsze, gdy w sprawie jest dowód danego rodzaju (sama obecność tabeli nie wskazuje fałszywki)', () => {
  const dtOf = (wd) => (wd === 6 ? 'sat' : wd === 0 ? 'sun' : 'wd');
  for (const iso of dates) {
    const c = caseOf(iso);
    const claims = c.cards.filter((k) => k.kind === 'supplied').map((k) => k.facts.find((f) => f.t === 'claim'));
    const receipts = claims.filter((cl) => cl.kind === 'receipt');
    const dt = dtOf(c.crimeDate.weekday);
    if (receipts.length) assert.ok(factsOf(c, 'pricelist').length, `${iso}: paragon bez cennika`);
    if (receipts.some((cl) => cl.cards)) assert.ok(factsOf(c, 'bankcard').length, `${iso}: paragon kartą bez odpowiedzi banku`);
    const hours = factsOf(c, 'hours');
    const fiscalPlaces = new Set(factsOf(c, 'fiscal').map((f) => f.place));
    for (const cl of receipts) {
      if (hours.find((h) => h.place === cl.place)?.[dt]) assert.ok(fiscalPlaces.has(cl.place), `${iso}: lokalu ${cl.place} z paragonu nie ma w raporcie kas`);
    }
    if (claims.some((cl) => cl.kind === 'photo' && ['plac', 'rynek'].includes(cl.place))) assert.ok(factsOf(c, 'shows').length, `${iso}: zdjęcie z placu/Rynku bez komunikatu ZGK`);
    if (claims.some((cl) => cl.kind === 'bus')) {
      const cars = new Set(factsOf(c, 'vehicle').map((v) => v.car));
      for (const cl of claims.filter((x) => x.kind === 'bus')) assert.ok(cars.has(cl.car), `${iso}: wozu ${cl.car} nie ma w dyspozycji MZK`);
    }
  }
});

test('ciemna tarcza ratusza nie występuje na fałszywkach (prawdziwe zdjęcia jej nie mają)', () => {
  for (const iso of dates) {
    const c = caseOf(iso);
    for (const k of c.cards.filter((x) => x.kind === 'supplied')) {
      const cl = k.facts.find((f) => f.t === 'claim');
      if (cl.kind === 'photo' && cl.clock === 'dark') assert.notEqual(k.id, c.solution.forged, `${iso}: ciemna tarcza na fałszywce`);
      if (cl.kind === 'photo' && cl.clock === 'dark') assert.notEqual(k.id, c.lieCard, `${iso}: ciemna tarcza na kłamstwie`);
    }
  }
});

test('jedna osoba nie ma dwóch różnych własnych kart płatniczych na paragonach', () => {
  for (const iso of dates) {
    const c = caseOf(iso);
    const ends = {};
    for (const k of c.cards.filter((x) => x.kind === 'supplied')) {
      const cl = k.facts.find((f) => f.t === 'claim');
      if (cl.kind !== 'receipt' || !cl.cards) continue;
      [cl.who, ...(cl.with || [])].forEach((who, i) => (ends[who] ||= new Set()).add(cl.cards[i]));
    }
    for (const [who, set] of Object.entries(ends)) assert.equal(set.size, 1, `${iso}: ${who} ma karty ${[...set]}`);
  }
});

test('fałszywy bilet „po ostatnim autobusie”: dyspozycja nie pokazuje wozu na tej linii o godzinie biletu', () => {
  let n = 0;
  for (const iso of dates) {
    const c = caseOf(iso);
    const res = solveCase(c);
    for (const ex of [res.explain.forged, ...res.explain.lies]) {
      if (!ex.reasonCodes.includes('bus-after-last')) continue;
      const cl = c.cards.find((k) => k.id === ex.card).facts.find((f) => f.t === 'claim');
      const v = factsOf(c, 'vehicle').find((x) => x.car === cl.car);
      assert.ok(!v.runs.some((r) => r.line === cl.line && r.from <= cl.time && cl.time <= r.to), `${iso}: wóz ${cl.car} na linii ${cl.line}`);
      n++;
    }
  }
  assert.ok(n >= 1, `przypadków: ${n}`);
});

test('przyznanie się do fałszywki cenowej pasuje do wariantu (stara cena albo cena, która obowiązuje dopiero później)', async () => {
  const { buildEpilogue } = await import('../js/epilogue.js');
  const seen = new Set();
  for (let i = 0; i < 1500 && seen.size < 2; i++) {
    const iso = addDays('2026-11-02', i);
    if (difficultyForDate(iso) > 2) continue;
    const c = buildDailyCase(iso);
    const res = solveCase(c);
    if (res.explain.forged.reasonCodes[0] !== 'receipt-price') continue;
    const early = /dopiero od/.test(res.explain.forged.reason);
    const quote = buildEpilogue(c, res, 'solved').quote;
    if (early) assert.match(quote, /z następnego dnia/, `${iso}: ${quote}`);
    else assert.match(quote, /sprzed kilku tygodni/, `${iso}: ${quote}`);
    assert.doesNotMatch(res.explain.forged.reason, / za [A-ZŁŚŻ]/, `${iso}: ${res.explain.forged.reason}`);
    seen.add(early);
  }
  assert.equal(seen.size, 2, 'oba warianty fałszywki cenowej');
});
