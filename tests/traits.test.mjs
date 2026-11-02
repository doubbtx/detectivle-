// Testy modułu cech osób z zamkniętą listą (generator v11): ślad z miejsca + pełny wykaz, kłamca odróżniany cechą.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDailyCase, buildPracticeCase, buildCase, dailyTraitVariant, practiceTraitVariant, difficultyForDate, TRAIT_SHARE,
  GENERATOR_VERSION,
} from '../js/generator.js';
import { solveCase, qualityIssues, traitIssues, proofDepth, investigationProfile } from '../js/solver.js';
import { rulesFor, rulesShortFor, RULE_TRAIT, RULE_LIE_TRAIT, TRAIT_VARIANTS, hasTraits } from '../js/data.js';
import { buildEpilogue } from '../js/epilogue.js';
import { renderBoard } from '../js/board.js';
import { cardIcon } from '../js/visuals.js';
import { addDays } from '../js/time.js';

const dates = Array.from({ length: 400 }, (_, i) => addDays('2026-11-02', i));
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = Array.from({ length: 600 }, (_, i) => [0, 1, 2, 3].map((k) => alphabet[Math.floor(i / 32 ** k) % 32]).join(''));
const cache = new Map();
const caseOf = (key) => {
  if (!cache.has(key)) cache.set(key, /^\d{4}-/.test(key) ? buildDailyCase(key) : buildPracticeCase(key));
  return cache.get(key);
};
const isTraitCard = (k) => (k.facts || []).some((f) => f.t === 'trait' || f.t === 'traitlist');
const factsOf = (c, t) => c.cards.flatMap((k) => (k.facts || []).filter((f) => f.t === t).map((f) => ({ ...f, ref: k.id })));

// Macierz: każdy wariant × każdy rodzaj zbrodni × trudność 3–7 (po jednej sprawie), plus dni i kody z cechą.
const matrix = [];
for (const v of ['shoe', 'dog', 'clothes']) {
  for (const crimeType of ['theft', 'arson', 'poison']) {
    for (let d = 3; d <= 7; d++) matrix.push(buildCase({ seed: `test-trait:${v}:${crimeType}:${d}`, date: '2026-05-14', difficulty: d, kind: 'practice', crimeType, traits: v }));
  }
}
const traitDays = dates.filter((d) => dailyTraitVariant(d)).slice(0, 30);
const traitCodes = codes.filter((c) => practiceTraitVariant(c)).slice(0, 45);
const traitCases = () => [...matrix, ...traitDays.map(caseOf), ...traitCodes.map(caseOf)];

test('cechy: ok. 35% spraw od środy do niedzieli i treningowych, pn–wt nigdy; trzy warianty po ok. 1/3', () => {
  assert.equal(GENERATOR_VERSION, 11);
  const wk = dates.filter((d) => difficultyForDate(d) >= 3);
  for (const d of dates.filter((x) => difficultyForDate(x) <= 2)) assert.equal(dailyTraitVariant(d), null, d);
  const dShare = wk.filter((d) => dailyTraitVariant(d)).length / wk.length;
  assert.ok(Math.abs(dShare - TRAIT_SHARE) < 0.07, `dni z cechą: ${dShare.toFixed(2)}`);
  const pShare = codes.filter((c) => practiceTraitVariant(c)).length / codes.length;
  assert.ok(Math.abs(pShare - TRAIT_SHARE) < 0.06, `trening z cechą: ${pShare.toFixed(2)}`);
  const count = {};
  for (const v of [...wk.map(dailyTraitVariant), ...codes.map(practiceTraitVariant)].filter(Boolean)) count[v] = (count[v] || 0) + 1;
  const n = Object.values(count).reduce((a, b) => a + b, 0);
  for (const v of Object.keys(TRAIT_VARIANTS)) assert.ok(count[v] / n > 0.25 && count[v] / n < 0.42, `${v}: ${count[v]}/${n}`);
  // Wariant z wylosowanego kodu trafia do sprawy (dzień i trening).
  for (const key of [...traitDays.slice(0, 8), ...traitCodes.slice(0, 8)]) {
    const v = /^\d{4}-/.test(key) ? dailyTraitVariant(key) : practiceTraitVariant(key);
    assert.equal(caseOf(key).traits?.variant, v, key);
  }
  for (const key of [...dates.filter((d) => !dailyTraitVariant(d)).slice(0, 8), ...codes.filter((c) => !practiceTraitVariant(c)).slice(0, 4)]) {
    assert.equal(caseOf(key).traits, undefined, key);
  }
});

