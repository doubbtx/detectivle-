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
import { solveCase, qualityIssues, investigationProfile, proofDepth } from './solver.js';
import { PLACE_CELLS, SCENE_CELLS, MIN_PER_CELL, minutesApart } from './town.js';

/**
 * Wersja generatora. Podbij ją przy każdej zmianie, która zmienia treść spraw.
 * Opublikowane sprawy (cases/*.json) i tak się nie zmienią, bo gra czyta je z plików.
 */
export const GENERATOR_VERSION = 8;

/** Krótki „odcisk” sprawy: 4 znaki, po których ekipa sprawdza, że ma te same akta. */
export function caseFingerprint(c) {
  const { fingerprint, ...rest } = c;
  void fingerprint;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h = hashString(JSON.stringify(rest));
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[h % 32];
    h = Math.floor(h / 32);
  }
  return out;
}

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
    // Pn–wt więcej osób z własnymi dowodami: w raporcie nie może być tylko dwóch kart do wyboru.
    decoys: diff === 2 ? 3 : 2,
    // W alibi krzyżowym (sob–nd) nie dajemy dodatkowych dowodów: psułyby symetrię dwóch wspólnych dowodów.
    extraTrueItems: diff === 5 ? 1 : 0,
    traps: diff <= 1 ? 0 : diff <= 4 ? 1 : 2,
    culpritTrap: diff >= 3,
    cardsPerDesk: 4 + Math.ceil(diff * 0.75),
    splitLegend: diff >= 5,
    splitCardOwners: diff >= 4,
    motives: diff >= 2 ? Math.min(3, diff - 1) : 0,
    noiseTableChance: 0.25 + diff * 0.08,
    // Od piątku jedna niewinna osoba też kłamie (ale ma inne, potwierdzone alibi).
    innocentLie: diff >= 5,
    // Jak często kłamstwo wygląda na alibi (godzina w zasięgu); w pozostałych sprawach wypada tuż poza zasięgiem.
    lieAlibiChance: 0.7,
    // Pułapka fizyczna na zapieczętowanym nagraniu zamiast darmowego zeznania.
    sealedTrapChance: diff >= 5 ? 0.75 : 0.5,
    // Zeznanie bez godziny („widziałam go przy Rynku”), które naprowadza na nagranie z kamery.
    tipChance: diff >= 3 ? 0.7 : 0.3,
    // Prawdziwy dowód bez alibi (godzina poza zasięgiem): liczenie kart z alibi nie wskazuje sprawcy.
    coverChance: diff >= 5 ? 0.8 : 0.5,
    // Pn–czw przykrywki dostają też osoby z alibi od świadka (więcej kart w raporcie, ale łatwe do odrzucenia).
    neutralCover: diff <= 4,
    // Jak zdradza się fałszywka: 'table' – sprzeczność z tabelą urzędową; 'self' – sprawcę widziano
    // wtedy gdzie indziej (fizyczna niemożliwość); 'cross' – fałszywka obejmuje niewinną osobę,
    // której prawdziwy pobyt temu przeczy (alibi krzyżowe).
    forgeMode: diff <= 2 ? 'table' : diff <= 5 ? 'self' : 'cross',
    // Prawdziwy wspólny dowód dwóch niewinnych osób (zmyłka: wspólny dowód nie musi być fałszywką).
    jointDecoyChance: diff >= 6 ? 1 : diff >= 3 ? 0.5 : 0,
  };
}

class RetryError extends Error {}
const retry = () => {
  throw new RetryError('retry');
};

