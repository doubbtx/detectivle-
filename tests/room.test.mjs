// Testy logiki pokoju gry na żywo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, connect, disconnect, reduce, isRoomCode, randomRoomCode, MAX_PLAYERS } from '../server/room.js';

const ids = ['aaaaaa1', 'bbbbbb2', 'cccccc3', 'dddddd4', 'eeeeee5', 'ffffff6'];
const ref = { type: 'practice', code: 'K7Q2' };

function lobby(n) {
  let s = newRoom('ABCDE', 0);
  for (let i = 0; i < n; i++) s = connect(s, ids[i], { name: `Gracz ${i + 1}`, caseRef: ref, fingerprint: 'QF7K' }, i).state;
  return s;
}

test('pierwszy gracz zostaje gospodarzem i ustala sprawę', () => {
  const s = lobby(2);
  assert.equal(s.hostId, ids[0]);
  assert.deepEqual(s.caseRef, ref);
  assert.equal(s.fingerprint, 'QF7K');
  assert.equal(s.players.length, 2);
});

test('pokój mieści najwyżej 5 osób, a w trakcie śledztwa nikt nowy nie wchodzi', () => {
  const s = lobby(MAX_PLAYERS);
  assert.ok(connect(s, ids[5], { name: 'X' }, 9).error);
  const started = reduce(s, ids[0], { t: 'start' }, 10).state;
  assert.ok(connect(started, ids[5], { name: 'X' }, 11).error);
  // ale ktoś z ekipy może wrócić po zerwaniu połączenia
  const off = disconnect(started, ids[2], 12).state;
  assert.equal(off.players.find((p) => p.id === ids[2]).online, false);
  const back = connect(off, ids[2], {}, 13);
  assert.ok(!back.error);
  assert.equal(back.state.players.find((p) => p.id === ids[2]).seat, 3);
});

test('start wymaga 2 osób i nadaje miejsca w kolejności wejścia', () => {
  assert.ok(reduce(lobby(1), ids[0], { t: 'start' }, 5).error);
  const s = reduce(lobby(3), ids[1], { t: 'start' }, 5).state;
  assert.equal(s.status, 'playing');
  assert.equal(s.teamSize, 3);
  assert.deepEqual(s.players.map((p) => p.seat), [1, 2, 3]);
  assert.equal(s.startedAt, 5);
});

test('stół, odpieczętowanie, ustalenia i podpowiedzi są wspólne', () => {
  let s = reduce(lobby(2), ids[0], { t: 'start' }, 5).state;
  s = reduce(s, ids[0], { t: 'table', card: 'D3' }, 6).state;
  s = reduce(s, ids[1], { t: 'table', card: 'D3' }, 7).state;
  assert.equal(s.table.length, 1);
  s = reduce(s, ids[1], { t: 'unlock', card: 'M2' }, 8).state;
  assert.equal(s.unlocked.M2, ids[1]);
  s = reduce(s, ids[0], { t: 'log', text: 'Halina czysta: S6 + M7' }, 9).state;
  assert.equal(s.log.at(-1).text, 'Halina czysta: S6 + M7');
  s = reduce(s, ids[0], { t: 'hint' }, 10).state;
  assert.equal(s.hints, 1);
  assert.equal(s.penalty, 120);
  assert.ok(reduce(s, ids[0], { t: 'table', card: '<script>' }, 11).error);
});

test('raport: pomyłka dodaje karę, trzecia pomyłka kończy sprawę, trafienie ją zamyka', () => {
  let s = reduce(lobby(2), ids[0], { t: 'start' }, 5).state;
  s = reduce(s, ids[0], { t: 'accuse', forged: 'D1', proof: 'M1', reason: 'x', ok: [false, null] }, 6).state;
  assert.equal(s.penalty, 300);
  assert.ok(reduce(s, ids[1], { t: 'accuse', forged: 'D1', proof: 'M1', ok: [false, null] }, 7).error, 'ta sama para drugi raz');
  const solved = reduce(s, ids[1], { t: 'accuse', forged: 'D2', proof: 'M3', ok: [true, true], report: { stars: 2, reasonOk: true } }, 8).state;
  assert.equal(solved.status, 'solved');
  assert.equal(solved.report.stars, 1, 'gwiazdki liczy serwer: powód tak, alibi brak, nie za pierwszym razem');
  s = reduce(s, ids[0], { t: 'accuse', forged: 'D2', proof: 'M4', ok: [true, false] }, 9).state;
  s = reduce(s, ids[0], { t: 'accuse', forged: 'D3', proof: 'M4', ok: [false, null] }, 10).state;
  assert.equal(s.status, 'failed');
  assert.ok(reduce(s, ids[0], { t: 'hint' }, 11).error);
});

test('kody pokojów', () => {
  for (let i = 0; i < 50; i++) assert.ok(isRoomCode(randomRoomCode()));
  assert.ok(!isRoomCode('ab'));
  assert.ok(!isRoomCode('ABCD0'));
});

test('podpowiedź jest odporna na dwa kliknięcia naraz, a „pierwsza próba” liczy serwer', () => {
  let s = reduce(lobby(2), ids[0], { t: 'start' }, 5).state;
  s = reduce(s, ids[0], { t: 'hint', n: 0 }, 6).state;
  assert.ok(reduce(s, ids[1], { t: 'hint', n: 0 }, 7).error, 'druga osoba z nieaktualnym licznikiem');
  assert.equal(s.hints, 1);
  s = reduce(s, ids[0], { t: 'accuse', forged: 'D1', proof: 'M1', ok: [false, null] }, 8).state;
  const solved = reduce(s, ids[1], { t: 'accuse', forged: 'D2', proof: 'M2', ok: [true, true], report: { reasonOk: true, alibiCorrect: 4, alibiTotal: 4, firstTry: true, stars: 3 } }, 9).state;
  assert.equal(solved.report.firstTry, false);
  assert.equal(solved.report.stars, 2);
});

test('domyślne imiona są numerowane, a znaki < > zostają (wyświetlane jako tekst)', () => {
  let s = newRoom('ABCDE', 0);
  s = connect(s, ids[0], { name: '' }, 1).state;
  s = connect(s, ids[1], { name: 'Ania <3' }, 2).state;
  assert.equal(s.players[0].name, 'Detektyw 1');
  assert.equal(s.players[1].name, 'Ania <3');
});
