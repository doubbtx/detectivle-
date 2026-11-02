// Tablica śledcza: gracz przypina karty, a tablica sama wypisuje z nich fakty (kto, gdzie, kiedy)
// i układa je na osi czasu przy podejrzanych. Po wybraniu dwóch faktów pokazuje odstęp czasu i drogę
// między miejscami. Tablica NIE ocenia, czy coś jest sprzeczne ani który dowód jest fałszywy:
// liczby zestawia, wniosek wyciąga gracz.

import { PLACES, crimeOf, shownWindows } from './data.js';
import { fmt } from './time.js';
import { portrait } from './portraits.js';
import { PLACE_CELLS, cellsApart, blocksText, MIN_PER_CELL } from './town.js';
import { icon } from './icons.js';

/**
 * Cechy osób na tablicy: tylko to, co jest na otwartych kartach. Z wykazu wypisujemy wartość przy osobie (rozmiar buta,
 * „zna go pies”, szalik, plecak), a znacznik „pasuje do śladu” dopiero wtedy, gdy otwarty jest też ślad z miejsca.
 */
/** Kolor szalika (czapki) albo plecaka jako kółko: nazwa koloru nie mieści się w wąskiej kolumnie tablicy. */
function swatch(name) {
  const col = [['czerwon', '#c0392b'], ['zielon', '#3c8d4f'], ['żółt', '#e2b33c'], ['jasn', '#e8dcc0'], ['czarn', '#2c2c34']].find(([k]) => name.startsWith(k));
  return `<span class="bd-sw" style="background:${col ? col[1] : 'transparent'}" aria-hidden="true"></span><span class="sr-only">${esc(name)}</span>`;
}