const ALL_KINDS = ['train', 'receipt', 'photo', 'cinema', 'delivery', 'parking', 'bus'];
/** Rodzaje dowodów, którymi może skłamać niewinna osoba. */
const LIE_KINDS = ['receipt', 'photo', 'parking', 'delivery'];

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
      c.generatorVersion = GENERATOR_VERSION;
      c.investigation = investigationProfile(c, res);
      c.depth = proofDepth(res);
      c.fingerprint = caseFingerprint(c);
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

  // Czasy dotarcia wynikają z planu Borowic: kratki w poziomie i w pionie razy MIN_PER_CELL.
  const sceneCell = SCENE_CELLS[scene.id];
  const travel = {};
  for (const key of Object.keys(PLACES)) travel[key] = minutesApart(sceneCell, PLACE_CELLS[key]);
  /** Najszybsze przejście między dwoma miejscami w mieście. */
  const between = (a, b) => (a === b ? 0 : minutesApart(PLACE_CELLS[a], PLACE_CELLS[b]));
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
  // pogodzić: przejście z A do B trwa tyle, ile kratek między nimi na planie miasta.
  const AWAY = '@poza-miastem';
  const FAR = 100000;
  const events = Object.fromEntries(suspects.map((s) => [s.id, []]));
  const tmin = (place) => (place === AWAY ? undefined : travel[place]);
  const clash = (a, b, margin) => {
    if (a.place === b.place) return false;
    if (a.from <= b.to + margin && b.from <= a.to + margin) return true;
    const [x, y] = a.to < b.from ? [a, b] : [b, a];
    if (tmin(x.place) === undefined || tmin(y.place) === undefined) return false;
    return y.from - x.to < between(x.place, y.place) + margin;
  };
  // `avoid`: pobyty, z którymi nowe dowody danej osoby nie mogą kolidować (np. fałszywy wspólny dowód,
  // żeby fałszywkę obalała dokładnie jedna karta).
  const avoid = {};
  const fits = (sid, evs) => evs.every((e, i) => events[sid].every((o) => !clash(e, o, 4)) && (avoid[sid] || []).every((o) => !clash(e, o, 4)) && evs.slice(i + 1).every((f) => !clash(e, f, 4)));

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

  const usedMeters = new Set();
  const meterNo = () => {
    let n;
    do n = rng.int(10, 59); while (usedMeters.has(n));
    usedMeters.add(n);
    return n;
  };
  const initialName = (p) => `${p.first[0]}. ${p.full.split(' ').slice(1).join(' ')}`;

  // --- Dowody dostarczone przez podejrzanych --------------------------------
  /** Godzina tuż poza zasięgiem: z tego miejsca dało się jeszcze zdążyć na kradzież (albo wrócić po niej). */
  const nearOut = (place) => {
    const d = travel[place];
    const choices = [];
    const bLo = Math.max(17 * 60, W1 - d - 18);
    const bHi = W1 - d - 4;
    if (bLo <= bHi) choices.push(() => rng.int(bLo, bHi));
    const aLo = W2 + d + 4;
    const aHi = Math.min(23 * 60 + 15, W2 + d + 18);
    if (aLo <= aHi) choices.push(() => rng.int(aLo, aHi));
    if (!choices.length) retry();
    return rng.pick(choices)();
  };

  function makeClaim(kind, s, forged, noAlibi = false, opts = {}) {
    let evs = [];
    const withP = opts.withP || null;
    const tPick = (place, lo = 18 * 60, hi = 23 * 60) => {
      if (noAlibi) return nearOut(place);
      if (opts.mustConflict) {
        // Godzina, która daje alibi, a jednocześnie nie da się jej pogodzić z prawdziwym pobytem osoby z dowodu.
        const E = opts.mustConflict[0];
        const D = between(place, E.place);
        if (E.place === place || D < 10) retry();
        const [a, b] = clearRange(place);
        const from = Math.max(a, lo, E.from - (D - 5));
        const to = Math.min(b, hi, E.to + (D - 5));
        if (from > to) retry();
        return rng.int(from, to);
      }
      return timeIn(place, lo, hi);
    };
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
        // „Poza miastem” zaczyna się kilka minut po odjeździe, żeby nie kolidował z samym odjazdem (margines 4 min).
        evs = [{ place: 'dworzec', from: t, to: t }, { place: AWAY, from: t + 5, to: FAR }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'wyjechał', 'wyjechała')} pociągiem do ${dest.gen} (bilet: ${id}).`;
        break;
      }
      case 'receipt': {
        const place = takePlace((p) => p.venue);
        const t = tPick(place);
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
        const baseItems = VENUE_ITEMS[place] || [['Usługa', '10,00']];
        const items = withP ? baseItems.map(([n, pr]) => [`2× ${n}`, (Number(pr.replace(',', '.')) * 2).toFixed(2).replace('.', ',')]) : baseItems;
        const total = items.reduce((sum, [, price]) => sum + Number(price.replace(',', '.')), 0);
        card = addCard({
          desk: 'D', kind: 'supplied', by, title: 'Paragon fiskalny',
          lines: [
            PLACES[place].name,
            PLACES[place].address,
            `${dShort} godz. ${fmt(t)}`,
            ...items.map(([n, pr]) => `${n} ${pr}`),
            `SUMA PLN ${total.toFixed(2).replace('.', ',')}`,
            ...(withP ? [`płatność dzielona, 2 karty: ${initialName(s)} (…${rng.int(1000, 9999)}), ${initialName(withP)} (…${rng.int(1000, 9999)})`] : []),
          ],
          facts: [{ t: 'claim', kind, who: by, place, time: t, ...(withP ? { with: [withP.id] } : {}) }],
        });
        evs = [{ place, from: t, to: t }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'był', 'była')} ${PLACES[place].loc}${withP ? ` razem z ${withP.ins}` : ''} (paragon: ${id}).`;
        break;
      }
      case 'photo': {
        const place = takePlace((p) => p.photo);
        let t = 0;
        for (let k = 0; k < 6; k++) {
          t = tPick(place);
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
            withP ? `Na zdjęciu: ${s.first} i ${withP.first} ${rng.pick(['uśmiechają się do obiektywu przy fontannie', 'pozują na tle ratusza', 'stoją przy barierce', 'trzymają kubki z herbatą'])}.` : `Na zdjęciu: ${s.first} ${rng.pick(PHOTO_POSES)}.`,
            `W tle: ${skyText}; ${groundText}.`,
          ],
          facts: [{ t: 'claim', kind, who: by, place, time: t, sky, ground, ...(withP ? { with: [withP.id] } : {}) }],
        });
        evs = [{ place, from: t, to: t }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'spacerował', 'spacerowała')} ${PLACES[place].walk}${withP ? ` razem z ${withP.ins}` : ''} (zdjęcie: ${id}).`;
        break;
      }
      case 'cinema': {
        usedPlaces.add('kino');
        taken.add('kino');
        const film = rng.pick(FILMS.filter((f) => !T.films.some((x) => x.film === f)));
        const start = round5(tPick('kino', 18 * 60, 21 * 60 + 30));
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
            ...(withP
              ? (() => { const seat = rng.int(3, 15); return [`2 bilety: rząd ${rng.pick(['C', 'D', 'E', 'F', 'G', 'H'])}, miejsca ${seat} i ${seat + 1} · 48,00 zł`, `rezerwacja imienna: ${initialName(s)}, ${initialName(withP)}`]; })()
              : [`rząd ${rng.pick(['C', 'D', 'E', 'F', 'G', 'H'])}, miejsce ${rng.int(3, 18)} · 24,00 zł`]),
          ],
          facts: [{ t: 'claim', kind, who: by, film, start, ...(withP ? { with: [withP.id] } : {}) }],
        });
        evs = [{ place: 'kino', from: start, to: start + dur }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'był', 'była')} w kinie „Mewa”${withP ? ` razem z ${withP.ins}` : ''} na filmie „${film}” (bilet${withP ? 'y' : ''}: ${id}).`;
        break;
      }
      case 'delivery': {
        const st1 = takePlace((p) => p.street);
        const st2 = takePlace((p) => p.street);
        const t1 = tPick(st1, 18 * 60, 22 * 60 + 30);
        const t2 = t1 + Math.max(rng.int(9, 24), between(st1, st2) + rng.int(5, 10));
        if (noAlibi && t2 > W1 - travel[st2] - 4 && t2 < W2 + travel[st2] + 4) retry();
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
        const t = tPick(place, 18 * 60, 22 * 60 + 30);
        const zone = rng.pick(['A', 'B', 'C', 'D', 'E'].filter((z) => !T.zones.some((x) => x.zone === z)));
        const span = () => [rng.pick([8, 9]) * 60, rng.pick([15, 16, 17, 18, 20, 22]) * 60];
        const hours = { wd: span(), sat: rng.chance(0.7) ? span() : null, sun: rng.chance(0.3) ? span() : null };
        if (!forged) hours[dt] = [rng.pick([8, 9, 10]) * 60, Math.min(23 * 60 + 30, Math.ceil((t + rng.int(10, 90)) / 60) * 60)];
        else if (dt !== 'wd' && rng.chance(0.4)) hours[dt] = null;
        else hours[dt] = [rng.pick([8, 9]) * 60, Math.max(12 * 60, Math.floor((t - rng.int(6, 70)) / 30) * 30)];
        T.zones.push({ zone, streets: [place], hours, claimed: true });
        card = addCard({
          desk: 'D', kind: 'supplied', by, title: 'Bilet parkingowy',
          lines: [
            `Parkomat nr ${meterNo()} · ${PLACES[place].name} · strefa ${zone}`,
            `${dShort}, wydano ${fmt(t)}`,
            'opłata 4,00 zł',
          ],
          facts: [{ t: 'claim', kind, who: by, place, zone, time: t }],
        });
        evs = [{ place, from: t, to: t }];
        card.alibi = (id) => `Twierdzi, że ${g(s, 'parkował', 'parkowała')} ${PLACES[place].loc} i ${g(s, 'sam', 'sama')} ${g(s, 'kupił', 'kupiła')} bilet w parkomacie (bilet: ${id}).`;
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
    if (opts.mustConflict && !evs.some((e) => opts.mustConflict.some((E) => clash(e, E, -4)))) retry();
    s.items.push(card);
    if (!s.claimCard) s.claimCard = card;
    return { card, events: evs };
  }

  // --- Niezależne potwierdzenia (świadkowie, kamery, rejestry kart) ---------
  const WITNESS_TEXT = {
    teatr: (s, w, ts) => (ts.length > 1
      ? `„${pan(s)} ${s.first} ${g(s, 'przyszedł', 'przyszła')} na spektakl o ${fmt(ts[0])}. W przerwie, o ${fmt(ts[1])}, ${g(s, 'kupił', 'kupiła')} u mnie program.”`
      : `„O ${fmt(ts[0])} ${pan(s).toLowerCase()} ${s.first} ${g(s, 'pytał', 'pytała')} mnie w holu, czy są jeszcze bilety na sobotę.”`),
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
  // Kilka wersji, żeby dwa zeznania w jednej sprawie nie brzmiały identycznie.
  const TRAP_BEFORE = [
    (s, t) => `„${pan(s)} ${s.first} ${g(s, 'wyszedł', 'wyszła')} od nas o ${fmt(t)}. ${g(s, 'Spieszył', 'Spieszyła')} się.”`,
    (s, t) => `„O ${fmt(t)} ${pan(s).toLowerCase()} ${s.first} ${g(s, 'założył', 'założyła')} płaszcz i ${g(s, 'wyszedł', 'wyszła')}. Więcej ${s.f ? 'jej' : 'go'} tu nie było.”`,
    (s, t) => `„${pan(s)} ${s.first} ${g(s, 'pożegnał', 'pożegnała')} się ze mną o ${fmt(t)} i ${g(s, 'poszedł', 'poszła')} w swoją stronę.”`,
  ];
  const TRAP_AFTER = [
    (s, t) => `„${pan(s)} ${s.first} ${g(s, 'przyszedł', 'przyszła')} do nas dopiero o ${fmt(t)}.”`,
    (s, t) => `„${pan(s)} ${s.first} ${g(s, 'pojawił', 'pojawiła')} się u nas o ${fmt(t)}, wcześniej ${s.f ? 'jej' : 'go'} nie było.”`,
    (s, t) => `„O ${fmt(t)} ${pan(s).toLowerCase()} ${s.first} ${g(s, 'wszedł', 'weszła')} i ${g(s, 'rozglądał', 'rozglądała')} się za kimś.”`,
  ];
  let trapB = 0;
  let trapA = 0;
  const trapShift = rng.int(0, 2);
  const TRAP_TEXT = (s, side, t) => (side === 'before'
    ? TRAP_BEFORE[(trapShift + trapB++) % TRAP_BEFORE.length](s, t)
    : TRAP_AFTER[(trapShift + trapA++) % TRAP_AFTER.length](s, t));

  const TIP_TEXTS = [
    (s, w, place) => `„${pan(s)} ${s.first} ${g(s, 'kręcił', 'kręciła')} się tamtego wieczoru ${PLACES[place].loc}. O której? Nie ${g(w, 'patrzyłem', 'patrzyłam')} na zegarek.”`,
    (s, w, place) => `„Jestem ${g(w, 'pewien', 'pewna')}, że ${pan(s).toLowerCase()} ${s.first} ${g(s, 'był', 'była')} wieczorem ${PLACES[place].loc}. Czy to było wcześnie, czy późno, tego nie wiem.”`,
    (s, w, place) => `„${pan(s)} ${s.first} ${g(s, 'przeszedł', 'przeszła')} obok mnie ${PLACES[place].loc}. Godziny nie pamiętam, ale tam wisi kamera, to się sprawdzi.”`,
    (s, w, place) => `„${pan(s)} ${s.first}? Tak, ${g(w, 'widziałem', 'widziałam')} ${s.f ? 'ją' : 'go'} ${PLACES[place].loc}. To był ten wieczór, ale godziny nie podam.”`,
  ];
  /** Zeznanie bez godziny: naprowadza na nagranie z kamery, ale samo niczego nie dowodzi. */
  const noTip = new Set();
  let tipOrder = null;
  let tipIdx = 0;
  function makeTip(s, place) {
    if (noTip.has(s.id)) return;
    if (!tipOrder) tipOrder = rng.shuffle(TIP_TEXTS.map((_, i) => i));
    const w = nextWitness();
    const text = TIP_TEXTS[tipOrder[tipIdx++ % tipOrder.length]](s, w, place);
    addCard({ desk: 'S', kind: 'witness', title: `Zeznanie: ${w.full}`, sub: g(w, 'mieszkaniec okolicy', 'mieszkanka okolicy'), lines: [text] });
  }

  /**
   * Pułapka fizyczna: niezależny świadek albo kamera widzi sprawcę gdzie indziej o godzinie,
   * której nie da się pogodzić z fałszywym dowodem (czasy dotarcia albo wyjazd pociągiem),
   * a która sama nie daje alibi na czas kradzieży.
   */
  function makePhysicalTrap(s, forgedEvs) {
    const others = events[s.id].filter((e) => !forgedEvs.includes(e));
    for (let k = 0; k < 60; k++) {
      const source = rng.chance(P.sealedTrapChance) ? 'cctv' : 'witness';
      const options = Object.keys(PLACES).filter((key) => (source === 'witness' ? PLACES[key].witness : PLACES[key].cctv) && !taken.has(key));
      if (!options.length) continue;
      const place = rng.pick(options);
      const d = travel[place];
      // Przy bilecie kolejowym świadek widzi sprawcę przed odjazdem w miejscu, z którego nie zdążyłby na dworzec
      // (trzeba policzyć czasy dotarcia), a nie po prostu „w mieście po odjeździe pociągu”.
      const F = rng.pick(forgedEvs.filter((e) => e.place !== AWAY));
      let t;
      if (F.place === AWAY) {
        t = rng.int(Math.max(F.from + 10, W2 + d + 3), F.from + 90);
      } else {
        const D = between(place, F.place);
        if (place === F.place || D < 10) continue;
        t = rng.int(F.from - (D - 5), F.to + (D - 5));
      }
      if (!(t <= W1 - d - 3 || t >= W2 + d + 3)) continue;
      if (t < 17 * 60 || t > 23 * 60 + 30) continue;
      const ev = { place, from: t, to: t };
      if (!forgedEvs.some((f) => clash(ev, f, -4))) continue;
      if (others.some((o) => clash(ev, o, 4))) continue;
      taken.add(place);
      usedPlaces.add(place);
      if (source === 'witness') {
        const w = nextWitness();
        addCard({
          desk: 'S', kind: 'witness', title: `Zeznanie: ${w.full}`,
          sub: `${PLACES[place].witness[w.f ? 'f' : 'm']} ${PLACES[place].loc}`,
          lines: [TRAP_TEXT(s, t < W1 ? 'before' : 'after', t)],
          facts: [{ t: 'seen', who: s.id, place, from: t, to: t }],
        });
      } else {
        addCard({
          desk: 'Z', kind: 'official', title: 'Monitoring miejski',
          lines: [`Kamera nr ${rng.int(2, 19)} · ${PLACES[place].name}`, `Nagranie z godz. ${fmt(t)}`, `Wyraźnie widać: ${s.full} ${rng.pick(CCTV_DETAILS)}.`],
          facts: [{ t: 'seen', who: s.id, place, from: t, to: t }],
        });
        if (rng.chance(P.tipChance)) makeTip(s, place);
      }
      events[s.id].push(ev);
      return;
    }
    retry();
  }

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
      if (rng.chance(P.tipChance)) makeTip(s, place);
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
  // W alibi krzyżowym kłamstwo nie zabiera rodzajów wspólnych dowodów (paragon, zdjęcie, kino).
  const lieKinds = P.forgeMode === 'cross' ? ['parking', 'delivery'] : LIE_KINDS;
  const lieKind = P.innocentLie ? kinds.splice(kinds.findIndex((k) => lieKinds.includes(k)), 1)[0] : null;
  let kp = 0;

  const culprit = suspects[culpritIdx];
  // Weekend: zawsze dwa wspólne dowody i jeden zwykły. W około 60% spraw fałszywką jest wspólny dowód sprawcy
  // (alibi krzyżowe), w pozostałych oba wspólne dowody są prawdziwe, a fałszywką jest zwykły dowód sprawcy
  // (zdradza go fizyczna niemożliwość). Z samych akt nie da się więc wskazać fałszywki.
  const weekend = P.forgeMode === 'cross';
  const mode = weekend && rng.chance(0.56) ? 'self' : P.forgeMode;
  const JOINT_KINDS = ['receipt', 'photo', 'cinema'];
  // Rodzaj dowodu zarezerwowany na fałszywkę krzyżową i na prawdziwy wspólny dowód (zmyłkę).
  // Bilet do kina łatwiej „zgrać” w sprzeczność z pobytem Y, więc losujemy go rzadziej: wtedy rodzaj wspólnego
  // dowodu nie zdradza, który z dwóch jest fałszywy.
  // Alibi krzyżowe: losujemy parę rodzajów dla dwóch wspólnych dowodów i dopiero potem, który z nich jest
  // fałszywy, żeby rodzaj dowodu niczego nie zdradzał. Wagi FW wyrównują to, że niektóre rodzaje
  // częściej przechodzą kontrolę jakości jako fałszywka (dobrane pomiarem na kilkuset dniach).
  let crossKind = null;
  let jointKind = null;
  let jointKind2 = null;
  if (weekend && mode === 'self') {
    [jointKind, jointKind2] = rng.sample(JOINT_KINDS.filter((k) => kinds.includes(k)), 2);
    for (const k of [jointKind, jointKind2]) kinds.splice(kinds.indexOf(k), 1);
  } else if (mode === 'cross') {
    const pair = rng.sample(JOINT_KINDS.filter((k) => kinds.includes(k)), 2);
    const FW = { receipt: 1.35, photo: 1.05, cinema: 0.55 };
    const forgedFirst = rng.chance(FW[pair[0]] / (FW[pair[0]] + FW[pair[1]]));
    [crossKind, jointKind] = forgedFirst ? pair : [pair[1], pair[0]];
    for (const k of pair) kinds.splice(kinds.indexOf(k), 1);
  } else {
    const jointIdx = rng.chance(P.jointDecoyChance) ? kinds.findIndex((k) => JOINT_KINDS.includes(k)) : -1;
    jointKind = jointIdx >= 0 ? kinds.splice(jointIdx, 1)[0] : null;
  }
  const neutralPlace = {};
  // Alibi krzyżowe: dwa symetryczne wspólne dowody. Fałszywy (sprawca + Y) i prawdziwy (zmyłka A + N2).
  // A nie ma innego dowodu z alibi (tak jak sprawca), a N2, tak jak Y, ma prawdziwy pobyt tylko
  // na zapieczętowanym nagraniu albo w rejestrze. Żeby wskazać fałszywkę, trzeba to sprawdzić.
  const jointOwnerIdx = weekend ? rng.pick(decoyIdx) : -1;
  const jointPartnerIdx = weekend ? neutralIdx[1] : -1;
  // Drugi prawdziwy wspólny dowód (weekend bez alibi krzyżowego): druga zmyłka razem z Y.
  const jointOwner2Idx = weekend && mode === 'self' ? decoyIdx.find((i) => i !== jointOwnerIdx) : -1;
  const jointPartner2Idx = weekend && mode === 'self' ? neutralIdx[0] : -1;
  let forgedCard;
  let forgedEvents = [];
  if (mode === 'cross') {
    // Alibi krzyżowe: sprawca pokazuje wspólny dowód z niewinną osobą Y, a prawdziwy pobyt Y temu przeczy.
    const forgedKind = crossKind;
    const yIdx = neutralIdx[0];
    const Y = suspects[yIdx];
    // Prawdziwy pobyt Y jest na zapieczętowanym nagraniu albo w rejestrze wejść: trzeba go zlecić,
    // a trop jest logiczny (Y twierdzi, że był właśnie tam).
    // Bez zeznania-tropu: Y sam mówi, gdzie był, a trop wprost do kamery Y zdradzałby fałszywkę.
    noTip.add(Y.id);
    neutralPlace[yIdx] = attempt(Y, () => makeNeutral(rng.pick(['cctv', 'cardlog']), Y, 'clear')).place;
    noTip.delete(Y.id);
    const yEvents = events[Y.id].slice();
    const res = attempt(culprit, () => makeClaim(forgedKind, culprit, false, false, { withP: Y, mustConflict: yEvents }));
    forgedCard = res.card;
    forgedEvents = res.events;
    avoid[Y.id] = res.events;
  } else {
    // Fałszywka „fizyczna”: rodzaj losujemy z wagami, bo niektóre rodzaje częściej przechodzą kontrolę
    // jakości. Dzięki temu żaden rodzaj dowodu nie jest „zawsze prawdziwy” ani „zwykle fałszywy”.
    if (mode === 'self') {
      const W = { receipt: 3.4, photo: 2.6, train: 1.15, parking: 2.4, bus: 1.4, delivery: 0.9, cinema: 1.0 };
      const avail = kinds.slice(kp);
      let x = rng.next() * avail.reduce((sum, k) => sum + (W[k] || 1), 0);
      const pick = avail.find((k) => (x -= W[k] || 1) < 0) || avail[avail.length - 1];
      const at = kinds.indexOf(pick, kp);
      [kinds[kp], kinds[at]] = [kinds[at], kinds[kp]];
    }
    const forgedKind = kinds[kp++];
    const res = attempt(culprit, () => makeClaim(forgedKind, culprit, mode === 'table'));
    forgedCard = res.card;
    forgedEvents = res.events;
  }
  for (const i of decoyIdx) {
    if (i === jointOwnerIdx || i === jointOwner2Idx) continue;
    const kind = kinds[kp++];
    attempt(suspects[i], () => makeClaim(kind, suspects[i], false));
  }
  for (const i of neutralIdx) {
    if (neutralPlace[i]) continue;
    if (i === jointPartnerIdx || i === jointPartner2Idx) {
      noTip.add(suspects[i].id);
      neutralPlace[i] = attempt(suspects[i], () => makeNeutral(rng.pick(['cctv', 'cardlog']), suspects[i], 'clear')).place;
      noTip.delete(suspects[i].id);
      continue;
    }
    neutralPlace[i] = attempt(suspects[i], () => makeNeutral(rng.pick(['witness', 'witness', 'cctv', 'cardlog']), suspects[i], 'clear')).place;
  }
  const extraIdx = neutralIdx.slice(0, P.extraTrueItems);
  for (const i of extraIdx) {
    const kind = kinds[kp++];
    attempt(suspects[i], () => makeClaim(kind, suspects[i], false));
  }
  // Prawdziwe wspólne dowody dwóch niewinnych osób.
  const makeJoint = (kind, pair) => {
    for (let k = 0; k < 30; k++) {
      const [ai, bi] = pair || rng.sample(innocents.filter((i) => !avoid[suspects[i].id]), 2);
      const A = suspects[ai];
      const B = suspects[bi];
      const sn = snapshot();
      try {
        const res = makeClaim(kind, A, false, false, { withP: B });
        if (fits(A.id, res.events) && fits(B.id, res.events)) {
          events[A.id].push(...res.events);
          events[B.id].push(...res.events);
          return true;
        }
        restore(sn, A);
      } catch (e) {
        if (!(e instanceof RetryError)) throw e;
        restore(sn, A);
      }
    }
    return false;
  };
  let jointDone = false;
  if (jointKind && (weekend || innocents.filter((i) => !avoid[suspects[i].id]).length >= 2)) {
    jointDone = makeJoint(jointKind, weekend ? [jointOwnerIdx, jointPartnerIdx] : null);
  }
  if (jointKind2 && !makeJoint(jointKind2, [jointOwner2Idx, jointPartner2Idx])) retry();
  // W alibi krzyżowym zawsze leży też prawdziwy wspólny dowód: inaczej fałszywka byłaby jedynym takim dowodem.
  if (weekend && !jointDone) retry();
  // Karty-przykrywki: prawdziwe dowody bez alibi (godzina tuż poza zasięgiem) u sprawcy i u zmyłek,
  // żeby samo liczenie kart z alibi nie wskazywało sprawcy.
  const COVER_KINDS = ['receipt', 'parking', 'delivery'];
  for (const i of [culpritIdx, ...decoyIdx, ...(P.neutralCover ? neutralIdx : [])]) {
    if (!rng.chance(P.coverChance)) continue;
    const s = suspects[i];
    const kind = rng.pick(COVER_KINDS);
    try {
      attempt(s, () => makeClaim(kind, s, false, true));
    } catch (e) {
      if (!(e instanceof RetryError)) throw e;
    }
  }

  // Kłamstwo niewinnej osoby: fałszywy dowód, a obok niego inne, prawdziwe alibi tej osoby.
  // Kłamca ma niezależne alibi od świadka, kamery albo rejestru.
  let lieCard = null;
  if (lieKind) {
    // W weekend kłamie jedna ze zmyłek (w obu odmianach tak samo, żeby kłamca nie zdradzał odmiany).
    const pool = weekend ? decoyIdx : neutralIdx.filter((i) => !extraIdx.includes(i));
    const liar = suspects[rng.pick(pool.length ? pool : neutralIdx)];
    // Kłamstwo zwykle wygląda na alibi (godzina w zasięgu), a od fałszywki sprawcy odróżnia je to,
    // że kłamca ma inne, potwierdzone alibi. Czasem godzina wypada tuż poza zasięgiem.
    const lieNoAlibi = !rng.chance(P.lieAlibiChance);
    lieCard = attempt(liar, () => makeClaim(lieKind, liar, true, lieNoAlibi)).card;
  }
  // Pułapki niewinnych są na nagraniu tak samo często jak pułapka sprawcy, żeby kamera z zeznaniem-tropem go nie zdradzała.
  for (const i of rng.sample(innocents, P.traps)) attempt(suspects[i], () => makeNeutral(rng.chance(P.sealedTrapChance) ? 'cctv' : rng.pick(['witness', 'cardlog']), suspects[i], 'trap'));
  if (mode === 'self') makePhysicalTrap(culprit, forgedEvents);
  // Pułapka sprawcy jest na nagraniu (z ewentualnym zeznaniem-tropem) mniej więcej tak często jak pułapka
  // któregoś z niewinnych, żeby trop do kamery nie wskazywał ani sprawcy, ani niewinnych.
  else if (P.culpritTrap) attempt(culprit, () => makeNeutral(rng.chance(0.4) ? 'cctv' : rng.pick(['witness', 'cardlog']), culprit, 'trap'));

  // W raporcie wybiera się fałszywkę spośród dowodów od podejrzanych: musi ich być co najmniej cztery,
  // inaczej dałoby się ją po prostu zgadnąć.
  if (cards.filter((k) => k.kind === 'supplied').length < 4) retry();

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
    // Lokale, w których ktoś był widziany (np. świadek w restauracji), nie dostają losowych godzin.
    const extra = Object.keys(PLACES).filter((k) => PLACES[k].venue && !taken.has(k) && !T.hours.some((h) => h.place === k));
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
        'Autobus zatrzymuje się na przystanku tylko na chwilę. Bilet kasuje się od razu po wejściu, najpóźniej 2 minuty po rozkładowej godzinie odjazdu.',
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
      () => ({ title: 'Wycinek z „Gazety Borowickiej”', lines: ['W Teatrze Miejskim trwają próby do premiery „Zemsty”.', 'Kasa biletowa czynna codziennie od 10:00.'] }),
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
      () => ({ title: 'Plan miasta: objaśnienia', lines: ['Rzeka dzieli miasto na dwie części, ale mostów i kładek jest kilkanaście.', 'Czasy dotarcia na kartach już to uwzględniają.'] }),
      () => ({ title: 'Komunikat drogowy', lines: ['Remont chodnika przy ul. Szpitalnej.', 'Ruch pieszy bez utrudnień.'] }),
      () => ({ title: 'Mapa ścieżek rowerowych', lines: ['Ścieżka wzdłuż rzeki: od bulwaru do stadionu.', 'Wieczorem ścieżka nie jest oświetlona.'] }),
    ],
    Z: [
      () => ({ title: 'Zdjęcie z oględzin', lines: ['Puste miejsce po skradzionym przedmiocie.', 'Na blacie smuga po rękawiczce.'] }),
      () => ({ title: 'Zdjęcie z oględzin', lines: ['Na wycieraczce ślady piasku z budowy obok.', 'Nie da się ustalić rozmiaru buta.'] }),
      () => ({ title: 'Zdjęcie klawiatury przy drzwiach', lines: ['Na klawiszach 1, 4, 7 i 9 starta farba.'] }),
      () => ({ title: 'Zdjęcie z jubileuszu lokalu', lines: ['Rok temu: cała piątka podejrzanych wśród gości.', 'Wszyscy uśmiechnięci, z kieliszkami w dłoniach.'] }),
      () => ({ title: 'Kamera sklepu naprzeciwko', lines: ['Kamera jest atrapą i nic nie nagrywa.'] }),
      () => ({ title: 'Monitoring miejski', lines: [`Kamera nr ${rng.int(2, 19)} · ${rng.pick(['Rynek', 'Plac Wolności', 'Dworzec kolejowy'])}`, `Nagranie z godz. ${fmt(rng.int(19 * 60, 21 * 60 + 30))}`, 'Widać parę z psem.'] }),
    ],
    R: [
      () => ({ title: 'Rejestr systemu alarmowego', lines: [`${fmt(closeT)} uzbrojony przez ${g(owner, 'właściciela', 'właścicielkę')}`, `${fmt(W1)} rozbrojony kodem`, `${fmt(W2)} uzbrojony kodem`] }),
      () => ({ title: 'Rejestr zgłoszeń straży miejskiej', lines: [`${fmt(rng.int(19 * 60, 20 * 60))} głośna muzyka, Osiedle Leśne`, `${fmt(rng.int(20 * 60, 21 * 60 + 30))} pies bez smyczy, Park Zdrojowy`] }),
      () => {
        const [a, b] = [rng.int(19 * 60, 21 * 60), rng.int(19 * 60, 21 * 60)].sort((x, y) => x - y);
        return { title: 'Rowery miejskie: stacja Rynek', lines: [`${fmt(a)} wypożyczono rower nr ${rng.int(10, 60)} (karta anonimowa)`, `${fmt(b)} zwrócono rower nr ${rng.int(10, 60)}`] };
      },
    ],
  };

  // Zeznania o motywach (szum, ale budzą podejrzenia).
  const MOTIVES = [
    (s) => `„${s.first} od miesięcy ${g(s, 'narzekał', 'narzekała')} na brak pieniędzy.”`,
    (s) => `„W zeszłym tygodniu ${s.first} ${g(s, 'pokłócił', 'pokłóciła')} się ${scene.ownerIns} o pieniądze.”`,
    (s) => `„${s.first} ${g(s, 'pytał', 'pytała')} mnie niedawno, ile można dostać za najcenniejsze rzeczy ${scene.inLoc}.”`,
    (s) => `„${s.first} ${g(s, 'kupił', 'kupiła')} ostatnio nowy samochód. Skąd ${g(s, 'miał', 'miała')} na to pieniądze?”`,
    (s) => `„${s.first} ${g(s, 'wiedział', 'wiedziała')}, że alarm ma tylko czujnik drzwi, bez kamer.”`,
  ];
  const motiveTexts = rng.sample(MOTIVES, P.motives);
  const motiveTargets = rng.sample(suspects, P.motives);
  motiveTexts.forEach((fn, k) => {
    const w = nextWitness();
    addCard({ desk: 'S', kind: 'witness', title: `Zeznanie: ${w.full}`, sub: g(w, 'znajomy z okolicy', 'znajoma z okolicy'), lines: [fn(motiveTargets[k])] });
  });

  // Plan miasta: kratki miejsca kradzieży, wszystkich miejsc z kart i kilku dodatkowych.
  // Z kratek gracz liczy czasy dotarcia (w poziomie + w pionie, razy MIN_PER_CELL minut).
  const mapPlaces = [...usedPlaces, ...rng.sample(Object.keys(PLACES).filter((k) => !usedPlaces.has(k)), rng.int(2, 4))]
    .sort((a, b) => PLACES[a].name.localeCompare(PLACES[b].name, 'pl'));
  addCard({
    desk: 'M',
    title: 'Plan miasta Borowice',
    sub: `1 kratka = ${MIN_PER_CELL} min drogi · liczcie kratki w poziomie i w pionie`,
    mapCard: true,
    lines: [
      `Miejsce kradzieży: ${scene.name}, kratka ${sceneCell}`,
      ...mapPlaces.map((p) => `${PLACES[p].name}: ${PLACE_CELLS[p]}`),
    ],
    facts: [{ t: 'grid', perCell: MIN_PER_CELL, scene: sceneCell }, ...mapPlaces.map((p) => ({ t: 'pos', place: p, cell: PLACE_CELLS[p] }))],
  });

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

  // Czynności śledcze: karty urzędowe (poza czasami dotarcia) są na start zapieczętowane.
  const sealFor = (card) => {
    if (card.kind !== 'official') return null;
    const types = new Set((card.facts || []).map((f) => f.t));
    if (types.has('travel') || types.has('grid')) return null;
    if (types.has('train')) return { label: 'Pobierz rozkład jazdy ze stacji Borowice', cost: 30 };
    if (types.has('bus')) return { label: `Pobierz rozkład MZK: ${card.title.replace(/^Przystanek (.+): linia (\S+)$/, 'linia $2, przystanek $1')}`, cost: 30 };
    if (types.has('street')) return { label: 'Zapytaj urząd o numerację budynków', cost: 30 };
    if (types.has('hours')) return { label: 'Zapytaj urząd o godziny otwarcia lokali', cost: 30 };
    if (types.has('weather')) return { label: 'Zamów raport ze stacji meteo', cost: 30 };
    if (types.has('screening')) return { label: 'Pobierz repertuar kina „Mewa”', cost: 15 };
    if (types.has('zone')) return { label: 'Pobierz uchwałę o strefach parkowania', cost: 30 };
    if (types.has('cardlog')) return { label: `Zażądaj rejestru wejść: ${card.title.replace(/^Rejestr wejść: /, '')}`, cost: 60 };
    if (types.has('cardowner')) return { label: `Zażądaj wykazu kart: ${card.title.replace(/^Właściciele kart wejściowych: /, '')}`, cost: 30 };
    if (types.has('sunset')) return { label: 'Sprawdź kalendarz astronomiczny', cost: 15 };
    if (types.has('legend')) return { label: 'Poproś o objaśnienia znaków w rozkładach', cost: 15 };
    if (card.title === 'Monitoring miejski') {
      // Okno nagrania (45 min wokół zapisanej chwili): da się logicznie wybrać kamerę do sprawdzenia.
      const m = /(\d{1,2}):(\d{2})/.exec(card.lines[1] || '');
      const t = m ? Number(m[1]) * 60 + Number(m[2]) : null;
      const a = t === null ? null : round5(t - rng.int(5, 40));
      const win = t === null ? '' : `, ${fmt(a)}–${fmt(a + 45)}`;
      return { label: `Zabezpiecz nagranie: ${card.lines[0].charAt(0).toLowerCase()}${card.lines[0].slice(1)}${win}`, cost: 60 };
    }
    const inner = card.title.replace(/„([^”]*)”/g, '»$1«');
    if (card.desk === 'R') return { label: `Zażądaj kopii dokumentu „${inner}”`, cost: 30 };
    return { label: `Przejrzyj dokument „${inner}”`, cost: 15 };
  };

  const publicCards = finalCards.map((c) => {
    const action = sealFor(c);
    return {
      id: c.id, desk: c.desk, kind: c.kind, title: c.title, sub: c.sub || '', lines: c.lines, by: c.by || null, facts: c.facts,
      ...(c.mapCard ? { map: true } : {}),
      ...(action ? { action } : {}),
    };
  });


  return {
    version: 1,
    kind: opts.kind,
    number: opts.number,
    code: opts.code || null,
    date: opts.date,
    crimeDate: { iso: crimeIso, weekday, label: `${WEEKDAYS[weekday]}, ${dateLong(crimeIso)}` },
    difficulty: opts.difficulty,
    title: `Kradzież ${scene.inLoc}`,
    stolen: { acc: stolen, nom: stolenNom },
    owner: { full: owner.full, f: owner.f, role: scene.ownerRole },
    scene: { name: scene.name, address: scene.address, short: scene.short, inLoc: scene.inLoc },
    intro: `${scene.name}, ${scene.address}. ${WEEKDAYS_ACC[weekday][0].toUpperCase()}${WEEKDAYS_ACC[weekday].slice(1)}, ${dateLong(crimeIso)}, ${scene.ownerRole} ${owner.full} ${g(owner, 'wyszedł', 'wyszła')} o ${fmt(closeT)} i ${g(owner, 'zamknął', 'zamknęła')} drzwi. System alarmowy zarejestrował otwarcie drzwi kodem o ${fmt(W1)} i ich zamknięcie o ${fmt(W2)}. Rano okazało się, że skradziono ${stolen}. Kod znało pięć osób i to one są podejrzanymi.`,
    window: { from: W1, to: W2 },
    suspects: suspects.map(({ id, full, first, f, role, alibi, items, fullAcc, ins, gen }) => ({ id, full, first, f, role, alibi, items, fullAcc, ins, gen })),
    desks: DESK_DEFS,
    cards: publicCards,
    solution: { culprit: suspects[culpritIdx].id, forged: forgedCard.id },
    innocentLie: Boolean(lieCard),
    forgeMode: mode,
    lieCard: lieCard ? lieCard.id : null,
  };
}
