// Ilustrowany plan Borowic (SVG): ulice z nazwami, kamienice, rynek z ratuszem, rzeka z mostami,
// park, tory i dworzec. Ulice biegną w siatce, a każde miejsce leży w jednym kwartale (polu planu
// A–T × 1–14, jak w skorowidzu papierowego planu). Pomiar trasy rysuje drogę po ulicach.

import { ICONS } from './icons.js';
import { COLS, ROWS, COL_LETTERS, PLACE_CELLS, SCENE_CELLS, parseCell, cellsApart, MIN_PER_CELL, blocksText } from './town.js';

const C = 46; // bok kwartału razem z połową ulic
const PAD = 26;
const W = PAD * 2 + COLS * C;
const H = PAD * 2 + ROWS * C;
const X = (i) => PAD + i * C; // granica (ulica) nr i
const Y = (j) => PAD + j * C;
const cx = (x) => X(x) + C / 2;
const cy = (y) => Y(y) + C / 2;

/** Krótkie podpisy na mapie. */
export const MAP_LABELS = {
  teatr: 'Teatr Miejski', pub: 'Pub Kotwica', restauracja: 'Pod Lipami', kregielnia: 'Kręgielnia', hotel: 'Hotel Zacisze',
  biblioteka: 'Biblioteka', basen: 'Basen Delfin', silownia: 'Siłownia Atlas', dworzec: 'Dworzec PKP',
  rynek: 'Rynek', plac: 'Pl. Wolności', bulwar: 'Bulwar', park: 'Park Zdrojowy', kino: 'Kino Mewa',
  kawiarnia: 'Filiżanka', apteka: 'Apteka', delikatesy: 'Delikatesy U Basi', pizzeria: 'Pizzeria Napoli',
  kwiatowa: 'Kwiatowa', jasminowa: 'Jaśminowa', polna: 'Polna', ogrodowa: 'Ogrodowa', sloneczna: 'Słoneczna',
  brzozowa: 'Brzozowa', akacjowa: 'Akacjowa', wrzosowa: 'Wrzosowa',
  krotka: 'Krótka', ratuszowa: 'Ratuszowa', zamkowa: 'Zamkowa', garbarska: 'Garbarska',
  stopLesne: 'Os. Leśne', stopSzpital: 'Szpital', stopStadion: 'Stadion', stopZajezdnia: 'Zajezdnia', stopZielone: 'Os. Zielone',
  stadion: 'Hala OSiR', szpital: 'Szpital Pow.', ratusz: 'Ratusz', cmentarz: 'Cmentarz',
};

/** Nazwy ulic: pionowe (granica między kolumnami i-1 oraz i) i poziome (między wierszami). */
const V_STREETS = {
  1: 'Leśna', 2: 'Szpitalna', 3: 'Kolejowa', 4: 'Teatralna', 5: 'Wolności', 6: 'Muzealna', 7: 'Szeroka', 8: 'Kościelna',
  9: 'Długa', 10: 'Rynkowa', 11: 'Złota', 12: 'Rycerska', 13: 'Cicha', 14: 'Mostowa', 15: 'Sadowa', 16: 'Parkowa',
  17: 'Zdrojowa', 18: 'Sportowa', 19: 'Łąkowa',
};
const H_STREETS = {
  1: 'Biblioteczna', 2: 'Targowa', 3: 'Mickiewicza', 4: 'Słowackiego', 5: 'Kopernika', 6: 'Lipowa', 7: 'Klasztorna',
  8: 'Piekarska', 9: 'Ogrodnicza', 10: 'Nadrzeczna', 12: 'Zarzeczna', 13: 'Dworcowa',
};
const MAIN_V = new Set([5, 10, 14]);
const MAIN_H = new Set([4, 8, 12]);
const RIVER = 11; // rzeka Borówka płynie wzdłuż granicy między wierszami 11 i 12
const PARK = new Set(['P6', 'Q6', 'R6', 'P7', 'Q7', 'R7', 'P8', 'Q8', 'R8', 'S7']);
const PLAZA = new Set(['J6', 'K6']); // Rynek z ratuszem
const CEMETERY = new Set(['D12', 'D13']);