test('cechy: każda sprawa ma jedno rozwiązanie i przechodzi kontrolę jakości (3 warianty × kradzież, podpalenie, otrucie × trudność 3–7)', () => {
  const seen = new Set();
  for (const c of traitCases()) {
    const tag = `${c.date}/${c.code}/${c.traits.variant}`;
    const res = solveCase(c);
    assert.equal(res.consistent.length, 1, `${tag}: ${res.consistent.length}`);
    assert.deepEqual(res.unique, c.solution, tag);
    assert.deepEqual(qualityIssues(c, res), [], tag);
    assert.deepEqual(traitIssues(c, res), [], tag);
    assert.equal(c.innocentLie, true, tag);
    assert.equal(c.forgeMode, 'self', tag);
    seen.add(`${c.traits.variant}/${c.crimeType || 'theft'}`);
  }
  assert.equal(seen.size, 9, [...seen].join(' '));
});

test('cechy: sprawca ma cechę, kłamca nie, a cechę (każdą osobno i wszystkie naraz) mają co najmniej dwie osoby', () => {
  const holders = [];
  for (const c of traitCases()) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    const lie = res.explain.lies[0];
    for (const t of c.traits.ids) {
      const seen = factsOf(c, 'trait').find((f) => f.trait === t);
      const list = factsOf(c, 'traitlist').find((f) => f.trait === t);
      assert.ok(seen && list && list.complete, `${tag}: ${t}`);
      // Wykaz obejmuje wszystkich podejrzanych (pełny), sprawca ma cechę, kłamca nie ma którejś z cech.
      assert.deepEqual(Object.keys(list.values).sort(), c.suspects.map((s) => s.id).sort(), tag);
      assert.equal(list.values[c.solution.culprit], seen.value, `${tag}: sprawca bez cechy ${t}`);
      const h = c.suspects.filter((s) => list.values[s.id] === seen.value);
      assert.ok(h.length >= 2, `${tag}: cechę ${t} ma ${h.length} osoba`);
      // Ślad i wykaz leżą na różnych biurkach (w ekipie trzeba je zestawić).
      assert.notEqual(c.cards.find((k) => k.id === seen.ref).desk, c.cards.find((k) => k.id === list.ref).desk, tag);
    }
    assert.ok(res.explain.trait.holders.includes(c.solution.culprit), tag);
    assert.ok(res.explain.trait.holders.length >= 2, `${tag}: wszystkie cechy ma ${res.explain.trait.holders.length} osoba`);
    assert.ok(!res.explain.trait.holders.includes(lie.who), `${tag}: kłamca ma cechę`);
    holders.push(res.explain.trait.holders.length);
  }
  // Liczba osób z cechą nie jest stała (czasem cechę ma więcej niewinnych).
  assert.ok(holders.some((n) => n > 2) && holders.some((n) => n === 2), holders.join(','));
});

test('cechy: bez kart z cechą zostają co najmniej dwie hipotezy (sprawca albo kłamca); bez karty obalającej fałszywkę też', () => {
  for (const c of traitCases()) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    const lie = res.explain.lies[0];
    const noTrait = solveCase({ ...c, cards: c.cards.filter((k) => !isTraitCard(k)) });
    assert.ok(noTrait.consistent.length >= 2, `${tag}: bez cechy ${noTrait.consistent.length}`);
    assert.ok(noTrait.consistent.some((h) => h.culprit === lie.who && h.forged === lie.card), `${tag}: bez cechy kłamca nie jest możliwym sprawcą`);
    assert.ok(noTrait.consistent.some((h) => h.culprit === c.solution.culprit), tag);
    // Brak samego wykazu albo samego śladu też zostawia co najmniej dwie hipotezy.
    for (const t of ['trait', 'traitlist']) {
      const part = solveCase({ ...c, cards: c.cards.filter((k) => !(k.facts || []).some((f) => f.t === t)) });
      assert.ok(part.consistent.length >= 2, `${tag}: bez ${t} ${part.consistent.length}`);
    }
    // Cecha nie rozwiązuje sprawy sama: bez karty obalającej fałszywkę zostaje sprawca i niewinna osoba z cechą.
    const proof = new Set(res.explain.forged.proofRefs);
    const noProof = solveCase({ ...c, cards: c.cards.filter((k) => !proof.has(k.id)) });
    assert.ok(noProof.consistent.length >= 2, `${tag}: bez obalenia ${noProof.consistent.length}`);
    assert.ok(noProof.consistent.some((h) => h.culprit !== c.solution.culprit && res.explain.trait.holders.includes(h.culprit)), tag);
  }
});

