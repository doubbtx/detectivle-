// Czas i daty. Godziny w sprawie trzymamy jako minuty od północy dnia zbrodni
// (np. 19:52 = 1192). Wartości ≥ 1440 oznaczają godziny po północy.

export const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
export const WEEKDAYS_ACC = ['w niedzielę', 'w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę'];
export const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

const pad = (n) => String(n).padStart(2, '0');

/** 1192 → "19:52" */
export function fmt(mins) {
  const m = Math.round(mins);
  const h = Math.floor(m / 60) % 24;
  return `${h}:${pad(m % 60)}`;
}

/** Godzina w rozkładach i godzinach otwarcia: 1260 → "21", 1290 → "21:30", 1560 → "2" */
export function fmtHour(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return m === 0 ? String(h) : `${h}:${pad(m)}`;
}

export function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function daysBetween(isoA, isoB) {
  return Math.round((parseIso(isoB) - parseIso(isoA)) / 86400000);
}

/** Dzisiejsza data w strefie czasowej gracza (jak w Wordle). */
export function localTodayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function weekdayOf(iso) {
  return parseIso(iso).getUTCDay();
}

/** 'wd' (pon–pt), 'sat' albo 'sun' */
export function dayType(weekday) {
  if (weekday === 0) return 'sun';
  if (weekday === 6) return 'sat';
  return 'wd';
}

export function dateLong(iso) {
  const d = parseIso(iso);
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "1.11.2026" */
export function dateShort(iso) {
  const d = parseIso(iso);
  return `${d.getUTCDate()}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

function lastSundayOf(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

/** Czy w Polsce obowiązuje czas letni (od ostatniej niedzieli marca do ostatniej niedzieli października). */
export function isSummerTime(iso) {
  const d = parseIso(iso);
  const y = d.getUTCFullYear();
  return d >= lastSundayOf(y, 2) && d < lastSundayOf(y, 9);
}

/** Przybliżona godzina zachodu słońca w środkowej Polsce (czas lokalny, w minutach). */
export function sunsetFor(iso) {
  const d = parseIso(iso);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d - start) / 86400000) + 1;
  const winterTime = 1065 + 135 * Math.sin((2 * Math.PI * (doy - 80)) / 365);
  return Math.round(winterTime + (isSummerTime(iso) ? 60 : 0));
}
