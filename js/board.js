// Tablica śledcza: gracz przypina karty, a tablica sama wypisuje z nich fakty (kto, gdzie, kiedy)
// i układa je na osi czasu przy podejrzanych. Po wybraniu dwóch faktów pokazuje odstęp czasu i drogę
// między miejscami. Tablica NIE ocenia, czy coś jest sprzeczne ani który dowód jest fałszywy:
// liczby zestawia, wniosek wyciąga gracz.

import { PLACES } from './data.js';
import { fmt } from './time.js';
import { icon } from './icons.js';
import { portrait } from './portraits.js';
import { PLACE_CELLS, cellsApart, blocksText, MIN_PER_CELL } from './town.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const placeName = (key) => (key === '@pociag' ? 'pociąg (poza miastem)' : PLACES[key]?.name || key);

/**
 * Fakty z jednej karty (tylko to, co jest dosłownie na karcie).
 * @returns {{id: string, card: string, who: string[], place: string, from: number, to: number|null, note: string}[]}
 */
export function factsOfCard(k, { cards, canSee }) {
  const out = [];
  const add = (who, place, from, to, note) => out.push({ id: `${k.id}#${out.length}`, card: k.id, who, place, from, to, note });
  for (const f of k.facts || []) {
    if (f.t === 'seen') add([f.who], f.place, f.from, f.to, f.from === f.to ? '' : 'cały czas');
    if (f.t === 'claim') {
      const who = [f.who, ...(f.with || [])];
      if (f.kind === 'delivery') for (const st of f.stops) add(who, st.place, st.time, st.time, 'doręczenie');
      else if (f.kind === 'cinema') add(who, 'kino', f.start, null, `seans „${f.film}”`);
      else if (f.kind === 'train') add(who, 'dworzec', f.time, null, 'odjazd pociągu');
      else if (f.kind === 'bus') add(who, f.stop, f.time, f.time, `autobus ${f.line}`);
      else add(who, f.place, f.time, f.time, { receipt: 'paragon', photo: 'zdjęcie', parking: 'bilet parkingowy' }[f.kind] || '');
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
 * @param {string} o.sceneCell pole miejsca kradzieży
 * @param {boolean} o.autoAll wpisać wszystkie jawne fakty (pn–wt: zagadka i tak jest w tabelach urzędowych)
 */
export function renderBoard({ c, pins, sel, canSee, hasMap, sceneCell, autoAll = false }) {
  // Teczki osób: to, co każda osoba twierdzi (jej własne dowody), jest wpisane od razu.
  // Niezależne fakty (świadkowie, kamery, rejestry) gracz dopina sam, chyba że autoAll.
  const visible = c.cards.filter((k) => canSee(k) && isPinnable(k));
  const auto = visible.filter((k) => autoAll || k.kind === 'supplied').map((k) => k.id);
  const ids = [...new Set([...auto, ...pins])];
  const facts = ids.map((id) => c.cards.find((k) => k.id === id)).filter((k) => k && canSee(k)).flatMap((k) => factsOfCard(k, { cards: c.cards, canSee }).map((f) => ({ ...f, claim: k.kind === 'supplied' })));
  const byId = new Map(facts.map((f) => [f.id, f]));
  const chosen = sel.map((id) => byId.get(id)).filter(Boolean);
  // Oś czasu: od 17:00 do 24:00, poszerzana, jeśli coś wypada poza.
  const A = Math.min(17 * 60, ...facts.map((f) => f.from - 15));
  const B = Math.max(24 * 60, ...facts.map((f) => (f.to ?? f.from) + 15));
  const pct = (m) => ((m - A) / (B - A)) * 100;
  const hours = [];
  for (let h = Math.ceil(A / 60); h * 60 <= B; h++) hours.push(h);
  const win = `<span class="bd-window" style="left:${pct(c.window.from)}%;width:${pct(c.window.to) - pct(c.window.from)}%" title="drzwi otwarte ${fmt(c.window.from)}–${fmt(c.window.to)}"></span>`;
  const axis = `<div class="bd-axis">${hours.map((h) => `<span style="left:${pct(h * 60)}%">${h % 24}</span>`).join('')}</div>`;
  const chip = (f) => `<button class="bd-fact${f.claim ? ' claim' : ''}${sel.includes(f.id) ? ' on' : ''}" data-act="board-pick" data-id="${f.id}" aria-pressed="${sel.includes(f.id)}"><span class="chip">${f.card}</span> ${esc(placeName(f.place))} <b>${when(f)}</b>${f.note ? ` <span class="bd-note">${esc(f.note)}</span>` : ''}</button>`;
  const lane = (list) => `<div class="bd-lane">${win}${list.map((f) => (f.to === null || f.to === f.from
    ? `<button class="bd-dot${f.claim ? ' claim' : ''}${sel.includes(f.id) ? ' on' : ''}" style="left:${pct(f.from)}%" data-act="board-pick" data-id="${f.id}" title="${esc(placeName(f.place))} ${when(f)} (${f.card})" aria-label="${esc(placeName(f.place))} ${when(f)}"></button>`
    : `<button class="bd-bar${f.claim ? ' claim' : ''}${sel.includes(f.id) ? ' on' : ''}" style="left:${pct(f.from)}%;width:${Math.max(1.5, pct(f.to) - pct(f.from))}%" data-act="board-pick" data-id="${f.id}" title="${esc(placeName(f.place))} ${when(f)} (${f.card})" aria-label="${esc(placeName(f.place))} ${when(f)}"></button>`)).join('')}</div>`;
  const rows = c.suspects.map((s) => {
    const list = facts.filter((f) => f.who.includes(s.id)).sort((a, b) => a.from - b.from);
    return `<div class="bd-row">
      <div class="bd-who">${portrait(s.full, 'portrait bd-face')}<b>${esc(s.first)}</b><span class="bd-role">${esc(s.role)}</span></div>
      <div class="bd-track"><p class="bd-alibi">${esc(s.alibi.replace(/\s*\((?:bilety?|paragon|zdjęcie|zrzut ekranu|bilet): [A-Z]\d+\)/g, ''))}</p>${lane(list)}<div class="bd-chips">${list.map(chip).join('') || '<span class="muted small">brak dowodów z godziną</span>'}</div></div>
    </div>`;
  }).join('');
  const loose = facts.filter((f) => !f.who.length);
  const looseRow = loose.length ? `<div class="bd-row"><div class="bd-who"><span class="bd-face bd-unknown">?</span><b>Kto?</b></div><div class="bd-track">${lane(loose)}<div class="bd-chips">${loose.map(chip).join('')}</div><p class="muted small">Właściciela karty wejściowej podaje wykaz kart.</p></div></div>` : '';

  // Zestawienie wybranych faktów: same liczby, bez werdyktu.
  const cellOf = (place) => (place === 'scene' ? sceneCell : PLACE_CELLS[place]);
  const route = (a, b) => {
    if (!hasMap) return 'drogę policzy osoba z planem miasta';
    if (a === b) return 'to samo miejsce';
    const n = cellsApart(cellOf(a), cellOf(b));
    return `droga ${blocksText(n)} = <b>${n * MIN_PER_CELL} min</b>`;
  };
  let compare = '<p class="muted small">Dotknij faktu (kropki na osi albo karteczki), żeby zobaczyć, jak daleko jest do miejsca kradzieży. Dotknij drugiego, żeby zestawić czas i drogę.</p>';
  if (chosen.length === 1) {
    const f = chosen[0];
    compare = `<p><span class="chip">${f.card}</span> ${esc(placeName(f.place))} <b>${when(f)}</b>${hasMap ? ` · pole ${cellOf(f.place)}` : ''}</p>
      <p class="small">Do miejsca kradzieży: ${hasMap ? `${blocksText(cellsApart(cellOf(f.place), sceneCell))} = <b>${cellsApart(cellOf(f.place), sceneCell) * MIN_PER_CELL} min</b>` : 'zapytaj osobę z planem miasta'} · drzwi otwarte ${fmt(c.window.from)}–${fmt(c.window.to)}</p>`;
  } else if (chosen.length === 2) {
    const [x, y] = [...chosen].sort((a, b) => a.from - b.from);
    const xEnd = x.to ?? x.from;
    const gap = y.from - xEnd;
    const overlap = y.from <= xEnd && x.to !== null;
    compare = `<p><span class="chip">${x.card}</span> ${esc(placeName(x.place))} <b>${when(x)}</b> → <span class="chip">${y.card}</span> ${esc(placeName(y.place))} <b>${when(y)}</b></p>
      <p class="small">${overlap ? 'Te pobyty nakładają się w czasie.' : `Odstęp: <b>${gap} min</b>${x.to === null ? ` (od ${x.note}, ${fmt(x.from)})` : ''}`} · ${route(x.place, y.place)}</p>`;
  }
  return `
  <section class="board" aria-label="Tablica śledcza">
    <header class="desk-head">
      <h2>${icon('footprints')} Tablica śledcza</h2>
      <p class="muted small">${autoAll ? 'Wszystkie jawne fakty są już wpisane.' : 'Teczki osób: to, co każdy twierdzi, jest już wpisane (jasne karteczki). Świadków, nagrania i rejestry dopinasz przyciskiem „Na tablicę” (żółte karteczki).'} Czerwony pas to czas, gdy drzwi były otwarte.</p>
    </header>
    <div class="bd-compare" aria-live="polite">${compare}${sel.length ? '<p><button class="link-btn" data-act="board-clear">Wyczyść wybór</button></p>' : ''}</div>
    ${facts.length ? `<div class="bd-grid">${axis}${rows}${looseRow}</div>` : '<p class="muted">Tablica jest pusta. Na kartach z godziną i miejscem (bilety, paragony, zeznania, nagrania, rejestry) jest przycisk „Na tablicę”.</p>'}
  </section>`;
}