test('cechy: kłamca powstaje jak sprawca (dowód z alibi obalony fizycznie jedną kartą, bez innego alibi), więc forma go nie zdradza', () => {
  const kindC = {};
  const kindL = {};
  const srcC = {};
  const srcL = {};
  let sameSightings = 0;
  let n = 0;
  const src = (c, id) => {
    const k = c.cards.find((x) => x.id === id);
    return k.kind === 'witness' ? 'witness' : 'cctv';
  };
  const sightings = (c, who) => factsOf(c, 'seen').filter((f) => f.who === who).length;
  for (const c of traitCases()) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    const lie = res.explain.lies[0];
    const f = res.explain.forged;
    assert.equal(lie.card, c.lieCard, tag);
    assert.ok(lie.physical && f.physical, tag);
    assert.equal(lie.about, lie.who, tag);
    assert.equal(f.about, c.solution.culprit, tag);
    assert.equal(lie.proofCount, 1, tag);
    assert.ok(lie.alibi, `${tag}: kłamstwo nie daje alibi`);
    assert.deepEqual(lie.cleared, [], `${tag}: kłamca ma inne alibi`);
    // Kłamca, tak jak sprawca, nie ma żadnego niezależnego potwierdzenia, ale ma własny dowód z alibi.
    assert.ok(!res.neutralClears.has(lie.who), tag);
    assert.ok(c.cards.some((k) => k.kind === 'supplied' && k.by === lie.who), tag);
    const fk = res.evaluated.find((e) => e.card === c.solution.forged).kind;
    kindC[fk] = (kindC[fk] || 0) + 1;
    kindL[lie.kind] = (kindL[lie.kind] || 0) + 1;
    const a = src(c, f.proofRefs[0]);
    const b = src(c, lie.proofRefs[0]);
    srcC[a] = (srcC[a] || 0) + 1;
    srcL[b] = (srcL[b] || 0) + 1;
    if (sightings(c, c.solution.culprit) === sightings(c, lie.who)) sameSightings++;
    n++;
  }
  // Ten sam zestaw rodzajów dowodów i podobny udział nagrań wśród kart obalających.
  assert.ok(Object.keys(kindL).length >= 6 && Object.keys(kindC).length >= 6, `${JSON.stringify(kindC)} / ${JSON.stringify(kindL)}`);
  assert.ok(Math.abs((srcC.cctv || 0) - (srcL.cctv || 0)) / n < 0.2, `kamera: ${srcC.cctv}/${srcL.cctv} z ${n}`);
  assert.ok(sameSightings / n > 0.85, `ta sama liczba pobytów z godziną: ${sameSightings}/${n}`);
});