/** Ikona znacznika (Lucide); parking ma literę P jak na znaku drogowym. */
const PLACE_ICONS = {
  teatr: 'drama', pub: 'beer', restauracja: 'utensils-crossed', kregielnia: 'target', hotel: 'hotel',
  biblioteka: 'library-big', basen: 'waves-ladder', silownia: 'dumbbell', dworzec: 'train-front',
  rynek: 'landmark', plac: 'flag', bulwar: 'footprints', park: 'trees', kino: 'clapperboard',
  kawiarnia: 'coffee', apteka: 'pill', delikatesy: 'shopping-basket', pizzeria: 'pizza',
  stadion: 'trophy', szpital: 'hospital', ratusz: 'landmark', cmentarz: 'cross',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const swV = (i) => (MAIN_V.has(i) ? 11 : 7);
const swH = (j) => (MAIN_H.has(j) ? 11 : 7);
/** Deterministyczny „los” dla kwartału: miasto wygląda zawsze tak samo. */
const hash = (x, y, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function icon(name, x, y, size, cls) {
  return `<svg class="${cls}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

function markerInner(key, place, x, y, size) {
  if (place?.parking) return `<text class="t-glyph" x="${x}" y="${y + 4.5}" text-anchor="middle">P</text>`;
  const name = place?.stop ? 'bus-front' : place?.street ? 'house' : PLACE_ICONS[key] || 'map-pin';
  return icon(name, x, y, size, 't-ico');
}

/** Zabudowa jednego kwartału. */
function block(x, y, label) {
  const l = X(x) + swV(x) / 2 + 2;
  const t = Y(y) + swH(y) / 2 + 2;
  const r = X(x + 1) - swV(x + 1) / 2 - 2;
  const b = Y(y + 1) - swH(y + 1) / 2 - 2;
  const w = r - l;
  const h = b - t;
  if (PARK.has(label)) {
    let out = `<rect class="m-park" x="${l - 2}" y="${t - 2}" width="${w + 4}" height="${h + 4}" rx="3"/>`;
    for (let k = 0; k < 5; k++) out += `<circle class="m-tree" cx="${l + 4 + hash(x, y, k) * (w - 8)}" cy="${t + 4 + hash(x, y, k + 9) * (h - 8)}" r="${2.6 + hash(x, y, k + 3) * 2}"/>`;
    return out;
  }
  if (CEMETERY.has(label)) {
    let out = `<rect class="m-cemetery" x="${l}" y="${t}" width="${w}" height="${h}" rx="2"/>`;
    for (let k = 0; k < 6; k++) out += `<rect class="m-grave" x="${l + 5 + (k % 3) * (w - 10) / 3}" y="${t + 6 + Math.floor(k / 3) * (h - 12) / 2}" width="4" height="6" rx="1"/>`;
    return out;
  }
  if (PLAZA.has(label)) {
    let out = `<rect class="m-plaza" x="${l - 2}" y="${t - 2}" width="${w + 4}" height="${h + 4}" rx="2"/>`;
    if (label === 'K6') out += `<rect class="m-bldg m-civic" x="${l + w * 0.22}" y="${t + h * 0.25}" width="${w * 0.56}" height="${h * 0.5}" rx="1.5"/>`;
    return out;
  }
  // Starówka: zwarte kamienice wokół podwórza; przedmieścia: domy z ogródkami.
  const dist = Math.abs(x - 10) + Math.abs(y - 6);
  const out = [];
  if (dist <= 7) {
    const d = Math.min(w, h) * (0.3 + hash(x, y) * 0.08);
    out.push(`<rect class="m-yard" x="${l}" y="${t}" width="${w}" height="${h}" rx="1.5"/>`);
    out.push(`<path class="m-bldg" d="M${l} ${t}H${r}V${b}H${l}Z M${l + d} ${t + d}V${b - d}H${r - d}V${t + d}Z" fill-rule="evenodd"/>`);
    const n = 2 + Math.floor(hash(x, y, 2) * 2);
    for (let k = 1; k <= n; k++) {
      const gx = l + (w * k) / (n + 1);
      out.push(`<line class="m-gap" x1="${gx}" y1="${t}" x2="${gx}" y2="${t + d}"/><line class="m-gap" x1="${gx}" y1="${b - d}" x2="${gx}" y2="${b}"/>`);
    }
  } else {
    out.push(`<rect class="m-garden" x="${l}" y="${t}" width="${w}" height="${h}" rx="2"/>`);
    const n = 2 + Math.floor(hash(x, y, 1) * 3);
    for (let k = 0; k < n; k++) {
      const hw = w * (0.24 + hash(x, y, k + 4) * 0.12);
      const hh = h * (0.22 + hash(x, y, k + 7) * 0.12);
      const px = l + 2 + ((k % 2) * (w - hw - 4)) + hash(x, y, k + 11) * 3;
      const py = t + 2 + (Math.floor(k / 2) * (h - hh - 4)) + hash(x, y, k + 13) * 3;
      out.push(`<rect class="m-bldg m-house" x="${px}" y="${py}" width="${hw}" height="${hh}" rx="1"/>`);
    }
  }
  return out.join('');
}

/** Trasa po ulicach między środkami dwóch kwartałów. */
function routePath(a, b) {
  const [ax, ay] = parseCell(a);
  const [bx, by] = parseCell(b);
  // Ulica pozioma przy kwartale A w stronę B; wzdłuż rzeki ulicy nie ma, więc wtedy bierzemy drugą stronę kwartału.
  let j = by < ay ? ay : ay + 1;
  if (j === RIVER) j = j === ay + 1 ? ay : ay + 1;
  const sy = Y(j);
  const sx = bx > ax ? X(bx) : X(bx + 1);
  const pts = ay === by
    ? [[cx(ax), cy(ay)], [cx(ax), sy], [cx(bx), sy], [cx(bx), cy(by)]]
    : [[cx(ax), cy(ay)], [cx(ax), sy], [sx, sy], [sx, cy(by)], [cx(bx), cy(by)]];
  // Etykieta na środku najdłuższego odcinka trasy.
  let best = 0;
  for (let k = 1; k < pts.length; k++) {
    const len = Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]);
    const bl = Math.abs(pts[best + 1][0] - pts[best][0]) + Math.abs(pts[best + 1][1] - pts[best][1]);
    if (len > bl) best = k - 1;
  }
  const mid = [(pts[best][0] + pts[best + 1][0]) / 2, (pts[best][1] + pts[best + 1][1]) / 2];
  return { d: `M ${pts.map((p) => p.join(' ')).join(' L ')}`, mid };
}

/**
 * @param {object} o
 * @param {object} o.places PLACES z data.js
 * @param {string} [o.scene] id sceny (miejsce kradzieży)
 * @param {string} [o.sceneLabel]
 * @param {Set<string>} [o.active] miejsca występujące w sprawie (reszta przygaszona)
 * @param {string[]} [o.selected] wybrane miejsca (klucze; 'scene' = miejsce kradzieży), najwyżej dwa
 */
export function renderTownSvg({ places, scene, sceneLabel = 'Miejsce kradzieży', active = null, selected = [] }) {
  const p = [];
  p.push(`<svg class="town" viewBox="0 0 ${W} ${H}" role="img" aria-label="Plan Borowic">`);
  p.push(`<rect class="m-land" x="0" y="0" width="${W}" height="${H}"/>`);
  // Ulice (najpierw obrys, potem jezdnia, żeby skrzyżowania były czyste)
  const streets = [];
  for (let i = 0; i <= COLS; i++) streets.push({ v: true, i, w: swV(i) });
  for (let j = 0; j <= ROWS; j++) if (j !== RIVER) streets.push({ v: false, i: j, w: swH(j) });
  const seg = (s, grow) => (s.v
    ? `<rect x="${X(s.i) - s.w / 2 - grow}" y="${PAD - 10}" width="${s.w + grow * 2}" height="${ROWS * C + 20}"/>`
    : `<rect x="${PAD - 10}" y="${Y(s.i) - s.w / 2 - grow}" width="${COLS * C + 20}" height="${s.w + grow * 2}"/>`);
  p.push(`<g class="m-street-edge">${streets.map((s) => seg(s, 1)).join('')}</g>`);
  p.push(`<g class="m-street">${streets.map((s) => seg(s, 0)).join('')}</g>`);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) p.push(block(x, y, `${COL_LETTERS[x]}${y + 1}`));
  // Rzeka Borówka z mostem na każdej ulicy
  const ry = Y(RIVER);
  p.push(`<path class="m-water" d="M ${PAD - 12} ${ry - 9} C ${X(5)} ${ry - 14}, ${X(9)} ${ry - 4}, ${X(13)} ${ry - 10} S ${X(18)} ${ry - 6}, ${W - PAD + 12} ${ry - 10} L ${W - PAD + 12} ${ry + 10} C ${X(18)} ${ry + 7}, ${X(15)} ${ry + 12}, ${X(12)} ${ry + 9} S ${X(5)} ${ry + 13}, ${PAD - 12} ${ry + 9} Z"/>`);
  for (let i = 0; i <= COLS; i++) {
    const w = swV(i);
    p.push(`<rect class="m-bridge" x="${X(i) - w / 2 - 1.5}" y="${ry - 15}" width="${w + 3}" height="30" rx="1"/><rect class="m-street-fill" x="${X(i) - w / 2}" y="${ry - 15}" width="${w}" height="30"/>`);
  }
  p.push(`<text class="m-river-name" x="${X(7) + C / 2}" y="${ry + 4}" text-anchor="middle">Borówka</text>`);
  // Tory przy dworcu
  const rly = Y(ROWS);
  const rail = `M ${PAD - 12} ${rly} H ${X(7)} C ${X(8)} ${rly}, ${X(8) + 16} ${rly + 6}, ${X(8) + 26} ${H}`;
  p.push(`<path class="m-rail" d="${rail}"/><path class="m-rail-ties" d="${rail}"/>`);
  // Nazwy ulic
  for (const [i, name] of Object.entries(V_STREETS)) {
    const row = [1, 9, 4, 12, 7, 2, 10, 5][i % 8];
    p.push(`<text class="m-street-name${MAIN_V.has(Number(i)) ? ' main' : ''}" transform="translate(${X(Number(i)) + 3} ${cy(row)}) rotate(-90)" text-anchor="middle">${esc(name)}</text>`);
  }
  for (const [j, name] of Object.entries(H_STREETS)) {
    const col = [3, 15, 8, 1, 12, 6, 17, 10][j % 8];
    p.push(`<text class="m-street-name${MAIN_H.has(Number(j)) ? ' main' : ''}" x="${cx(col)}" y="${Y(Number(j)) + 3}" text-anchor="middle">${esc(name)}</text>`);
  }
  // Skorowidz na marginesach (jak na papierowym planie)
  for (let x = 0; x < COLS; x++) {
    p.push(`<text class="m-index" x="${cx(x)}" y="${PAD - 13}" text-anchor="middle">${COL_LETTERS[x]}</text><text class="m-index" x="${cx(x)}" y="${H - 8}" text-anchor="middle">${COL_LETTERS[x]}</text>`);
  }
  for (let y = 0; y < ROWS; y++) {
    p.push(`<text class="m-index" x="${PAD - 14}" y="${cy(y) + 4}" text-anchor="middle">${y + 1}</text><text class="m-index" x="${W - PAD + 14}" y="${cy(y) + 4}" text-anchor="middle">${y + 1}</text>`);
  }
  p.push(`<rect class="m-frame" x="${PAD - 10}" y="${PAD - 10}" width="${COLS * C + 20}" height="${ROWS * C + 20}"/>`);

  // Trasa między dwoma wybranymi miejscami
  const cellOf = (key) => (key === 'scene' ? SCENE_CELLS[scene] : PLACE_CELLS[key]);
  if (selected.length === 2 && cellOf(selected[0]) && cellOf(selected[1])) {
    const a = cellOf(selected[0]);
    const b = cellOf(selected[1]);
    const route = routePath(a, b);
    p.push(`<path class="m-route-casing" d="${route.d}"/><path class="m-route" d="${route.d}"/>`);
    const n = cellsApart(a, b);
    // Etykieta na zakręcie trasy (z dala od pinezek na jej końcach)
    const tx = Math.min(Math.max(route.mid[0], PAD + 74), W - PAD - 74);
    const ty = Math.min(Math.max(route.mid[1], PAD + 16), H - PAD - 16);
    p.push(`<g class="m-route-tag"><rect x="${tx - 72}" y="${ty - 13}" width="144" height="26" rx="13"/><text x="${tx}" y="${ty + 4}" text-anchor="middle">${blocksText(n)} · ${n * MIN_PER_CELL} min</text></g>`);
  }

  // Podpis miejsca kradzieży pod pinezkami miejsc (żeby ich nie zasłaniał); krótka nazwa z cudzysłowu.
  const sceneShort = (sceneLabel.match(/„[^”]+”/) || [sceneLabel.replace(/ Regionalne$/, '')])[0];
  if (scene && SCENE_CELLS[scene]) {
    const [x, y] = parseCell(SCENE_CELLS[scene]);
    p.push(`<circle class="t-scene-halo" cx="${cx(x)}" cy="${cy(y) - 17}" r="24"/><text class="t-scene-label" x="${cx(x)}" y="${cy(y) + 21}" text-anchor="middle">${esc(sceneShort)}</text>`);
  }
  // Miejsca: najpierw przygaszone, potem te ze sprawy (na wierzchu)
  const isOn = (k) => !active || active.has(k);
  const order = Object.keys(PLACE_CELLS).sort((a, b) => Number(isOn(a)) - Number(isOn(b)));
  for (const key of order) {
    const [x, y] = parseCell(PLACE_CELLS[key]);
    const on = isOn(key);
    const sel = selected.includes(key);
    const name = places[key]?.name || key;
    const mx = cx(x);
    const my = cy(y);
    const head = on
      ? `<path class="t-pin" d="M ${mx} ${my + 6} C ${mx - 4} ${my}, ${mx - 13} ${my - 6}, ${mx - 13} ${my - 15} A 13 13 0 1 1 ${mx + 13} ${my - 15} C ${mx + 13} ${my - 6}, ${mx + 4} ${my}, ${mx} ${my + 6} Z"/>${markerInner(key, places[key], mx, my - 15, 15)}`
      : `<circle class="t-dot" cx="${mx}" cy="${my - 2}" r="9"/>${markerInner(key, places[key], mx, my - 2, 11)}`;
    p.push(`<g class="t-place${on ? ' on' : ''}${sel ? ' sel' : ''}" data-act="map-pick" data-place="${key}" tabindex="${on ? 0 : -1}" role="button" aria-pressed="${sel}" aria-label="${esc(name)}, pole ${PLACE_CELLS[key]}"><circle class="t-hit" cx="${mx}" cy="${my - 6}" r="19"/>${head}<text class="t-label" x="${mx}" y="${my + 18}" text-anchor="middle">${esc(MAP_LABELS[key] || key)}</text></g>`);
  }
  // Miejsce kradzieży
  if (scene && SCENE_CELLS[scene]) {
    const [x, y] = parseCell(SCENE_CELLS[scene]);
    const mx = cx(x);
    const my = cy(y);
    const sel = selected.includes('scene');
    p.push(`<g class="t-scene${sel ? ' sel' : ''}" data-act="map-pick" data-place="scene" tabindex="0" role="button" aria-pressed="${sel}" aria-label="Miejsce kradzieży: ${esc(sceneLabel)}, pole ${SCENE_CELLS[scene]}">`
      + `<circle class="t-hit" cx="${mx}" cy="${my - 14}" r="22"/>`
      + `<path d="M ${mx} ${my + 8} C ${mx - 5} ${my + 1}, ${mx - 16} ${my - 7}, ${mx - 16} ${my - 18} A 16 16 0 1 1 ${mx + 16} ${my - 18} C ${mx + 16} ${my - 7}, ${mx + 5} ${my + 1}, ${mx} ${my + 8} Z"/>`
      + icon('search', mx, my - 18, 17, 't-scene-ico')
      + '</g>');
  }
  p.push('</svg>');
  return p.join('');
}
