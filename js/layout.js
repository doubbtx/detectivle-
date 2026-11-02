// Porządek śledztwa: każda karta ma dokładnie jedno miejsce macierzyste.
//   krok 1 „Co się stało”      – karty z miejsca zdarzenia (oględziny, ślad i wykaz, okno zdarzenia),
//   krok 2 „Teczki podejrzanych” – dowody, które podejrzany sam dostarczył (pole `by`, nigdy koperta),
//   krok 3 „Akta i koperty”     – wszystko inne, w działach biurek (D, S, M, Z, R).
// Przypisanie wynika wyłącznie z budowy karty (rodzaj, fakty, tytuł), nigdy z rozwiązania sprawy.
// Moduł jest czysty (bez DOM), więc da się go testować w Node.

import { CHARACTERS } from './data.js';

export const DESK_ORDER = ['D', 'S', 'M', 'Z', 'R'];

/** Fakty, które opisują samo miejsce zdarzenia: ślad i wykaz cech, otwarcia drzwi, zapłon, karafka. */
export const SCENE_FACTS = new Set(['trait', 'traitlist', 'opening', 'ignition', 'timer', 'dosed', 'carafe', 'glass', 'refill']);

/** Dokumenty z oględzin i o samym miejscu (zwykle bez faktów): poznajemy je po tytule. */
export const SCENE_TITLE = /^(Zdjęcie z oględzin|Zdjęcie klawiatury przy drzwiach|Protokół oględzin|Protokół zabezpieczenia obuwia|Lista osób znających kod|Lista osób z dostępem|Wynik badania wody z karafki|Raport straży pożarnej|Rejestr systemu alarmowego|Wycena rzeczoznawcy|Polisa ubezpieczeniowa)/;

const norm = (t) => String(t ?? '').replace(/⁠/g, '').replace(/\s+/g, ' ');

/** Karta z miejsca zdarzenia (krok 1). Dowody podejrzanych nigdy tu nie trafiają. */
export function isSceneCard(k, c) {
  if (k.by) return false;
  if ((k.facts || []).some((f) => SCENE_FACTS.has(f.t))) return true;
  if (SCENE_TITLE.test(norm(k.title))) return true;
  // Zeznanie samego poszkodowanego (właściciela) dotyczy tego, co zastał na miejscu.
  const owner = c?.owner?.full;
  return Boolean(owner && k.kind === 'witness' && norm(k.title) === `Zeznanie: ${norm(owner)}`);
}

/**
 * Miejsce macierzyste karty: { place: 'scene' } | { place: 'folder', sid } | { place: 'akta', desk }.
 * Do teczki trafia tylko jawny dowód podejrzanego (bez czynności), więc zamknięta koperta nigdy nie zdradza,
 * kogo dotyczy.
 */
export function homeOf(k, c) {
  if (k.by && !k.action && c.suspects.some((s) => s.id === k.by)) return { place: 'folder', sid: k.by };
  if (isSceneCard(k, c)) return { place: 'scene' };
  return { place: 'akta', desk: k.desk };
}

/** Podział wszystkich kart sprawy: { scene: [id], folders: { sid: [id] }, akta: { D: [id], … } }. */
export function placeCards(c) {
  const out = { scene: [], folders: Object.fromEntries(c.suspects.map((s) => [s.id, []])), akta: Object.fromEntries(DESK_ORDER.map((d) => [d, []])) };
  for (const k of c.cards) {
    const h = homeOf(k, c);
    if (h.place === 'scene') out.scene.push(k.id);
    else if (h.place === 'folder') out.folders[h.sid].push(k.id);
    else (out.akta[h.desk] ||= []).push(k.id);
  }
  // W dziale najpierw karty jawne, potem koperty (kolejność stała: nie zależy od tego, co już otwarto).
  const byAction = (ids) => ids.sort((a, b) => Number(Boolean(cardOf(c, a).action)) - Number(Boolean(cardOf(c, b).action)) || cmpId(a, b));
  out.scene = byAction(out.scene);
  for (const d of Object.keys(out.akta)) byAction(out.akta[d]);
  for (const s of Object.keys(out.folders)) out.folders[s].sort(cmpId);
  return out;
}

const cardOf = (c, id) => c.cards.find((k) => k.id === id);
const cmpId = (a, b) => a.localeCompare(b, 'pl', { numeric: true });

/** Formy imienia i nazwiska podejrzanego (mianownik i odmiany z biblioteki postaci). */
function nameForms(s) {
  const ch = CHARACTERS.find((x) => x.full === s.full) || {};
  return [...new Set([s.full, s.fullAcc, ch.fullAcc, s.first, s.gen, s.ins, ch.first, ch.gen, ch.acc, ch.ins].filter(Boolean).map(norm))];
}

/** Czy widoczny tekst karty (tytuł, podtytuł, linie) wymienia osobę z imienia (z nazwiskiem albo bez). */
export function namesPerson(k, s) {
  const text = norm([k.title, k.sub, ...(k.lines || [])].join(' \n '));
  return nameForms(s).some((f) => new RegExp(`(?<![\\p{L}\\d])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u').test(text));
}

/**
 * Karty, które wspominają osobę, do pokazania w jej teczce jako odnośniki. Tylko karty, które gracz już widzi
 * (`visible`: jawne albo otwarte koperty na jego biurkach), bez własnych dowodów tej osoby i bez list,
 * które wymieniają całą piątkę (takie nic nie mówią o jednej osobie).
 */
export function mentionsOf(c, sid, visible) {
  const s = c.suspects.find((x) => x.id === sid);
  if (!s) return [];
  return c.cards.filter((k) => {
    if (!visible(k)) return false;
    const h = homeOf(k, c);
    if (h.place === 'folder' && h.sid === sid) return false;
    if (!namesPerson(k, s)) return false;
    return c.suspects.filter((x) => namesPerson(k, x)).length < c.suspects.length;
  }).map((k) => k.id);
}