test('cechy: brak telli – „osoba bez dowodu” jest niewinna z samej zasady w obu rodzajach spraw, a oczyszczona cechą zawsze ma własny dowód', () => {
  const stats = (list) => {
    let noSup = 0;
    let noSupCulprit = 0;
    let lone = 0;
    let loneCulprit = 0;
    for (const c of list) {
      const res = solveCase(c);
      const falseCards = new Set([c.solution.forged, ...res.explain.lies.map((l) => l.card)]);
      const unconfirmed = c.suspects.filter((s) => !(res.neutralClears.get(s.id) || []).length
        && !res.evaluated.some((e) => (e.who === s.id || e.with.includes(s.id)) && !falseCards.has(e.card) && res.givesAlibi(e)));
      for (const s of c.suspects) {
        if (c.cards.some((k) => k.kind === 'supplied' && k.by === s.id)) continue;
        noSup++;
        if (s.id === c.solution.culprit) noSupCulprit++;
      }
      // „Jedyna osoba bez potwierdzonego alibi” (po rozwiązaniu): w zwykłej sprawie to zawsze sprawca.
      lone++;
      if (unconfirmed.length === 1 && unconfirmed[0].id === c.solution.culprit) loneCulprit++;
    }
    return { noSup, noSupCulprit, loneShare: loneCulprit / lone };
  };
  const trait = traitCases().filter((c) => c.kind === 'daily' || c.code);
  const plain = [...dates.filter((d) => difficultyForDate(d) >= 3 && !dailyTraitVariant(d)).slice(0, 30), ...codes.filter((c) => !practiceTraitVariant(c)).slice(0, 30)].map(caseOf);
  const st = stats(trait);
  const sp = stats(plain);
  // Osoba bez żadnego dowodu nigdy nie jest sprawcą (zasada nr 3: nie miała czego sfałszować) – tak samo w obu.
  assert.equal(st.noSupCulprit, 0);
  assert.equal(sp.noSupCulprit, 0);
  // W zwykłej sprawie jedyną osobą bez potwierdzonego alibi jest sprawca, w sprawie z cechą nigdy (są dwie: sprawca
  // i kłamca, a rozstrzyga dopiero cecha).
  assert.equal(sp.loneShare, 1);
  assert.equal(st.loneShare, 0);
  for (const c of trait) {
    const res = solveCase(c);
    const lie = res.explain.lies[0];
    const items = res.explain.suspects[lie.who];
    assert.ok(items.length && items.every((it) => it.type === 'trait'), `${c.date}/${c.code}: kłamca oczyszczony tylko cechą`);
  }
});

