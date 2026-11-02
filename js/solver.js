// Niezależny solver. Czyta wyłącznie fakty zapisane na kartach (i zasady gry),
// nie zagląda do pola `solution`. Dzięki temu sprawdza, czy sprawa z generatora
// ma dokładnie jedno rozwiązanie, i układa wyjaśnienie na ekran wyniku.

import { PLACES, TRAIN_NOTES, TEAM_DESKS } from './data.js';
import { dayType, fmt, WEEKDAYS_ACC } from './time.js';

const SCENE = '@scena';
const AWAY = '@poza-miastem';
const FAR = 100000;

const placeName = (key) => PLACES[key]?.name ?? key;
const placeLoc = (key) => PLACES[key]?.loc ?? key;

function openAt(hours, dt, t) {
  const span = hours[dt];
  return Boolean(span) && span[0] <= t && t < span[1];
}

export function solveCase(c) {
  const weekday = c.crimeDate.weekday;
  const dt = dayType(weekday);
  const W1 = c.window.from;
  const W2 = c.window.to;
  const suspects = new Map(c.suspects.map((s) => [s.id, s]));

  const travel = new Map();
  const trains = new Map();
  const legend = new Map();
  const hours = new Map();
  const rains = [];
  let weatherCard = null;
  let sunset = null;
  const screenings = [];
  const streets = new Map();
  const zones = [];
  const buses = [];
  const seen = [];
  const cardlogs = [];
  const cardOwners = new Map();
  const claims = [];

  for (const card of c.cards) {
    for (const f of card.facts || []) {
      const ref = card.id;
      switch (f.t) {
        case 'travel': travel.set(f.place, { min: f.min, ref }); break;
        case 'train': trains.set(f.no, { ...f, ref }); break;
        case 'legend': legend.set(f.symbol, ref); break;
        case 'hours': hours.set(f.place, { ...f, ref }); break;
        case 'weather': weatherCard = ref; break;
        case 'rain': rains.push({ ...f, ref }); break;
        case 'sunset': sunset = { time: f.time, ref }; break;
        case 'screening': screenings.push({ ...f, ref }); break;
        case 'street': streets.set(f.street, { ...f, ref }); break;
        case 'zone': zones.push({ ...f, ref }); break;
        case 'bus': buses.push({ ...f, ref }); break;
        case 'seen': seen.push({ ...f, refs: [ref] }); break;
        case 'cardlog': cardlogs.push({ ...f, ref }); break;
        case 'cardowner': cardOwners.set(`${f.place}#${f.card}`, { who: f.who, ref }); break;
        case 'claim': claims.push({ ...f, card: ref }); break;
        default: break;
      }
    }
  }

  // Rejestry wejść łączymy z listą właścicieli kart.
  for (const log of cardlogs) {
    const owner = cardOwners.get(`${log.place}#${log.card}`);
    if (!owner) continue;
    const refs = owner.ref === log.ref ? [log.ref] : [log.ref, owner.ref];
    seen.push({ who: owner.who, place: log.place, from: log.from, to: log.to, refs, via: 'card' });
  }

  /** Czy pobyt w miejscu `place` w czasie [from, to] wyklucza bycie na miejscu zbrodni od W1 do W2? */
  function clears(place, from, to) {
    const tr = travel.get(place);
    if (!tr) return null;
    return from < W2 + tr.min && to > W1 - tr.min ? tr : null;
  }

  const raining = (t) => rains.some((r) => r.from <= t && t < r.to);
  const rainedRecently = (t, mins) => rains.some((r) => r.from < t && r.to > t - mins);

  /** Sprawdza dowód dostarczony przez podejrzanego. */
  function evaluate(cl) {
    const out = { card: cl.card, who: cl.who, kind: cl.kind, contradicted: false, unknown: false, reason: '', reasonCodes: [], refs: [], sightings: [], okNote: '' };
    switch (cl.kind) {
      case 'train': {
        const row = trains.get(cl.no);
        out.sightings.push({ place: 'dworzec', from: cl.time, to: cl.time });
        if (!row) {
          if (!trains.size) { out.unknown = true; break; }
          out.contradicted = true;
          out.reasonCodes.push('train-missing');
          out.reason = `pociągu ${cl.no} nie ma w rozkładzie`;
          break;
        }
        out.refs.push(row.ref);
        if (row.dep !== cl.time) {
          out.contradicted = true;
          out.reasonCodes.push('train-time');
          out.reason = `bilet podaje odjazd o ${fmt(cl.time)}, a według rozkładu [${row.ref}] pociąg ${cl.no} odjeżdża o ${fmt(row.dep)}`;
          break;
        }
        const note = TRAIN_NOTES[row.note];
        if (!note.runs(weekday)) {
          const lref = legend.get(row.note);
          if (lref && lref !== row.ref) out.refs.push(lref);
          out.contradicted = true;
          out.reasonCodes.push('train-day');
          out.reason = `pociąg ${cl.no} ma w rozkładzie [${row.ref}] znak „${row.note}”, czyli ${note.text}${lref && lref !== row.ref ? ` [${lref}]` : ''}, a kradzież wydarzyła się ${WEEKDAYS_ACC[weekday]}`;
          break;
        }
        out.okNote = `pociąg ${cl.no} odjeżdża o ${fmt(row.dep)} i tego dnia kursuje [${row.ref}]`;
        break;
      }
      case 'receipt': {
        const h = hours.get(cl.place);
        out.sightings.push({ place: cl.place, from: cl.time, to: cl.time });
        if (!h) { out.unknown = true; break; }
        out.refs.push(h.ref);
        if (!openAt(h, dt, cl.time)) {
          out.contradicted = true;
          out.reasonCodes.push(h[dt] ? 'closed-early' : 'closed-day');
          out.reason = h[dt]
            ? `${placeName(cl.place)} – lokal czynny tego dnia tylko do ${fmt(h[dt][1])} [${h.ref}], a paragon ma godzinę ${fmt(cl.time)}`
            : `${placeName(cl.place)} – lokal nieczynny w ten dzień tygodnia [${h.ref}], a paragon ma godzinę ${fmt(cl.time)}`;
          break;
        }
        out.okNote = `${placeName(cl.place)} był wtedy otwarty [${h.ref}]`;
        break;
      }
      case 'photo': {
        out.sightings.push({ place: cl.place, from: cl.time, to: cl.time });
        const problems = [];
        if (sunset) {
          if (cl.sky === 'day' && cl.time > sunset.time + 20) problems.push({ code: 'photo-daylight', text: `zdjęcie pokazuje jasne niebo o ${fmt(cl.time)}, a słońce zaszło o ${fmt(sunset.time)} [${sunset.ref}]`, ref: sunset.ref });
          if (cl.sky === 'night' && cl.time < sunset.time - 20) problems.push({ code: 'photo-dark', text: `zdjęcie pokazuje ciemne niebo o ${fmt(cl.time)}, a słońce zaszło dopiero o ${fmt(sunset.time)} [${sunset.ref}]`, ref: sunset.ref });
        }
        if (weatherCard) {
          if (cl.ground === 'dry' && raining(cl.time)) problems.push({ code: 'photo-dry', text: `zdjęcie z ${fmt(cl.time)} pokazuje suchy chodnik, a według stacji meteo [${weatherCard}] wtedy padało`, ref: weatherCard });
          if (cl.ground === 'wet' && !raining(cl.time) && !rainedRecently(cl.time, 60)) problems.push({ code: 'photo-wet', text: `zdjęcie z ${fmt(cl.time)} pokazuje kałuże, a według stacji meteo [${weatherCard}] od dawna nie padało`, ref: weatherCard });
        }
        if (problems.length) {
          out.contradicted = true;
          out.reason = problems.map((p) => p.text).join('; ');
          out.reasonCodes.push(...problems.map((p) => p.code));
          out.refs.push(...new Set(problems.map((p) => p.ref)));
          break;
        }
        out.refs.push(...[weatherCard, sunset?.ref].filter(Boolean));
        out.okNote = `niebo i chodnik na zdjęciu zgadzają się z pogodą${weatherCard ? ` [${weatherCard}]` : ''}${sunset ? ` i zachodem słońca [${sunset.ref}]` : ''}`;
        break;
      }
      case 'cinema': {
        const sc = screenings.find((s) => s.film === cl.film && s.start === cl.start);
        const anyRef = screenings.find((s) => s.film === cl.film)?.ref ?? screenings[0]?.ref;
        if (!sc && !screenings.length) {
          out.sightings.push({ place: 'kino', from: cl.start, to: cl.start });
          out.unknown = true;
          break;
        }
        if (!sc) {
          out.sightings.push({ place: 'kino', from: cl.start, to: cl.start });
          out.contradicted = true;
          out.reasonCodes.push('no-screening');
          if (anyRef) out.refs.push(anyRef);
          out.reason = `w repertuarze kina [${anyRef}] film „${cl.film}” nie ma seansu o ${fmt(cl.start)}`;
          break;
        }
        out.refs.push(sc.ref);
        out.sightings.push({ place: 'kino', from: cl.start, to: cl.start + sc.dur });
        out.okNote = `seans „${cl.film}” o ${fmt(cl.start)} jest w repertuarze [${sc.ref}] i trwa do ${fmt(cl.start + sc.dur)}`;
        break;
      }
      case 'delivery': {
        const bad = [];
        for (const stop of cl.stops) {
          out.sightings.push({ place: stop.place, from: stop.time, to: stop.time });
          const st = streets.get(stop.place);
          if (!st) { out.unknown = true; continue; }
          if (!out.refs.includes(st.ref)) out.refs.push(st.ref);
          const parityOk = st.parity === 'all' || (st.parity === 'even' ? stop.no % 2 === 0 : stop.no % 2 === 1);
          if (stop.no < 1 || stop.no > st.max || !parityOk) {
            const desc = st.parity === 'all' ? `ma numery od 1 do ${st.max}` : `ma tylko numery ${st.parity === 'even' ? 'parzyste' : 'nieparzyste'} do ${st.max}`;
            out.reasonCodes.push(stop.no > st.max || stop.no < 1 ? 'no-number' : 'parity');
            bad.push(`adres ${placeName(stop.place)} ${stop.no} nie istnieje: według spisu ulic [${st.ref}] ta ulica ${desc}`);
          }
        }
        if (bad.length) { out.contradicted = true; out.reason = bad.join('; '); break; }
        out.okNote = `oba adresy istnieją w spisie ulic [${out.refs.join(', ')}]`;
        break;
      }
      case 'parking': {
        out.sightings.push({ place: cl.place, from: cl.time, to: cl.time });
        const zone = zones.find((z) => z.zone === cl.zone);
        if (!zone) { out.unknown = true; break; }
        out.refs.push(zone.ref);
        if (!openAt(zone.hours, dt, cl.time)) {
          out.contradicted = true;
          out.reasonCodes.push(zone.hours[dt] ? 'zone-ended' : 'zone-off-day');
          out.reason = zone.hours[dt]
            ? `w strefie ${cl.zone} parkomaty działają tego dnia tylko do ${fmt(zone.hours[dt][1])} [${zone.ref}], a bilet wydano o ${fmt(cl.time)}`
            : `w strefie ${cl.zone} w ten dzień tygodnia parkomaty są wyłączone [${zone.ref}], a bilet wydano o ${fmt(cl.time)}`;
          break;
        }
        out.okNote = `parkomaty w strefie ${cl.zone} działały o tej porze [${zone.ref}]`;
        break;
      }
      case 'bus': {
        out.sightings.push({ place: cl.stop, from: cl.time, to: cl.time });
        const bus = buses.find((b) => b.stop === cl.stop && b.line === cl.line);
        if (!bus) { out.unknown = true; break; }
        out.refs.push(bus.ref);
        const deps = bus.deps[dt] || [];
        const match = deps.find((d) => cl.time >= d && cl.time - d <= 2);
        if (match === undefined) {
          const last = deps[deps.length - 1];
          out.contradicted = true;
          out.reasonCodes.push(last !== undefined && cl.time > last + 2 ? 'bus-after-last' : 'bus-no-departure');
          out.reason = last !== undefined && cl.time > last + 2
            ? `bilet skasowano o ${fmt(cl.time)}, a ostatni autobus linii ${cl.line} odjechał z tego przystanku o ${fmt(last)} [${bus.ref}]`
            : `bilet skasowano o ${fmt(cl.time)}, a o tej porze żaden autobus linii ${cl.line} nie odjeżdżał z tego przystanku [${bus.ref}]`;
          break;
        }
        out.okNote = `autobus linii ${cl.line} odjechał z przystanku o ${fmt(match)} [${bus.ref}]`;
        break;
      }
      default:
        out.contradicted = true;
        out.reason = 'nieznany rodzaj dowodu';
    }
    return out;
  }

  const evaluated = claims.map((cl) => {
    const e = evaluate(cl);
    // Prawdziwy bilet kolejowy oznacza, że po odjeździe tej osoby nie było już w mieście.
    e.events = e.sightings.map((x) => ({ ...x, refs: [e.card] }));
    if (cl.kind === 'train' && !e.contradicted && !e.unknown) e.events.push({ place: AWAY, from: cl.time + 1, to: FAR, refs: [e.card] });
    return e;
  });
  const byCard = new Map(evaluated.map((e) => [e.card, e]));

  function clearingFrom(sightings, refsBase) {
    const res = [];
    for (const s of sightings) {
      const tr = clears(s.place, s.from, s.to);
      if (tr) res.push({ place: s.place, from: s.from, to: s.to, travel: tr.min, refs: [...refsBase, tr.ref] });
    }
    return res;
  }

  /**
   * Czy dwa pobyty tej samej osoby da się pogodzić? Gracz zna tylko czasy dotarcia
   * do miejsca zbrodni, więc z kart wynika dolna granica: przejście z A do B trwa
   * co najmniej |dA − dB| minut. Pobyty nakładające się w czasie w różnych miejscach
   * są zawsze sprzeczne. Miejsce zbrodni ma czas dotarcia 0.
   */
  const travelMin = (place) => (place === SCENE ? 0 : travel.get(place)?.min);
  function conflict(a, b) {
    if (a.place === b.place) return false;
    if (a.from <= b.to && b.from <= a.to) return true;
    const [x, y] = a.to < b.from ? [a, b] : [b, a];
    const dx = travelMin(x.place);
    const dy = travelMin(y.place);
    if (dx === undefined || dy === undefined) return false;
    return y.from - x.to < Math.abs(dx - dy);
  }
  function firstConflict(events) {
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        if (conflict(events[i], events[j])) return [events[i], events[j]];
      }
    }
    return null;
  }
  const neutralEvents = new Map();
  for (const s of seen) {
    if (!suspects.has(s.who)) continue;
    if (!neutralEvents.has(s.who)) neutralEvents.set(s.who, []);
    neutralEvents.get(s.who).push({ place: s.place, from: s.from, to: s.to, refs: s.refs });
  }
  /** Prawdziwe pobyty osoby przy założeniu, że `forgedCard` jest fałszywką. */
  function trueEvents(who, forgedCard) {
    const evs = [...(neutralEvents.get(who) || [])];
    for (const e of evaluated) if (e.who === who && e.card !== forgedCard) evs.push(...e.events);
    return evs;
  }

  const neutralClears = new Map();
  for (const s of seen) {
    if (!suspects.has(s.who)) continue;
    const cl = clearingFrom([s], s.refs);
    if (!cl.length) continue;
    if (!neutralClears.has(s.who)) neutralClears.set(s.who, []);
    neutralClears.get(s.who).push(...cl);
  }

  // Wszystkie hipotezy: (sprawca, sfałszowany dowód tego sprawcy).
  const consistent = [];
  for (const sus of c.suspects) {
    for (const forged of evaluated.filter((e) => e.who === sus.id)) {
      const othersOk = evaluated.every((e) => e === forged || !e.contradicted);
      if (!othersOk) continue;
      if (neutralClears.has(sus.id)) continue;
      const ownTrue = evaluated.filter((e) => e.who === sus.id && e !== forged);
      if (ownTrue.some((e) => clearingFrom(e.sightings, [e.card]).length)) continue;
      // Każda osoba musi dać się fizycznie „przeprowadzić” przez wszystkie swoje prawdziwe pobyty,
      // a sprawca dodatkowo przez pobyt na miejscu zbrodni.
      const physicalOk = c.suspects.every((p) => {
        const evs = trueEvents(p.id, forged.card);
        if (p.id === sus.id) evs.push({ place: SCENE, from: W1, to: W2, refs: [] });
        return !firstConflict(evs);
      });
      if (!physicalOk) continue;
      consistent.push({ culprit: sus.id, forged: forged.card });
    }
  }

  const unique = consistent.length === 1 ? consistent[0] : null;

  // Wyjaśnienie: kto i czym ma potwierdzone alibi.
  const explain = { suspects: {}, forged: null };
  if (unique) {
    const f = byCard.get(unique.forged);
    explain.forged = { card: f.card, kind: f.kind, reason: f.reason, reasonCodes: f.reasonCodes, refs: [f.card, ...f.refs] };
    for (const sus of c.suspects) {
      if (sus.id === unique.culprit) continue;
      const items = [];
      for (const n of neutralClears.get(sus.id) || []) items.push({ type: 'neutral', ...n });
      for (const e of evaluated.filter((x) => x.who === sus.id)) {
        for (const cl of clearingFrom(e.sightings, [e.card])) items.push({ type: 'supplied', note: e.okNote, ...cl });
      }
      explain.suspects[sus.id] = items;
    }
  }

  return {
    ok: Boolean(unique),
    consistent,
    trueEvents,
    firstConflict,
    unique,
    evaluated,
    neutralClears,
    explain,
    window: { W1, W2 },
    describeClear(item) {
      const when = item.from === item.to ? `o ${fmt(item.from)}` : `od ${fmt(item.from)} do ${fmt(item.to)}`;
      return `${placeLoc(item.place)} ${when} (dotarcie: ${item.travel} min)`;
    },
  };
}

