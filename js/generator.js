// Generator codziennej sprawy „Fałszywe Alibi”.
//
// Zasada sprawy: pięcioro podejrzanych, każde ma alibi. Niewinni mają alibi
// potwierdzone przez niezależnych świadków albo przez własne, prawdziwe dowody.
// Sprawca dostarczył jeden sfałszowany dowód, który kłóci się z faktami
// z innego biurka (rozkład jazdy, godziny otwarcia, pogoda, spis ulic...).
// Po wygenerowaniu sprawę sprawdza niezależny solver (solver.js).

import { makeRng, hashString } from './rng.js';
import {
  CHARACTERS, ROLES, WITNESSES, SCENES, PLACES, TRAIN_DESTINATIONS, TRAIN_NOTES, FILMS,
  VENUE_ITEMS, CCTV_DETAILS, PHOTO_POSES, DESK_DEFS, ITEM_NOM,
} from './data.js';
import {
  fmt, fmtHour, addDays, weekdayOf, dayType, dateLong, dateShort, sunsetFor, daysBetween,
  WEEKDAYS, WEEKDAYS_ACC, isSummerTime,
} from './time.js';
import { solveCase, qualityIssues } from './solver.js';

/** Dzień przed sprawą nr 1. Sprawa nr 1 to 2 listopada 2026. */
export const EPOCH = '2026-11-01';

export function caseNumber(iso) {
  return daysBetween(EPOCH, iso);
}

/** Poniedziałek = 1 (najłatwiej) … niedziela = 7 (najtrudniej). */
export function difficultyForDate(iso) {
  const wd = weekdayOf(iso);
  return wd === 0 ? 7 : wd;
}

export const DIFFICULTY_LABELS = ['', 'bardzo łatwa', 'łatwa', 'średnia', 'średnia', 'trudna', 'trudna', 'bardzo trudna'];

function params(diff) {
  return {
    decoys: diff <= 2 ? 1 : diff <= 5 ? 2 : 3,
    extraTrueItems: diff >= 5 ? 1 : 0,
    traps: diff <= 1 ? 0 : diff <= 4 ? 1 : 2,
    culpritTrap: diff >= 3,
    cardsPerDesk: 4 + Math.ceil(diff * 0.75),
    splitLegend: diff >= 5,
    splitCardOwners: diff >= 4,
    motives: diff >= 2 ? Math.min(3, diff - 1) : 0,
    noiseTableChance: 0.25 + diff * 0.08,
  };
}

class RetryError extends Error {}
const retry = () => {
  throw new RetryError('retry');
};

const ALL_KINDS = ['train', 'receipt', 'photo', 'cinema', 'delivery', 'parking', 'bus'];

export function buildDailyCase(iso) {
  return buildCase({
    seed: `daily:${iso}`,
    date: iso,
    difficulty: difficultyForDate(iso),
    number: caseNumber(iso),
    kind: 'daily',
  });
}

/** Sprawa treningowa z kodu (np. „K7Q2”): ten sam kod = ta sama sprawa u wszystkich. */
export function buildPracticeCase(code) {
  const norm = code.toUpperCase();
  const h = hashString(`practice:${norm}`);
  const date = addDays('2026-01-01', h % 365);
  return buildCase({
    seed: `practice:${norm}`,
    date,
    difficulty: 3 + (h % 5),
    number: null,
    code: norm,
    kind: 'practice',
  });
}

export function randomPracticeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function buildCase(opts) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const rng = makeRng(`${opts.seed}#${attempt}`);
    let c;
    try {
      c = generate(rng, opts);
    } catch (e) {
      if (e instanceof RetryError) continue;
      throw e;
    }
    const res = solveCase(c);
    if (qualityIssues(c, res).length === 0) {
      c.attempt = attempt;
      return c;
    }
  }
  throw new Error(`Nie udało się wygenerować sprawy dla ziarna ${opts.seed}`);
}

/** Do diagnostyki: jedna próba generowania bez kontroli jakości. */
export function generateAttempt(opts, attempt) {
  try {
    return { case: generate(makeRng(`${opts.seed}#${attempt}`), opts) };
  } catch (e) {
    if (e instanceof RetryError) return { retry: true };
    throw e;
  }
}