test('cechy: zasady, teksty kart, ikony i koperty; zmyłka z cechą bez znaczenia w części spraw', () => {
  let noise = 0;
  const n = traitCases().length;
  for (const c of traitCases()) {
    const tag = `${c.date}/${c.code}`;
    assert.ok(hasTraits(c), tag);
    const rules = rulesFor(c);
    assert.ok(rules.includes(RULE_TRAIT), tag);
    assert.ok(rules.some((r) => r.startsWith(RULE_LIE_TRAIT.slice(0, 60))), tag);
    assert.match(rules.join(' '), /nikt się nie przebierał/, tag);
    assert.ok(rulesShortFor(c).some(([ic]) => ic === TRAIT_VARIANTS[c.traits.variant].icon), tag);
    const tc = c.cards.filter(isTraitCard);
    assert.equal(tc.length, c.traits.variant === 'clothes' ? 3 : 2, tag);
    for (const k of tc) {
      assert.ok(['footprints', 'dog', 'shirt', 'scan-face', 'message-circle'].includes(cardIcon(k)), `${tag}: ${k.title} → ${cardIcon(k)}`);
      // Karty urzędowe ze śladem i wykazem są w kopertach, zeznania jawne.
      if (k.kind !== 'witness') assert.ok(k.action && k.action.cost > 0, `${tag}: ${k.title} bez koperty`);
      // Krótkie linie dokumentów (zeznanie to cytat w dymku, jak inne zeznania).
      if (k.kind !== 'witness') for (const line of k.lines) assert.ok(line.length <= 60, `${tag}: za długa linia „${line}”`);
    }
    if (c.cards.some((k) => /drugi odcisk|Książeczka zdrowia|Notatka recepcji|Rzeczy znalezione/.test(k.title))) noise++;
    const res = solveCase(c);
    const ep = buildEpilogue(c, res, 'solved');
    const all = [...c.cards.flatMap((k) => [k.title, k.sub, ...k.lines]), ...rules, ...ep.paragraphs, ep.quote, res.explain.trait.reason, res.explain.lies[0].reason, res.explain.lies[0].trait.text].join('\n');
    assert.ok(!/undefined|NaN|\$\{|null|\[object/.test(all), `${tag}: ${all.match(/.*(undefined|NaN|\$\{|null|\[object).*/)?.[0]}`);
    assert.match(ep.paragraphs.join(' '), /Ślad z miejsca też się zgadzał/, tag);
    assert.match(ep.paragraphs.join(' '), /do śladu z miejsca i tak nie pasował/, tag);
  }
  assert.ok(noise / n > 0.2 && noise / n < 0.65, `zmyłki z cechą: ${noise}/${n}`);
});

test('cechy: głębokość dowodu i budżet liczą krok cechy, a w raporcie brak cechy potwierdza „alibi” kłamcy', () => {
  for (const c of traitCases()) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    const lie = res.explain.lies[0];
    assert.ok(lie.trait.refs.every((r) => res.explain.trait.refs.includes(r)), tag);
    assert.equal(c.depth, proofDepth(res, c), tag);
    assert.equal(c.depth, new Set(res.explain.forged.refs).size + new Set([...lie.refs, ...lie.trait.refs]).size, tag);
    assert.ok(c.depth >= 7, `${tag}: głębokość ${c.depth}`);
    const inv = investigationProfile(c, res);
    for (const id of lie.trait.refs) {
      const k = c.cards.find((x) => x.id === id);
      if (k.action) assert.ok(inv.need.includes(id), `${tag}: ${id} poza budżetem`);
    }
    assert.match(res.explain.lies[0].trait.text, /^nie /, tag);
    assert.ok(res.describeClear(res.explain.suspects[lie.who][0]).startsWith('nie '), tag);
  }
});

test('cechy na tablicy: wartości z wykazu dopiero po otwarciu wykazu, znacznik „pasuje do śladu” dopiero po otwarciu obu kart', () => {
  for (const c of traitCases().slice(0, 30)) {
    const tag = `${c.date}/${c.code}`;
    const tc = c.cards.filter(isTraitCard);
    const lists = tc.filter((k) => k.facts.some((f) => f.t === 'traitlist'));
    const seenCards = tc.filter((k) => k.facts.some((f) => f.t === 'trait'));
    const board = (open) => renderBoard({ c, pins: [], sel: [], canSee: (k) => !isTraitCard(k) || open.includes(k), hasMap: true, sceneCell: 'J4' });
    assert.ok(!/bd-trait\b/.test(board([])), `${tag}: cecha bez otwartych kart`);
    assert.ok(!/class="bd-trait match"/.test(board(lists)), `${tag}: znacznik bez śladu`);
    assert.ok(!/bd-trait/.test(board(seenCards)), `${tag}: znacznik bez wykazu`);
    const both = board(tc);
    const res = solveCase(c);
    // Liczba znaczników „pasuje” (bez legendy): co najmniej tyle, ile osób ma wszystkie cechy.
    const marks = (both.match(/class="bd-trait match"/g) || []).length;
    assert.ok(marks >= res.explain.trait.holders.length, `${tag}: ${marks}`);
  }
});

test('cechy: stare pliki z cases/ (bez cech) działają jak wcześniej', () => {
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'cases');
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  assert.ok(files.includes('2026-11-02.json'));
  // Pliki opublikowane przed v11 nie mają cech; nowsze mogą je mieć – wtedy sprawdzamy tylko jednoznaczność.
  for (const f of files) {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (c.traits !== undefined) {
      assert.ok(c.cards.some(isTraitCard), f);
      assert.deepEqual(solveCase(c).unique, c.solution, f);
      continue;
    }
    assert.ok(!c.cards.some(isTraitCard), f);
    const res = solveCase(c);
    assert.deepEqual(res.unique, c.solution, f);
    assert.equal(res.explain.trait, null, f);
    assert.ok(!rulesFor(c).includes(RULE_TRAIT), f);
    assert.ok(!rulesShortFor(c).some(([, r]) => /cechę ma sprawca/.test(r)), f);
  }
});