/** Kontrola jakości sprawy z generatora. Zwraca listę problemów (pusta = OK). */
export function qualityIssues(c, res = solveCase(c)) {
  const issues = [];
  if (!res.ok) {
    issues.push(`liczba spójnych rozwiązań: ${res.consistent.length}`);
    return issues;
  }
  if (res.unique.culprit !== c.solution.culprit || res.unique.forged !== c.solution.forged) {
    issues.push('rozwiązanie solvera różni się od zamierzonego');
  }
  const forged = res.evaluated.find((e) => e.card === c.solution.forged);
  const travelOk = forged.sightings.some((s) => {
    const card = c.cards.find((k) => (k.facts || []).some((f) => f.t === 'travel' && f.place === s.place));
    if (!card) return false;
    const min = card.facts.find((f) => f.t === 'travel' && f.place === s.place).min;
    return s.from < c.window.to + min && s.to > c.window.from - min;
  });
  if (!travelOk) issues.push('sfałszowany dowód nie dawałby sprawcy alibi');
  for (const s of c.suspects) {
    if (s.id === c.solution.culprit) continue;
    if (!res.explain.suspects[s.id]?.length) issues.push(`niewinny ${s.full} nie ma potwierdzonego alibi`);
  }
  // Fałszywkę ma obalać tylko zamierzona karta, a nie np. pułapka z udziałem sprawcy.
  const storyEvents = [...res.trueEvents(c.solution.culprit, c.solution.forged), ...forged.sightings.map((x) => ({ ...x, refs: [forged.card] }))];
  if (forged.kind === 'train') storyEvents.push({ place: '@poza-miastem', from: forged.sightings[0].from + 1, to: 100000, refs: [forged.card] });
  if (res.firstConflict(storyEvents)) issues.push('fałszywkę obala też fizyczna sprzeczność z innym pobytem sprawcy');
  // Współpraca: sfałszowana karta i karta, która ją obala, muszą być u różnych graczy.
  const deskOf = (id) => c.cards.find((k) => k.id === id)?.desk;
  const forgedDesk = deskOf(c.solution.forged);
  const refDesks = forged.refs.map(deskOf);
  for (const size of [2, 3, 4, 5]) {
    const seatOf = (desk) => TEAM_DESKS[size].findIndex((ds) => ds.includes(desk));
    if (!refDesks.some((d) => seatOf(d) !== seatOf(forgedDesk))) issues.push(`przy ${size} graczach jedna osoba ma i fałszywkę, i jej obalenie`);
  }
  for (const desk of ['D', 'S', 'M', 'Z', 'R']) {
    if (!c.cards.some((k) => k.desk === desk)) issues.push(`puste biurko ${desk}`);
  }
  return issues;
}
