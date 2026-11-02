// Niezależny solver. Czyta wyłącznie fakty zapisane na kartach (i zasady gry),
// nie zagląda do pola `solution`. Dzięki temu sprawdza, czy sprawa z generatora
// ma dokładnie jedno rozwiązanie, i układa wyjaśnienie na ekran wyniku.

import { PLACES, TRAIN_NOTES, TEAM_DESKS, crimeOf } from './data.js';
import { dayType, fmt, WEEKDAYS_ACC } from './time.js';
import { cellsApart, blocksText } from './town.js';

const SCENE = '@scena';
const AWAY = '@poza-miastem';
const FAR = 100000;

const placeName = (key) => PLACES[key]?.name ?? key;
const placeLoc = (key) => PLACES[key]?.loc ?? key;
const zl = (cents) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
const dayMonth = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)}.${m}`; };

function openAt(hours, dt, t) {
  const span = hours[dt];
  return Boolean(span) && span[0] <= t && t < span[1];
}

export function solveCase(c) {
  const weekday = c.crimeDate.weekday;
  const dt = dayType(weekday);
  const crime = crimeOf(c);
  // Okno zbrodni. Przy kradzieży podaje je akta (c.window), przy podpaleniu solver wybiera je sam
  // z otwarć drzwi w rejestrze alarmu, godziny zapłonu i nastawu minutnika (niżej).
  let W1 = c.window?.from;
  let W2 = c.window?.to;
  const crimeIso = c.crimeDate.iso;
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
  // Szczegóły sprawdzane w tabelach (od generatora v9).
  const prices = new Map();
  const bankCards = new Map();
  const fiscal = new Map();
  let shows = null;
  const vehicles = new Map();
  let clockLight = null;
  let scaffold = null;
  // Podpalenie (od generatora v10): otwarcia drzwi, zapłon z czujki dymu, nastaw minutnika z opinii biegłego.
  const openings = [];
  let ignition = null;
  let timer = null;
  // Otrucie (okno-chwila): postawienie karafki i wejścia obsługi (kandydaci na dolną granicę okna), wymiana wody
  // (dolna granica), szklanki wypite przez poszkodowanego (kandydaci na górną granicę), szklanka ze środkiem
  // według lekarza (górna granica).
  const carafeTimes = [];
  const refills = [];
  const glasses = [];
  const dosed = [];
  // Cechy osób (od generatora v11): ślad z miejsca (jaką cechę ma sprawca) i pełny wykaz (kto ją ma).
  const traitSeen = new Map();
  const traitLists = new Map();

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
        case 'vehicle': vehicles.set(f.car, { ...f, ref }); break;
        case 'shows': shows = { ...f, ref }; break;
        case 'clocklight': clockLight = { ...f, ref }; break;
        case 'scaffold': scaffold = { ...f, ref }; break;
        case 'fiscal': { if (!fiscal.has(f.place)) fiscal.set(f.place, []); fiscal.get(f.place).push({ ...f, ref }); break; }
        case 'bankcard': bankCards.set(f.no, { ...f, ref }); break;
        case 'price': { if (!prices.has(f.place)) prices.set(f.place, []); prices.get(f.place).push({ ...f, ref }); break; }
        case 'opening': openings.push({ from: f.from, to: f.to, ref }); break;
        case 'ignition': ignition = { time: f.time, ref }; break;
        case 'timer': timer = { min: f.min, max: f.max, ref }; break;
        case 'carafe': carafeTimes.push({ time: f.time, kind: f.kind, ref }); break;
        case 'refill': refills.push({ time: f.time, ref }); break;
        case 'glass': glasses.push({ time: f.time, ref }); break;
        case 'dosed': dosed.push({ time: f.time, ref }); break;
        case 'trait': traitSeen.set(f.trait, { ...f, ref }); break;
        case 'traitlist': traitLists.set(f.trait, { ...f, ref }); break;
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

  // Otrucie: sprawca był na miejscu tylko przez chwilę gdzieś w oknie W1–W2 (a nie przez całe okno).
  const moment = crime.windowFrom === 'moment';

  /**
   * Czy pobyt w miejscu `place` w czasie [from, to] wyklucza bycie na miejscu zbrodni od W1 do W2?
   * Okno-chwila: pobyt wyklucza każdą chwilę z przedziału (from − d, to + d), więc daje alibi tylko wtedy,
   * gdy ten przedział obejmuje całe okno. `away`: po tej godzinie osoby nie było w mieście (pociąg).
   */
  function clears(place, from, to, away = false) {
    const tr = travel.get(place);
    if (!tr) return null;
    if (moment) return from - tr.min < W1 && (away || to + tr.min > W2) ? tr : null;
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
        // `away`: po odjeździe tej osoby nie ma w mieście (liczy się przy oknie-chwili).
        out.sightings.push({ place: 'dworzec', from: cl.time, to: cl.time, away: true });
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
          out.reason = `pociąg ${cl.no} ma w rozkładzie [${row.ref}] znak „${row.note}”, czyli ${note.text}${lref && lref !== row.ref ? ` [${lref}]` : ''}, a ${crime.happened} ${WEEKDAYS_ACC[weekday]}`;
          break;
        }
        if (row.note && legend.get(row.note) && legend.get(row.note) !== row.ref) out.refs.push(legend.get(row.note));
        out.okNote = `pociąg ${cl.no} odjeżdża o ${fmt(row.dep)} i tego dnia kursuje [${row.ref}]`;
        break;
      }
      case 'receipt': {
        out.sightings.push({ place: cl.place, from: cl.time, to: cl.time });
        const problems = [];
        const checked = [];
        const h = hours.get(cl.place);
        if (h) {
          if (!openAt(h, dt, cl.time)) {
            problems.push({
              codes: h[dt] ? ['closed-early'] : ['closed-day', 'closed-early'],
              ref: h.ref,
              text: h[dt]
                ? `${placeName(cl.place)} – lokal czynny tego dnia tylko do ${fmt(h[dt][1])} [${h.ref}], a paragon ma godzinę ${fmt(cl.time)}`
                : `${placeName(cl.place)} – lokal nieczynny w ten dzień tygodnia [${h.ref}], a paragon ma godzinę ${fmt(cl.time)}`,
            });
          } else checked.push({ ref: h.ref, note: `${placeName(cl.place)} – lokal był wtedy otwarty [${h.ref}]` });
        }
        for (const row of prices.get(cl.place) || []) {
          const it = (cl.items || []).find((x) => x.n === row.item);
          if (!it) continue;
          const unit = Math.round(it.p / (it.q || 1));
          const now = crimeIso >= row.since;
          const expect = now ? row.after : row.before;
          if (unit !== expect) {
            problems.push({
              codes: ['receipt-price'], ref: row.ref,
              text: now
                ? `według cennika [${row.ref}] od ${dayMonth(row.since)} ${row.item} kosztuje ${zl(row.after)} zł, a paragon z ${dayMonth(crimeIso)} ma jeszcze starą cenę ${zl(unit)} zł`
                : `według cennika [${row.ref}] ${row.item} kosztuje ${zl(row.after)} zł dopiero od ${dayMonth(row.since)}, a paragon z ${dayMonth(crimeIso)} ma już tę cenę`,
              early: !now,
            });
          } else checked.push({ ref: row.ref, note: `ceny zgadzają się z cennikiem [${row.ref}]` });
        }
        if (cl.rno !== undefined && fiscal.has(cl.place)) {
          const rows = fiscal.get(cl.place);
          const pad4 = (n) => String(n).padStart(4, '0');
          const bad = rows.filter((r) => (r.no < cl.rno && r.time > cl.time) || (r.no > cl.rno && r.time < cl.time) || (r.no === cl.rno && r.time !== cl.time))
            .sort((a, b) => Math.abs(a.no - cl.rno) - Math.abs(b.no - cl.rno))[0];
          if (bad) {
            problems.push({
              codes: ['receipt-number'], ref: bad.ref,
              text: bad.no < cl.rno
                ? `paragon nr ${pad4(cl.rno)} ma godzinę ${fmt(cl.time)}, a według raportu kasy [${bad.ref}] wcześniejszy numer ${pad4(bad.no)} wydano dopiero o ${fmt(bad.time)}; numeracja jest kolejna`
                : bad.no > cl.rno
                  ? `paragon nr ${pad4(cl.rno)} ma godzinę ${fmt(cl.time)}, a według raportu kasy [${bad.ref}] późniejszy numer ${pad4(bad.no)} wydano już o ${fmt(bad.time)}; numeracja jest kolejna`
                  : `paragon nr ${pad4(cl.rno)} ma godzinę ${fmt(cl.time)}, a według raportu kasy [${bad.ref}] ten numer wydano o ${fmt(bad.time)}`,
            });
          } else checked.push({ ref: rows[0].ref, note: `numer paragonu pasuje do raportu kasy [${rows[0].ref}]` });
        }
        (cl.cards || []).forEach((no, i) => {
          const row = bankCards.get(no);
          if (!row) return;
          const expect = i === 0 ? cl.who : cl.with?.[i - 1];
          if (row.who !== expect) {
            problems.push({
              codes: ['receipt-card'], ref: row.ref,
              text: `paragon opłacono kartą …${no}, a według odpowiedzi banku [${row.ref}] ${row.f ? 'jej właścicielką' : 'jej właścicielem'} jest ${row.name}, nie ${suspects.get(expect)?.full ?? 'osoba z dowodu'}; paragon dowodzi obecności właściciela karty`,
            });
          } else checked.push({ ref: row.ref, note: cl.cards.length > 1 ? `karty z paragonu należą do tych osób [${row.ref}]` : `karta z paragonu należy do tej osoby [${row.ref}]` });
        });
        if (problems.length) {
          out.contradicted = true;
          out.reason = problems.map((p) => p.text).join('; ');
          out.reasonCodes.push(...new Set(problems.flatMap((p) => p.codes)));
          out.refs.push(...new Set(problems.map((p) => p.ref)));
          // Paragon z ceną, która zacznie obowiązywać dopiero później (do przyznania się w epilogu).
          if (problems.some((p) => p.early)) out.variant = 'price-early';
          break;
        }
        if (!checked.length) { out.unknown = true; break; }
        out.refs.push(...new Set(checked.map((x) => x.ref)));
        out.okNote = [...new Set(checked.map((x) => x.note))].join(', ');
        break;
      }
      case 'photo': {
        out.sightings.push({ place: cl.place, from: cl.time, to: cl.time });
        const problems = [];
        const okBits = [];
        if (sunset) {
          if (cl.sky === 'day' && cl.time > sunset.time + 20) problems.push({ code: 'photo-daylight', text: `zdjęcie pokazuje jasne niebo o ${fmt(cl.time)}, a słońce zaszło o ${fmt(sunset.time)} [${sunset.ref}]`, ref: sunset.ref });
          if (cl.sky === 'night' && cl.time < sunset.time - 20) problems.push({ code: 'photo-dark', text: `zdjęcie pokazuje ciemne niebo o ${fmt(cl.time)}, a słońce zaszło dopiero o ${fmt(sunset.time)} [${sunset.ref}]`, ref: sunset.ref });
        }
        if (weatherCard) {
          if (cl.ground === 'dry' && raining(cl.time)) problems.push({ code: 'photo-dry', text: `zdjęcie z ${fmt(cl.time)} pokazuje suchy chodnik, a według stacji meteo [${weatherCard}] wtedy padało`, ref: weatherCard });
          if (cl.ground === 'wet' && !raining(cl.time) && !rainedRecently(cl.time, 60)) problems.push({ code: 'photo-wet', text: `zdjęcie z ${fmt(cl.time)} pokazuje kałuże, a według stacji meteo [${weatherCard}] od dawna nie padało`, ref: weatherCard });
        }
        if (typeof cl.show === 'boolean' && shows) {
          const on = shows.starts.some((a) => a <= cl.time && cl.time < a + shows.dur);
          const what = shows.kind === 'fountain' ? 'pokaz fontanny' : 'pokaz świateł na pomniku';
          if (on !== cl.show) {
            const cur = shows.starts.find((a) => a <= cl.time && cl.time < a + shows.dur);
            problems.push({
              code: 'photo-show', ref: shows.ref,
              text: cl.show
                ? `na zdjęciu z ${fmt(cl.time)} trwa ${what}, a według komunikatu ZGK [${shows.ref}] o tej porze pokazu nie było`
                : `na zdjęciu z ${fmt(cl.time)} nie ma pokazu, a według komunikatu ZGK [${shows.ref}] od ${fmt(cur)} do ${fmt(cur + shows.dur)} trwał ${what}`,
            });
          } else okBits.push({ ref: shows.ref, note: `pokaz na placu zgadza się z komunikatem ZGK [${shows.ref}]` });
        }
        if (cl.clock && clockLight) {
          const sc = scaffold && scaffold.from <= crimeIso && crimeIso <= scaffold.to;
          const expect = sc ? 'scaffold' : clockLight.from <= cl.time && cl.time < clockLight.to ? 'lit' : 'dark';
          const ref = sc || (cl.clock === 'scaffold' && scaffold) ? scaffold.ref : clockLight.ref;
          if (expect !== cl.clock) {
            const desc = { lit: 'podświetloną tarczę zegara na ratuszu', dark: 'ciemną tarczę zegara na ratuszu', scaffold: 'wieżę ratusza w rusztowaniu' }[cl.clock];
            problems.push({
              code: 'photo-clock', ref,
              text: sc
                ? `zdjęcie pokazuje ${desc}, a według komunikatu ZGK [${ref}] od ${dayMonth(scaffold.from)} do ${dayMonth(scaffold.to)} tarczę zasłaniało rusztowanie`
                : cl.clock === 'scaffold'
                  ? `zdjęcie pokazuje ${desc}, a według komunikatu ZGK [${scaffold?.ref ?? ref}] ${scaffold ? `remont wieży trwał od ${dayMonth(scaffold.from)} do ${dayMonth(scaffold.to)}, a nie ${dayMonth(crimeIso)}` : 'wieża nie była w remoncie'}`
                  : expect === 'dark'
                  ? `zdjęcie z ${fmt(cl.time)} pokazuje ${desc}, a według komunikatu ZGK [${ref}] tarcza jest podświetlona tylko od ${fmt(clockLight.from)} do ${fmt(clockLight.to)}`
                  : `zdjęcie z ${fmt(cl.time)} pokazuje ${desc}, a według komunikatu ZGK [${ref}] o tej porze tarcza była podświetlona i bez rusztowania`,
            });
          } else okBits.push({ ref, note: `zegar na ratuszu zgadza się z komunikatem ZGK [${ref}]` });
        }
        if (problems.length) {
          out.contradicted = true;
          out.reason = problems.map((p) => p.text).join('; ');
          out.reasonCodes.push(...problems.map((p) => p.code));
          out.refs.push(...new Set(problems.map((p) => p.ref)));
          break;
        }
        out.refs.push(...new Set([weatherCard, sunset?.ref, ...okBits.map((x) => x.ref)].filter(Boolean)));
        out.okNote = [`niebo i chodnik na zdjęciu zgadzają się z pogodą${weatherCard ? ` [${weatherCard}]` : ''}${sunset ? ` i zachodem słońca [${sunset.ref}]` : ''}`, ...okBits.map((x) => x.note)].join(', ');
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
        const problems = [];
        const okBits = [];
        const bus = buses.find((b) => b.stop === cl.stop && b.line === cl.line);
        if (bus) {
          const deps = bus.deps[dt] || [];
          const match = deps.find((d) => cl.time >= d && cl.time - d <= 2);
          if (match === undefined) {
            const last = deps[deps.length - 1];
            const after = last !== undefined && cl.time > last + 2;
            problems.push({
              codes: after ? ['bus-after-last', 'bus-no-departure'] : ['bus-no-departure'], ref: bus.ref,
              text: after
                ? `bilet skasowano o ${fmt(cl.time)}, a ostatni autobus linii ${cl.line} odjechał z tego przystanku o ${fmt(last)} [${bus.ref}]`
                : `bilet skasowano o ${fmt(cl.time)}, a o tej porze żaden autobus linii ${cl.line} nie odjeżdżał z tego przystanku [${bus.ref}]`,
            });
          } else okBits.push({ ref: bus.ref, note: `autobus linii ${cl.line} odjechał z przystanku o ${fmt(match)} [${bus.ref}]` });
        }
        const v = cl.car !== undefined ? vehicles.get(cl.car) : null;
        if (v) {
          if (!v.runs.some((r) => r.line === cl.line && r.from <= cl.time && cl.time <= r.to)) {
            const at = v.runs.find((r) => r.from <= cl.time && cl.time <= r.to);
            problems.push({
              codes: ['bus-vehicle'], ref: v.ref,
              text: `bilet z wozu ${cl.car} skasowano o ${fmt(cl.time)} na linii ${cl.line}, a według dyspozycji MZK [${v.ref}] ten wóz ${at ? `jeździł wtedy na linii ${at.line}` : 'nie kursował wtedy na żadnej linii (postój w zajezdni)'}`,
            });
          } else okBits.push({ ref: v.ref, note: `wóz ${cl.car} jeździł wtedy na linii ${cl.line} [${v.ref}]` });
        }
        if (problems.length) {
          out.contradicted = true;
          out.reason = problems.map((p) => p.text).join('; ');
          out.reasonCodes.push(...new Set(problems.flatMap((p) => p.codes)));
          out.refs.push(...new Set(problems.map((p) => p.ref)));
          break;
        }
        if (!okBits.length) { out.unknown = true; break; }
        out.refs.push(...okBits.map((x) => x.ref));
        out.okNote = okBits.map((x) => x.note).join(', ');
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
    e.events = e.sightings.map(({ away, ...x }) => ({ ...x, refs: [e.card] }));
    if (cl.kind === 'train' && !e.contradicted && !e.unknown) e.events.push({ place: AWAY, from: cl.time + 1, to: FAR, refs: [e.card] });
    return e;
  });
  const byCard = new Map(evaluated.map((e) => [e.card, e]));

  function clearingFrom(sightings, refsBase) {
    const res = [];
    for (const s of sightings) {
      const tr = clears(s.place, s.from, s.to, s.away);
      if (tr) res.push({ place: s.place, from: s.from, to: s.to, travel: tr.min, refs: [...refsBase, tr.ref], ...(moment && s.away ? { away: true } : {}) });
    }
    // Okno-chwila: każdy pobyt liczy się osobno (tak mówi zasada chwili). Dwa doręczenia kuriera, które dopiero
    // razem wykluczałyby każdą chwilę okna, nie dają alibi; taka osoba po prostu nie mogła być sprawcą (nie ma
    // wolnej chwili), co sprawdza warunek fizyczny niżej.
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

  /** Niezależne alibi (świadkowie, kamery, rejestry) dla bieżącego okna W1–W2. */
  function computeNeutralClears() {
    const map = new Map();
    for (const s of seen) {
      if (!suspects.has(s.who)) continue;
      const cl = clearingFrom([s], s.refs);
      if (!cl.length) continue;
      if (!map.has(s.who)) map.set(s.who, []);
      map.get(s.who).push(...cl);
    }
    return map;
  }

  // Okna do sprawdzenia. Przy podpaleniu: otwarcia drzwi przed zapłonem, w których dało się podłożyć minutnik
  // (chwila podłożenia leży w [zapłon − nastaw maks., zapłon − nastaw min.]). Bez opinii biegłego albo czujki
  // każde otwarcie jest możliwe, a bez rejestru alarmu nie ma żadnego okna.
  // Przy otruciu: od ostatniej wymiany wody do pierwszej szklanki ze środkiem. Bez zeznania o wymianie wody
  // dolną granicą może być każde wejście obsługi albo postawienie karafki; bez opinii lekarza górną granicą
  // może być każda szklanka (nie wiadomo, w której był już środek). Każda para to osobna hipoteza.
  const fromOpenings = crime.windowFrom === 'openings';
  const multiWin = crime.windowFrom !== 'case';
  let windows;
  if (fromOpenings) {
    windows = openings.filter((o) => (!ignition || o.from <= ignition.time)
      && (!ignition || !timer || (o.to >= ignition.time - timer.max && o.from <= ignition.time - timer.min)));
  } else if (moment) {
    const lows = refills.length ? [Math.max(...refills.map((x) => x.time))] : [...new Set(carafeTimes.map((x) => x.time))];
    const highs = dosed.length ? [Math.min(...dosed.map((x) => x.time))] : [...new Set(glasses.map((x) => x.time))];
    windows = [];
    for (const lo of lows.sort((a, b) => a - b)) for (const hi of highs.sort((a, b) => a - b)) if (lo < hi) windows.push({ from: lo, to: hi });
  } else windows = [{ from: W1, to: W2 }];
  let neutralClears = new Map();

  // Wszystkie hipotezy: (sprawca, sfałszowany dowód tego sprawcy).
  // Zasada: fałszywka sprawcy daje mu alibi na czas kradzieży. W sprawach z kłamstwem
  // niewinnej osoby (c.innocentLie) dokładnie jeden inny dowód może być fałszywy, ale
  // należy do kogoś innego, a ta osoba i tak ma inne, potwierdzone alibi.
  const maxLies = c.innocentLie ? 1 : 0;
  const givesAlibi = (e) => clearingFrom(e.sightings, [e.card]).length > 0;
  // Cechy osób. Cecha jest znana, gdy leżą obie karty: ślad z miejsca i pełny wykaz. Sprawca musi mieć każdą znaną
  // cechę. W sprawie z cechami (c.traits) kłamstwo niewinnej osoby jest wytłumaczone, gdy kłamca ma inne
  // potwierdzone alibi albo nie ma którejś cechy sprawcy; dopóki którejś cechy z zasad nie znamy (brak karty),
  // nie da się tego wykluczyć, więc każde kłamstwo uchodzi za możliwe.
  const ruleTraits = c.traits?.ids || [];
  const traitRule = ruleTraits.length > 0;
  const knownTraits = [...traitSeen.keys()].filter((t) => traitLists.get(t)?.complete);
  const hasTrait = (who, t) => traitLists.get(t).values?.[who] === traitSeen.get(t).value;
  const missingTrait = (who) => knownTraits.find((t) => !hasTrait(who, t)) || null;
  const traitExcuse = (who) => traitRule && (ruleTraits.some((t) => !knownTraits.includes(t)) || Boolean(missingTrait(who)));
  /** Potwierdzone alibi osoby z kart uznanych w hipotezie za prawdziwe. */
  const clearedBy = (who, falseCards) => {
    const items = [...(neutralClears.get(who) || [])];
    for (const e of evaluated) {
      if ((e.who === who || e.with.includes(who)) && !falseCards.has(e.card)) items.push(...clearingFrom(e.sightings, [e.card]));
    }
    return items;
  };
  /** Okno-chwila: pierwsza chwila okna, w której osoba z pobytami `evs` mogła być na miejscu zbrodni (albo null). */
  function momentFor(evs) {
    for (let m = W1; m <= W2; m++) {
      const at = { place: SCENE, from: m, to: m };
      if (evs.every((e) => !conflict(at, e))) return m;
    }
    return null;
  }
  /** Czy wszystkie osoby dają się fizycznie przeprowadzić przez swoje prawdziwe pobyty (sprawca też przez miejsce zbrodni). */
  const physicalOk = (susId, falseCards) => c.suspects.every((p) => {
    const evs = trueEvents(p.id, falseCards);
    // Okno-chwila: sprawca musiał zdążyć na miejsce w jakiejś chwili okna (wystarczy jedna).
    if (p.id === susId && moment) return !firstConflict(evs) && momentFor(evs) !== null;
    if (p.id === susId) evs.push({ place: SCENE, from: W1, to: W2, refs: [] });
    return !firstConflict(evs);
  });
  /** Kłamstwo osoby `who` jest wytłumaczone: ma inne potwierdzone alibi albo (sprawa z cechą) nie ma cechy sprawcy. */
  const excused = (who, falseCards) => clearedBy(who, falseCards).length > 0 || traitExcuse(who);
  const consistent = [];
  for (const win of windows) {
    W1 = win.from;
    W2 = win.to;
    neutralClears = computeNeutralClears();
    for (const sus of c.suspects) {
      for (const forged of evaluated.filter((e) => e.who === sus.id)) {
        if (!givesAlibi(forged)) continue;
        // Sprawca ma każdą znaną cechę ze śladu.
        if (missingTrait(sus.id)) continue;
        const lies = evaluated.filter((e) => e !== forged && e.contradicted);
        if (lies.length > maxLies) continue;
        if (lies.some((e) => e.who === sus.id)) continue;
        let falseCards = new Set([forged.card, ...lies.map((e) => e.card)]);
        if (lies.some((e) => !excused(e.who, falseCards))) continue;
        if (neutralClears.has(sus.id)) continue;
        const ownTrue = evaluated.filter((e) => (e.who === sus.id || e.with.includes(sus.id)) && !falseCards.has(e.card));
        if (ownTrue.some((e) => givesAlibi(e))) continue;
        // Każda osoba musi dać się fizycznie „przeprowadzić” przez wszystkie swoje prawdziwe pobyty,
        // a sprawca dodatkowo przez pobyt na miejscu zbrodni.
        let physLie = null;
        if (!physicalOk(sus.id, falseCards)) {
          // Sprawa z cechą: kłamstwo niewinnej osoby może zdradzać fizyczna niemożliwość (tak jak fałszywkę sprawcy),
          // a nie tabela. Szukamy jednego dowodu innej osoby, bez którego wszystko się zgadza.
          if (!traitRule || lies.length >= maxLies) continue;
          physLie = evaluated.find((e) => {
            if (e === forged || falseCards.has(e.card) || e.who === sus.id) return false;
            const fc = new Set([...falseCards, e.card]);
            return excused(e.who, fc) && physicalOk(sus.id, fc);
          }) || null;
          if (!physLie) continue;
          falseCards = new Set([...falseCards, physLie.card]);
        }
        // Przy podpaleniu i otruciu hipoteza obejmuje też okno: to samo rozwiązanie w dwóch oknach to dwie hipotezy.
        const hyp = multiWin ? { culprit: sus.id, forged: forged.card, window: { from: W1, to: W2 } } : { culprit: sus.id, forged: forged.card };
        if (physLie) hyp.lies = [physLie.card];
        consistent.push(hyp);
      }
    }
  }

  const uniqueHyp = consistent.length === 1 ? consistent[0] : null;
  const unique = uniqueHyp ? { culprit: uniqueHyp.culprit, forged: uniqueHyp.forged } : null;
  // Dalsze wyjaśnienia liczymy w oknie jedynej hipotezy (przy podpaleniu) albo w oknie z akt.
  if (uniqueHyp?.window) {
    W1 = uniqueHyp.window.from;
    W2 = uniqueHyp.window.to;
  } else if (multiWin && windows.length) {
    W1 = windows[0].from;
    W2 = windows[0].to;
  }
  neutralClears = computeNeutralClears();

  // Wyjaśnienie: kto i czym ma potwierdzone alibi.
  const explain = { suspects: {}, forged: null, lies: [], window: null, trait: null };
  if (unique && fromOpenings) explain.window = explainWindow();
  if (unique && moment) explain.window = explainMoment();
  if (unique) {
    const f = byCard.get(unique.forged);
    explain.forged = { card: f.card, kind: f.kind, reason: f.reason, reasonCodes: f.reasonCodes, refs: [f.card, ...f.refs], proofRefs: [...f.refs], physical: false, ...(f.variant ? { variant: f.variant } : {}) };
    const physLies = new Set(uniqueHyp.lies || []);
    explain.lies = evaluated.filter((e) => e !== f && (e.contradicted || physLies.has(e.card))).map((e) => {
      const s0 = e.sightings[0];
      const tr = travel.get(s0.place);
      // Wszystkie miejsca z karty (np. dwa doręczenia kuriera) z czasami dotarcia.
      const stops = e.sightings.map((x) => ({ place: x.place, from: x.from, to: x.to, travel: travel.get(x.place)?.min, travelRef: travel.get(x.place)?.ref }));
      return { card: e.card, who: e.who, kind: e.kind, reason: e.reason, reasonCodes: e.reasonCodes, refs: [e.card, ...e.refs], place: s0.place, from: s0.from, to: s0.to, travel: tr?.min, travelRef: tr?.ref, stops, alibi: givesAlibi(e) };
    });
    const lieCards = new Set(explain.lies.map((x) => x.card));
    const allFalse = new Set([f.card, ...lieCards]);
    // Dlaczego kłamstwo nie jest fałszywką sprawcy: kłamca ma inne, potwierdzone alibi (albo nie ma cechy ze śladu).
    for (const lie of explain.lies) {
      lie.cleared = clearedBy(lie.who, allFalse);
      if (physLies.has(lie.card)) Object.assign(lie, physicalProof(byCard.get(lie.card), allFalse));
      const tx = traitMissText(lie.who);
      if (tx) lie.trait = tx;
    }
    if (!f.contradicted) {
      const pp = physicalProof(f, allFalse);
      if (pp.card) explain.forged = pp;
    }
    explain.trait = traitSummary();
    for (const sus of c.suspects) {
      if (sus.id === unique.culprit) continue;
      const items = [];
      for (const n of neutralClears.get(sus.id) || []) items.push({ type: 'neutral', ...n });
      for (const e of evaluated.filter((x) => (x.who === sus.id || x.with.includes(sus.id)) && !lieCards.has(x.card) && x !== f)) {
        for (const cl of clearingFrom(e.sightings, [e.card])) items.push({ type: 'supplied', note: e.okNote, ...cl });
      }
      // Kto nie ma cechy ze śladu, nie jest sprawcą (to nie alibi, ale tak samo wyklucza tę osobę).
      const tx = traitMissText(sus.id);
      if (tx) items.push({ type: 'trait', refs: tx.refs, text: tx.text, trait: tx.trait });
      explain.suspects[sus.id] = items;
    }
  }

  /** Podpalenie: krok „wybór okna” (które otwarcie drzwi mieści się w widełkach minutnika). */
  function explainWindow() {
    const chosen = { from: W1, to: W2 };
    const others = openings.filter((o) => o.from !== W1 || o.to !== W2);
    const refs = [...new Set([openings[0]?.ref, ignition?.ref, timer?.ref].filter(Boolean))];
    if (!ignition || !timer) return { ...chosen, others, refs, reason: '' };
    const a = ignition.time - timer.max;
    const b = ignition.time - timer.min;
    const span = (o) => `${fmt(o.from)}–${fmt(o.to)}`;
    const why = others.map((o) => `${span(o)} wypada ${o.to < a ? 'za wcześnie' : 'za późno'}`).join(', a ');
    const reason = `czujka dymu zapisała zapłon o ${fmt(ignition.time)} [${ignition.ref}], a według opinii biegłego [${timer.ref}] minutnik nastawiono na ${timer.min}–${timer.max} min, więc podłożono go między ${fmt(a)} a ${fmt(b)}; z otwarć drzwi w rejestrze alarmu [${openings[0].ref}] w ten przedział trafia tylko ${span(chosen)}${why ? `, a ${why}` : ''}`;
    return { ...chosen, others, refs, ignition: ignition.time, min: timer.min, max: timer.max, from2: a, to2: b, reason };
  }

  /** Otrucie: krok „okno zdarzenia” (od wymiany wody w karafce do pierwszej szklanki ze środkiem). */
  function explainMoment() {
    const lo = refills.length ? refills.reduce((a, b) => (b.time > a.time ? b : a)) : null;
    const hi = dosed.length ? dosed.reduce((a, b) => (b.time < a.time ? b : a)) : null;
    const refs = [...new Set([lo?.ref, hi?.ref].filter(Boolean))];
    const reason = lo && hi
      ? `wodę w karafce wymieniono o ${fmt(lo.time)} [${lo.ref}], a według lekarza środek był już w szklance wypitej o ${fmt(hi.time)} [${hi.ref}], więc dosypano go w jakiejś chwili między ${fmt(W1)} a ${fmt(W2)}; inne godziny z kart tego okna nie zmieniają`
      : '';
    return { from: W1, to: W2, others: [], refs, reason, moment: true };
  }

  /** Cechy: opis braku cechy u osoby (do wyjaśnienia i raportu) albo null, gdy osoba ma wszystkie znane cechy. */
  function traitMissText(who) {
    const t = missingTrait(who);
    if (!t) return null;
    const seen = traitSeen.get(t);
    const list = traitLists.get(t);
    const p = suspects.get(who);
    const not = (seen.hasNot || [])[p?.f ? 1 : 0] || 'nie ma cechy ze śladu';
    return { trait: t, refs: [seen.ref, list.ref], text: `${not} (${seen.short || 'ślad z miejsca'})` };
  }

  /** Cechy: krótkie podsumowanie śladu i wykazu (do ekranu wyniku). */
  function traitSummary() {
    if (!knownTraits.length) return null;
    const parts = knownTraits.map((t) => {
      const seen = traitSeen.get(t);
      const list = traitLists.get(t);
      const names = c.suspects.filter((p) => hasTrait(p.id, t)).map((p) => p.full);
      return { trait: t, refs: [seen.ref, list.ref], holders: c.suspects.filter((p) => hasTrait(p.id, t)).map((p) => p.id), text: `${seen.what} [${seen.ref}], a według wykazu [${list.ref}] ${list.lead || 'tę cechę ma tylko'}: ${names.join(', ')}` };
    });
    const holders = c.suspects.filter((p) => knownTraits.every((t) => hasTrait(p.id, t))).map((p) => p.id);
    return { refs: [...new Set(parts.flatMap((x) => x.refs))], parts, holders, reason: parts.map((x) => x.text).join('; ') };
  }

  /** Fałszywka zgodna z tabelami: szukamy pobytu, którego nie da się z nią pogodzić. */
  function physicalProof(f, falseCards) {
    const people = [f.who, ...f.with];
    // Ile różnych kart (poza czasami dotarcia) obala fałszywkę: w dobrej sprawie dokładnie jedna.
    const proofSets = new Set();
    for (const pid of people) {
      for (const e of f.events) for (const o of trueEvents(pid, falseCards)) if (conflict(e, o)) proofSets.add(o.refs.join('+'));
    }
    // Zbieramy wszystkie sprzeczności i wybieramy tę, której udowodnienie wymaga najmniej kart:
    // nakładanie się w czasie albo wyjazd pociągiem nie potrzebują planu miasta.
    const options = [];
    for (const pid of people) {
      for (const e of f.events) {
        for (const o of trueEvents(pid, falseCards)) {
          if (!conflict(e, o)) continue;
          const overlap = e.place === AWAY || o.place === AWAY || (e.from <= o.to && o.from <= e.to);
          options.push({ pid, e, o, overlap });
        }
      }
    }
    if (!options.length) return {};
    options.sort((a, b) => Number(b.overlap) - Number(a.overlap));
    const { pid, e, o, overlap } = options[0];
    const person = suspects.get(pid);
    const gp = (m, fm) => (person.f ? fm : m);
    const when = (x) => (x.from === x.to ? `o ${fmt(x.from)}` : `od ${fmt(x.from)} do ${fmt(x.to)}`);
    const oRefs = o.refs.filter(Boolean);
    // Karty potrzebne, żeby z dowodu odczytać pobyt (np. repertuar z długością filmu).
    const ownRefs = f.kind === 'cinema' ? [...new Set((f.refs || []).filter((r) => r !== f.card))] : [];
    let reason;
    const travelRefs = [];
    if (e.place === AWAY) {
      reason = `według dowodu [${f.card}] ${person.full} ${gp('wyjechał', 'wyjechała')} pociągiem o ${fmt(e.from - 1)}, a karta ${oRefs.map((r) => `[${r}]`).join(' i ')} pokazuje tę osobę ${placeLoc(o.place)} ${when(o)}, kiedy już nie ${gp('powinien', 'powinna')} być w mieście`;
    } else if (overlap) {
      reason = `według karty ${oRefs.map((r) => `[${r}]`).join(' i ')} ${person.full} ${gp('był', 'była')} ${placeLoc(o.place)} ${when(o)}, a dowód [${f.card}] umieszcza tę osobę ${placeLoc(e.place)} ${when(e)}${ownRefs.length ? ` (${ownRefs.map((r) => `[${r}]`).join(', ')})` : ''}; nikt nie jest w dwóch miejscach naraz`;
    } else {
      const ta = travel.get(e.place);
      const tb = travel.get(o.place);
      if (ta) travelRefs.push(ta.ref);
      if (tb && tb.ref !== ta?.ref) travelRefs.push(tb.ref);
      const D = ta && tb ? between(e.place, o.place) : null;
      let how = '';
      if (D !== null) {
        how = grid
          ? `${blocksText(cellsApart(ta.cell, tb.cell))} na planie miasta (${ta.cell} → ${tb.cell}), czyli ${D} min drogi [${[...new Set(travelRefs)].join(', ')}]`
          : `co najmniej ${D} min drogi (czasy dotarcia ${ta.min} i ${tb.min} min [${[...new Set(travelRefs)].join(', ')}])`;
      }
      reason = `według karty ${oRefs.map((r) => `[${r}]`).join(' i ')} ${person.full} ${gp('był', 'była')} ${placeLoc(o.place)} ${when(o)}, a dowód [${f.card}] umieszcza tę osobę ${placeLoc(e.place)} ${when(e)}`
        + (how ? `; droga między tymi miejscami to ${how}` : '');
    }
    return {
      card: f.card, kind: f.kind, reason, reasonCodes: [pid === f.who ? 'physical' : 'physical-other'],
      refs: [...new Set([f.card, ...oRefs, ...ownRefs, ...travelRefs])], proofRefs: oRefs, physical: true, about: pid, proofCount: proofSets.size,
    };
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
    // Okna, które zostały po odrzuceniu otwarć niepasujących do minutnika (przy kradzieży: okno z akt,
    // przy otruciu: pary granic okna możliwe według kart).
    windows,
    moment,
    // Czy dowód (gdyby był prawdziwy) daje alibi w oknie rozwiązania.
    givesAlibi,
    describeClear(item) {
      if (item.type === 'trait') return item.text;
      const when = item.from === item.to ? `o ${fmt(item.from)}` : `od ${fmt(item.from)} do ${fmt(item.to)}`;
      return `${placeLoc(item.place)} ${when}${item.away ? ', potem wyjazd z miasta' : ''} (dotarcie: ${item.travel} min)`;
    },
  };
}

/** Ile różnych okien zostaje w spójnych hipotezach (hipotezy w jednym oknie liczą się raz). */
const windowsLeft = (res) => new Set(res.consistent.map((h) => (h.window ? `${h.window.from}-${h.window.to}` : '-'))).size;

/** Karty, które wyznaczają okno (bez nich zostaje kilka okien kandydujących). */
const WINDOW_FACTS = { openings: ['timer', 'ignition'], moment: ['refill', 'dosed'] };

/**
 * Czy krok „wybór okna” jest potrzebny do werdyktu: bez kart wyznaczających okno spójne hipotezy dają więcej niż
 * jedną parę (sprawca, fałszywka). Dziś generator buduje sprawy tak, że w każdym oknie kandydującym wychodzi to
 * samo rozwiązanie, więc okno jest częścią opowieści, a nie dowodu.
 */
export function windowStepNeeded(c, res = solveCase(c)) {
  const facts = WINDOW_FACTS[crimeOf(c).windowFrom];
  if (!facts || !res.explain.window) return false;
  const rest = c.cards.filter((k) => !(k.facts || []).some((f) => facts.includes(f.t)));
  const pairs = new Set(solveCase({ ...c, cards: rest }).consistent.map((h) => `${h.culprit}/${h.forged}`));
  return pairs.size !== 1;
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
  // Okno-chwila: fałszywka musi wykluczać każdą chwilę okna (solver liczy to w oknie rozwiązania).
  const travelOk = res.moment ? res.givesAlibi(forged) : forged.sightings.some((s) => {
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
    // Od środy obalenie wymaga zestawienia co najmniej trzech kart (np. kamera + plan miasta), a nie jednej.
    if (new Set(res.explain.forged.refs).size < 3) issues.push('fałszywkę obala jedna karta bez liczenia czasu');
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
      if (c.lieCard && c.lieCard !== lie.card) issues.push('solver wskazał inne kłamstwo niż zamierzone');
      // Sprawa z cechą: kłamstwo zdradza fizyczna niemożliwość, tak jak fałszywkę sprawcy (sprawdza traitIssues).
      if (hasTraitRule(c)) continue;
      // Kłamstwo ma obalać tylko karta z tabeli, a nie inny pobyt kłamcy.
      const e = res.evaluated.find((x) => x.card === lie.card);
      const evs = [...res.trueEvents(lie.who, new Set([c.solution.forged, lie.card])), ...e.sightings.map((x) => ({ ...x, refs: [lie.card] }))];
      if (res.firstConflict(evs)) issues.push('kłamstwo niewinnej osoby obala też fizyczna sprzeczność');
    }
  } else if (res.explain.lies.length) {
    issues.push('sprzeczny dowód poza fałszywką w sprawie bez kłamstwa');
  }
  // Współpraca: sfałszowana karta i karta, która ją obala, muszą być u różnych graczy.
  const deskOf = (id) => c.cards.find((k) => k.id === id)?.desk;
  const forgedDesk = deskOf(c.solution.forged);
  // Plan miasta jest stały (można go znać na pamięć), więc liczą się tylko karty z tej sprawy.
  const isMap = (id) => c.cards.find((k) => k.id === id)?.map;
  const proofOnly = res.explain.forged.physical ? res.explain.forged.proofRefs : res.explain.forged.refs;
  const refDesks = proofOnly.filter((r) => r !== c.solution.forged && !isMap(r)).map(deskOf);
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
  // Podpalenie: okno wynika jednoznacznie z rejestru alarmu, czujki i opinii biegłego, a bez opinii biegłego
  // nie da się go wybrać przez samo wykluczanie (w obu otwarciach wychodzi spójna hipoteza).
  if (crimeOf(c).windowFrom === 'openings') {
    if (res.windows.length !== 1) issues.push(`otwarć pasujących do minutnika: ${res.windows.length}`);
    else if (res.windows[0].from !== c.window.from || res.windows[0].to !== c.window.to) issues.push('minutnik wskazuje inne otwarcie niż zamierzone');
    const noTimer = c.cards.filter((k) => !(k.facts || []).some((f) => f.t === 'timer'));
    if (noTimer.length === c.cards.length) issues.push('brak opinii biegłego o minutniku');
    else if (windowsLeft(solveCase({ ...c, cards: noTimer })) < 2) issues.push('okno da się wybrać bez opinii biegłego');
  }
  // Otrucie: granice okna podają karty (wymiana wody, opinia lekarza). Bez którejkolwiek z nich okna nie da się
  // ustalić: zostają co najmniej dwie hipotezy (różne okna z tym samym rozwiązaniem).
  if (crimeOf(c).windowFrom === 'moment') {
    if (res.windows.length !== 1) issues.push(`możliwych okien: ${res.windows.length}`);
    else if (res.windows[0].from !== c.window.from || res.windows[0].to !== c.window.to) issues.push('karty wyznaczają inne okno niż zamierzone');
    for (const [t, what] of [['refill', 'zeznania o wymianie wody'], ['dosed', 'opinii lekarza']]) {
      const rest = c.cards.filter((k) => !(k.facts || []).some((f) => f.t === t));
      if (rest.length === c.cards.length) issues.push(`brak ${what}`);
      else if (windowsLeft(solveCase({ ...c, cards: rest })) < 2) issues.push(`okno da się ustalić bez ${what}`);
    }
  }
  if (hasTraitRule(c)) issues.push(...traitIssues(c, res));
  return issues;
}

const hasTraitRule = (c) => Boolean(c.traits?.ids?.length);
const traitFactCards = (c) => c.cards.filter((k) => (k.facts || []).some((f) => f.t === 'trait' || f.t === 'traitlist'));

/**
 * Kontrola jakości modułu cech (generator v11):
 * - każda cecha z zasad ma ślad i pełny wykaz; sprawca ma wszystkie cechy, a ma je też co najmniej jedna niewinna
 *   osoba (każdą cechę osobno i wszystkie naraz), więc sama cecha nie rozwiązuje sprawy;
 * - kłamstwo niewinnej osoby zdradza fizyczna niemożliwość (jedna karta, z liczeniem czasu), a kłamca nie ma
 *   żadnego innego alibi i nie ma cechy: od sprawcy odróżnia go tylko cecha;
 * - bez kart z cechą zostają co najmniej dwie hipotezy (karta z cechą jest potrzebna).
 */
export function traitIssues(c, res = solveCase(c)) {
  const issues = [];
  const facts = c.cards.flatMap((k) => (k.facts || []).map((f) => ({ ...f, ref: k.id })));
  const sid = c.solution.culprit;
  const all = c.suspects.map((s) => s.id);
  const holdersOf = (t) => {
    const seen = facts.find((f) => f.t === 'trait' && f.trait === t);
    const list = facts.find((f) => f.t === 'traitlist' && f.trait === t);
    if (!seen || !list || !list.complete) return null;
    return all.filter((id) => list.values?.[id] === seen.value);
  };
  const sets = [];
  for (const t of c.traits.ids) {
    const h = holdersOf(t);
    if (!h) { issues.push(`cecha ${t}: brak śladu albo pełnego wykazu`); continue; }
    if (!h.includes(sid)) issues.push(`cecha ${t}: sprawca jej nie ma`);
    if (h.length < 2) issues.push(`cecha ${t}: ma ją tylko ${h.length} osoba`);
    sets.push(h);
  }
  const both = all.filter((id) => sets.every((h) => h.includes(id)));
  if (sets.length && both.length < 2) issues.push('wszystkie cechy naraz ma mniej niż dwie osoby');
  const lie = res.explain.lies[0];
  if (!lie) issues.push('sprawa z cechą bez kłamstwa niewinnej osoby');
  else {
    if (!lie.trait) issues.push('kłamca ma cechę sprawcy');
    if (lie.cleared?.length) issues.push('kłamca ma inne potwierdzone alibi (cecha niepotrzebna)');
    if (!lie.physical) issues.push('kłamstwo nie jest obalane fizyczną niemożliwością');
    else {
      if (lie.proofCount !== 1) issues.push(`kłamstwo obala ${lie.proofCount} różnych kart`);
      if (new Set(lie.refs).size < 3) issues.push('kłamstwo obala jedna karta bez liczenia czasu');
      if (lie.about !== lie.who) issues.push('kłamstwo powinno obalać pobyt kłamcy');
      // Ten sam warunek współpracy co dla fałszywki: kłamstwo i karta, która je obala, u różnych graczy (inaczej
      // kontrola jakości odsiewałaby inne rodzaje kłamstw niż fałszywek i rodzaj dowodu coś by zdradzał).
      const deskOf = (id) => c.cards.find((k) => k.id === id)?.desk;
      const lieDesk = deskOf(lie.card);
      const refDesks = lie.proofRefs.filter((r) => !c.cards.find((k) => k.id === r)?.map).map(deskOf);
      for (const size of [2, 3, 4, 5]) {
        const seatOf = (desk) => TEAM_DESKS[size].findIndex((ds) => ds.includes(desk));
        if (!refDesks.some((d) => seatOf(d) !== seatOf(lieDesk))) issues.push(`przy ${size} graczach jedna osoba ma i kłamstwo, i jego obalenie`);
      }
    }
    if (!lie.alibi) issues.push('kłamstwo nie daje alibi (inna forma niż fałszywka sprawcy)');
  }
  // Karta z cechą jest potrzebna: bez kart ze śladem i wykazem zostają co najmniej dwie hipotezy.
  const tc = new Set(traitFactCards(c).map((k) => k.id));
  const without = solveCase({ ...c, cards: c.cards.filter((k) => !tc.has(k.id)) });
  if (without.consistent.length < 2) issues.push(`bez kart z cechą hipotez: ${without.consistent.length}`);
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
  // Osoba bez żadnego dostarczonego dowodu jest niewinna z samej zasady 3 (nie miała czego sfałszować),
  // więc sprawdzanie jej alibi nie wchodzi do budżetu.
  const hasSupplied = new Set(c.cards.filter((k) => k.kind === 'supplied').map((k) => k.by));
  for (const [who, items] of res.neutralClears) if (hasSupplied.has(who)) for (const it of items) for (const r of it.refs) if (cost(r)) need.add(r);
  const minimal = new Set();
  for (const ex of [res.explain.forged, ...(res.explain.lies || []), ...(res.explain.lies || []).map((l) => l.trait), res.explain.window]) {
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
export function proofDepth(res, c = null) {
  if (!res.explain.forged) return 0;
  // Podpalenie i otrucie: krok „wybór okna” liczy się tylko wtedy, gdy bez niego werdykt nie jest jednoznaczny
  // (`c` podane; bez `c` liczymy go zawsze, jak dawniej).
  const win = res.explain.window && (!c || windowStepNeeded(c, res)) ? res.explain.window.refs : [];
  const forgedRefs = [...res.explain.forged.refs, ...win];
  const lie = res.explain.lies?.[0];
  if (!lie) return new Set(forgedRefs).size;
  // Kłamstwo: karta i jej obalenie, a do tego czas dotarcia (gdy nie daje alibi) albo najtańsze inne alibi kłamcy.
  // Sprawa z cechą: kłamca nie ma innego alibi, a od sprawcy odróżnia go cecha (ślad i wykaz).
  if (lie.trait) return new Set(forgedRefs).size + new Set([...lie.refs, ...lie.trait.refs]).size;
  const extra = lie.alibi ? (lie.cleared || []).reduce((best, it) => (!best || it.refs.length < best.length ? it.refs : best), null) || [] : (lie.stops || []).map((x) => x.travelRef).concat(lie.travelRef);
  return new Set(forgedRefs).size + new Set([...lie.refs, ...extra].filter(Boolean)).size;
}