// Regresja (weryfikacja kroku 3): w weekend wspólny dowód miała zawsze T2, a sprawca w sprawie z cechą nigdy go nie ma,
// więc „osoba z cechą ze wspólnym dowodem” była zawsze niewinna, bez liczenia.
test('cechy: osoba z cechą ma wspólny dowód tylko wtedy, gdy oczyszcza ją też coś innego (weekend: wspólny dowód poza parą kłamca–T2)', () => {
  const weekendDays = dates.filter((d) => dailyTraitVariant(d) && difficultyForDate(d) >= 6).slice(0, 20);
  const weekendCodes = codes.filter((c) => practiceTraitVariant(c)).map(caseOf).filter((c) => c.difficulty >= 6).slice(0, 25);
  const all = [...traitCases(), ...weekendDays.map(caseOf), ...weekendCodes];
  for (const c of all) {
    const tag = `${c.date}/${c.code}`;
    const res = solveCase(c);
    const C = c.solution.culprit;
    const lies = new Set([c.solution.forged, ...res.explain.lies.map((l) => l.card)]);
    assert.ok(!res.evaluated.some((e) => e.with.length && (e.who === C || e.with.includes(C))), `${tag}: sprawca ze wspólnym dowodem`);
    for (const id of res.explain.trait.holders) {
      const joint = res.evaluated.filter((e) => e.with.length && (e.who === id || e.with.includes(id)));
      if (!joint.length) continue;
      // Oczyszcza ją niezależne alibi albo drugi własny prawdziwy dowód z alibi (poza wspólnym).
      const other = (res.neutralClears.get(id) || []).length
        || res.evaluated.some((e) => e.who === id && !e.with.length && !lies.has(e.card) && res.givesAlibi(e));
      assert.ok(other, `${tag}: ${id} ma cechę, a jedynym alibi jest wspólny dowód`);
    }
  }
  // Wspólny dowód w ogóle bywa w sprawach z cechą (inaczej test niczego nie sprawdza).
  assert.ok(all.some((c) => solveCase(c).evaluated.some((e) => e.with.length)), 'brak wspólnych dowodów');
});

// Regresja (weryfikacja kroku 3): przy podpaleniu kamera z ubraniem pokazywała „1. właściciel, 2. postać”, co
// przeczyło opinii biegłego albo wskazywało rozstrzygające otwarcie bez niej. Karta ze śladem nie może wyznaczać okna.
test('cechy: karta ze śladem nie podaje godzin ani kolejności wejść; realia kart śladu i wykazu', () => {
  let decoys = 0;
  for (const c of traitCases()) {
    const tag = `${c.date}/${c.code}/${c.crimeType || 'theft'}`;
    const seen = c.cards.filter((k) => (k.facts || []).some((f) => f.t === 'trait'));
    for (const k of seen.filter((x) => x.kind !== 'witness')) {
      for (const line of k.lines) {
        assert.ok(!/\d{1,2}:\d{2}/.test(line), `${tag}: godzina na karcie śladu „${line}”`);
        assert.ok(!/^\s*\d+\.\s/.test(line), `${tag}: kolejność na karcie śladu „${line}”`);
      }
      if (c.crimeType === 'arson' && c.traits.variant === 'clothes') assert.match(k.lines.join(' '), /kolejności wejść nie widać/, tag);
    }
    if (c.traits.variant === 'dog') {
      const w = seen.find((k) => k.kind === 'witness');
      const [, a, b] = w.lines[0].match(/od (\d{1,2}:\d{2}) do (\d{1,2}:\d{2})/);
      const toMin = (s) => Number(s.split(':')[0]) * 60 + Number(s.split(':')[1]);
      // Podpalenie: świadek przy psie kończy przed zapłonem (pies nie milczy przy pożarze).
      if (c.crimeType === 'arson') assert.ok(toMin(b) < c.ignition, `${tag}: świadek do ${b}, zapłon ${c.ignition}`);
      assert.ok(toMin(a) < toMin(b), tag);
      // Świadek siedział przy psie, więc jest w „pełnym wykazie”.
      const list = c.cards.find((k) => (k.facts || []).some((f) => f.t === 'traitlist'));
      const name = w.title.replace(/^Zeznanie: /, '');
      assert.ok(list.lines.some((l) => l.replace(/ /g, ' ').includes(name)), `${tag}: ${name} poza zeszytem`);
    }
    if (c.traits.variant === 'shoe') {
      const proto = c.cards.find((k) => (k.facts || []).some((f) => f.t === 'traitlist'));
      const sizes = Object.values(proto.facts[0].values);
      const d = c.cards.find((k) => k.title === 'Zdjęcie z oględzin: drugi odcisk');
      if (d) {
        decoys++;
        // Rozmiar zmyłki spoza protokołu (nie myli się z niczyim butem i nie zależy od płci T2).
        const v = Number(d.lines[0].match(/rozmiarze (\d+)/)[1]);
        assert.ok(!sizes.includes(v), `${tag}: zmyłka ${v} w protokole`);
        assert.ok(v >= 36 && v <= 46, tag);
      }
    }
  }
  assert.ok(decoys > 0);
});
