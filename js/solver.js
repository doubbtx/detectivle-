// Niezależny solver. Czyta wyłącznie fakty zapisane na kartach (i zasady gry),
// nie zagląda do pola `solution`. Dzięki temu sprawdza, czy sprawa z generatora
// ma dokładnie jedno rozwiązanie, i układa wyjaśnienie na ekran wyniku.

import { PLACES, TRAIN_NOTES, TEAM_DESKS } from './data.js';
import { dayType, fmt, WEEKDAYS_ACC } from './time.js';
import { cellsApart, blocksText } from './town.js';

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
  // Plan miasta (od generatora v8): kratki miejsc; czas = kratki w poziomie + w pionie razy perCell.
  let grid = null;
  const cells = new Map();
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
        case 'grid': grid = { perCell: f.perCell, scene: f.scene, ref }; break;
        case 'pos': cells.set(f.place, { cell: f.cell, ref }); break;
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

  if (grid) {
    for (const [place, { cell, ref }] of cells) travel.set(place, { min: cellsApart(grid.scene, cell) * grid.perCell, ref, cell });
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
        if (row.note && legend.get(row.note) && legend.get(row.note) !== row.ref) out.refs.push(legend.get(row.note));
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
          out.reasonCodes.push(...(h[dt] ? ['closed-early'] : ['closed-day', 'closed-early']));
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
        const zone = zones.find((z) => z.zone === cl.zone && (!z.streets || z.streets.includes(cl.place))) || zones.find((z) => z.zone === cl.zone);
        if (!zone) { out.unknown = true; break; }
        out.refs.push(zone.ref);
        if (!openAt(zone.hours, dt, cl.time)) {
          out.contradicted = true;
          out.reasonCodes.push(...(zone.hours[dt] ? ['zone-ended'] : ['zone-off-day', 'zone-ended']));
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
          out.reasonCodes.push(...(last !== undefined && cl.time > last + 2 ? ['bus-after-last', 'bus-no-departure'] : ['bus-no-departure']));
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
    // Wspólny dowód (np. zdjęcie dwóch osób) dotyczy też osób z listy `with`.
    e.with = Array.isArray(cl.with) ? cl.with.filter((id) => suspects.has(id)) : [];
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
  /** Najkrótsze przejście między dwoma miejscami: z planu miasta albo (stare sprawy) |dA − dB|. */
  function between(a, b) {
    if (a === b) return 0;
    const da = travelMin(a);
    const db = travelMin(b);
    if (da === undefined || db === undefined) return undefined;
    if (grid && a !== SCENE && b !== SCENE) return cellsApart(cells.get(a).cell, cells.get(b).cell) * grid.perCell;
    return Math.abs(da - db);
  }
  function conflict(a, b) {
    if (a.place === b.place) return false;
    if (a.from <= b.to && b.from <= a.to) return true;
    const [x, y] = a.to < b.from ? [a, b] : [b, a];
    const d = between(x.place, y.place);
    if (d === undefined) return false;
    return y.from - x.to < d;
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
  /** Prawdziwe pobyty osoby; `falseCards` to karty uznane w danej hipotezie za fałszywe. */
  function trueEvents(who, falseCards) {
    const skip = falseCards instanceof Set ? falseCards : new Set([falseCards]);
    const evs = [...(neutralEvents.get(who) || [])];
    for (const e of evaluated) if ((e.who === who || e.with.includes(who)) && !skip.has(e.card)) evs.push(...e.events);
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
  // Zasada: fałszywka sprawcy daje mu alibi na czas kradzieży. W sprawach z kłamstwem
  // niewinnej osoby (c.innocentLie) dokładnie jeden inny dowód może być fałszywy, ale
  // należy do kogoś innego, a ta osoba i tak ma inne, potwierdzone alibi.
  const maxLies = c.innocentLie ? 1 : 0;
  const givesAlibi = (e) => clearingFrom(e.sightings, [e.card]).length > 0;
  /** Potwierdzone alibi osoby z kart uznanych w hipotezie za prawdziwe. */
  const clearedBy = (who, falseCards) => {
    const items = [...(neutralClears.get(who) || [])];
    for (const e of evaluated) {
      if ((e.who === who || e.with.includes(who)) && !falseCards.has(e.card)) items.push(...clearingFrom(e.sightings, [e.card]));
    }
    return items;
  };
  const consistent = [];
  for (const sus of c.suspects) {
    for (const forged of evaluated.filter((e) => e.who === sus.id)) {
      if (!givesAlibi(forged)) continue;
      const lies = evaluated.filter((e) => e !== forged && e.contradicted);
      if (lies.length > maxLies) continue;
      if (lies.some((e) => e.who === sus.id)) continue;
      const falseCards = new Set([forged.card, ...lies.map((e) => e.card)]);
      if (lies.some((e) => !clearedBy(e.who, falseCards).length)) continue;
      if (neutralClears.has(sus.id)) continue;
      const ownTrue = evaluated.filter((e) => (e.who === sus.id || e.with.includes(sus.id)) && !falseCards.has(e.card));
      if (ownTrue.some((e) => givesAlibi(e))) continue;
      // Każda osoba musi dać się fizycznie „przeprowadzić” przez wszystkie swoje prawdziwe pobyty,
      // a sprawca dodatkowo przez pobyt na miejscu zbrodni.
      const physicalOk = c.suspects.every((p) => {
        const evs = trueEvents(p.id, falseCards);
        if (p.id === sus.id) evs.push({ place: SCENE, from: W1, to: W2, refs: [] });
        return !firstConflict(evs);
      });
      if (!physicalOk) continue;
      consistent.push({ culprit: sus.id, forged: forged.card });
    }
  }

  const unique = consistent.length === 1 ? consistent[0] : null;

  // Wyjaśnienie: kto i czym ma potwierdzone alibi.
  const explain = { suspects: {}, forged: null, lies: [] };
  if (unique) {
    const f = byCard.get(unique.forged);
    explain.forged = { card: f.card, kind: f.kind, reason: f.reason, reasonCodes: f.reasonCodes, refs: [f.card, ...f.refs], proofRefs: [...f.refs], physical: false };
    explain.lies = evaluated.filter((e) => e !== f && e.contradicted).map((e) => {
      const s0 = e.sightings[0];
      const tr = travel.get(s0.place);
      // Wszystkie miejsca z karty (np. dwa doręczenia kuriera) z czasami dotarcia.
      const stops = e.sightings.map((x) => ({ place: x.place, from: x.from, to: x.to, travel: travel.get(x.place)?.min, travelRef: travel.get(x.place)?.ref }));
      return { card: e.card, who: e.who, kind: e.kind, reason: e.reason, reasonCodes: e.reasonCodes, refs: [e.card, ...e.refs], place: s0.place, from: s0.from, to: s0.to, travel: tr?.min, travelRef: tr?.ref, stops, alibi: givesAlibi(e) };
    });
    const lieCards = new Set(explain.lies.map((x) => x.card));
    // Dlaczego kłamstwo nie jest fałszywką sprawcy: kłamca ma inne, potwierdzone alibi.
    for (const lie of explain.lies) lie.cleared = clearedBy(lie.who, new Set([f.card, ...lieCards]));
    if (!f.contradicted) explainPhysical(f, new Set([f.card, ...lieCards]));
    for (const sus of c.suspects) {
      if (sus.id === unique.culprit) continue;
      const items = [];
      for (const n of neutralClears.get(sus.id) || []) items.push({ type: 'neutral', ...n });
      for (const e of evaluated.filter((x) => (x.who === sus.id || x.with.includes(sus.id)) && !lieCards.has(x.card) && x !== f)) {
        for (const cl of clearingFrom(e.sightings, [e.card])) items.push({ type: 'supplied', note: e.okNote, ...cl });
      }
      explain.suspects[sus.id] = items;
    }
  }

  /** Fałszywka zgodna z tabelami: szukamy pobytu, którego nie da się z nią pogodzić. */
  function explainPhysical(f, falseCards) {
    const people = [f.who, ...f.with];
    // Ile różnych kart (poza czasami dotarcia) obala fałszywkę: w dobrej sprawie dokładnie jedna.
    const proofSets = new Set();
    for (const pid of people) {
      for (const e of f.events) for (const o of trueEvents(pid, falseCards)) if (conflict(e, o)) proofSets.add(o.refs.join('+'));
    }
    for (const pid of people) {
      const person = suspects.get(pid);
      const gp = (m, fm) => (person.f ? fm : m);
      for (const e of f.events) {
        for (const o of trueEvents(pid, falseCards)) {
          if (!conflict(e, o)) continue;
          const when = (x) => (x.from === x.to ? `o ${fmt(x.from)}` : `od ${fmt(x.from)} do ${fmt(x.to)}`);
          const oRefs = o.refs.filter(Boolean);
          let reason;
          const travelRefs = [];
          if (e.place === AWAY) {
            reason = `według dowodu [${f.card}] ${person.full} ${gp('wyjechał', 'wyjechała')} pociągiem o ${fmt(e.from - 1)}, a karta ${oRefs.map((r) => `[${r}]`).join(' i ')} pokazuje tę osobę ${placeLoc(o.place)} ${when(o)}, kiedy już nie ${gp('powinien', 'powinna')} być w mieście`;
          } else {
            const ta = travel.get(e.place);
            const tb = travel.get(o.place);
            if (ta) travelRefs.push(ta.ref);
            if (tb && tb.ref !== ta?.ref) travelRefs.push(tb.ref);
            const D = ta && tb ? between(e.place, o.place) : null;
            const how = grid
              ? `${blocksText(cellsApart(ta.cell, tb.cell))} na planie miasta (${ta.cell} → ${tb.cell}), czyli ${D} min drogi [${[...new Set(travelRefs)].join(', ')}]`
              : `co najmniej ${D} min drogi (czasy dotarcia ${ta?.min} i ${tb?.min} min [${[...new Set(travelRefs)].join(', ')}])`;
            reason = `według karty ${oRefs.map((r) => `[${r}]`).join(' i ')} ${person.full} ${gp('był', 'była')} ${placeLoc(o.place)} ${when(o)}, a dowód [${f.card}] umieszcza tę osobę ${placeLoc(e.place)} ${when(e)}`
              + (D !== null ? `; między tymi miejscami jest ${how}` : '');
          }
          explain.forged = {
            card: f.card, kind: f.kind, reason, reasonCodes: [pid === f.who ? 'physical' : 'physical-other'],
            refs: [f.card, ...oRefs, ...new Set(travelRefs)], proofRefs: oRefs, physical: true, about: pid, proofCount: proofSets.size,
          };
          return;
        }
      }
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
    travel,
    between,
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
    const min = res.travel.get(s.place)?.min;
    if (min === undefined) return false;
    return s.from < c.window.to + min && s.to > c.window.from - min;
  });
  if (!travelOk) issues.push('sfałszowany dowód nie dawałby sprawcy alibi');
  for (const s of c.suspects) {
    if (s.id === c.solution.culprit) continue;
    if (!res.explain.suspects[s.id]?.length) issues.push(`niewinny ${s.full} nie ma potwierdzonego alibi`);
  }
  // Fałszywkę ma obalać tylko zamierzona karta, a nie np. pułapka z udziałem sprawcy.
  const lieSet = new Set(res.explain.lies.map((x) => x.card));
  const storyEvents = [...res.trueEvents(c.solution.culprit, new Set([c.solution.forged, ...lieSet])), ...forged.sightings.map((x) => ({ ...x, refs: [forged.card] }))];
  if (forged.kind === 'train') storyEvents.push({ place: '@poza-miastem', from: forged.sightings[0].from + 1, to: 100000, refs: [forged.card] });
  const mode = c.forgeMode || 'table';
  if (mode === 'table' && res.firstConflict(storyEvents)) issues.push('fałszywkę obala też fizyczna sprzeczność z innym pobytem sprawcy');
  if (mode !== 'table') {
    if (forged.contradicted) issues.push('fałszywka fizyczna nie powinna kłócić się z tabelą');
    if (!res.explain.forged.physical) issues.push('brak fizycznej sprzeczności obalającej fałszywkę');
    else if (res.explain.forged.proofCount !== 1) issues.push(`fałszywkę obala ${res.explain.forged.proofCount} różnych kart`);
    if (mode === 'cross' && res.explain.forged.about === c.solution.culprit) issues.push('alibi krzyżowe powinno obalać pobyt innej osoby');
  }
  // Prawdziwe karty nie mogą sobie przeczyć: świadek w lokalu tylko w godzinach otwarcia.
  const dtq = dayType(c.crimeDate.weekday);
  const hoursRows = c.cards.flatMap((k) => (k.facts || []).filter((f) => f.t === 'hours'));
  for (const k of c.cards) {
    for (const f of k.facts || []) {
      if (f.t !== 'seen' && f.t !== 'cardlog') continue;
      const h = hoursRows.find((x) => x.place === f.place);
      if (h && !(h[dtq] && h[dtq][0] <= f.from && f.to < h[dtq][1])) issues.push(`${k.id}: pobyt w lokalu poza godzinami otwarcia`);
    }
  }
  if (c.innocentLie) {
    if (res.explain.lies.length !== 1) issues.push(`liczba kłamstw niewinnych: ${res.explain.lies.length}`);
    for (const lie of res.explain.lies) {
      // Kłamstwo ma obalać tylko karta z tabeli, a nie inny pobyt kłamcy.
      const e = res.evaluated.find((x) => x.card === lie.card);
      const evs = [...res.trueEvents(lie.who, new Set([c.solution.forged, lie.card])), ...e.sightings.map((x) => ({ ...x, refs: [lie.card] }))];
      if (res.firstConflict(evs)) issues.push('kłamstwo niewinnej osoby obala też fizyczna sprzeczność');
      if (c.lieCard && c.lieCard !== lie.card) issues.push('solver wskazał inne kłamstwo niż zamierzone');
    }
  } else if (res.explain.lies.length) {
    issues.push('sprzeczny dowód poza fałszywką w sprawie bez kłamstwa');
  }
  // Współpraca: sfałszowana karta i karta, która ją obala, muszą być u różnych graczy.
  const deskOf = (id) => c.cards.find((k) => k.id === id)?.desk;
  const forgedDesk = deskOf(c.solution.forged);
  const refDesks = res.explain.forged.refs.filter((r) => r !== c.solution.forged).map(deskOf);
  for (const size of [2, 3, 4, 5]) {
    const seatOf = (desk) => TEAM_DESKS[size].findIndex((ds) => ds.includes(desk));
    if (!refDesks.some((d) => seatOf(d) !== seatOf(forgedDesk))) issues.push(`przy ${size} graczach jedna osoba ma i fałszywkę, i jej obalenie`);
  }
  // Bez kart obalających fałszywkę sprawa nie może być rozwiązywalna (brak skrótu przez samo wykluczanie).
  const proof = new Set(res.explain.forged.proofRefs || []);
  if (proof.size) {
    const without = solveCase({ ...c, cards: c.cards.filter((k) => !proof.has(k.id)) });
    if (without.consistent.length === 1) issues.push('sprawa rozwiązywalna bez karty obalającej fałszywkę');
  }
  for (const desk of ['D', 'S', 'M', 'Z', 'R']) {
    if (!c.cards.some((k) => k.desk === desk)) issues.push(`puste biurko ${desk}`);
  }
  return issues;
}

/**
 * Profil śledztwa: które zapieczętowane karty trzeba odpieczętować, żeby sprawdzić każdy
 * dowód podejrzanych i każde niezależne alibi, i ile to kosztuje (w minutach śledztwa).
 */
export function investigationProfile(c, res = solveCase(c)) {
  const byId = new Map(c.cards.map((k) => [k.id, k]));
  const cost = (id) => byId.get(id)?.action?.cost || 0;
  const need = new Set();
  for (const e of res.evaluated) for (const r of e.refs) if (cost(r)) need.add(r);
  for (const items of res.neutralClears.values()) for (const it of items) for (const r of it.refs) if (cost(r)) need.add(r);
  const minimal = new Set();
  for (const ex of [res.explain.forged, ...(res.explain.lies || [])]) {
    if (ex) for (const r of ex.refs) if (cost(r)) minimal.add(r);
  }
  // Minimalna ścieżka (np. kamera z pułapką na sprawcę) też wchodzi do pełnego sprawdzenia.
  for (const r of minimal) need.add(r);
  const sumPerDesk = (ids) => {
    const per = {};
    for (const id of ids) {
      const d = byId.get(id).desk;
      per[d] = (per[d] || 0) + cost(id);
    }
    return per;
  };
  const perDesk = sumPerDesk(need);
  const minimalPerDesk = sumPerDesk(minimal);
  return { need: [...need].sort(), total: [...need].reduce((a, id) => a + cost(id), 0), perDesk, minimalPerDesk };
}

/**
 * Budżet godzin śledztwa (w minutach) dla zestawu biurek: minimalna ścieżka (karty obalające
 * fałszywkę i kłamstwo) plus część pełnego sprawdzenia wszystkich dowodów. Im trudniejszy dzień, tym ciaśniej.
 */
export function investigationBudget(c, desks) {
  const inv = c.investigation;
  if (!inv) return 0;
  const sum = (per) => desks.reduce((a, d) => a + ((per || {})[d] || 0), 0);
  const need = sum(inv.perDesk);
  const minimal = sum(inv.minimalPerDesk);
  const k = 0.7 - 0.05 * (c.difficulty || 4);
  return Math.max(60, Math.ceil((minimal + k * (need - minimal)) / 30) * 30);
}

/**
 * Głębokość dowodu: ile różnych kart trzeba zestawić, żeby udowodnić rozwiązanie
 * (fałszywka + karty, które ją obalają, łącznie z czasami dotarcia; plus kłamstwo niewinnej
 * osoby i jego obalenie). 2 = jedno sprawdzenie w tabeli, 5+ = łańcuch wniosków.
 */
export function proofDepth(res) {
  if (!res.explain.forged) return 0;
  const lie = res.explain.lies?.[0];
  if (!lie) return new Set(res.explain.forged.refs).size;
  // Kłamstwo: karta i jej obalenie, a do tego czas dotarcia (gdy nie daje alibi) albo najtańsze inne alibi kłamcy.
  const extra = lie.alibi ? (lie.cleared || []).reduce((best, it) => (!best || it.refs.length < best.length ? it.refs : best), null) || [] : (lie.stops || []).map((x) => x.travelRef).concat(lie.travelRef);
  return new Set(res.explain.forged.refs).size + new Set([...lie.refs, ...extra].filter(Boolean)).size;
}