function traitBadges(c, canSee, sid) {
  const visible = c.cards.filter((k) => canSee(k));
  const lists = visible.flatMap((k) => (k.facts || []).filter((f) => f.t === 'traitlist'));
  const seen = visible.flatMap((k) => (k.facts || []).filter((f) => f.t === 'trait'));
  const out = [];
  for (const l of lists) {
    const v = l.values?.[sid];
    const tr = seen.find((x) => x.trait === l.trait);
    const match = Boolean(tr) && v === tr.value;
    // Krótkie etykiety (wąska kolumna na telefonie): sam rozmiar, „zna” albo kolor; pełna nazwa w podpowiedzi.
    const dog = c.traits?.dog || 'pies';
    const full = l.trait === 'shoe' ? `rozmiar buta ${v}`
      : l.trait === 'dog' ? `${dog} zna tę osobę`
        : l.trait === 'scarf' ? (c.traits?.scarf || 'szalik') : (c.traits?.bag || 'plecak');
    const label = l.trait === 'shoe' ? `${icon('footprints')}${esc(v)}`
      : !v ? null
        : l.trait === 'dog' ? `${icon('dog')}zna`
          : `${icon(l.trait === 'scarf' ? 'shirt' : 'briefcase')}${swatch(full)}`;
    const title = `${full}${match ? ' – pasuje do śladu z miejsca' : ''}`;
    if (label) out.push(`<span class="bd-trait${match ? ' match' : ''}" title="${esc(title)}">${label}${match ? ' ✓' : ''}</span>`);
  }
  return out.length ? `<span class="bd-traits">${out.join('')}</span>` : '';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
// Najdłuższe role nie mieszczą się w wąskiej kolumnie tablicy na telefonie: miękki dywiz łamie je w miejscu sylaby
// („rzeczo-/znawczyni”) zamiast wypychać w pas osi czasu. Krótsze role zostają bez zmian.
const ROLE_SHY = { rzeczoznawczyni: 'rzeczo\u00adznawczyni', rzeczoznawca: 'rzeczo\u00adznawca' };
const roleHtml = (role) => esc(role).replace(/\p{L}+/gu, (w) => ROLE_SHY[w] || w);
const placeName = (key) => (key === '@pociag' ? 'pociąg (poza miastem)' : PLACES[key]?.name || key);

/**
 * Fakty z jednej karty (tylko to, co jest dosłownie na karcie).
 * @returns {{id: string, card: string, who: string[], place: string, from: number, to: number|null, note: string}[]}
 */
export function factsOfCard(k, { cards, canSee, c = null }) {
  const out = [];
  const add = (who, place, from, to, note) => out.push({ id: `${k.id}#${out.length}`, card: k.id, who, place, from, to, note });
  for (const f of k.facts || []) {
    if (f.t === 'seen') add([f.who], f.place, f.from, f.to, f.from === f.to ? '' : 'cały czas');
    if (f.t === 'claim') {
      // Wspólny dowód: osobny wpis dla każdej osoby; przy partnerze dopisek, czyj to dowód.
      const owner = c?.suspects?.find((x) => x.id === f.who)?.first || '';
      for (const who of [f.who, ...(f.with || [])]) {
        const byNote = who !== f.who ? ` (wspólny, wg dowodu: ${owner})` : f.with?.length ? ' (wspólny)' : '';
        if (f.kind === 'delivery') for (const st of f.stops) add([who], st.place, st.time, st.time, 'doręczenie');
        else if (f.kind === 'cinema') add([who], 'kino', f.start, null, `seans „${f.film}”${byNote}`);
        else if (f.kind === 'train') add([who], 'dworzec', f.time, null, 'odjazd pociągu');
        else if (f.kind === 'bus') add([who], f.stop, f.time, f.time, `autobus ${f.line}`);
        else add([who], f.place, f.time, f.time, ({ receipt: 'paragon', photo: 'zdjęcie', parking: 'bilet parkingowy' }[f.kind] || '') + byNote);
      }
    }
    if (f.t === 'cardlog') {
      // Właściciela karty wejściowej podaje osobna karta (wykaz kart); bez niej fakt jest „nieprzypisany”.
      const owner = cards.find((c) => canSee(c) && (c.facts || []).some((x) => x.t === 'cardowner' && x.place === f.place && x.card === f.card));
      const who = owner ? [owner.facts.find((x) => x.t === 'cardowner' && x.place === f.place && x.card === f.card).who] : [];
      add(who, f.place, f.from, f.to, `karta wejściowa nr ${f.card}`);
    }
  }
  return out;
}

/** Czy z karty da się coś przypiąć (ma godzinę i miejsce). */
export const isPinnable = (k) => (k.facts || []).some((f) => f.t === 'seen' || f.t === 'claim' || f.t === 'cardlog');

const when = (f) => (f.to === null ? fmt(f.from) : f.from === f.to ? fmt(f.from) : `${fmt(f.from)}–${fmt(f.to)}`);

/**
 * @param {object} o
 * @param {object} o.c sprawa
 * @param {string[]} o.pins przypięte karty
 * @param {string[]} o.sel wybrane fakty (id), najwyżej dwa
 * @param {(k) => boolean} o.canSee czy gracz widzi treść karty
 * @param {boolean} o.hasMap czy gracz ma plan miasta (w ekipie tylko osoba z biurkiem Mapa)
 * @param {string} o.sceneCell pole miejsca zdarzenia (kradzieży, podpalenia)
 * @param {boolean} o.autoAll wpisać wszystkie jawne fakty (pn–wt: zagadka i tak jest w tabelach urzędowych)
 * @param {string} [o.noMapText] co napisać zamiast drogi, gdy gracz nie ma planu
 */
export function renderBoard({ c, pins, sel, canSee, hasMap, sceneCell, autoAll = false, noMapText = 'zapytaj osobę z planem miasta' }) {
  // Teczki osób: to, co każda osoba twierdzi (jej własne dowody), jest wpisane od razu.
  // Niezależne fakty (świadkowie, kamery, rejestry) gracz dopina sam, chyba że autoAll.
  const visible = c.cards.filter((k) => canSee(k) && isPinnable(k));
  const auto = visible.filter((k) => autoAll || k.kind === 'supplied').map((k) => k.id);
  const ids = [...new Set([...auto, ...pins])];
  const facts = ids.map((id) => c.cards.find((k) => k.id === id)).filter((k) => k && canSee(k)).flatMap((k) => factsOfCard(k, { cards: c.cards, canSee, c }).map((f) => ({ ...f, claim: k.kind === 'supplied' })));
  const byId = new Map(facts.map((f) => [f.id, f]));
  const chosen = sel.map((id) => byId.get(id)).filter(Boolean);
  // Oś czasu: tylko godziny, w których coś się dzieje (fakty i okno kradzieży, z zapasem), pełne godziny.
  // Na wąskim ekranie kropki z 25-minutowym odstępem nie zlewają się w jedną.
  // Przy podpaleniu tablica pokazuje wszystkie otwarcia drzwi i zapłon, a nie rozstrzygające okno.
  const cr = crimeOf(c);
  const wins = shownWindows(c);
  const ign = cr.id === 'arson' && typeof c.ignition === 'number' ? c.ignition : null;
  // Otrucie: pas od postawienia karafki do ostatniej szklanki i kreski przy wejściach obsługi i szklankach
  // (granice okna gracz ustala z kart).
  const moment = cr.windowFrom === 'moment' && c.carafe ? c.carafe : null;
  const marks = moment ? [...moment.visits.map((t) => ({ t, label: 'obsługa' })), ...moment.glasses.map((t) => ({ t, label: 'szklanka' }))] : [];
  const winText = moment
    ? `karafka na stole ${fmt(wins[0].from)}–${fmt(wins[0].to)}`
    : wins.length > 1 ? `otwarcia drzwi ${wins.map((w) => `${fmt(w.from)}–${fmt(w.to)}`).join(' i ')}` : `drzwi otwarte ${fmt(wins[0].from)}–${fmt(wins[0].to)}`;
  const times = [...wins.flatMap((w) => [w.from, w.to]), ...(ign === null ? [] : [ign]), ...facts.flatMap((f) => [f.from, f.to ?? f.from])];
  const A = Math.floor((Math.min(...times) - 20) / 60) * 60;
  const B = Math.max(A + 180, Math.ceil((Math.max(...times) + 20) / 60) * 60);
  const pct = (m) => ((m - A) / (B - A)) * 100;
  const hours = [];
  for (let h = Math.ceil(A / 60); h * 60 <= B; h++) hours.push(h);
  const win = wins.map((w, i) => `<span class="bd-window${wins.length > 1 && i % 2 ? ' alt' : ''}" style="left:${pct(w.from)}%;width:${pct(w.to) - pct(w.from)}%" title="${wins.length > 1 ? `otwarcie ${i + 1}` : 'drzwi otwarte'} ${fmt(w.from)}–${fmt(w.to)}"></span>`).join('')
    + (ign === null ? '' : `<span class="bd-ign" style="left:${pct(ign)}%" title="zapłon ${fmt(ign)}"></span>`)
    + marks.map((m) => `<span class="bd-mark" style="left:${pct(m.t)}%" title="${m.label} ${fmt(m.t)}"></span>`).join('');
  // Oś w takim samym układzie jak wiersze (kolumna twarzy + pas), więc godziny trafiają dokładnie nad kropki.
  const axis = `<div class="bd-row bd-axis-row" aria-hidden="true"><span></span><div class="bd-axis">${hours.map((h) => `<span style="left:${pct(h * 60)}%">${h % 24}:00</span>`).join('')}</div></div>`;
  const ticks = hours.map((h) => `<i class="bd-tick" style="left:${pct(h * 60)}%"></i>`).join('');
  const chip = (f) => `<button class="bd-fact${f.claim ? ' claim' : ''}${sel.includes(f.id) ? ' on' : ''}" data-act="board-pick" data-id="${f.id}" aria-pressed="${sel.includes(f.id)}"><span class="chip">${f.card}</span> ${esc(placeName(f.place))} <b>${when(f)}</b>${f.note ? ` <span class="bd-note">${esc(f.note)}</span>` : ''}</button>`;
  const lane = (list) => `<div class="bd-lane">${ticks}${win}${list.map((f) => (f.to === null || f.to === f.from
    ? `<button class="bd-dot${f.claim ? ' claim' : ''}${sel.includes(f.id) ? ' on' : ''}" style="left:${pct(f.from)}%" data-act="board-pick" data-id="${f.id}" title="${esc(placeName(f.place))} ${when(f)} (${f.card})" aria-label="${esc(placeName(f.place))} ${when(f)}"></button>`
    : `<button class="bd-bar${f.claim ? ' claim' : ''}${sel.includes(f.id) ? ' on' : ''}" style="left:${pct(f.from)}%;width:${Math.max(1.5, pct(f.to) - pct(f.from))}%" data-act="board-pick" data-id="${f.id}" title="${esc(placeName(f.place))} ${when(f)} (${f.card})" aria-label="${esc(placeName(f.place))} ${when(f)}"></button>`)).join('')}</div>`;
  const rows = c.suspects.map((s) => {
    const list = facts.filter((f) => f.who.includes(s.id)).sort((a, b) => a.from - b.from);
    return `<div class="bd-row">
      <div class="bd-who">${portrait(s.full, 'portrait bd-face')}<b>${esc(s.first)}</b><span class="bd-role">${roleHtml(s.role)}</span>${traitBadges(c, canSee, s.id)}</div>
      <div class="bd-track"><p class="bd-alibi">${esc(s.alibi.replace(/\s*\((?:bilety?|paragon|zdjęcie|zrzut ekranu|bilet): [A-Z]\d+\)/g, ''))}</p>${lane(list)}<div class="bd-chips">${list.map(chip).join('') || '<span class="muted small">brak dowodów z godziną</span>'}</div></div>
    </div>`;
  }).join('');
  const loose = facts.filter((f) => !f.who.length);
  const looseRow = loose.length ? `<div class="bd-row"><div class="bd-who"><span class="bd-face bd-unknown">?</span><b>Kto?</b></div><div class="bd-track">${lane(loose)}<div class="bd-chips">${loose.map(chip).join('')}</div><p class="muted small">Właściciela karty wejściowej podaje wykaz kart.</p></div></div>` : '';

  // Zestawienie wybranych faktów: same liczby, bez werdyktu.
  const cellOf = (place) => (place === 'scene' ? sceneCell : PLACE_CELLS[place]);
  const route = (a, b) => {
    if (!hasMap) return noMapText;
    if (a === b) return 'to samo miejsce';
    const n = cellsApart(cellOf(a), cellOf(b));
    return `droga ${blocksText(n)} = <b>${n * MIN_PER_CELL} min</b>`;
  };
  let compare = `<p class="muted small bd-tip">Dotknij faktu, żeby zobaczyć drogę do miejsca ${cr.gen}. Dotknij drugiego, żeby zestawić czas i drogę.</p>`;
  if (chosen.length === 1) {
    const f = chosen[0];
    compare = `<p><span class="chip">${f.card}</span> ${esc(placeName(f.place))} <b>${when(f)}</b>${hasMap ? ` · pole ${cellOf(f.place)}` : ''}</p>
      <p class="small">Do miejsca ${cr.gen}: ${hasMap ? `${blocksText(cellsApart(cellOf(f.place), sceneCell))} = <b>${cellsApart(cellOf(f.place), sceneCell) * MIN_PER_CELL} min</b>` : noMapText} · ${winText}</p>`;
  } else if (chosen.length === 2) {
    const [x, y] = [...chosen].sort((a, b) => a.from - b.from);
    const xEnd = x.to ?? x.from;
    const gap = y.from - xEnd;
    // Same liczby (odstęp może być ujemny, gdy drugi fakt wypada w trakcie pierwszego); wniosek należy do gracza.
    compare = `<p><span class="chip">${x.card}</span> ${esc(placeName(x.place))} <b>${when(x)}</b> → <span class="chip">${y.card}</span> ${esc(placeName(y.place))} <b>${when(y)}</b></p>
      <p class="small">Odstęp: <b>${gap} min</b>${x.to === null ? ` (od ${x.note}, ${fmt(x.from)})` : ''} · ${route(x.place, y.place)}</p>`;
  }
  return `
  <section class="board" aria-label="Tablica śledcza">
    <ul class="bd-legend" aria-label="Legenda">
      <li><span class="lg lg-claim"></span>twierdzi podejrzany</li>
      ${autoAll ? '' : '<li><span class="lg lg-pin"></span>dopięte przez ciebie (przycisk „Na tablicę”)</li>'}
      <li><span class="lg lg-win"></span>${winText}</li>
      ${ign === null ? '' : `<li><span class="lg lg-ign"></span>zapłon ${fmt(ign)}</li>`}
      ${c.cards.some((k) => canSee(k) && (k.facts || []).some((f) => f.t === 'traitlist')) ? `<li><span class="bd-trait match bd-lg">✓</span>pasuje do śladu z miejsca (gdy otwarte są ślad i wykaz)</li>` : ''}
      ${moment ? `<li><span class="lg lg-mark"></span>obsługa ${moment.visits.map(fmt).join(', ')} · szklanki ${moment.glasses.map(fmt).join(', ')}</li>` : ''}
    </ul>
    <div class="bd-compare${chosen.length ? '' : ' empty'}" aria-live="polite">${compare}<p class="bd-clear"${sel.length ? '' : ' style="visibility:hidden"'}><button class="link-btn" data-act="board-clear"${sel.length ? '' : ' tabindex="-1" aria-hidden="true"'}>Wyczyść wybór</button></p></div>
    ${facts.length ? `<div class="bd-grid">${axis}${rows}${looseRow}</div>` : '<p class="muted">Tablica jest pusta. Na kartach z godziną i miejscem (bilety, paragony, zeznania, nagrania, rejestry) jest przycisk „Na tablicę”.</p>'}
  </section>`;
}
