// Borowice: stały plan miasteczka. Ulice tworzą siatkę, a każde miejsce leży w jednym kwartale
// (pole planu: kolumny A–T, wiersze 1–14, jak w skorowidzu papierowego planu miasta).
// Czas dotarcia między dwoma miejscami to liczba przecznic w poziomie plus w pionie
// (przez rzekę prowadzi most na każdej ulicy), razy MIN_PER_CELL minut.

export const COLS = 20;
export const ROWS = 14;
export const MIN_PER_CELL = 2;
export const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRST';

/** Kratki miejsc z PLACES (data.js). */
export const PLACE_CELLS = {
  teatr: 'F4', pub: 'M10', restauracja: 'O6', kregielnia: 'Q11', hotel: 'D9',
  biblioteka: 'I2', basen: 'S4', silownia: 'P13', dworzec: 'C14',
  rynek: 'J6', plac: 'E6', bulwar: 'K11', park: 'Q7', kino: 'G11',
  kawiarnia: 'J7', apteka: 'C5', delikatesy: 'L3', pizzeria: 'N13',
  kwiatowa: 'B2', jasminowa: 'E2', polna: 'S2', ogrodowa: 'R9', sloneczna: 'F14',
  brzozowa: 'A8', akacjowa: 'T13', wrzosowa: 'O2',
  krotka: 'I10', ratuszowa: 'L7', zamkowa: 'F9', garbarska: 'N4',
  stopLesne: 'A5', stopSzpital: 'C2', stopStadion: 'S10', stopZajezdnia: 'Q14', stopZielone: 'T7',
  stadion: 'T9', szpital: 'B3', ratusz: 'K6', cmentarz: 'D12',
};

/** Biuro detektywa (ekran główny): tuż przy Rynku. */
export const OFFICE_CELL = 'H7';

/** Kratki miejsc zbrodni (SCENES w data.js). */
export const SCENE_CELLS = {
  antykwariat: 'H5', galeria: 'L5', zegarmistrz: 'I8', jubiler: 'K8', muzeum: 'G7',
  lutnik: 'M7', ksiegarnia: 'J4', fotograf: 'N9', cukiernia: 'H9',
};

/** 'J7' → [9, 6] (kolumna, wiersz od zera). */
export function parseCell(label) {
  return [COL_LETTERS.indexOf(label[0]), Number(label.slice(1)) - 1];
}

/** [9, 6] → 'J7'. */
export function cellLabel([x, y]) {
  return `${COL_LETTERS[x]}${y + 1}`;
}

export function cellsApart(a, b) {
  const [ax, ay] = parseCell(a);
  const [bx, by] = parseCell(b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** Najszybszy czas dotarcia (w minutach) między dwiema kratkami. */
export function minutesApart(a, b, perCell = MIN_PER_CELL) {
  return cellsApart(a, b) * perCell;
}

export const placeCell = (key) => PLACE_CELLS[key];
export const sceneCell = (id) => SCENE_CELLS[id];

/** „1 przecznica”, „3 przecznice”, „12 przecznic”. */
export function blocksText(n) {
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  const word = n === 1 ? 'przecznica' : !teen && last >= 2 && last <= 4 ? 'przecznice' : 'przecznic';
  return `${n} ${word}`;
}