function generate(rng, opts) {
  const P = params(opts.difficulty);
  const crimeIso = addDays(opts.date, -1);
  const weekday = weekdayOf(crimeIso);
  const dt = dayType(weekday);
  const dShort = dateShort(crimeIso);
  const sunset = sunsetFor(crimeIso);

  const g = (p, m, f) => (p.f ? f : m);
  const pan = (p) => (p.f ? 'Pani' : 'Pan');
  const round5 = (m) => Math.round(m / 5) * 5;

  // --- Scena, podejrzani, okno czasowe -------------------------------------
  const scene = rng.pick(SCENES);
  const stolen = rng.pick(scene.items);
  const stolenNom = ITEM_NOM[stolen] ?? stolen;
  const roles = rng.sample(ROLES, 5);
  const suspects = rng.sample(CHARACTERS, 5).map((ch, i) => ({
    id: `s${i + 1}`,
    ...ch,
    role: roles[i][ch.f ? 'f' : 'm'],
    items: [],
    alibi: '',
  }));
  const W1 = rng.int(19 * 60 + 5, 20 * 60 + 35);
  const W2 = W1 + rng.int(24, 46);
  const closeT = W1 - rng.int(14, 45);

  const travel = {};
  for (const key of Object.keys(PLACES)) travel[key] = rng.int(6, 36);
  const usedPlaces = new Set();
  const taken = new Set();
  const useWitness = rng.sample(WITNESSES, WITNESSES.length);
  let witnessIdx = 0;
  const nextWitness = () => useWitness[witnessIdx++ % useWitness.length];

  const clearRange = (place) => [W1 - travel[place] + 3, W2 + travel[place] - 3];
  const timeIn = (place, lo = 18 * 60, hi = 23 * 60) => {
    const [a, b] = clearRange(place);
    const from = Math.max(a, lo);
    const to = Math.min(b, hi);
    if (from > to) retry();
    return rng.int(from, to);
  };
  const trapTime = (place) => {
    const d = travel[place];
    const beforeMax = W1 - d - 3;
    const afterMin = W2 + d + 3;
    const choices = [];
    if (beforeMax >= 17 * 60 + 15) choices.push({ side: 'before', t: rng.int(Math.max(17 * 60, beforeMax - 70), beforeMax) });
    if (afterMin <= 23 * 60 + 30) choices.push({ side: 'after', t: rng.int(afterMin, Math.min(23 * 60 + 40, afterMin + 50)) });
    if (!choices.length) retry();
    return rng.pick(choices);
  };
  const takePlace = (pred) => {
    const options = Object.keys(PLACES).filter((k) => pred(PLACES[k], k) && !taken.has(k));
    if (!options.length) retry();
    const k = rng.pick(options);
    taken.add(k);
    usedPlaces.add(k);
    return k;
  };

  // Pobyty każdej osoby (miejsce + przedział czasu). Nowe dowody muszą dać się z nimi
  // pogodzić: przejście z A do B trwa co najmniej |dA − dB| minut (to gracz wyliczy z mapy).
  const AWAY = '@poza-miastem';
  const FAR = 100000;
  const events = Object.fromEntries(suspects.map((s) => [s.id, []]));
  const tmin = (place) => (place === AWAY ? undefined : travel[place]);
  const clash = (a, b, margin) => {
    if (a.place === b.place) return false;
    if (a.from <= b.to + margin && b.from <= a.to + margin) return true;
    const [x, y] = a.to < b.from ? [a, b] : [b, a];
    const dx = tmin(x.place);
    const dy = tmin(y.place);
    if (dx === undefined || dy === undefined) return false;
    return y.from - x.to < Math.abs(dx - dy) + margin;
  };
  const fits = (sid, evs) => evs.every((e, i) => events[sid].every((o) => !clash(e, o, 4)) && evs.slice(i + 1).every((f) => !clash(e, f, 4)));

  const cards = [];
  const addCard = (card) => {
    cards.push({ lines: [], facts: [], kind: 'official', ...card });
    return cards[cards.length - 1];
  };

  // Wspólne tabele faktów (każda trafia na jedną kartę urzędową).
  const T = { trains: [], hours: [], films: [], streets: [], zones: [], buses: [], weather: null, cardlogs: {} };
  const usedTrainNos = new Set();
  const usedDest = new Set();

  const snapshot = () => ({
    cards: cards.length, trains: T.trains.length, hours: T.hours.length, films: T.films.length,
    streets: T.streets.length, zones: T.zones.length, buses: T.buses.length, weather: T.weather,
    cardlogs: JSON.stringify(T.cardlogs), taken: [...taken], used: [...usedPlaces],
    nos: [...usedTrainNos], dest: [...usedDest], widx: witnessIdx,
  });
  const restore = (sn, s) => {
    const removed = new Set(cards.slice(sn.cards));
    cards.length = sn.cards;
    T.trains.length = sn.trains; T.hours.length = sn.hours; T.films.length = sn.films;
    T.streets.length = sn.streets; T.zones.length = sn.zones; T.buses.length = sn.buses;
    T.weather = sn.weather;
    T.cardlogs = JSON.parse(sn.cardlogs);
    const reset = (set, list) => { set.clear(); list.forEach((x) => set.add(x)); };
    reset(taken, sn.taken); reset(usedPlaces, sn.used); reset(usedTrainNos, sn.nos); reset(usedDest, sn.dest);
    witnessIdx = sn.widx;
    s.items = s.items.filter((c) => !removed.has(c));
    if (removed.has(s.claimCard)) s.claimCard = s.items[0] || null;
  };
  /** Tworzy dowód; jeśli nie pasuje do innych pobytów tej osoby, cofa go i losuje jeszcze raz. */
  const attempt = (s, fn) => {
    for (let k = 0; k < 14; k++) {
      const sn = snapshot();
      let res;
      try {
        res = fn();
      } catch (e) {
        if (!(e instanceof RetryError)) throw e;
        restore(sn, s);
        continue;
      }
      if (fits(s.id, res.events)) {
        events[s.id].push(...res.events);
        return res;
      }
      restore(sn, s);
    }
    return retry();
  };

  // --- Dowody dostarczone przez podejrzanych --------------------------------
  function makeClaim(kind, s, forged) {
    let evs = [];
    let card;
    const by = s.id;
    switch (kind) {
      case 'train': {
        usedPlaces.add('dworzec');
        const t = timeIn('dworzec', 18 * 60, 22 * 60 + 45);
        const dest = rng.pick(TRAIN_DESTINATIONS.filter((d) => !usedDest.has(d.name)));
        usedDest.add(dest.name);
        let no;
        do no = `${rng.pick(['IC', 'TLK', 'R'])} ${rng.int(1000, 8999)}`; while (usedTrainNos.has(no));
        usedTrainNos.add(no);
        const runs = Object.keys(TRAIN_NOTES).filter((n) => n && TRAIN_NOTES[n].runs(weekday));
        const stops = Object.keys(TRAIN_NOTES).filter((n) => n && !TRAIN_NOTES[n].runs(weekday));
        const row = { no, dest: dest.name, dep: t, note: '' };
        if (forged) {
          if (rng.chance(0.6)) row.note = rng.pick(stops);
          else {
            row.dep = t + rng.pick([-60, 60, -30, 30, -120]);
            row.note = rng.chance(0.5) ? rng.pick(runs) : '';
          }
        } else row.note = rng.chance(0.6) ? rng.pick(runs) : '';
        T.trains.push(row);
        card = addCard({
          desk: 'D', kind: 'supplied', by, title: 'Bilet kolejowy',
          lines: [
            'przejazd jednorazowy · klasa 2',
            `${no} → ${dest.name}`,
            `${dShort} · odjazd z Borowic ${fmt(t)}`,
            `wagon ${rng.int(2, 12)}, miejsce ${rng.int(11, 88)} · ${rng.int(19, 89)},${rng.pick(['00', '50', '90'])} zł`,
          ],
          facts: [{ t: 'claim', kind, who: by, no, time: t }],
        });
        evs = [{ place: 'dworzec', from: t, to: t }, { place: AWAY, from: t + 1, to: FAR }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'wyjechał', 'wyjechała')} pociągiem do ${dest.gen} (bilet: ${id}).`;
        break;
      }
      case 'receipt': {
        const place = takePlace((p) => p.venue);
        const t = timeIn(place);
        const span = () => [rng.pick([7, 8, 9, 10, 11, 12]) * 60, rng.pick([18, 19, 20, 21, 22, 23]) * 60 + rng.pick([0, 0, 30])];
        const hours = { wd: span(), sat: rng.chance(0.85) ? span() : null, sun: rng.chance(0.6) ? span() : null };
        if (!forged) {
          hours[dt] = [rng.pick([8, 9, 10, 11, 12]) * 60, Math.ceil((t + rng.int(6, 70)) / 30) * 30];
        } else if (dt !== 'wd' && rng.chance(0.4)) {
          hours[dt] = null;
        } else {
          hours[dt] = [rng.pick([8, 9, 10]) * 60, Math.floor((t - rng.int(8, 60)) / 30) * 30];
        }
        T.hours.push({ place, ...hours });
        const items = VENUE_ITEMS[place] || [['Usługa', '10,00']];
        const total = items.reduce((sum, [, price]) => sum + Number(price.replace(',', '.')), 0);
        card = addCard({
          desk: 'D', kind: 'supplied', by, title: 'Paragon fiskalny',
          lines: [
            PLACES[place].name,
            PLACES[place].address,
            `${dShort} godz. ${fmt(t)}`,
            ...items.map(([n, pr]) => `${n} ${pr}`),
            `SUMA PLN ${total.toFixed(2).replace('.', ',')}`,
          ],
          facts: [{ t: 'claim', kind, who: by, place, time: t }],
        });
        evs = [{ place, from: t, to: t }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'był', 'była')} ${PLACES[place].loc} (paragon: ${id}).`;
        break;
      }
      case 'photo': {
        const place = takePlace((p) => p.photo);
        let t = 0;
        for (let k = 0; k < 6; k++) {
          t = timeIn(place);
          if (Math.abs(t - sunset) > 30) break;
        }
        if (Math.abs(t - sunset) <= 30) retry();
        const natural = t < sunset ? 'day' : 'night';
        let sky = natural;
        let ground;
        const rainAround = () => [[round5(t - rng.int(20, 90)), round5(t + rng.int(20, 90))]];
        const dryAround = () => {
          const r = rng.int(0, 2);
          if (r === 0) return [];
          if (r === 1) {
            const end = round5(t - rng.int(150, 240));
            return end > 16 * 60 + 30 ? [[Math.max(16 * 60, end - rng.int(30, 80)), end]] : [];
          }
          const start = round5(t + rng.int(40, 110));
          return [[start, start + round5(rng.int(30, 80))]];
        };
        let rain;
        if (forged) {
          const opts = ['dry'];
          if (natural === 'night') opts.push('daylight');
          if (rng.pick(opts) === 'daylight') {
            sky = 'day';
            const wet = rng.chance(0.5);
            ground = wet ? 'wet' : 'dry';
            rain = wet ? rainAround() : dryAround();
          } else {
            ground = 'dry';
            rain = rainAround();
          }
        } else {
          const wet = rng.chance(0.5);
          ground = wet ? 'wet' : 'dry';
          rain = wet ? rainAround() : dryAround();
        }
        T.weather = { rain };
        const skyText = sky === 'day' ? 'jasne niebo, słońce nisko nad dachami' : 'ciemne niebo, palą się latarnie';
        const groundText = ground === 'dry' ? 'suchy chodnik, nikt nie ma parasola' : 'mokry bruk, kałuże, ludzie pod parasolami';
        card = addCard({
          desk: 'Z', kind: 'supplied', by, title: 'Zdjęcie z telefonu',
          lines: [
            `${PLACES[place].name} · metadane pliku: ${dShort}, ${fmt(t)}`,
            `Na zdjęciu: ${s.first} ${rng.pick(PHOTO_POSES)}.`,
            `W tle: ${skyText}; ${groundText}.`,
          ],
          facts: [{ t: 'claim', kind, who: by, place, time: t, sky, ground }],
        });
        evs = [{ place, from: t, to: t }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'spacerował', 'spacerowała')} ${PLACES[place].walk} (zdjęcie: ${id}).`;
        break;
      }
      case 'cinema': {
        usedPlaces.add('kino');
        taken.add('kino');
        const film = rng.pick(FILMS.filter((f) => !T.films.some((x) => x.film === f)));
        const start = round5(timeIn('kino', 18 * 60, 21 * 60 + 30));
        const dur = rng.int(95, 135);
        let starts;
        if (!forged) {
          starts = [start];
          if (start - 150 >= 15 * 60) starts.unshift(round5(start - rng.int(150, 200)));
        } else {
          starts = [round5(start - rng.int(70, 150)), round5(start + rng.int(70, 150))];
        }
        T.films.push({ film, dur, starts: starts.filter((x) => x >= 14 * 60 && x <= 23 * 60), claimed: true, start, forged });
        card = addCard({
          desk: 'D', kind: 'supplied', by, title: 'Bilet do kina',
          lines: [
            `Kino „Mewa” · sala ${rng.int(1, 3)}`,
            `„${film}”`,
            `${dShort} · seans ${fmt(start)}`,
            `rząd ${rng.pick(['C', 'D', 'E', 'F', 'G', 'H'])}, miejsce ${rng.int(3, 18)} · 24,00 zł`,
          ],
          facts: [{ t: 'claim', kind, who: by, film, start }],
        });
        evs = [{ place: 'kino', from: start, to: start + dur }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'był', 'była')} w kinie „Mewa” na filmie „${film}” (bilet: ${id}).`;
        break;
      }
      case 'delivery': {
        const st1 = takePlace((p) => p.street);
        const st2 = takePlace((p) => p.street);
        const t1 = timeIn(st1, 18 * 60, 22 * 60 + 30);
        const t2 = t1 + Math.max(rng.int(9, 24), Math.abs(travel[st1] - travel[st2]) + rng.int(5, 10));
        const mkStreet = (street) => {
          const parity = rng.pick(['all', 'all', 'even', 'odd']);
          let max = rng.int(7, 48);
          if (parity === 'even' && max % 2) max += 1;
          if (parity === 'odd' && max % 2 === 0) max += 1;
          return { street, parity, max };
        };
        const r1 = mkStreet(st1);
        const r2 = mkStreet(st2);
        T.streets.push(r1, r2);
        const validNo = (r) => {
          for (;;) {
            const n = rng.int(r.parity === 'even' ? 2 : 1, r.max);
            if (r.parity === 'all' || (r.parity === 'even') === (n % 2 === 0)) return n;
          }
        };
        const invalidNo = (r) => {
          if (r.parity !== 'all' && rng.chance(0.5)) {
            for (;;) {
              const n = rng.int(1, r.max);
              if ((r.parity === 'even') !== (n % 2 === 0)) return n;
            }
          }
          let n = r.max + rng.int(1, 30);
          if (r.parity === 'even' && n % 2) n += 1;
          if (r.parity === 'odd' && n % 2 === 0) n += 1;
          return n;
        };
        let n1 = validNo(r1);
        let n2 = validNo(r2);
        if (forged) {
          if (rng.chance(0.5)) n1 = invalidNo(r1);
          else n2 = invalidNo(r2);
        }
        card = addCard({
          desk: 'Z', kind: 'supplied', by, title: 'Zrzut ekranu z aplikacji kurierskiej',
          lines: [
            `Konto kuriera: ${s.full} · ${dShort}`,
            `${fmt(t1)} ✓ doręczono: ${PLACES[st1].name} ${n1}`,
            `${fmt(t2)} ✓ doręczono: ${PLACES[st2].name} ${n2}`,
          ],
          facts: [{ t: 'claim', kind, who: by, stops: [{ place: st1, no: n1, time: t1 }, { place: st2, no: n2, time: t2 }] }],
        });
        evs = [{ place: st1, from: t1, to: t1 }, { place: st2, from: t2, to: t2 }];
        card.alibi = (id) => `Twierdzi, że tego wieczoru ${g(s, 'dorabiał', 'dorabiała')} jako ${g(s, 'kurier', 'kurierka')} i ${g(s, 'rozwoził', 'rozwoziła')} paczki (zrzut ekranu: ${id}).`;
        break;
      }
      case 'parking': {
        const place = takePlace((p) => p.parking);
        const t = timeIn(place, 18 * 60, 22 * 60 + 30);
        const zone = rng.pick(['A', 'B', 'C']);
        const span = () => [rng.pick([8, 9]) * 60, rng.pick([15, 16, 17, 18, 20, 22]) * 60];
        const hours = { wd: span(), sat: rng.chance(0.7) ? span() : null, sun: rng.chance(0.3) ? span() : null };
        if (!forged) hours[dt] = [rng.pick([8, 9, 10]) * 60, Math.min(24 * 60, Math.ceil((t + rng.int(10, 90)) / 60) * 60)];
        else if (dt !== 'wd' && rng.chance(0.4)) hours[dt] = null;
        else hours[dt] = [rng.pick([8, 9]) * 60, Math.max(12 * 60, Math.floor((t - rng.int(6, 70)) / 30) * 30)];
        T.zones.push({ zone, streets: [place], hours, claimed: true });
        card = addCard({
          desk: 'D', kind: 'supplied', by, title: 'Bilet parkingowy',
          lines: [
            `Parkomat nr ${rng.int(10, 59)} · ${PLACES[place].name} · strefa ${zone}`,
            `${dShort}, wydano ${fmt(t)}`,
            `ważny do ${fmt(t + 60)} · opłata 4,00 zł`,
          ],
          facts: [{ t: 'claim', kind, who: by, place, zone, time: t }],
        });
        evs = [{ place, from: t, to: t }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'zostawił', 'zostawiła')} auto ${PLACES[place].loc} (bilet parkingowy: ${id}).`;
        break;
      }
      case 'bus': {
        const place = takePlace((p) => p.stop);
        const line = rng.pick(['3', '7', '12', '15']);
        const mkDeps = (from, every, last) => {
          const res = [];
          for (let x = from; x <= last; x += every + rng.int(-3, 3)) res.push(x);
          return res;
        };
        const deps = {
          wd: mkDeps(17 * 60 + rng.int(0, 15), rng.int(20, 30), rng.int(22, 23) * 60 + rng.int(0, 40)),
          sat: mkDeps(17 * 60 + rng.int(0, 20), rng.int(30, 45), rng.int(21, 22) * 60 + rng.int(0, 40)),
          sun: mkDeps(17 * 60 + rng.int(0, 25), rng.int(40, 60), 19 * 60 + rng.int(20, 130)),
        };
        const [lo, hi] = clearRange(place);
        const today = deps[dt];
        let t;
        if (!forged) {
          const ok = today.filter((d) => d >= lo && d + 2 <= hi);
          if (!ok.length) retry();
          t = rng.pick(ok) + rng.int(0, 2);
        } else {
          const last = today[today.length - 1];
          const options = [];
          if (last + 10 <= hi) options.push(rng.int(Math.max(lo, last + 10), Math.min(hi, last + 50)));
          for (let k = 0; k + 1 < today.length; k++) {
            const gap = today[k + 1] - today[k];
            const a = Math.max(lo, today[k] + 6);
            const b = Math.min(hi, today[k + 1] - 10);
            if (gap >= 18 && a <= b) options.push(rng.int(a, b));
          }
          if (!options.length) retry();
          t = rng.pick(options);
          if (today.some((d) => t >= d && t - d <= 2)) retry();
        }
        T.buses.push({ stop: place, line, deps });
        card = addCard({
          desk: 'D', kind: 'supplied', by, title: 'Bilet autobusowy',
          lines: [
            'MZK Borowice · bilet 60-minutowy',
            `skasowano: ${dShort}, ${fmt(t)}`,
            `linia ${line}, ${PLACES[place].name}`,
          ],
          facts: [{ t: 'claim', kind, who: by, stop: place, line, time: t }],
        });
        evs = [{ place, from: t, to: t }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'wracał', 'wracała')} do domu autobusem linii ${line} (bilet: ${id}).`;
        break;
      }
      default:
        throw new Error(kind);
    }
    s.items.push(card);
    if (!s.claimCard) s.claimCard = card;
    return { card, events: evs };
  }

  // --- Niezależne potwierdzenia (świadkowie, kamery, rejestry kart) ---------
  const WITNESS_TEXT = {
    teatr: (s, w, ts) => (ts.length > 1
      ? `„${pan(s)} ${s.first} ${g(s, 'przyszedł', 'przyszła')} na spektakl o ${fmt(ts[0])}. W przerwie, o ${fmt(ts[1])}, ${g(s, 'kupił', 'kupiła')} u mnie program.”`
      : `„${pan(s)} ${s.first} ${g(s, 'oddał', 'oddała')} płaszcz do szatni o ${fmt(ts[0])}, tuż przed spektaklem.”`),
    pub: (s, w, ts) => (ts.length > 1
      ? `„${pan(s)} ${s.first} ${g(s, 'siedział', 'siedziała')} przy barze. O ${fmt(ts[0])} ${g(s, 'zamówił', 'zamówiła')} herbatę z rumem, a o ${fmt(ts[1])} ${g(s, 'zapłacił', 'zapłaciła')} rachunek.”`
      : `„${pan(s)} ${s.first} ${g(s, 'grał', 'grała')} u nas w rzutki. O ${fmt(ts[0])} ${g(w, 'wpisałem', 'wpisałam')} wynik na tablicy.”`),
    restauracja: (s, w, ts) => (ts.length > 1
      ? `„${pan(s)} ${s.first} ${g(s, 'jadł', 'jadła')} u nas kolację. Zamówienie ${g(w, 'przyjąłem', 'przyjęłam')} o ${fmt(ts[0])}, deser ${g(w, 'podałem', 'podałam')} o ${fmt(ts[1])}.”`
      : `„${pan(s)} ${s.first} ${g(s, 'zamówił', 'zamówiła')} u mnie żurek o ${fmt(ts[0])}.”`),
    kregielnia: (s, w, ts) => (ts.length > 1
      ? `„${pan(s)} ${s.first} ${g(s, 'grał', 'grała')} na torze 4. O ${fmt(ts[0])} ${g(w, 'zapisałem', 'zapisałam')} wynik w systemie, a o ${fmt(ts[1])} ${g(s, 'oddał', 'oddała')} buty.”`
      : `„O ${fmt(ts[0])} ${pan(s).toLowerCase()} ${s.first} ${g(s, 'wypożyczył', 'wypożyczyła')} u mnie buty i ${g(s, 'zajął', 'zajęła')} tor 2.”`),
    hotel: (s, w, ts) => (ts.length > 1
      ? `„${pan(s)} ${s.first} ${g(s, 'przyszedł', 'przyszła')} do nas o ${fmt(ts[0])} i ${g(s, 'czekał', 'czekała')} w lobby na znajomego. O ${fmt(ts[1])} wciąż tam ${g(s, 'siedział', 'siedziała')}.”`
      : `„${g(w, 'Rozmawiałem', 'Rozmawiałam')} z ${s.f ? 'panią' : 'panem'} ${s.ins} przy recepcji o ${fmt(ts[0])}.”`),
    biblioteka: (s, w, ts) => (ts.length > 1
      ? `„${pan(s)} ${s.first} ${g(s, 'przyszedł', 'przyszła')} do czytelni o ${fmt(ts[0])}, a o ${fmt(ts[1])} ${g(s, 'wypożyczył', 'wypożyczyła')} dwie książki.”`
      : `„${pan(s)} ${s.first} ${g(s, 'oddał', 'oddała')} mi książki o ${fmt(ts[0])}.”`),
  };
  const TRAP_TEXT = (s, side, t) => (side === 'before'
    ? `„${pan(s)} ${s.first} ${g(s, 'wyszedł', 'wyszła')} od nas o ${fmt(t)}. ${g(s, 'Spieszył', 'Spieszyła')} się.”`
    : `„${pan(s)} ${s.first} ${g(s, 'przyszedł', 'przyszła')} do nas dopiero o ${fmt(t)}.”`);

  function makeNeutral(source, s, mode) {
    if (source === 'witness') {
      const place = takePlace((p) => p.witness);
      const w = nextWitness();
      let ts;
      let text;
      if (mode === 'clear') {
        const t1 = timeIn(place);
        ts = rng.chance(0.55) ? [t1, t1 + rng.int(20, 55)] : [t1];
        text = WITNESS_TEXT[place](s, w, ts);
      } else {
        const trap = trapTime(place);
        ts = [trap.t];
        text = TRAP_TEXT(s, trap.side, trap.t);
      }
      addCard({
        desk: 'S', kind: 'witness', title: `Zeznanie: ${w.full}`,
        sub: `${PLACES[place].witness[w.f ? 'f' : 'm']} ${PLACES[place].loc}`,
        lines: [text],
        // Dwie godziny w zeznaniu („o 20:19 zamówił, o 21:12 zapłacił”) to pobyt przez cały ten czas.
        facts: [{ t: 'seen', who: s.id, place, from: ts[0], to: ts[ts.length - 1] }],
      });
      return { place, events: [{ place, from: ts[0], to: ts[ts.length - 1] }] };
    }
    if (source === 'cctv') {
      const place = takePlace((p) => p.cctv);
      const t = mode === 'clear' ? timeIn(place) : trapTime(place).t;
      addCard({
        desk: 'Z', kind: 'official', title: 'Monitoring miejski',
        lines: [
          `Kamera nr ${rng.int(2, 19)} · ${PLACES[place].name}`,
          `Nagranie z godz. ${fmt(t)}`,
          `Wyraźnie widać: ${s.full} ${rng.pick(CCTV_DETAILS)}.`,
        ],
        facts: [{ t: 'seen', who: s.id, place, from: t, to: t }],
      });
      return { place, events: [{ place, from: t, to: t }] };
    }
    // rejestr kart wejściowych
    const place = takePlace((p) => p.cardlog);
    let t1;
    let t2;
    if (mode === 'clear') {
      t1 = timeIn(place);
      t2 = t1 + rng.int(45, 100);
    } else {
      const trap = trapTime(place);
      if (trap.side === 'before') {
        t2 = trap.t;
        t1 = t2 - rng.int(40, 80);
      } else {
        t1 = trap.t;
        t2 = t1 + rng.int(40, 80);
      }
    }
    if (!T.cardlogs[place]) T.cardlogs[place] = [];
    T.cardlogs[place].push({ owner: s.id, ownerName: s.full, t1, t2 });
    return { place, events: [{ place, from: t1, to: t2 }] };
  }

  // --- Plan alibi ------------------------------------------------------------
  const culpritIdx = rng.int(0, 4);
  const innocents = [0, 1, 2, 3, 4].filter((i) => i !== culpritIdx);
  const decoyIdx = rng.sample(innocents, P.decoys);
  const neutralIdx = innocents.filter((i) => !decoyIdx.includes(i));
  const kinds = rng.shuffle(ALL_KINDS);
  let kp = 0;

  const culprit = suspects[culpritIdx];
  const forgedKind = kinds[kp++];
  const forgedCard = attempt(culprit, () => makeClaim(forgedKind, culprit, true)).card;
  for (const i of decoyIdx) {
    const kind = kinds[kp++];
    attempt(suspects[i], () => makeClaim(kind, suspects[i], false));
  }
  const neutralPlace = {};
  for (const i of neutralIdx) {
    neutralPlace[i] = attempt(suspects[i], () => makeNeutral(rng.pick(['witness', 'witness', 'cctv', 'cardlog']), suspects[i], 'clear')).place;
  }
  for (let k = 0; k < P.extraTrueItems && k < neutralIdx.length; k++) {
    const kind = kinds[kp++];
    const sus = suspects[neutralIdx[k]];
    attempt(sus, () => makeClaim(kind, sus, false));
  }
  for (const i of rng.sample(innocents, P.traps)) attempt(suspects[i], () => makeNeutral(rng.pick(['witness', 'cctv', 'cardlog']), suspects[i], 'trap'));
  if (P.culpritTrap) attempt(culprit, () => makeNeutral(rng.pick(['witness', 'witness', 'cctv', 'cardlog']), culprit, 'trap'));

  // --- Karty urzędowe ze wspólnych tabel --------------------------------------
  const wantTable = (has) => has || rng.chance(P.noiseTableChance);

  // Rozkład jazdy pociągów
  if (wantTable(T.trains.length > 0)) {
    const n = rng.int(2, 4);
    for (let k = 0; k < n; k++) {
      let no;
      do no = `${rng.pick(['IC', 'TLK', 'R'])} ${rng.int(1000, 8999)}`; while (usedTrainNos.has(no));
      usedTrainNos.add(no);
      const dest = rng.pick(TRAIN_DESTINATIONS);
      T.trains.push({ no, dest: dest.name, dep: rng.int(17 * 60 + 30, 22 * 60 + 50), note: rng.pick(['', '', '†', '‡', '◊', '*']) });
    }
    T.trains.sort((a, b) => a.dep - b.dep);
    const symbols = [...new Set(T.trains.map((r) => r.note).filter(Boolean))];
    const legendLines = Object.keys(TRAIN_NOTES).filter(Boolean).map((sym) => `${sym} ${TRAIN_NOTES[sym].text}`);
    const tt = addCard({
      desk: 'M', title: 'Rozkład jazdy: stacja Borowice',
      sub: 'odjazdy wieczorne',
      lines: [
        ...T.trains.map((r) => `${fmt(r.dep)}  ${r.no} → ${r.dest}${r.note ? ` ${r.note}` : ''}`),
        ...(P.splitLegend ? ['Objaśnienia znaków na osobnej karcie.'] : ['Objaśnienia:', ...legendLines]),
      ],
      facts: T.trains.map((r) => ({ t: 'train', ...r })),
    });
    const legendFacts = symbols.map((symbol) => ({ t: 'legend', symbol }));
    if (P.splitLegend) {
      addCard({ desk: 'M', title: 'Objaśnienia znaków w rozkładach', lines: legendLines, facts: legendFacts });
    } else tt.facts.push(...legendFacts);
  }

  // Godziny otwarcia lokali
  if (wantTable(T.hours.length > 0)) {
    const extra = Object.keys(PLACES).filter((k) => PLACES[k].venue && !T.hours.some((h) => h.place === k));
    for (const place of rng.sample(extra, rng.int(1, 3))) {
      const span = () => [rng.pick([7, 8, 9, 10]) * 60, rng.pick([18, 19, 20, 21, 22]) * 60];
      T.hours.push({ place, wd: span(), sat: rng.chance(0.8) ? span() : null, sun: rng.chance(0.5) ? span() : null });
    }
    const fmtSpan = (sp) => (sp ? `${fmtHour(sp[0])}–${fmtHour(sp[1])}` : 'nieczynne');
    addCard({
      desk: 'R', title: 'Godziny otwarcia lokali',
      sub: 'rejestr Urzędu Miasta',
      lines: rng.shuffle(T.hours).map((h) => `${PLACES[h.place].name}: pn–pt ${fmtSpan(h.wd)} · sob ${fmtSpan(h.sat)} · nd ${fmtSpan(h.sun)}`),
      facts: T.hours.map((h) => ({ t: 'hours', ...h })),
    });
  }

  // Pogoda i zachód słońca
  const hasPhoto = Boolean(T.weather);
  if (hasPhoto || rng.chance(P.noiseTableChance)) {
    let rain = [];
    if (T.weather) rain = T.weather.rain;
    else if (rng.chance(0.5)) {
      const a = round5(rng.int(17 * 60, 21 * 60));
      rain = [[a, a + round5(rng.int(30, 120))]];
    }
    const segs = [];
    let cur = 16 * 60;
    for (const [a, b] of rain.slice().sort((x, y) => x[0] - y[0])) {
      if (a > cur) segs.push(`${fmt(cur)}–${fmt(a)} bez opadów`);
      segs.push(`${fmt(Math.max(a, cur))}–${fmt(b)} deszcz`);
      cur = b;
    }
    if (cur < 24 * 60) segs.push(`${fmt(cur)}–24:00 bez opadów`);
    const sunrise = Math.round(2 * (11 * 60 + 50 + (isSummerTime(crimeIso) ? 60 : 0)) - sunset);
    const wf = [{ t: 'weather' }, ...rain.map(([from, to]) => ({ t: 'rain', from, to }))];
    const sunsetLine = `Wschód słońca ${fmt(sunrise)} · zachód słońca ${fmt(sunset)}`;
    if (P.splitLegend) {
      addCard({ desk: 'R', title: 'Stacja meteorologiczna Borowice', sub: dShort, lines: segs, facts: wf });
      addCard({ desk: 'R', title: 'Kalendarz astronomiczny', sub: dShort, lines: [sunsetLine], facts: [{ t: 'sunset', time: sunset }] });
    } else {
      addCard({ desk: 'R', title: 'Stacja meteorologiczna Borowice', sub: dShort, lines: [...segs, sunsetLine], facts: [...wf, { t: 'sunset', time: sunset }] });
    }
  }

  // Repertuar kina
  if (wantTable(T.films.length > 0)) {
    const n = rng.int(2, 3);
    for (let k = 0; k < n; k++) {
      const film = rng.pick(FILMS.filter((f) => !T.films.some((x) => x.film === f)));
      const a = round5(rng.int(15 * 60, 18 * 60));
      T.films.push({ film, dur: rng.int(90, 130), starts: [a, round5(a + rng.int(140, 240))] });
    }
    const claimed = T.films.find((f) => f.claimed);
    if (claimed?.forged && rng.chance(0.5)) {
      const other = T.films.find((f) => !f.claimed);
      if (other) other.starts = [...new Set([...other.starts, claimed.start])].sort((x, y) => x - y);
    }
    const facts = [];
    for (const f of T.films) for (const st of f.starts) facts.push({ t: 'screening', film: f.film, start: st, dur: f.dur });
    addCard({
      desk: 'R', title: 'Repertuar kina „Mewa”', sub: dShort,
      lines: rng.shuffle(T.films).map((f) => `„${f.film}” (${f.dur} min): ${f.starts.map(fmt).join(' · ')}`),
      facts,
    });
  }

  // Spis ulic
  if (wantTable(T.streets.length > 0)) {
    const extra = Object.keys(PLACES).filter((k) => PLACES[k].street && !T.streets.some((r) => r.street === k));
    for (const street of rng.sample(extra, rng.int(2, 3))) {
      const parity = rng.pick(['all', 'even', 'odd']);
      let max = rng.int(8, 40);
      if (parity === 'even' && max % 2) max += 1;
      if (parity === 'odd' && max % 2 === 0) max += 1;
      T.streets.push({ street, parity, max });
    }
    const desc = (r) => (r.parity === 'all' ? `numery 1–${r.max}` : r.parity === 'even' ? `tylko parzyste, 2–${r.max}` : `tylko nieparzyste, 1–${r.max}`);
    addCard({
      desk: 'M', title: 'Spis numeracji budynków',
      sub: 'wybrane ulice',
      lines: rng.shuffle(T.streets).map((r) => `${PLACES[r.street].name}: ${desc(r)}`),
      facts: T.streets.map((r) => ({ t: 'street', ...r })),
    });
  }

  // Strefy płatnego parkowania
  if (wantTable(T.zones.length > 0)) {
    const letters = ['A', 'B', 'C'].filter((z) => !T.zones.some((x) => x.zone === z));
    const freeStreets = Object.keys(PLACES).filter((k) => PLACES[k].parking && !T.zones.some((x) => x.streets.includes(k)));
    for (const zone of rng.sample(letters, rng.int(1, 2))) {
      const span = () => [rng.pick([8, 9]) * 60, rng.pick([16, 18, 20]) * 60];
      const streets = freeStreets.splice(0, 1);
      if (!streets.length) break;
      T.zones.push({ zone, streets, hours: { wd: span(), sat: rng.chance(0.6) ? span() : null, sun: null } });
    }
    for (const z of T.zones) {
      if (freeStreets.length && rng.chance(0.5)) z.streets.push(freeStreets.shift());
    }
    const fmtSpan = (sp) => (sp ? `${fmtHour(sp[0])}–${fmtHour(sp[1])}` : 'bezpłatnie');
    addCard({
      desk: 'R', title: 'Strefy płatnego parkowania',
      sub: 'uchwała Rady Miasta',
      lines: [
        ...T.zones.slice().sort((a, b) => a.zone.localeCompare(b.zone)).map((z) => `Strefa ${z.zone} (${z.streets.map((k) => PLACES[k].name).join(', ')}): pn–pt ${fmtSpan(z.hours.wd)} · sob ${fmtSpan(z.hours.sat)} · nd ${fmtSpan(z.hours.sun)}`),
        'Poza godzinami płatnymi parkomaty są wyłączone i nie drukują biletów.',
      ],
      facts: T.zones.map((z) => ({ t: 'zone', zone: z.zone, streets: z.streets, hours: z.hours })),
    });
  }

  // Rozkłady autobusów
  for (const b of T.buses) {
    const short = (list) => list.map(fmt).join(' ');
    addCard({
      desk: 'M', title: `Przystanek ${PLACES[b.stop].stop}: linia ${b.line}`,
      sub: 'odjazdy wieczorne',
      lines: [
        `pn–pt: ${short(b.deps.wd)}`,
        `soboty: ${short(b.deps.sat)}`,
        `niedziele: ${short(b.deps.sun)}`,
        'Autobus zatrzymuje się na przystanku tylko na chwilę. Bilet kasuje się od razu po wejściu, najpóźniej 2 minuty po odjeździe z rozkładu.',
      ],
      facts: [{ t: 'bus', stop: b.stop, line: b.line, deps: b.deps }],
    });
  }

  // Rejestry kart wejściowych (+ ewentualnie osobna lista właścicieli kart)
  for (const [place, rows] of Object.entries(T.cardlogs)) {
    const others = rng.int(1, 2);
    for (let k = 0; k < others; k++) {
      const w = nextWitness();
      const a = rng.int(17 * 60, 21 * 60);
      rows.push({ owner: w.full, ownerName: w.full, t1: a, t2: a + rng.int(40, 100) });
    }
    const used = new Set();
    for (const r of rows) {
      do r.no = rng.int(100, 899); while (used.has(r.no));
      used.add(r.no);
    }
    const sorted = rows.slice().sort((a, b) => a.t1 - b.t1);
    const split = P.splitCardOwners;
    const logFacts = [];
    for (const r of rows) {
      logFacts.push({ t: 'cardlog', place, card: r.no, from: r.t1, to: r.t2 });
    }
    const ownerFacts = rows.map((r) => ({ t: 'cardowner', place, card: r.no, who: r.owner }));
    addCard({
      desk: 'R', title: `Rejestr wejść: ${PLACES[place].name}`, sub: dShort,
      lines: sorted.map((r) => `karta nr ${r.no}${split ? '' : ` (${r.ownerName})`}: wejście ${fmt(r.t1)}, wyjście ${fmt(r.t2)}`),
      facts: split ? logFacts : [...logFacts, ...ownerFacts],
    });
    if (split) {
      addCard({
        desk: 'D', title: `Właściciele kart wejściowych: ${PLACES[place].name}`,
        lines: rng.shuffle(rows).map((r) => `nr ${r.no}: ${r.ownerName}`),
        facts: ownerFacts,
      });
    }
  }

  // --- Szum: karty bez znaczenia dla rozwiązania ------------------------------
  const owner = scene.owner;
  const initials = owner.full.split(' ').map((x) => x[0]).join('.') + '.';
  const amount = () => `${rng.int(12, 180)} ${rng.pick(['000', '500'])}`;
  const NOISE = {
    D: [
      () => ({ title: 'Polisa ubezpieczeniowa', lines: [`Polisa nr PL-${rng.int(100000, 999999)}`, `Przedmiot: ${stolenNom}`, `Suma ubezpieczenia: ${amount()} zł`, `Ubezpieczony: ${owner.full}`] }),
      () => ({ title: 'Protokół oględzin', lines: ['Zamek bez śladów forsowania.', 'Drzwi otwarto kodem wpisanym na klawiaturze.', 'Na klamce i klawiaturze brak odcisków palców.'] }),
      () => ({ title: 'Faktura za serwis alarmu', lines: [`Faktura nr ${rng.int(10, 299)}/2026`, 'Przegląd czujnika drzwi i synchronizacja zegara.', 'Stan: sprawny, zegar zgodny co do sekundy.'] }),
      () => ({ title: 'Notatka z tablicy na zapleczu', lines: [`„Przypominam: kodu nie podajemy nikomu obcemu. ${initials}”`] }),
      () => ({ title: 'Wycinek z „Gazety Borowickiej”', lines: ['W weekend w Teatrze Miejskim premiera „Zemsty”.', 'Bilety na wszystkie spektakle wyprzedane.'] }),
      () => ({ title: 'Wycena rzeczoznawcy', lines: [`Przedmiot: ${stolenNom}`, `Wartość rynkowa: ${amount()} zł`] }),
      () => ({ title: 'Lista osób znających kod', lines: ['Kod zmieniono na początku miesiąca.', `Znają go: ${suspects.map((x) => x.full).join(', ')}.`] }),
      () => ({ title: 'Umowa z firmą ochroniarską', lines: ['Firma: Ochrona Borowice', 'Zakres: czujnik drzwi i alarm, bez kamer.', 'Patrol przyjeżdża tylko po włączeniu się alarmu.'] }),
      () => ({ title: 'Rachunek za prąd', lines: ['Zakład Energetyczny Borowice', `Zużycie w poprzednim miesiącu: ${rng.int(150, 320)} kWh`, `Do zapłaty: ${rng.int(120, 260)},${rng.int(10, 99)} zł`] }),
    ],
    S: [
      () => { const w = nextWitness(); return { title: `Zeznanie: ${w.full}`, sub: g(w, 'sąsiad z naprzeciwka', 'sąsiadka z naprzeciwka'), lines: [`„Około ${fmt(W1)} ${g(w, 'usłyszałem', 'usłyszałam')} pisk drzwi. Przez firankę nikogo nie ${g(w, 'widziałem', 'widziałam')}.”`] }; },
      () => { const w = nextWitness(); return { title: `Zeznanie: ${w.full}`, sub: g(w, 'dozorca sąsiedniej kamienicy', 'dozorczyni sąsiedniej kamienicy'), lines: [`„O 22:00 ${g(w, 'zamknąłem', 'zamknęłam')} bramę na podwórko. Wieczorem było spokojnie.”`] }; },
      () => { const w = nextWitness(); return { title: `Zeznanie: ${w.full}`, sub: g(w, 'taksówkarz', 'taksówkarka'), lines: [`„${g(w, 'Miałem', 'Miałam')} wieczorem tylko dwa kursy, oba na dworzec. Nikogo z tej piątki nie ${g(w, 'wiozłem', 'wiozłam')}.”`] }; },
      () => { const w = nextWitness(); return { title: `Zeznanie: ${w.full}`, sub: g(w, 'sprzedawca w budce z kebabem', 'sprzedawczyni w budce z kebabem'), lines: ['„Koło 21:00 ktoś w kapturze przebiegł w stronę parku. Chyba biegacz, miał opaskę odblaskową.”'] }; },
      () => ({ title: `Zeznanie: ${owner.full}`, sub: scene.ownerRole, lines: [`„${g(owner, 'Wyszedłem', 'Wyszłam')} o ${fmt(closeT)}, ${g(owner, 'zamknąłem', 'zamknęłam')} drzwi i ${g(owner, 'uzbroiłem', 'uzbroiłam')} alarm. Rano ${g(owner, 'zauważyłem', 'zauważyłam')} kradzież.”`] }),
    ],
    M: [
      () => ({ title: 'Plan miasta: objaśnienia', lines: ['Rzeka dzieli miasto na dwie części.', 'Dla aut jedyną przeprawą jest most przy Rynku.', 'Piesi mogą przejść także kładką przy bulwarze.'] }),
      () => ({ title: 'Komunikat drogowy', lines: ['Remont chodnika przy ul. Szpitalnej.', 'Ruch pieszy bez utrudnień.'] }),
      () => ({ title: 'Mapa ścieżek rowerowych', lines: ['Ścieżka wzdłuż rzeki: od bulwaru do stadionu.', 'Stacje rowerów miejskich: Rynek, Dworzec, Park Zdrojowy.'] }),
    ],
    Z: [
      () => ({ title: 'Zdjęcie z oględzin', lines: ['Puste miejsce po skradzionym przedmiocie.', 'Na blacie smuga po rękawiczce.'] }),
      () => ({ title: 'Zdjęcie z oględzin', lines: ['Rozmyte ślady błota przy drzwiach.', 'Nie da się ustalić rozmiaru buta.'] }),
      () => ({ title: 'Zdjęcie klawiatury przy drzwiach', lines: ['Na klawiszach 1, 4, 7 i 9 starta farba.'] }),
      () => ({ title: 'Zdjęcie z wigilii firmowej', lines: ['Cała piątka podejrzanych przy choince, rok temu.', 'Nic nie wskazuje na dawne konflikty.'] }),
      () => ({ title: 'Kamera sklepu naprzeciwko', lines: ['Kamera jest atrapą i nic nie nagrywa.'] }),
      () => ({ title: 'Monitoring miejski', lines: [`Kamera nr ${rng.int(2, 19)} · ${rng.pick(['Rynek', 'Plac Wolności', 'Dworzec kolejowy'])}`, `Nagranie z godz. ${fmt(rng.int(19 * 60, 21 * 60 + 30))}`, 'Widać parę z psem.'] }),
    ],
    R: [
      () => ({ title: 'Rejestr systemu alarmowego', lines: [`${fmt(closeT)} uzbrojony przez ${g(owner, 'właściciela', 'właścicielkę')}`, `${fmt(W1)} rozbrojony kodem`, `${fmt(W2)} uzbrojony kodem`] }),
      () => ({ title: 'Rejestr zgłoszeń straży miejskiej', lines: [`${fmt(rng.int(19 * 60, 20 * 60))} głośna muzyka, Osiedle Leśne`, `${fmt(rng.int(20 * 60, 21 * 60 + 30))} pies bez smyczy, Park Zdrojowy`] }),
      () => ({ title: 'Rowery miejskie: stacja Rynek', lines: [`${fmt(rng.int(19 * 60, 21 * 60))} wypożyczono rower nr ${rng.int(10, 60)} (karta anonimowa)`, `${fmt(rng.int(19 * 60, 21 * 60))} zwrócono rower nr ${rng.int(10, 60)}`] }),
    ],
  };

  // Zeznania o motywach (szum, ale budzą podejrzenia).
  const MOTIVES = [
    (s) => `„${s.first} od miesięcy ${g(s, 'narzekał', 'narzekała')} na brak pieniędzy.”`,
    (s) => `„W zeszłym tygodniu ${s.first} ${g(s, 'pokłócił', 'pokłóciła')} się ${scene.ownerIns} o pieniądze.”`,
    (s) => `„${s.first} ${g(s, 'pytał', 'pytała')} mnie niedawno, ile jest wart najcenniejszy eksponat.”`,
    (s) => `„${s.first} ${g(s, 'kupił', 'kupiła')} ostatnio nowy samochód. Skąd ${g(s, 'miał', 'miała')} na to pieniądze?”`,
    (s) => `„${s.first} ${g(s, 'wiedział', 'wiedziała')}, że alarm ma tylko czujnik drzwi, bez kamer.”`,
  ];
  const motiveTexts = rng.sample(MOTIVES, P.motives);
  const motiveTargets = rng.sample(suspects, P.motives);
  motiveTexts.forEach((fn, k) => {
    const w = nextWitness();
    addCard({ desk: 'S', kind: 'witness', title: `Zeznanie: ${w.full}`, sub: g(w, 'znajomy z okolicy', 'znajoma z okolicy'), lines: [fn(motiveTargets[k])] });
  });

  // Czasy dojścia: wszystkie miejsca z kart + kilka dodatkowych.
  const travelPlaces = [...usedPlaces];
  const extraPlaces = rng.sample(Object.keys(PLACES).filter((k) => !usedPlaces.has(k)), rng.int(2, 4));
  const allTravel = rng.shuffle([...travelPlaces, ...extraPlaces]);
  const chunk = allTravel.length > 7 ? Math.ceil(allTravel.length / 2) : allTravel.length;
  const parts = Math.ceil(allTravel.length / chunk);
  for (let k = 0; k < allTravel.length; k += chunk) {
    const part = allTravel.slice(k, k + chunk);
    addCard({
      desk: 'M',
      title: parts > 1 ? `Czasy dojścia do ${scene.short} (${k / chunk + 1}/${parts})` : `Czasy dojścia do ${scene.short}`,
      sub: 'najszybsza droga, tyle samo w każdą stronę',
      lines: part.map((p) => `${PLACES[p].name}: ${travel[p]} min`),
      facts: part.map((p) => ({ t: 'travel', place: p, min: travel[p] })),
    });
  }

  // Dopełnienie biurek szumem.
  for (const desk of ['D', 'S', 'M', 'Z', 'R']) {
    const pool = rng.shuffle(NOISE[desk]);
    let k = 0;
    while (cards.filter((c) => c.desk === desk).length < P.cardsPerDesk && k < pool.length) {
      addCard({ desk, kind: desk === 'S' ? 'witness' : 'official', ...pool[k++]() });
    }
  }

  // --- Numeracja kart, alibi, rozwiązanie ---------------------------------
  const finalCards = [];
  for (const desk of ['D', 'S', 'M', 'Z', 'R']) {
    rng.shuffle(cards.filter((c) => c.desk === desk)).forEach((c, i) => {
      c.id = `${desk}${i + 1}`;
      finalCards.push(c);
    });
  }

  suspects.forEach((s, i) => {
    if (s.claimCard) s.alibi = s.claimCard.alibi(s.claimCard.id);
    else s.alibi = `Twierdzi, że ${g(s, 'był', 'była')} ${PLACES[neutralPlace[i]].loc}.`;
    s.items = s.items.map((c) => c.id);
    delete s.claimCard;
  });

  const publicCards = finalCards.map((c) => ({
    id: c.id, desk: c.desk, kind: c.kind, title: c.title, sub: c.sub || '', lines: c.lines, by: c.by || null, facts: c.facts,
  }));


  return {
    version: 1,
    kind: opts.kind,
    number: opts.number,
    code: opts.code || null,
    date: opts.date,
    crimeDate: { iso: crimeIso, weekday, label: `${WEEKDAYS[weekday]}, ${dateLong(crimeIso)}` },
    difficulty: opts.difficulty,
    title: `Kradzież ${scene.inLoc}`,
    scene: { name: scene.name, address: scene.address, short: scene.short },
    intro: `${scene.name}, ${scene.address}. ${WEEKDAYS_ACC[weekday][0].toUpperCase()}${WEEKDAYS_ACC[weekday].slice(1)}, ${dateLong(crimeIso)}, ${scene.ownerRole} ${owner.full} ${g(owner, 'wyszedł', 'wyszła')} o ${fmt(closeT)} i ${g(owner, 'zamknął', 'zamknęła')} drzwi. Czujnik drzwi zarejestrował otwarcie kodem o ${fmt(W1)} i zamknięcie o ${fmt(W2)}. Rano okazało się, że skradziono ${stolen}. Kod znało pięć osób i to one są podejrzanymi.`,
    window: { from: W1, to: W2 },
    suspects: suspects.map(({ id, full, first, f, role, alibi, items }) => ({ id, full, first, f, role, alibi, items })),
    desks: DESK_DEFS,
    cards: publicCards,
    solution: { culprit: suspects[culpritIdx].id, forged: forgedCard.id },
  };
}
