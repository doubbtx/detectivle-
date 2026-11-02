// Testy porządku śledztwa (js/layout.js): każda karta ma dokładnie jedno miejsce, koperty nigdy w teczkach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPracticeCase, buildCase } from '../js/generator.js';
import { placeCards, homeOf, mentionsOf, isSceneCard, namesPerson, DESK_ORDER } from '../js/layout.js';

const casesDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'cases');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = Array.from({ length: 120 }, (_, i) => [0, 1, 2, 3].map((k) => alphabet[Math.floor((i * 37) / 32 ** k) % 32]).join(''));
const all = () => [
  ...readdirSync(casesDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf8'))),
  ...codes.map(buildPracticeCase),
  ...['theft', 'arson', 'poison'].flatMap((crimeType) => ['shoe', 'dog', 'clothes'].map((traits) => buildCase({ seed: `layout:${crimeType}:${traits}`, date: '2026-05-14', difficulty: 5, kind: 'practice', crimeType, traits }))),
];

test('porządek: każda karta w dokładnie jednym miejscu, zgodnie z homeOf', () => {
  for (const c of all()) {
    const p = placeCards(c);
    const ids = [...p.scene, ...Object.values(p.folders).flat(), ...DESK_ORDER.flatMap((d) => p.akta[d] || [])];
    assert.equal(ids.length, c.cards.length, `${c.code || c.date}: liczba kart`);
    assert.equal(new Set(ids).size, ids.length, `${c.code || c.date}: karta w dwóch miejscach`);
    for (const k of c.cards) {
      const h = homeOf(k, c);
      if (h.place === 'scene') assert.ok(p.scene.includes(k.id));
      else if (h.place === 'folder') assert.ok(p.folders[h.sid].includes(k.id));
      else assert.ok(p.akta[h.desk].includes(k.id));
    }
  }
});

test('porządek: koperty nigdy w teczkach, w teczce tylko dowody tej osoby', () => {
  for (const c of all()) {
    const p = placeCards(c);
    for (const [sid, ids] of Object.entries(p.folders)) {
      for (const id of ids) {
        const k = c.cards.find((x) => x.id === id);
        assert.ok(!k.action, `${c.code || c.date}: koperta ${id} w teczce`);
        assert.equal(k.by, sid);
      }
    }
    // Wszystkie jawne dowody podejrzanych są w ich teczkach.
    for (const k of c.cards.filter((x) => x.by && !x.action)) assert.equal(homeOf(k, c).place, 'folder');
  }
});

test('porządek: krok 1 ma karty okna i śladu dla każdego rodzaju zbrodni', () => {
  for (const c of all()) {
    const p = placeCards(c);
    const has = (t) => c.cards.filter((k) => (k.facts || []).some((f) => f.t === t)).every((k) => p.scene.includes(k.id));
    for (const t of ['opening', 'ignition', 'timer', 'dosed', 'carafe', 'glass', 'refill', 'trait', 'traitlist']) assert.ok(has(t), `${c.code || c.date}: ${t} poza krokiem 1`);
    // Karty z czasami dotarcia, rozkładami i rejestrami miejskimi nie trafiają do kroku 1.
    for (const id of p.scene) {
      const k = c.cards.find((x) => x.id === id);
      assert.ok(!(k.facts || []).some((f) => ['grid', 'train', 'bus', 'hours', 'zone', 'fiscal', 'seen', 'claim'].includes(f.t)), `${c.code || c.date}: ${id} w kroku 1`);
      assert.ok(isSceneCard(k, c));
    }
  }
});

test('porządek: wzmianki tylko z widocznych kart, bez własnych dowodów i list całej piątki', () => {
  for (const c of all().slice(0, 60)) {
    const visible = (k) => !k.action; // na starcie: jawne karty
    for (const s of c.suspects) {
      const ids = mentionsOf(c, s.id, visible);
      for (const id of ids) {
        const k = c.cards.find((x) => x.id === id);
        assert.ok(!k.action, `${id}: zamknięta koperta we wzmiankach`);
        assert.ok(namesPerson(k, s));
        assert.ok(!(k.by === s.id), `${id}: własny dowód jako wzmianka`);
        assert.ok(c.suspects.some((x) => !namesPerson(k, x)), `${id}: lista całej piątki`);
      }
    }
  }
});

test('porządek: rozpoznaje imię z nazwiskiem (także z twardą spacją) i samo imię', () => {
  const s = { id: 's1', full: 'Igor Malinowski', first: 'Igor', gen: 'Igora', ins: 'Igorem', fullAcc: 'Igora Malinowskiego' };
  assert.ok(namesPerson({ title: 'Monitoring', lines: ['Wyraźnie widać: Igor Malinowski rozmawia.'] }, s));
  assert.ok(namesPerson({ title: 'Zeznanie', lines: ['„Pan Igor przeszedł obok mnie.”'] }, s));
  assert.ok(!namesPerson({ title: 'Zeznanie', lines: ['„Igorówka to nazwa ulicy.”'] }, s));
});
