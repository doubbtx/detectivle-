// Interfejs gry „Fałszywe Alibi”. Czysty JavaScript, bez bibliotek.

import { randomPracticeCode, DIFFICULTY_LABELS, EPOCH } from './generator.js';
import { loadDailyCase, loadPracticeCase } from './cases.js';
import { solveCase, investigationBudget } from './solver.js';
import { TEAM_DESKS, DESK_DEFS, REASONS, PLACES, SCENES, rulesFor, rulesShortFor, hasTownMap } from './data.js';
import { renderTownSvg } from './map.js';
import { icon } from './icons.js';
import { portrait } from './portraits.js';
import { cardLook, cardIcon, cardVisual } from './visuals.js';
import { renderBoard, isPinnable, factsOfCard } from './board.js';
import { PLACE_CELLS, SCENE_CELLS, OFFICE_CELL, cellsApart, blocksText, MIN_PER_CELL } from './town.js';
import { buildEpilogue } from './epilogue.js';
import { fmt, localTodayIso, addDays } from './time.js';
import { store } from './storage.js';
import { CONFIG } from './config.js';
import { connectLive, randomClientId, liveServerUrl } from './live.js';

const app = document.getElementById('app');

const state = {
  screen: 'home', // home | intro | setup | game | result
  ref: null, // { type: 'daily', date } | { type: 'practice', code }
  c: null,
  sol: null,
  mode: 'solo', // solo | team
  teamSize: 3,
  seat: 1,
  tab: 'akta',
  modal: null, // null | 'accuse' | 'hints' | 'end'
  accuse: { forged: null, proof: null, reason: null, alibis: {}, last: null },
  confirm: null,
  showAll: false,
  toast: '',
  live: null, // { room, conn, rs, you, status, error, draft }
  liveAvailable: false,
};
let progress = null;
let timerHandle = null;
let toastHandle = null;

// ---------------------------------------------------------------------------
// Pomocnicze

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const deskName = (id) => DESK_DEFS.find((d) => d.id === id)?.name ?? id;
const suspectById = (id) => state.c.suspects.find((s) => s.id === id);
const cardById = (id) => state.c.cards.find((k) => k.id === id);
const caseKey = (ref) => (ref.type === 'daily' ? ref.date : `T-${ref.code}`);
const isCaptain = () => state.mode === 'solo' || state.mode === 'live' || state.seat === 1;
const isTeamLike = () => state.mode === 'team' || state.mode === 'live';

let loadToken = 0;

/** Wczytuje sprawę. Zwraca false, jeśli w międzyczasie zaczęło się wczytywanie innej. */
async function loadCase(ref) {
  const token = ++loadToken;
  const loaded = ref.type === 'daily' ? await loadDailyCase(ref.date) : loadPracticeCase(ref.code);
  if (token !== loadToken) return false;
  state.ref = ref;
  state.c = loaded.case;
  state.source = loaded.source;
  state.sol = solveCase(state.c);
  resetCaseUi();
  return true;
}

const FIRST_CASE = addDays(EPOCH, 1);
const isArchive = () => state.ref?.type === 'daily' && state.ref.date < addDays(localTodayIso(), -1);

function resetCaseUi() {
  state.accuse = { forged: null, proof: null, reason: null, alibis: {}, last: null };
  state.showAll = false;
  state.tab = 'akta';
  state.mapSel = [];
  state.boardSel = [];
  state.compare = [];
  state.deskFilter = 'all';
  state.boardView = 'time';
  if (state.mapScrolls) delete state.mapScrolls.plan;
  state.modal = null;
  state.confirm = null;
}

function myDesks() {
  if (state.mode === 'solo') return ['D', 'S', 'M', 'Z', 'R'];
  return TEAM_DESKS[state.teamSize][state.seat - 1];
}

function seatOfDesk(desk) {
  return TEAM_DESKS[state.teamSize].findIndex((ds) => ds.includes(desk)) + 1;
}

function progressKey(mode = state.mode, ref = state.ref, size = state.teamSize, seat = state.seat) {
  return mode === 'team' ? `p:${caseKey(ref)}:team:${size}:${seat}` : `p:${caseKey(ref)}:solo`;
}

/**
 * Wspólny dla wszystkich trybów zapis tego, co już wiadomo o sprawie na tym urządzeniu. Każdy tryb
 * ma własny postęp i 3 próby, więc bez tego dałoby się podejrzeć rozwiązanie (albo wypróbować karty)
 * w jednym trybie i „rozwiązać” sprawę za pierwszym razem w drugim.
 */
function caseSeen(ref = state.ref) {
  return store.get(`seen:${caseKey(ref)}`) || { revealedBy: null, triedBy: [] };
}
function markSeen(kind) {
  if (state.mode === 'live') return;
  const s = caseSeen();
  const me = progressKey();
  if (kind === 'reveal' && !s.revealedBy) s.revealedBy = me;
  if (kind === 'try' && !s.triedBy.includes(me)) s.triedBy.push(me);
  store.set(`seen:${caseKey(state.ref)}`, s);
}
/** Czy ta gra jest powtórką (rozwiązanie albo próby były już w innym trybie na tym urządzeniu). */
function isReplay() {
  if (state.mode === 'live') return false;
  const s = caseSeen();
  const me = progressKey();
  return Boolean((s.revealedBy && s.revealedBy !== me) || s.triedBy.some((k) => k !== me));
}

/** Ostatnio używane ustawienie ekipy dla tej sprawy: { size, seat }. */
function lastTeam(ref = state.ref) {
  return store.get(`lastTeam:${caseKey(ref)}`);
}

/** Zapis postępu pasuje do sprawy tylko z tym samym odciskiem (np. po ponownym wydaniu akt stary zapis znika). */
const fitsCase = (p) => (p && p.fp && state.c && p.fp === state.c.fingerprint ? p : null);

function savedProgress(mode, ref = state.ref) {
  if (mode === 'solo') return fitsCase(store.get(progressKey('solo', ref)));
  const lt = lastTeam(ref);
  return lt ? fitsCase(store.get(progressKey('team', ref, lt.size, lt.seat))) : null;
}

function freshProgress() {
  return {
    startedAt: null, endedAt: null, penalty: 0, hints: 0, attempts: [],
    status: 'playing', marks: {}, sus: {}, notes: '', teamSize: state.teamSize, seat: state.seat, unlocked: {},
    fp: state.c?.fingerprint || null, pins: [], aside: {},
  };
}

// ---------------------------------------------------------------------------
// Czynności śledcze: zapieczętowane karty i godziny śledztwa

const OVERTIME_STEP = 30; // minut nadgodzin
const OVERTIME_PENALTY = 120; // sekund kary za każde rozpoczęte pół godziny nadgodzin

function usedMin() {
  const u = progress?.unlocked || {};
  return state.c.cards.reduce((a, k) => a + (u[k.id] && k.action ? k.action.cost : 0), 0);
}

function budgetMin() {
  // Na żywo budżet jest wspólny dla całej ekipy (wszystkie biurka).
  return investigationBudget(state.c, state.mode === 'live' ? ['D', 'S', 'M', 'Z', 'R'] : myDesks());
}

/** Kara za nadgodziny. W ekipie godziny są orientacyjne (każdy ma swój budżet, a wynikiem jest czas kapitana). */
function overtimeSec(used = usedMin()) {
  if (state.mode === 'team') return 0;
  return Math.ceil(Math.max(0, used - budgetMin()) / OVERTIME_STEP) * OVERTIME_PENALTY;
}

function totalPenalty() {
  return (progress?.penalty || 0) + overtimeSec();
}

function fmtHM(min) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

const isSealedNow = (k) => Boolean(k.action) && !progress?.unlocked?.[k.id];
const isSealed = (k) => isSealedNow(k) && state.screen === 'game';

function saveProgress() {
  if (!progress) return;
  if (state.mode === 'live') {
    if (state.live?.room) store.set(`live:${state.live.room}`, { marks: progress.marks, sus: progress.sus, notes: progress.notes, pins: progress.pins || [], aside: progress.aside || {} });
    return;
  }
  store.set(progressKey(), progress);
}

function elapsedSec() {
  if (!progress?.startedAt) return 0;
  if (progress.finalSec != null) return progress.finalSec;
  const end = progress.endedAt ?? Date.now();
  return Math.max(0, Math.floor((end - progress.startedAt) / 1000)) + progress.penalty + overtimeSec();
}

function fmtClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Kara czasowa: „1 min”, „5 min”, „1 min 30 s” (żeby nie mylić z godzinami śledztwa „1:00 h”). */
function fmtPenalty(sec) {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

function showToast(text) {
  state.toast = text;
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = text;
    el.hidden = false;
  }
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => {
    state.toast = '';
    const t = document.getElementById('toast');
    if (t) t.hidden = true;
  }, 2600);
}

async function copyText(text, okMsg = 'Skopiowano') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg);
    return true;
  } catch {
    showToast('Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie.');
    return false;
  }
}

function difficultyDots(n) {
  return `<span class="dots" aria-label="trudność ${n} z 7">${Array.from({ length: 7 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

function initials(full) {
  return full.split(' ').map((w) => w[0]).join('');
}

// ---------------------------------------------------------------------------
// Statystyki (tylko sprawy dnia)

function statsKey(mode) {
  return `stats:${mode}`;
}

function getStats(mode) {
  return store.get(statsKey(mode), { played: 0, solved: 0, streak: 0, best: 0, last: null, bestTime: null });
}

/** Seria wygasa, jeśli wczoraj i dziś nie było rozwiązanej sprawy dnia. */
function shownStreak(st) {
  const today = localTodayIso();
  return st.last === today || st.last === addDays(today, -1) ? st.streak : 0;
}

/** Tabliczka na planie miasta: tu detektyw rozwiązał sprawę (tylko sprawy dnia, raz na sprawę). */
function addPlaque() {
  const c = state.c;
  const list = store.get('plaques') || [];
  if (list.some((x) => x.date === c.date)) return;
  const culprit = suspectById(c.solution.culprit);
  list.push({ date: c.date, scene: sceneIdOf(c), title: c.title, culprit: culprit.full });
  store.set('plaques', list.slice(-200));
}

function renderTown() {
  const c = state.c;
  const list = store.get('plaques') || [];
  const byCell = new Map();
  for (const x of list) {
    const cell = SCENE_CELLS[x.scene];
    if (!cell) continue;
    if (!byCell.has(cell)) byCell.set(cell, []);
    const [y, m, d] = x.date.split('-');
    byCell.get(cell).push(`${d}.${m}.${y}: ${x.title}. Zatrzymano: ${x.culprit}`);
  }
  const plaques = [...byCell].map(([cell, items]) => ({ cell, items }));
  const scene = sceneIdOf(c);
  const svg = renderTownSvg({ places: PLACES, scene, sceneLabel: c.scene.name, active: new Set(), office: OFFICE_CELL, plaques, sceneAct: 'home-case' });
  return `
  <section class="town-home" aria-label="Borowice">
    <h2 class="sec-label">Borowice · twoje miasto</h2>
    <p class="muted small">${['solved', 'failed', 'revealed'].includes(savedProgress('solo')?.status) || ['solved', 'failed', 'revealed'].includes(savedProgress('team')?.status) ? 'Dzisiejsza sprawa zamknięta:' : 'Nowe zgłoszenie:'} <b>${esc(c.title)}</b> (pole ${SCENE_CELLS[scene] || '–'}). ${list.length ? `Gwiazdki to rozwiązane już sprawy (${list.length}); najedź albo przytrzymaj, żeby zobaczyć, co się tam stało.` : 'Każda rozwiązana sprawa zostawi na planie gwiazdkę w miejscu zdarzenia.'}</p>
    <div class="town-wrap town-wrap-home" data-scroll-key="home">${svg}</div>
  </section>`;
}

function recordResult(solved) {
  // Do serii liczą się tylko sprawy dnia (dzisiejsza albo wczorajsza, jeśli gra przeszła przez północ).
  if (state.ref.type !== 'daily') return;
  if (solved) addPlaque();
  // Powtórka po podejrzeniu rozwiązania albo próbach w innym trybie nie liczy się do statystyk i serii.
  if (isReplay()) return;
  const statsMode = state.mode === 'live' ? 'team' : state.mode;
  const today = localTodayIso();
  const startedDay = progress.startedAt ? localTodayIso(new Date(progress.startedAt)) : today;
  // Liczy się dzisiejsza sprawa albo wczorajsza rozpoczęta przed północą.
  if (!(state.ref.date === today || (state.ref.date === addDays(today, -1) && startedDay === state.ref.date))) return;
  const mode = statsMode;
  const st = getStats(mode);
  if (st.lastPlayed && st.lastPlayed >= state.ref.date) return;
  st.played += 1;
  st.lastPlayed = state.ref.date;
  if (solved) {
    st.solved += 1;
    st.streak = st.last === addDays(state.ref.date, -1) ? st.streak + 1 : 1;
    st.last = state.ref.date;
    st.best = Math.max(st.best, st.streak);
    const t = progress.finalSec ?? elapsedSec();
    st.bestTime = st.bestTime == null ? t : Math.min(st.bestTime, t);
  } else {
    st.streak = 0;
  }
  store.set(statsKey(mode), st);
}

// ---------------------------------------------------------------------------
// Nawigacja

function go(screen) {
  state.screen = screen;
  state.modal = null;
  state.confirm = null;
  render();
  window.scrollTo(0, 0);
}

function clearPracticeHash() {
  if (!/^#(sprawa|dzien)-/.test(window.location.hash)) return;
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    window.location.hash = '';
  }
}

/** Otwiera sprawę dnia (domyślnie dzisiejszą). Przy pierwszym wejściu wraca od razu do rozpoczętej gry. */
function exitLiveIfAny() {
  if (!state.live) return;
  closeLive();
  if (state.mode === 'live') state.mode = 'solo';
  if (/^#pokoj-/.test(window.location.hash)) {
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      window.location.hash = '';
    }
  }
}

async function openDaily({ resume = false, date = null } = {}) {
  exitLiveIfAny();
  const today = localTodayIso();
  // Dopuszczamy jutro: zaproszenie wysłane tuż po północy przez kogoś z „szybszym” zegarem.
  const iso = date && date <= addDays(today, 1) ? date : today;
  if (!date) clearPracticeHash();
  if (!(await loadCase({ type: 'daily', date: iso }))) return;
  if (resume && tryResume()) return;
  go('home');
}

async function openPractice(code, { resume = false } = {}) {
  exitLiveIfAny();
  if (!(await loadCase({ type: 'practice', code }))) return;
  if (resume && tryResume()) return;
  go('intro');
}

function tryResume() {
  const mode = store.get(`resume:${caseKey(state.ref)}`);
  if (!mode) return false;
  const saved = savedProgress(mode);
  if (!saved || !saved.startedAt || saved.status !== 'playing') return false;
  startMode(mode);
  return true;
}

function startMode(mode) {
  exitLiveIfAny();
  state.mode = mode;
  resetCaseUi();
  if (mode === 'team') {
    const lt = lastTeam();
    if (lt) {
      state.teamSize = lt.size;
      state.seat = lt.seat;
    }
  }
  const saved = savedProgress(mode);
  if (saved) {
    progress = saved;
    if (saved.status !== 'playing') return go('result');
    if (mode === 'team' && !saved.startedAt) return go('setup');
    return go('game');
  }
  progress = freshProgress();
  if (mode === 'team') return go('setup');
  go('game');
}

/** Zmiana liczby osób albo numeru gracza: każde ustawienie ma osobny zapis. */
function changeTeam() {
  state.mode = 'team';
  resetCaseUi();
  progress = freshProgress();
  go('setup');
}

function startTeam() {
  const saved = fitsCase(store.get(progressKey('team')));
  progress = saved || freshProgress();
  store.set(`lastTeam:${caseKey(state.ref)}`, { size: state.teamSize, seat: state.seat });
  if (progress.status !== 'playing') return go('result');
  startClock();
  go('game');
}

function startClock() {
  if (!progress.startedAt) {
    progress.startedAt = Date.now();
    progress.teamSize = state.teamSize;
    progress.seat = state.seat;
    saveProgress();
  }
  store.set(`resume:${caseKey(state.ref)}`, state.mode);
}

function finish(status) {
  progress.status = status;
  progress.endedAt = Date.now();
  progress.finalSec = elapsedSec();
  state.focusResult = true;
  saveProgress();
  store.set(`resume:${caseKey(state.ref)}`, null);
  if (status === 'solved' || status === 'failed') recordResult(status === 'solved');
  go('result');
}

function goHome() {
  if (state.ref?.type === 'daily' && state.ref.date === localTodayIso()) go('home');
  else openDaily();
}

// ---------------------------------------------------------------------------
// Ekrany

function renderBrand(small = false) {
  return `<div class="brand${small ? ' brand-small' : ''}"><span class="brand-stamp">Fałszywe</span><span class="brand-word">Alibi</span></div>`;
}

function caseHeading() {
  const c = state.c;
  const label = c.kind === 'daily' ? `Sprawa nr ${c.number} · ${c.fingerprint}` : `Trening · kod ${c.code}`;
  return `
    <div class="file-tab">${esc(label)}</div>
    <h1 class="case-title">${esc(c.title)}</h1>
    <p class="case-meta">Data kradzieży: ${esc(c.crimeDate.label)}</p>
    <p class="case-meta">Trudność ${difficultyDots(c.difficulty)} ${esc(DIFFICULTY_LABELS[c.difficulty])}</p>
    ${c.innocentLie ? '<p class="case-meta lie-meta">W tej sprawie kłamią dwie osoby.</p>' : ''}
    ${isArchive() ? '<p class="case-meta"><b>Sprawa archiwalna.</b> Wynik nie liczy się do serii.</p>' : ''}`;
}

function playedLine(mode) {
  const p = savedProgress(mode);
  if (!p) return '';
  const label = mode === 'solo' ? 'Solo' : `Z ekipą (gracz ${p.seat} z ${p.teamSize})`;
  const change = mode === 'team' ? ` <button class="link-btn" data-act="change-team">Zmień ekipę lub numer</button>` : '';
  let text = '';
  if (p.status === 'solved') text = `rozwiązana w ${fmtClock(p.finalSec ?? Math.floor((p.endedAt - p.startedAt) / 1000) + p.penalty)}`;
  else if (p.status === 'failed') text = 'nierozwiązana';
  else if (p.status === 'revealed') text = 'rozwiązanie odsłonięte';
  else if (p.startedAt) text = `w toku · <button class="link-btn" data-act="mode" data-mode="${mode}">Wróć do gry</button>`;
  else return '';
  return `<li><b>${label}:</b> ${text}${change}</li>`;
}

function renderHow() {
  return `
  <section class="how-pics" aria-label="Jak grać w skrócie">
    <div class="how-pic">
      <div class="hp-art hp-faces" aria-hidden="true">${['Halina Wrona', 'Bruno Kalinowski', 'Zofia Pawlak', 'Igor Malinowski', 'Lena Dąbrowska'].map((n) => portrait(n)).join('')}</div>
      <p><b>Pięć osób znało kod.</b> Każda ma alibi.</p>
    </div>
    <div class="how-pic">
      <div class="hp-art" aria-hidden="true"><span class="hp-ticket">${icon('ticket')}<b>?</b></span></div>
      <p><b>Jeden dowód jest fałszywy.</b> Podrzucił go sprawca.</p>
    </div>
    <div class="how-pic">
      <div class="hp-art" aria-hidden="true"><span class="hp-pair">${icon('cctv')}${icon('map')}${icon('clock')}</span></div>
      <p><b>Znajdź kartę, która go obala,</b> i złóż raport.</p>
    </div>
  </section>
  <details class="how">
    <summary>Jak grać: szczegóły</summary>
    <ol class="how-list">
      <li>Pięcioro podejrzanych ma alibi. Jedno z nich jest fałszywe: sprawca dostarczył <b>dokładnie jeden sfałszowany dowód</b>.</li>
      <li>Dowody leżą na pięciu biurkach: Dokumenty, Świadkowie, Mapa i rozkłady, Zdjęcia, Rejestry. Żadne biurko samo nie wystarczy: do obalenia fałszywki zawsze potrzebna jest karta z innego biurka (rozkład, rejestr, nagranie albo zeznanie).</li>
      <li>Część kart urzędowych (rozkłady, rejestry, nagrania z kamer, pogoda) jest <b>zapieczętowana</b>. Widzisz tylko tytuł i czynność, np. „Pobierz rozkład jazdy” (30 min). Masz budżet godzin śledztwa, a nadgodziny dodają czas. Zlecaj tylko to, co może coś wyjaśnić.</li>
      <li>Od środy fałszywka zgadza się z rozkładami i rejestrami. Zdradza ją dopiero to, że ktoś był wtedy gdzie indziej i nie zdążyłby dotrzeć. W weekend dowody mogą dotyczyć dwóch osób naraz.</li>
      <li>Od piątku kłamią <b>dwie osoby</b>: sprawca i ktoś niewinny, kto ukrywał coś innego. Pierwsza znaleziona sprzeczność może być tym drugim kłamstwem. Kłamca zawsze ma inne, potwierdzone alibi, a sprawca poza fałszywką nie ma żadnego.</li>
      <li>Liczcie czasy. Jeśli kogoś widziano o 19:40 w teatrze, a z teatru na miejsce zbrodni najszybciej dociera się w 25 minut, to nie mógł być w środku o 19:52.</li>
      <li>Na koniec składasz <b>raport z dochodzenia</b>: sfałszowany dowód, karta, która go obala, i co ta karta pokazuje. Kto dostarczył fałszywkę, ten jest sprawcą. Masz ${CONFIG.maxAttempts} próby, każda pomyłka to +${fmtPenalty(CONFIG.wrongPenalty)}, a podpowiedź +${fmtPenalty(CONFIG.hintPenalty)}. Za trafny powód, potwierdzone alibi pozostałych i trafienie za pierwszym razem raport dostaje gwiazdki.</li>
      <li><b>Z ekipą:</b> każdy otwiera grę na swoim telefonie i wybiera inny numer gracza. Każdy widzi tylko swoje biurka, więc musicie rozmawiać (na Discordzie, przez telefon albo przy stole). Oskarżenie składa kapitan, czyli gracz 1.</li>
    </ol>
  </details>`;
}

function renderStats() {
  const s = getStats('solo');
  const t = getStats('team');
  const cell = (label, st) => `
    <div class="stat-group">
      <h3>${label}</h3>
      <dl>
        <div><dt>Seria</dt><dd>${shownStreak(st)}</dd></div>
        <div><dt>Najdłuższa</dt><dd>${st.best}</dd></div>
        <div><dt>Rozwiązane</dt><dd>${st.solved}/${st.played}</dd></div>
        <div><dt>Najlepszy czas</dt><dd>${st.bestTime == null ? '–' : fmtClock(st.bestTime)}</dd></div>
      </dl>
    </div>`;
  return `<section class="stats" aria-label="Twoje statystyki">${cell('Solo', s)}${cell('Z ekipą', t)}</section>`;
}

function renderHome() {
  const lines = [playedLine('solo'), playedLine('team')].join('');
  return `
  <div class="page">
    <header class="masthead">
      ${renderBrand()}
      <p class="tagline">Codzienna sprawa detektywistyczna. Rozwiązujcie ją razem albo solo.</p>
    </header>
    <section class="case-file">
      ${caseHeading()}
      <div class="actions">
        ${state.liveAvailable ? '<button class="btn btn-primary" data-act="live-create">Graj z ekipą na żywo <small>wspólny pokój</small></button>' : ''}
        <button class="btn${state.liveAvailable ? '' : ' btn-primary'}" data-act="mode" data-mode="team">${state.liveAvailable ? 'Z ekipą bez serwera' : 'Graj z ekipą'} <small>2–5 osób</small></button>
        <button class="btn" data-act="mode" data-mode="solo">Graj solo</button>
      </div>
      ${lines ? `<ul class="played">${lines}</ul>` : ''}
    </section>
    ${renderTown()}
    ${renderHow()}
    <section class="practice">
      <h2>Trening</h2>
      <p>Sprawa dnia jest jedna na dobę. Sprawy treningowe nie liczą się do serii. Ten sam kod daje tę samą sprawę, więc możecie zagrać w nią całą ekipą.</p>
      <div class="practice-row">
        <button class="btn" data-act="practice-new">Nowa sprawa treningowa</button>
        <form class="code-form" data-act="practice-code" novalidate>
          <label for="code-input">Kod od znajomych</label>
          <div class="code-row">
            <input id="code-input" name="code" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="np. K7Q2">
            <button class="btn" type="submit">Wczytaj</button>
          </div>
        </form>
      </div>
    </section>
    ${renderStats()}
  </div>`;
}

function renderIntro() {
  return `
  <div class="page">
    <header class="masthead masthead-row">
      <button class="btn btn-ghost" data-act="home">← Sprawa dnia</button>
      ${renderBrand(true)}
    </header>
    <section class="case-file">
      ${caseHeading()}
      <div class="actions">
        ${state.liveAvailable ? '<button class="btn btn-primary" data-act="live-create">Graj z ekipą na żywo <small>wspólny pokój</small></button>' : ''}
        <button class="btn${state.liveAvailable ? '' : ' btn-primary'}" data-act="mode" data-mode="team">${state.liveAvailable ? 'Z ekipą bez serwera' : 'Graj z ekipą'} <small>2–5 osób</small></button>
        <button class="btn" data-act="mode" data-mode="solo">Graj solo</button>
      </div>
      ${[playedLine('solo'), playedLine('team')].join('') ? `<ul class="played">${playedLine('solo')}${playedLine('team')}</ul>` : ''}
      <p class="muted">Podaj znajomym kod <b class="code">${esc(state.c.code)}</b>, żeby dostali tę samą sprawę.</p>
    </section>
  </div>`;
}

function inviteText() {
  const c = state.c;
  const what = c.kind === 'daily' ? `sprawę dnia nr ${c.number} (odcisk ${c.fingerprint})` : `sprawę treningową z kodem ${c.code}`;
  const seats = Array.from({ length: state.teamSize }, (_, i) => i + 1).filter((n) => n !== state.seat).join(', ');
  const url = CONFIG.shareUrl ? ` ${CONFIG.shareUrl}${c.kind === 'practice' ? `#sprawa-${c.code}` : `#dzien-${c.date}`}` : '';
  if (state.teamSize === 2) {
    return `Gramy w Fałszywe Alibi: ${what}, we dwoje.${url} Wejdź w „Graj z ekipą”, ustaw liczbę osób na 2 i weź numer ${seats}. Ja mam numer ${state.seat}. Startujemy razem, jak oboje będziemy na rozmowie.`;
  }
  return `Gramy w Fałszywe Alibi: ${what}, ekipa ${state.teamSize}-osobowa.${url} Wejdźcie w „Graj z ekipą”, ustawcie liczbę osób na ${state.teamSize} i weźcie numery: ${seats}. Ja mam numer ${state.seat}. Startujemy razem, jak wszyscy będą na rozmowie.`;
}

function renderSetup() {
  const sizes = [2, 3, 4, 5];
  const seats = Array.from({ length: state.teamSize }, (_, i) => i + 1);
  return `
  <div class="page">
    <header class="masthead masthead-row">
      <button class="btn btn-ghost" data-act="back-intro">← Wróć</button>
      ${renderBrand(true)}
    </header>
    <section class="setup">
      <h1 class="setup-title">Ustawienie ekipy</h1>
      <p class="muted">Każdy otwiera tę stronę na swoim urządzeniu, wybiera tę samą liczbę osób i inny numer gracza.</p>
      <p class="fingerprint">Sprawdźcie, czy wszyscy macie te same akta. Odcisk sprawy: <b class="code">${esc(state.c.fingerprint)}</b> (${esc(state.c.kind === 'daily' ? `sprawa nr ${state.c.number}` : `kod ${state.c.code}`)}). Jeśli ktoś ma inny, niech odświeży stronę.</p>
      <fieldset class="seg">
        <legend>Ile osób w ekipie?</legend>
        <div class="seg-row">
          ${sizes.map((n) => `<button class="seg-btn${n === state.teamSize ? ' on' : ''}" data-act="size" data-n="${n}" aria-pressed="${n === state.teamSize}">${n}</button>`).join('')}
        </div>
      </fieldset>
      <fieldset class="seg">
        <legend>Twój numer gracza</legend>
        <div class="seat-grid">
          ${seats.map((n) => `
            <button class="seat${n === state.seat ? ' on' : ''}" data-act="seat" data-n="${n}" aria-pressed="${n === state.seat}">
              <span class="seat-no">Gracz ${n}${n === 1 ? ' · kapitan' : ''}</span>
              <span class="seat-desks">${TEAM_DESKS[state.teamSize][n - 1].map(deskName).join(', ')}</span>
            </button>`).join('')}
        </div>
      </fieldset>
      <div class="invite">
        <label for="invite-text">Wiadomość dla ekipy</label>
        <textarea id="invite-text" readonly rows="4">${esc(inviteText())}</textarea>
        <button class="btn" data-act="copy-invite">Kopiuj wiadomość</button>
      </div>
      <ul class="setup-notes">
        <li>Widzisz tylko swoje biurka. Czytajcie sobie karty na głos albo wklejajcie je na czat przyciskiem „Kopiuj”.</li>
        <li>Każdy ma własny zegar. Kliknijcie „Zaczynamy” w tym samym momencie.</li>
        <li>Oskarżenie składa gracz 1. Musi wskazać fałszywkę i kartę, która ją obala, więc podawajcie sobie kody kart (np. „M4”).</li>
        <li>Czas kapitana jest wynikiem ekipy.</li>
      </ul>
      <button class="btn btn-primary btn-wide" data-act="team-start">Zaczynamy</button>
    </section>
  </div>`;
}

function renderSuspects() {
  const mine = myDesks();
  return state.c.suspects.map((s) => {
    const mark = progress.sus[s.id] || '';
    const chipFor = (id) => {
      const k = cardById(id);
      const own = mine.includes(k.desk);
      return `<button class="chip${own ? '' : ' chip-away'}" data-act="goto-card" data-id="${id}" title="${esc(k.title)}">${id}</button>`;
    };
    const inText = new Set();
    const alibiHtml = esc(s.alibi).replace(/\b([DSMZR]\d+)\)/g, (m0, id) => {
      inText.add(id);
      return `${chipFor(id)})`;
    });
    const chips = s.items.filter((id) => !inText.has(id)).map(chipFor).join(' ');
    return `
    <li class="suspect mark-${mark || 'none'}">
      <span class="avatar avatar-pic" aria-hidden="true">${portrait(s.full) || esc(initials(s.full))}</span>
      <div class="suspect-body">
        <div class="suspect-head">
          <b>${esc(s.full)}</b> <span class="role">${esc(s.role)}</span>
        </div>
        <p class="alibi">${alibiHtml} ${chips}</p>
      </div>
      <div class="mark-toggle" role="group" aria-label="Twoja ocena: ${esc(s.full)}">
        <button class="mk${mark === 'ok' ? ' on' : ''}" data-act="mark-sus" data-id="${s.id}" data-v="ok" aria-pressed="${mark === 'ok'}">alibi potwierdzone</button>
        <button class="mk mk-x${mark === 'x' ? ' on' : ''}" data-act="mark-sus" data-id="${s.id}" data-v="x" aria-pressed="${mark === 'x'}">${s.f ? 'podejrzana' : 'podejrzany'}</button>
      </div>
    </li>`;
  }).join('');
}

function renderAkta() {
  const c = state.c;
  const team = isTeamLike();
  return `
  <section class="akta" aria-label="Akta sprawy">
    <div class="akta-head">
      <h2 class="akta-title">${esc(c.title)}</h2>
      <div class="facts-row">
        <span class="fchip">${icon('clock')}${esc(c.crimeDate.label.replace(/ \d{4}$/, ''))}</span>
        <span class="fchip">${icon('map-pin')}${esc(c.scene.name)}${sceneIdOf(c) && SCENE_CELLS[sceneIdOf(c)] && hasTownMap(c) ? ` · ${SCENE_CELLS[sceneIdOf(c)]}` : ''}</span>
        <span class="fchip">${icon('lock')}kod znało 5 osób</span>
        ${c.stolen?.nom ? `<span class="fchip">${icon('search')}${esc(c.stolen.nom)}</span>` : ''}
      </div>
      <div class="window" aria-label="Drzwi były otwarte od ${fmt(c.window.from)} do ${fmt(c.window.to)}">
        <div><span class="w-label">otwarcie</span><span class="w-time">${fmt(c.window.from)}</span></div>
        <div class="w-line" aria-hidden="true"></div>
        <div><span class="w-label">zamknięcie</span><span class="w-time">${fmt(c.window.to)}</span></div>
      </div>
      <p class="w-note">${(c.intro.match(/o (\d{1,2}:\d{2}) i zamkn/) || [])[1] ? `${(c.intro.match(/o (\d{1,2}:\d{2}) i zamkn/))[1]} właściciel zamknął · ` : ''}sprawca w środku przez całe ${c.window.to - c.window.from} min</p>
      <details class="intro-more"><summary>Czytaj meldunek</summary><p class="intro">${esc(c.intro)}</p></details>
      ${(() => { const used = usedMin(); const bud = budgetMin(); const pct = Math.min(100, Math.round((used / Math.max(1, bud)) * 100)); return `<div class="budget${used > bud ? ' over' : used >= bud * 0.8 ? ' warn' : ''}" title="${state.mode === 'team' ? 'W ekipie każdy ma własny budżet, a nadgodziny są tylko informacją.' : `Każde rozpoczęte pół godziny ponad budżet to +${fmtPenalty(OVERTIME_PENALTY)} do czasu.`}"><span class="budget-label">${icon('clock')} Śledztwo <b>${fmtHM(used)} / ${fmtHM(bud)} h</b></span><span class="budget-bar"><span style="width:${pct}%"></span></span><span class="budget-note">${state.mode === 'team' ? 'koperty kosztują czas' : `ponad budżet: +${fmtPenalty(OVERTIME_PENALTY)} za każde 30 min`}</span></div>`; })()}
      ${c.innocentLie ? '<details class="lie-stamp"><summary>Kłamią 2 osoby</summary><p>Jeden fałszywy dowód podrzucił sprawca. Drugi to kłamstwo niewinnej osoby, która ukrywała coś niezwiązanego z kradzieżą. Kłamca ma poza nim inne, potwierdzone alibi.</p></details>' : ''}
    </div>
    <h3 class="sec-label">Podejrzani i ich alibi</h3>
    <ul class="suspects">${renderSuspects()}</ul>
    ${team ? `<p class="muted small">Szare kody to karty z biurek innych graczy. Kliknij kod, żeby sprawdzić, kto ma tę kartę.</p>` : ''}
    <section class="rules-short" aria-label="Zasady w skrócie">
      <h3 class="sec-label">Zasady w skrócie</h3>
      <ul>${rulesShortFor(c).map(([ic, r]) => `<li><span class="rs-ico">${icon(ic)}</span><span>${esc(r)}</span></li>`).join('')}</ul>
      <details class="rules">
        <summary>Pełne zasady</summary>
        <ol>${rulesFor(c).map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      </details>
    </section>
  </section>`;
}

function renderCard(k, opts = {}) {
  const by = k.by ? suspectById(k.by) : null;
  const marked = progress?.marks?.[k.id];
  if (!opts.noActions && progress?.aside?.[k.id]) {
    return `
  <article class="card card-aside" id="card-${k.id}" data-card="${k.id}">
    <button class="aside-row" data-act="aside-card" data-id="${k.id}" aria-label="Pokaż odłożoną kartę ${k.id}">
      <span class="card-id">${k.id}</span><span class="card-ico">${icon(cardIcon(k))}</span><span class="aside-title">${esc(k.title)}</span><span class="aside-tag">odłożona · pokaż</span>
    </button>
  </article>`;
  }
  const sealed = !opts.noActions && isSealed(k);
  if (sealed) {
    const after = usedMin() + k.action.cost;
    const extra = overtimeSec(after) - overtimeSec();
    const overBudget = after > budgetMin();
    const confirming = state.confirm === `unlock:${k.id}`;
    // Koperta jako mały kafelek: tytuł, co trzeba zlecić i koszt. Kafelki stoją w siatce pod jawnymi kartami.
    const label = /^(Przejrzyj dokument|Zażądaj kopii dokumentu) „/.test(k.action.label) ? '' : k.action.label;
    return `
  <article class="card card-sealed env-tile${confirming ? ' confirming' : ''}" id="card-${k.id}" data-card="${k.id}">
    <header class="env-head">
      <span class="card-id">${k.id}</span>
      <span class="env-cost" aria-label="koszt ${k.action.cost} min">−${fmtHM(k.action.cost)}</span>
    </header>
    <h4 class="env-title"><span class="card-ico">${icon(cardIcon(k))}</span>${esc(k.title)}</h4>
    ${k.sub ? `<p class="card-sub">${esc(k.sub)}</p>` : ''}
    ${label ? `<p class="seal-action" title="${esc(label)}">${esc(label)}</p>` : ''}
    <button class="btn btn-small env-open${confirming ? ' btn-primary' : ''}" data-act="unlock" data-id="${k.id}">${confirming ? `Nadgodziny +${fmtPenalty(extra)}. Zlecić?` : `${icon('lock')} Otwórz${overBudget ? ' (ponad budżet)' : ''}`}</button>
  </article>`;
  }
  const look = cardLook(k);
  const visual = cardVisual(k, { suspectById });
  return `
  <article class="card card-${k.kind}${look ? ` look-${look}` : ''}${marked ? ' card-marked' : ''}${opts.highlight ? ' card-hl' : ''}" id="card-${k.id}" data-card="${k.id}">
    <header class="card-head">
      <span class="card-id">${k.id}</span>
      <div class="card-titles">
        <h4>${look === 'witness' ? `${visual}<span class="sr-only">Zeznanie: </span>${esc(k.title.replace(/^Zeznanie:\s*/, ''))}` : `<span class="card-ico">${icon(cardIcon(k))}</span>${esc(k.title)}`}</h4>
        ${k.sub ? `<p class="card-sub">${esc(k.sub)}</p>` : ''}
      </div>
      ${marked ? '<span class="card-star" aria-label="zaznaczona">★</span>' : ''}
    </header>
    ${by ? `<p class="stamp" title="${by.f ? 'Dostarczyła' : 'Dostarczył'}: ${esc(by.full)}">${portrait(by.full, 'portrait portrait-stamp')}<span class="sr-only">${by.f ? 'Dostarczyła' : 'Dostarczył'}: </span>${esc(by.full)}</p>` : ''}
    ${look === 'witness' ? `<div class="card-lines wit-bubble">${k.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : visual}
    ${look === 'witness' ? '' : (() => {
      const linesHtml = `<div class="card-lines">${k.lines.map((l) => `<p>${esc(l).replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2')}</p>`).join('')}</div>`;
      // Bilet: same linie karty na kartoniku z perforacją (bez powtarzania danych w osobnym obrazku).
      return look === 'ticket' ? `<div class="tk-wrap"><span class="tk-ico">${(k.facts || []).some((f) => f.kind === 'parking') ? '<b>P</b>' : icon(cardIcon(k))}</span>${linesHtml}</div>` : linesHtml;
    })()}
    ${k.map && !opts.noActions && hasMapTab() ? `<p><button class="btn btn-small" data-act="board-view" data-id="plan">${icon('map')} Otwórz plan miasta</button></p>` : ''}
    ${opts.noActions ? '' : `
    <footer class="card-foot">
      <button class="link-btn" data-act="mark-card" data-id="${k.id}" aria-pressed="${Boolean(marked)}">${marked ? '★ Ważna' : '☆ Ważna'}</button>
      ${isPinnable(k) && k.kind !== 'supplied' && state.c.difficulty > 2 ? `<button class="link-btn${(progress.pins || []).includes(k.id) ? ' on-board' : ''}" data-act="pin-card" data-id="${k.id}" aria-pressed="${(progress.pins || []).includes(k.id)}">${(progress.pins || []).includes(k.id) ? 'Na tablicy ✓' : 'Na tablicę'}</button>` : ''}
      <button class="link-btn${(state.compare || []).includes(k.id) ? ' on-board' : ''}" data-act="compare-card" data-id="${k.id}" aria-pressed="${(state.compare || []).includes(k.id)}">${(state.compare || []).includes(k.id) ? 'Porównuję ✓' : 'Porównaj'}</button>
      <button class="link-btn" data-act="aside-card" data-id="${k.id}">Odłóż</button>
      ${state.mode === 'solo' ? '' : `<button class="link-btn" data-act="copy-card" data-id="${k.id}">Kopiuj</button>`}
      ${state.mode === 'live' ? (onTable(k.id) ? `<span class="link-btn on-table">Na stole ✓</span>` : `<button class="link-btn" data-act="table" data-id="${k.id}">Połóż na stół</button>`) : ''}
    </footer>`}
  </article>`;
}

function cardPlainText(k) {
  const by = k.by ? suspectById(k.by) : null;
  return [`[${k.id}] ${k.title}${k.sub ? ` (${k.sub})` : ''}${by ? ` · ${by.f ? 'dostarczyła' : 'dostarczył'}: ${by.full}` : ''}`, ...k.lines].join('\n');
}

function renderDesk(desk) {
  const cards = state.c.cards.filter((k) => k.desk === desk);
  const def = DESK_DEFS.find((d) => d.id === desk);
  return `
  <section class="desk" aria-label="Biurko ${esc(def.name)}">
    <header class="desk-head">
      <h2>${esc(def.name)}</h2>
      <p class="muted small">${cards.length} ${cards.length >= 2 && cards.length <= 4 ? 'karty' : 'kart'} · ${esc(def.hint)}</p>
    </header>
    <div class="cards">${cards.map((k) => renderCard(k)).join('')}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Plan miasta

const mapCardOf = (c = state.c) => c.cards.find((k) => k.map);
function hasMapTab() {
  const mc = state.c && hasTownMap(state.c) ? mapCardOf() : null;
  return Boolean(mc && myDesks().includes(mc.desk));
}
const mapPlaceName = (key) => (key === 'scene' ? state.c.scene.name : PLACES[key]?.name || key);
const mapCell = (key) => (key === 'scene' ? SCENE_CELLS[sceneIdOf(state.c)] : PLACE_CELLS[key]);
function sceneIdOf(c) {
  const g = mapCardOf(c)?.facts.find((f) => f.t === 'grid');
  return Object.keys(SCENE_CELLS).find((id) => SCENE_CELLS[id] === g?.scene) || SCENES.find((x) => x.name === c.scene?.name)?.id;
}

/** Karty (z biurek gracza), które dotyczą danego miejsca. Zapieczętowane rozpoznajemy tylko po etykiecie czynności. */
function cardsAtPlace(key) {
  const name = PLACES[key]?.name;
  return state.c.cards.filter((k) => myDesks().includes(k.desk) && !k.map).filter((k) => {
    if (isSealed(k)) return Boolean(name && k.action.label.includes(name));
    return (k.facts || []).some((f) => f.place === key || f.stop === key || (f.stops || []).some((st) => st.place === key)
      || (f.t === 'claim' && ((f.kind === 'train' && key === 'dworzec') || (f.kind === 'cinema' && key === 'kino'))));
  });
}

function renderPlan() {
  const c = state.c;
  const mc = mapCardOf();
  const active = new Set(mc.facts.filter((f) => f.t === 'pos').map((f) => f.place));
  const sel = state.mapSel || [];
  const svg = renderTownSvg({ places: PLACES, scene: sceneIdOf(c), sceneLabel: c.scene.name, active, selected: sel });
  const chip = (id) => `<button class="chip chip-btn" data-act="goto-card" data-id="${id}">${id}</button>`;
  let info = '<p class="muted small">Dotknij miejsca, żeby zobaczyć jego pole i karty, które go dotyczą. Dotknij drugiego, a plan pokaże trasę po ulicach.</p>';
  if (sel.length === 1) {
    const key = sel[0];
    const n = key === 'scene' ? 0 : cellsApart(mapCell('scene'), mapCell(key));
    const cards = key === 'scene' ? [] : cardsAtPlace(key);
    info = `<p class="plan-place"><b>${esc(mapPlaceName(key))}</b> · pole ${mapCell(key)}</p>
      ${key === 'scene' ? '<p class="small">Tu doszło do kradzieży.</p>' : `<p class="small">Do miejsca kradzieży: ${blocksText(n)}, czyli ${n * MIN_PER_CELL} min.</p>`}
      ${cards.length ? `<p class="small">Karty o tym miejscu: ${cards.map((k) => chip(k.id)).join(' ')}</p>` : key === 'scene' ? '' : '<p class="small muted">Na twoich biurkach nie ma kart o tym miejscu.</p>'}`;
  } else if (sel.length === 2) {
    const n = cellsApart(mapCell(sel[0]), mapCell(sel[1]));
    info = `<p class="plan-place"><b>${esc(mapPlaceName(sel[0]))}</b> (${mapCell(sel[0])}) → <b>${esc(mapPlaceName(sel[1]))}</b> (${mapCell(sel[1])})</p>
      <p class="small">Najkrótsza trasa: ${blocksText(n)}, czyli <b>${n * MIN_PER_CELL} min</b> (w każdą stronę tyle samo).</p>`;
  }
  return `
  <section class="plan" aria-label="Plan miasta">
    <header class="desk-head">
      <h2>Plan Borowic</h2>
      <p class="muted small">1 przecznica = ${MIN_PER_CELL} min · pinezki: miejsca z akt (karta ${mc.id}) · lupa: miejsce kradzieży</p>
    </header>
    <div class="plan-info">${info}${sel.length ? '<p><button class="link-btn" data-act="map-clear">Wyczyść wybór</button></p>' : ''}</div>
    <div class="town-wrap" data-scroll-key="plan">${svg}</div>
  </section>`;
}

function renderBoardTab() {
  const view = state.boardView === 'plan' && hasMapTab() ? 'plan' : state.boardView === 'notes' ? 'notes' : 'time';
  const seg = `<div class="seg seg-tabs" role="tablist" aria-label="Widok tablicy">
    <button class="seg-btn${view === 'time' ? ' on' : ''}" data-act="board-view" data-id="time" role="tab" aria-selected="${view === 'time'}">${icon('clock')} Oś czasu</button>
    ${hasMapTab() ? `<button class="seg-btn${view === 'plan' ? ' on' : ''}" data-act="board-view" data-id="plan" role="tab" aria-selected="${view === 'plan'}">${icon('map')} Plan miasta</button>` : ''}
    <button class="seg-btn${view === 'notes' ? ' on' : ''}" data-act="board-view" data-id="notes" role="tab" aria-selected="${view === 'notes'}">${icon('file-text')} Notatki</button>
  </div>`;
  if (view === 'plan') return seg + renderPlan();
  if (view === 'notes') return seg + renderNotes();
  return seg + renderBoardTimeline();
}

function renderBoardTimeline() {
  const c = state.c;
  const canSee = (k) => myDesks().includes(k.desk) && !isSealed(k);
  const noMapText = !hasTownMap(c) ? 'czasy dotarcia są na biurku „Mapa i rozkłady”' : 'zapytaj osobę z planem miasta';
  return renderBoard({ c, pins: progress.pins || [], sel: state.boardSel || [], canSee, hasMap: hasMapTab(), sceneCell: SCENE_CELLS[sceneIdOf(c)], autoAll: c.difficulty <= 2, noMapText });
}

function renderNotes() {
  return `
  <section class="notes-panel" aria-label="Notatki">
    <h2>Notatki</h2>
    <p class="muted small">Zapisują się tylko na tym urządzeniu.</p>
    <label class="sr-only" for="notes">Notatki</label>
    <textarea id="notes" data-act="notes" rows="12" placeholder="np. Halina: teatr 19:40 + 25 min → czysta">${esc(progress.notes)}</textarea>
    <h3 class="sec-label">Zaznaczone karty</h3>
    <div class="cards">${state.c.cards.filter((k) => progress.marks[k.id] && myDesks().includes(k.desk)).map((k) => renderCard(k)).join('') || '<p class="muted small">Nic jeszcze nie zaznaczono. Użyj „☆ Ważna” na karcie.</p>'}</div>
  </section>`;
}

function renderTopbar() {
  const c = state.c;
  const label = c.kind === 'daily' ? `Sprawa nr ${c.number}<span class="tb-fp"> · ${esc(c.fingerprint)}</span>` : `Trening ${esc(c.code)}`;
  const who = state.mode === 'solo' ? 'solo' : state.mode === 'live'
    ? `na żywo · gracz ${state.seat} z ${state.teamSize} · ${state.live?.rs?.players.filter((p) => p.online).length ?? 0} online${state.live?.status === 'open' ? '' : state.live?.status === 'stopped' ? ' · rozłączono' : ' · łączenie…'}`
    : `gracz ${state.seat} z ${state.teamSize}`;
  const left = CONFIG.maxAttempts - progress.attempts.length;
  return `
  <div class="topbar">
    <div class="topbar-inner">
      <button class="btn btn-ghost btn-icon" data-act="leave" aria-label="Wyjdź do strony głównej">←</button>
      <div class="tb-title"><b>${label}</b><span><span class="tb-mode">${esc(who)} · </span>${state.mode === 'live' && state.live?.status !== 'open' ? `<span class="tb-live">${state.live?.status === 'stopped' ? 'rozłączono' : 'łączenie…'} · </span>` : ''}<span class="tb-budget">śledztwo <span class="nw${usedMin() > budgetMin() ? ' over' : ''}">${fmtHM(usedMin())}/${fmtHM(budgetMin())} h</span></span></span></div>
      <div class="tb-clock" aria-live="off"><span id="clock">${fmtClock(elapsedSec())}</span>${totalPenalty() ? `<small>w tym +${fmtPenalty(totalPenalty())}</small>` : ''}</div>
      <div class="tb-actions">
        ${state.mode === 'team' && !isCaptain() ? '' : `<button class="btn btn-small" data-act="open-hints" aria-label="Podpowiedź, użyto ${progress.hints} z 3"><span class="tb-long">Podpowiedź</span><span class="tb-short" aria-hidden="true">?</span> <span class="pill">${progress.hints}/3</span></button>`}
        ${isCaptain()
          ? `<button class="btn btn-small btn-primary" data-act="open-accuse">Raport <span class="pill">${left}</span></button>`
          : `<button class="btn btn-small" data-act="open-end">Koniec</button>`}
      </div>
    </div>
  </div>`;
}

function renderTabs() {
  // Trzy miejsca zamiast dziewięciu: sprawa, wszystkie dowody (z filtrami biurek) i tablica (oś czasu, plan, notatki).
  const ownCards = state.c.cards.filter((k) => myDesks().includes(k.desk)).length;
  const tabs = [{ id: 'akta', label: 'Sprawa' }, { id: 'evidence', label: `Dowody ${ownCards}` }, { id: 'board', label: 'Tablica' }, ...(state.mode === 'live' ? [{ id: 'table', label: `Stół ${state.live?.rs?.table.length ?? 0}` }] : [])];
  return `
  <nav class="tabs" aria-label="Biurka">
    <div class="tabs-inner">
      ${tabs.map((t) => `<button class="tab${state.tab === t.id ? ' on' : ''}${t.id === 'akta' ? ' tab-akta' : ''}" data-act="tab" data-tab="${t.id}" aria-current="${state.tab === t.id ? 'page' : 'false'}">${esc(t.label)}</button>`).join('')}
    </div>
  </nav>`;
}

function renderGate() {
  return `
  <div class="page">
    <section class="gate">
      ${caseHeading()}
      <p>Zegar ruszy, kiedy otworzysz akta. Masz ${CONFIG.maxAttempts} próby na wskazanie sfałszowanego dowodu i karty, która go obala.</p>
      <div class="actions">
        <button class="btn btn-primary" data-act="solo-start">Otwórz akta</button>
        <button class="btn btn-ghost" data-act="leave">Wróć</button>
      </div>
    </section>
  </div>`;
}

function renderGame() {
  if (!progress.startedAt) return renderGate();
  const mine = myDesks();
  // Stare nazwy zakładek (biurka, plan, notatki) prowadzą do nowych miejsc.
  if (mine.includes(state.tab)) { state.deskFilter = state.tab; state.tab = 'evidence'; }
  if (state.tab === 'plan') { state.boardView = 'plan'; state.tab = 'board'; }
  if (state.tab === 'notes') { state.boardView = 'notes'; state.tab = 'board'; }
  if (!['akta', 'evidence', 'board', 'table'].includes(state.tab) || (state.tab === 'table' && state.mode !== 'live')) state.tab = 'akta';
  const right = state.tab === 'akta' ? 'evidence' : state.tab;
  const rightHtml = right === 'table' ? renderTable() : right === 'board' ? renderBoardTab() : renderEvidence();
  return `
  <div class="sticky-head">${renderTopbar()}${renderTabs()}</div>
  <div class="game view-${state.tab === 'akta' ? 'akta' : 'other'}${state.tab === 'plan' || state.tab === 'board' ? ' view-plan' : ''}">
    <div class="col-left">${renderAkta()}</div>
    <div class="col-right">${rightHtml}</div>
  </div>
  ${renderCompareTray()}
  ${renderModal()}`;
}

/** Wszystkie dowody gracza w jednym miejscu, z filtrami biurek. */
function renderEvidence() {
  const mine = myDesks();
  const f = state.deskFilter && (mine.includes(state.deskFilter) || state.deskFilter === 'marked') ? state.deskFilter : 'all';
  const own = state.c.cards.filter((k) => mine.includes(k.desk));
  const marked = own.filter((k) => progress.marks?.[k.id]);
  const chip = (id, label, n) => `<button class="fchip-btn${f === id ? ' on' : ''}" data-act="desk-filter" data-id="${id}" aria-pressed="${f === id}">${label}${n !== undefined ? ` <span class="tab-n">${n}</span>` : ''}</button>`;
  const deskBlock = (d) => {
    // Najpierw jawne karty, pod nimi koperty jako małe kafelki (mniej przewijania przez zamknięte dokumenty).
    const cards = own.filter((k) => k.desk === d);
    const open = cards.filter((k) => !isSealed(k));
    const sealed = cards.filter((k) => isSealed(k));
    return `<h3 class="sec-label desk-label">${icon(cardIcon(cards[0] || {}))} ${esc(deskName(d))} <span class="muted small">${cards.length}</span></h3>
      ${open.length ? `<div class="cards">${open.map((k) => renderCard(k)).join('')}</div>` : ''}
      ${sealed.length ? `<p class="env-label">${icon('lock')} Koperty do zlecenia · ${sealed.length}</p><div class="env-grid">${sealed.map((k) => renderCard(k)).join('')}</div>` : ''}`;
  };
  const body = f === 'all' ? mine.map(deskBlock).join('') : f === 'marked'
    ? `<div class="cards">${marked.map((k) => renderCard(k)).join('') || '<p class="muted">Nic jeszcze nie oznaczono. Użyj „☆ Ważna” na karcie.</p>'}</div>`
    : deskBlock(f);
  return `
  <section class="evidence" aria-label="Dowody">
    <div class="filter-row" role="group" aria-label="Pokaż">
      ${chip('all', 'Wszystkie', own.length)}
      ${mine.map((d) => chip(d, esc(deskName(d)), own.filter((k) => k.desk === d).length)).join('')}
      ${chip('marked', '★ Ważne', marked.length)}
    </div>
    ${body}
  </section>`;
}

/** Pasek porównania (karty wybrane przyciskiem „Porównaj”). */
function renderCompareTray() {
  const list = (state.compare || []).filter((id) => cardById(id));
  if (!list.length || state.modal || state.tab === 'board') return '';
  return `<div class="cmp-tray" role="region" aria-label="Porównanie">
    <span class="cmp-chips">${list.map((id) => `<span class="chip">${id}</span>`).join(' ')}</span>
    <button class="btn btn-small btn-primary" data-act="open-compare"${list.length < 2 ? ' disabled' : ''}>${list.length < 2 ? 'Wybierz drugą kartę' : `Porównaj (${list.length})`}</button>
    <button class="btn btn-small btn-ghost" data-act="compare-clear" aria-label="Wyczyść porównanie">✕</button>
  </div>`;
}

/** Okno porównania: karty obok siebie, zestawienie godzin i dróg, mini-plan z trasą. */
function renderCompareBody() {
  const list = (state.compare || []).map(cardById).filter(Boolean);
  const canSee = (k) => myDesks().includes(k.desk) && !isSealed(k);
  // Fakty z kart bez powtórzeń (wspólny dowód daje ten sam pobyt dwóm osobom).
  const facts = list.map((k) => {
    if (!canSee(k)) return [];
    const seen = new Set();
    return factsOfCard(k, { cards: state.c.cards, canSee, c: state.c }).filter((x) => {
      const key = `${x.place}|${x.from}|${x.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const map = hasMapTab();
  const cellOf = (pl) => PLACE_CELLS[pl];
  const sceneC = SCENE_CELLS[sceneIdOf(state.c)];
  const nm = (pl) => PLACES[pl]?.name || pl;
  const when = (x) => (x.to === null || x.to === x.from ? fmt(x.from) : `${fmt(x.from)}–${fmt(x.to)}`);
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      for (const a of facts[i]) {
        for (const b of facts[j]) {
          const [x, y] = a.from <= b.from ? [a, b] : [b, a];
          const gap = y.from - (x.to ?? x.from);
          const n = map && cellOf(x.place) && cellOf(y.place) ? cellsApart(cellOf(x.place), cellOf(y.place)) : null;
          rows.push(`<li><span class="chip">${x.card}</span> ${esc(nm(x.place))} <b>${when(x)}</b> → <span class="chip">${y.card}</span> ${esc(nm(y.place))} <b>${when(y)}</b><br><span class="small">odstęp <b>${gap} min</b>${n !== null ? ` · droga ${blocksText(n)} = <b>${n * MIN_PER_CELL} min</b>` : map ? '' : ' · drogę zna osoba z planem miasta'}</span></li>`);
        }
      }
    }
  }
  const single = facts.flat().filter(() => map && sceneC).slice(0, 6).map((x) => `<li><span class="chip">${x.card}</span> ${esc(nm(x.place))} <b>${when(x)}</b> · do miejsca kradzieży ${blocksText(cellsApart(cellOf(x.place), sceneC))} = <b>${cellsApart(cellOf(x.place), sceneC) * MIN_PER_CELL} min</b></li>`);
  const places = [...new Set(facts.flat().map((x) => x.place).filter((pl) => PLACE_CELLS[pl]))];
  const mini = map && places.length ? `<div class="town-wrap cmp-map" data-scroll-key="cmp">${renderTownSvg({ places: PLACES, scene: sceneIdOf(state.c), sceneLabel: state.c.scene.name, active: new Set(places), selected: places.slice(0, 2) })}</div>` : '';
  return `
    <h2 tabindex="-1">Porównanie</h2>
    <div class="cmp-grid cmp-${Math.min(list.length, 3)}">${list.map((k) => (canSee(k) ? renderCard(k, { noActions: true }) : `<article class="card card-sealed"><header class="card-head"><span class="card-id">${k.id}</span><div class="card-titles"><h4>${esc(k.title)}</h4></div></header><p class="seal-action">${isSealed(k) ? 'Koperta jeszcze zamknięta.' : 'Ta karta leży u innego gracza.'}</p></article>`)).join('')}</div>
    ${rows.length ? `<h3 class="sec-label">Godziny i drogi</h3><ul class="cmp-rows">${rows.slice(0, 8).join('')}</ul>` : ''}
    ${single.length ? `<h3 class="sec-label">Do miejsca kradzieży (drzwi otwarte ${fmt(state.c.window.from)}–${fmt(state.c.window.to)})</h3><ul class="cmp-rows">${single.join('')}</ul>` : ''}
    ${mini}
    <p class="muted small">Gra tylko zestawia liczby z kart. Wnioski wyciągasz sam.</p>`;
}

// ---------------------------------------------------------------------------
// Podpowiedzi, oskarżenie

function hintTexts() {
  const sol = state.sol;
  const out = [];
  // Podpowiedź 1 nie może wskazywać karty, która obala fałszywkę (w weekend to często pobyt drugiej osoby).
  const proofIds = proofSet();
  const safe = (i) => i.type === 'neutral' && !i.refs.some((r) => proofIds.has(r));
  const neutral = Object.entries(sol.explain.suspects).find(([, items]) => items.some(safe));
  if (neutral) {
    const [id, items] = neutral;
    const it = items.find(safe);
    out.push(`${suspectById(id).full} ma alibi potwierdzone przez niezależne źródło. Zobacz karty ${it.refs.slice(0, -1).join(', ')} i ${it.refs[it.refs.length - 1]}.`);
  } else {
    out.push(`${isTeamLike() ? 'Zacznijcie' : 'Zacznij'} od czasów dotarcia na biurku „Mapa i rozkłady”.`);
  }
  const forged = sol.explain.forged;
  const refDesk = cardById((forged.proofRefs || forged.refs).find((r) => r !== forged.card))?.desk;
  out.push(`Fałszywkę obala karta z biurka „${deskName(refDesk)}”.${isTeamLike() ? ` Ma je gracz ${seatOfDesk(refDesk)}.` : ''}`);
  // Podpowiedź 3 wskazuje trop (czyj pobyt albo jaka tabela), ale nie numer karty.
  const keyCard = cardById((forged.proofRefs || forged.refs).find((r) => r !== forged.card));
  if (forged.physical && forged.about) {
    const who = suspectById(forged.about);
    const src = keyCard?.title === 'Monitoring miejski' ? 'nagranie z kamery' : keyCard?.kind === 'witness' ? 'zeznanie świadka' : 'rejestr';
    out.push(`${isTeamLike() ? 'Sprawdźcie' : 'Sprawdź'}, gdzie naprawdę ${who.f ? 'była' : 'był'} ${who.full}: kluczowe jest ${src}, zestawione z planem miasta.`);
  } else {
    out.push(`${isTeamLike() ? 'Porównajcie' : 'Porównaj'} dowody podejrzanych z kartą „${keyCard?.title || 'tabela urzędowa'}”.`);
  }
  return out;
}

function renderModal() {
  if (!state.modal) return '';
  let body = '';
  if (state.modal === 'hints') {
    const texts = hintTexts();
    const used = texts.slice(0, progress.hints);
    const confirming = state.confirm === 'hint';
    body = `
      <h2 tabindex="-1">Podpowiedzi</h2>
      ${used.length ? `<ol class="hint-list">${used.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : '<p class="muted">Nie użyto jeszcze żadnej podpowiedzi.</p>'}
      ${progress.hints < texts.length
        ? `<button class="btn ${confirming ? 'btn-primary' : ''}" data-act="hint">${confirming ? `Na pewno? +${fmtPenalty(CONFIG.hintPenalty)} do czasu` : `Pokaż podpowiedź ${progress.hints + 1} z 3`}</button>`
        : '<p class="muted">To już wszystkie podpowiedzi.</p>'}`;
  }
  if (state.modal === 'accuse') {
    const a = state.accuse;
    const supplied = state.c.cards.filter((k) => k.kind === 'supplied');
    const left = CONFIG.maxAttempts - progress.attempts.length;
    const mine = myDesks();
    const proofCard = a.proof ? cardById(a.proof) : null;
    const forgedCard = a.forged ? cardById(a.forged) : null;
    const accused = forgedCard ? suspectById(forgedCard.by) : null;
    const reasons = forgedCard ? REASONS[forgedKind(forgedCard)] || [] : [];
    const reasonText = reasons.find(([code]) => code === a.reason)?.[1];
    const sq = (v) => (v === null ? 'skip' : v ? 'ok' : 'bad');
    const tried = progress.attempts.some((t) => t.forged === a.forged && t.proof === a.proof);
    const blank = (v) => (v ? `<b>${v}</b>` : '<span class="blank">……</span>');
    const cardOptions = (sel) => DESK_DEFS.map((d) => `<optgroup label="${esc(d.name)}">${state.c.cards.filter((k) => k.desk === d.id).map((k) => `<option value="${k.id}" ${sel === k.id ? 'selected' : ''}>${k.id}${mine.includes(k.desk) ? ` · ${esc(k.title)}` : ''}</option>`).join('')}</optgroup>`).join('');
    body = `
      <h2 tabindex="-1">Raport z dochodzenia</h2>
      <p class="muted small">Pozostałe próby: ${left}. Pomyłka dodaje ${fmtPenalty(CONFIG.wrongPenalty)} do czasu.</p>
      ${a.last ? (progress.attempts.length >= 2
        ? `<p class="feedback" role="status"><span class="fb"><span class="sq ${sq(a.last[0])}"></span> fałszywka: ${a.last[0] ? 'trafiona' : 'pudło'}</span> <span class="fb"><span class="sq ${sq(a.last[1])}"></span> obalenie: ${a.last[1] === null ? 'nie sprawdzono' : a.last[1] ? 'trafione' : 'pudło'}</span></p>`
        : '<p class="feedback" role="status"><span class="fb"><span class="sq bad"></span> Raport nietrafny.</span> Po drugiej pomyłce dowiesz się, która część była zła.</p>') : ''}
      ${progress.attempts.length ? `<div class="history"><span class="history-label">Wcześniejsze próby:</span> ${progress.attempts.map((t, i) => `<span class="fb"><span class="chip">${t.forged}</span> + <span class="chip">${t.proof}</span> ${i === 0 && progress.attempts.length < 2 ? '<span class="sq bad"></span>' : `<span class="sq ${sq(t.ok[0])}"></span><span class="sq ${sq(t.ok[1])}"></span>`}</span>`).join(' ')}</div>` : ''}
      <fieldset class="pick">
        <legend>1. Sfałszowany dowód</legend>
        <div class="pick-list">
          ${supplied.map((k) => `<button class="pick-btn pick-row${a.forged === k.id ? ' on' : ''}" data-act="pick-forged" data-id="${k.id}" aria-pressed="${a.forged === k.id}"><span class="chip">${k.id}</span> <span class="pick-main">${esc(k.title)}<span class="pick-sub">${esc(suspectById(k.by).full)}</span></span></button>`).join('')}
        </div>
      </fieldset>
      <fieldset class="pick">
        <legend>2. Karta, która go obala</legend>
        ${isTeamLike() ? '<p class="muted small">Kody kart z innych biurek podają ci pozostali gracze (albo kładą je na stół).</p>' : ''}
        <div class="proof-grid">
          ${DESK_DEFS.map((d) => {
            const ids = state.c.cards.filter((k) => k.desk === d.id && k.kind !== 'supplied');
            if (!ids.length) return '';
            return `<div class="proof-row"><span class="proof-desk">${esc(d.name)}</span><div class="proof-chips">${ids.map((k) => { const sealedOwn = mine.includes(k.desk) && isSealedNow(k); return `<button class="proof-chip${a.proof === k.id ? ' on' : ''}${sealedOwn ? ' sealed' : ''}" data-act="pick-proof" data-id="${k.id}" aria-pressed="${a.proof === k.id}" ${mine.includes(k.desk) ? `title="${esc(k.title)}${sealedOwn ? ' (zapieczętowana)' : ''}"` : ''}>${k.id}</button>`; }).join('')}</div></div>`;
          }).join('')}
        </div>
      </fieldset>
      <fieldset class="pick">
        <legend>3. Co ta karta pokazuje?</legend>
        ${reasons.length ? `<div class="pick-list">${reasons.map(([code, text]) => `<button class="pick-btn pick-reason${a.reason === code ? ' on' : ''}" data-act="pick-reason" data-id="${code}" aria-pressed="${a.reason === code}">${esc(text)}</button>`).join('')}</div>` : '<p class="muted small">Najpierw wskaż sfałszowany dowód.</p>'}
      </fieldset>
      <fieldset class="pick">
        <legend>4. Karty potwierdzające alibi pozostałych <span class="muted small">(nieobowiązkowe, za gwiazdkę)</span></legend>
        <div class="alibi-list">
          ${state.c.suspects.filter((x) => !accused || x.id !== accused.id).map((x) => `
            <label class="alibi-row" for="alibi-${x.id}"><span>${esc(x.full)}</span>
              <select id="alibi-${x.id}" data-act="alibi" data-id="${x.id}"><option value="">nie wiem</option>${cardOptions(a.alibis[x.id])}</select>
            </label>`).join('')}
        </div>
      </fieldset>
      <div class="report-preview" aria-live="polite">
        <p>${accused ? (accused.f ? 'Sprawczynią' : 'Sprawcą') : 'Sprawcą'} jest ${blank(accused ? esc(accused.full) : '')}. Dowód ${blank(a.forged)} jest sfałszowany, bo karta ${blank(a.proof)} pokazuje, że ${blank(reasonText ? esc(reasonText) : '')}.</p>
        ${proofCard && !mine.includes(proofCard.desk) ? `<p class="small muted">Karta ${proofCard.id} leży na biurku „${esc(deskName(proofCard.desk))}”.</p>` : ''}
        ${proofCard && mine.includes(proofCard.desk) && isSealedNow(proofCard) ? `<p class="small warn">Karta ${proofCard.id} jest jeszcze zapieczętowana. Nie wiesz, co na niej jest.</p>` : ''}
      </div>
      ${tried ? '<p class="small muted">Ta para kart była już sprawdzona. Wybierz inną.</p>' : ''}
      <button class="btn btn-primary btn-wide" data-act="accuse" ${a.forged && a.proof && a.reason && !tried ? '' : 'disabled'}>Podpisz i złóż raport</button>`;
  }
  if (state.modal === 'compare') body = renderCompareBody();
  if (state.modal === 'end') {
    const confirming = state.confirm === 'reveal';
    body = `
      <h2 tabindex="-1">Koniec śledztwa</h2>
      <p>Oskarżenie składa kapitan, czyli gracz 1. Kiedy zamknie sprawę, możesz tu zobaczyć rozwiązanie i wszystkie karty.</p>
      <button class="btn ${confirming ? 'btn-primary' : ''}" data-act="reveal">${confirming ? 'Na pewno? To odsłoni rozwiązanie' : 'Pokaż rozwiązanie'}</button>`;
  }
  return `
  <div class="overlay" data-act="close-modal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="${({ hints: 'Podpowiedzi', accuse: 'Raport z dochodzenia', end: 'Koniec śledztwa', compare: 'Porównanie' })[state.modal]}" data-stop>
      <button class="btn btn-ghost btn-icon modal-close" data-act="close-modal" aria-label="Zamknij">✕</button>
      ${body}
    </div>
  </div>`;
}

function proofSet() {
  const f = state.sol.explain.forged;
  return new Set((f.proofRefs || f.refs).filter((r) => r !== f.card));
}

function forgedKind(card) {
  return card.facts?.find((f) => f.t === 'claim')?.kind;
}

/** Karty, które potwierdzają alibi danej osoby (bez kart z czasami dotarcia). */
function alibiCards(sid) {
  const set = new Set();
  for (const item of state.sol.explain.suspects[sid] || []) item.refs.slice(0, -1).forEach((r) => set.add(r));
  return set;
}

function reportQuality(a) {
  const f = state.sol.explain.forged;
  const innocents = state.c.suspects.filter((x) => x.id !== state.c.solution.culprit);
  const alibiCorrect = innocents.filter((x) => a.alibis[x.id] && alibiCards(x.id).has(a.alibis[x.id])).length;
  const reasonOk = f.reasonCodes.includes(a.reason);
  const firstTry = !isReplay() && progress.hints < 3 && (state.mode === 'live' ? progress.attempts.length === 0 : progress.attempts.length === 1);
  const stars = Number(reasonOk) + Number(alibiCorrect === innocents.length) + Number(firstTry);
  return { reasonOk, alibiCorrect, alibiTotal: innocents.length, firstTry, stars };
}

function submitAccusation() {
  const a = state.accuse;
  // Po pomyłce karta-obalenie jest czyszczona, więc podwójne kliknięcie nie wyśle drugiej próby.
  if (!a.forged || !a.proof || !a.reason || progress.status !== 'playing') return;
  // Kartą obalającą może być tylko karta, którą ktoś już widział (koperta otwarta).
  // (W ekipie bez serwera widać tylko własne koperty, więc karty z cudzych biurek nie sprawdzamy.)
  const proofCard = cardById(a.proof);
  if (isSealedNow(proofCard) && (state.mode !== 'team' || myDesks().includes(proofCard.desk))) {
    showToast(`Karta ${a.proof} jest jeszcze w zamkniętej kopercie. Najpierw ją otwórz.`);
    return;
  }
  if (progress.attempts.some((t) => t.forged === a.forged && t.proof === a.proof)) return;
  const sol = state.c.solution;
  const forgedOk = a.forged === sol.forged;
  const ok = [forgedOk, forgedOk ? proofSet().has(a.proof) : null];
  if (state.mode === 'live') {
    if (state.live.rs?.fingerprint && state.live.rs.fingerprint !== state.c.fingerprint) {
      showToast('Masz inną wersję sprawy niż gospodarz pokoju. Odśwież stronę, zanim złożysz raport.');
      return;
    }
    const report = ok[0] && ok[1] ? reportQuality(a) : null;
    if (!state.live.conn.send({ t: 'accuse', forged: a.forged, proof: a.proof, reason: a.reason, alibis: a.alibis, ok, report })) {
      showToast('Brak połączenia z serwerem. Spróbuj za chwilę.');
      return;
    }
    a.last = ok;
    if (!(ok[0] && ok[1])) a.proof = null;
    render();
    return;
  }
  progress.attempts.push({ forged: a.forged, proof: a.proof, reason: a.reason, alibis: { ...a.alibis }, ok });
  markSeen('try');
  a.last = ok;
  if (ok[0] && ok[1]) {
    progress.report = reportQuality(a);
    return finish('solved');
  }
  progress.penalty += CONFIG.wrongPenalty;
  a.proof = null;
  state.modalTop = true; // wynik próby jest na górze okna raportu, więc tam przewijamy
  saveProgress();
  if (progress.attempts.length >= CONFIG.maxAttempts) return finish('failed');
  render();
}

const starsText = (n) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;

// ---------------------------------------------------------------------------
// Wynik

function shareText() {
  const c = state.c;
  const head = c.kind === 'daily' ? `Fałszywe Alibi nr ${c.number}` : `Fałszywe Alibi · trening ${c.code}`;
  const mode = state.mode === 'solo' ? 'solo' : `ekipa${state.mode === 'live' ? ' na żywo' : ''} · ${state.teamSize} ${state.teamSize === 5 ? 'osób' : 'osoby'}`;
  // Pierwsza pomyłka bez szczegółów (tak jak w grze): jeden czerwony kwadrat.
  const rows = progress.attempts.map((a, i) => (i === 0 && !(a.ok[0] && a.ok[1]) ? '🟥' : a.ok.map((x) => (x === null ? '⬜' : x ? '🟩' : '🟥')).join(''))).join('\n');
  const tail = progress.status === 'solved'
    ? `⏱ ${fmtClock(elapsedSec())} · 💡 ${progress.hints} · 🔎 ${fmtHM(usedMin())}/${fmtHM(budgetMin())} h${progress.report ? ` · raport ${starsText(progress.report.stars)}` : ''}`
    : 'Sprawa nierozwiązana';
  return [`${head} · ${mode}${isReplay() ? ' · powtórka' : ''}`, rows, tail, CONFIG.shareUrl].filter(Boolean).join('\n');
}

/** Ile zostało do następnej sprawy dnia (liczone od daty sprawy na ekranie). */
function msToNextCase() {
  const [y, m, d] = state.ref.date.split('-').map(Number);
  return new Date(y, m - 1, d + 1) - new Date();
}

function renderEpilogue() {
  const outcome = progress.status === 'failed' ? 'failed' : progress.status === 'revealed' ? 'revealed' : 'solved';
  const e = buildEpilogue(state.c, state.sol, outcome);
  return `
    <section class="epilogue" aria-label="${esc(e.heading)}">
      <p class="epi-head">${esc(e.heading)}</p>
      <p class="epi-meta">${esc(e.meta)}</p>
      ${e.paragraphs.map((x) => `<p>${esc(x)}</p>`).join('')}
      <blockquote>${esc(e.quote)}</blockquote>
    </section>`;
}

function renderResult() {
  const c = state.c;
  const sol = state.sol;
  const culprit = suspectById(c.solution.culprit);
  const forged = cardById(c.solution.forged);
  const solved = progress.status === 'solved';
  const revealed = progress.status === 'revealed';
  const stampText = solved ? 'Sprawa zamknięta' : revealed ? 'Akta odtajnione' : 'Sprawa nierozwiązana';
  const refsHtml = (text) => esc(text).replace(/\[([DSMZR]\d+)\]/g, '<span class="chip">$1</span>');
  const others = c.suspects.filter((s) => s.id !== culprit.id).map((s) => {
    const seenSrc = new Set();
    const items = (sol.explain.suspects[s.id] || []).filter((i) => {
      if (seenSrc.has(i.refs[0])) return false;
      seenSrc.add(i.refs[0]);
      return true;
    });
    return `<li><b>${esc(s.full)}</b>: ${items.map((i) => `${esc(sol.describeClear(i))} ${i.refs.map((r) => `<span class="chip">${r}</span>`).join(' ')}`).join('; ')}</li>`;
  }).join('');
  const nextIn = c.kind === 'daily' ? msToNextCase() : 0;
  const hh = Math.floor(nextIn / 3600000);
  const mm = Math.floor((nextIn % 3600000) / 60000);
  return `
  <div class="page page-result">
    <header class="masthead masthead-row">
      <button class="btn btn-ghost" data-act="leave">← Strona główna</button>
      ${renderBrand(true)}
    </header>
    <section class="result">
      <p class="big-stamp ${solved ? 'ok' : revealed ? 'neutral' : 'bad'}" tabindex="-1" id="result-stamp">${stampText}</p>
      <h1 class="case-title">${esc(c.title)}</h1>
      ${revealed ? '<p class="muted">Wynik ekipy podaje kapitan.</p>' : `
      <dl class="result-stats">
        <div><dt>Czas</dt><dd>${solved ? fmtClock(elapsedSec()) : '–'}</dd></div>
        <div><dt>Próby</dt><dd>${progress.attempts.length}/${CONFIG.maxAttempts}</dd></div>
        <div><dt>Podpowiedzi</dt><dd>${progress.hints}</dd></div>
        <div><dt>Śledztwo</dt><dd class="nw">${fmtHM(usedMin())}/${fmtHM(budgetMin())} h</dd></div>
        <div><dt>Kary</dt><dd>+${fmtPenalty(totalPenalty())}</dd></div>
        ${solved && progress.report ? `<div><dt>Raport</dt><dd class="stars" aria-label="${progress.report.stars} z 3 gwiazdek">${starsText(progress.report.stars)}</dd></div>` : ''}
      </dl>
      ${solved && progress.report ? `<ul class="report-review">
        <li class="${progress.report.reasonOk ? 'ok' : 'bad'}">${progress.report.reasonOk ? '✓' : '✕'} powód fałszerstwa</li>
        <li class="${progress.report.alibiCorrect === progress.report.alibiTotal ? 'ok' : 'bad'}">${progress.report.alibiCorrect === progress.report.alibiTotal ? '✓' : '✕'} alibi pozostałych: ${progress.report.alibiCorrect}/${progress.report.alibiTotal}</li>
        <li class="${progress.report.firstTry ? 'ok' : 'bad'}">${progress.report.firstTry ? '✓' : '✕'} za pierwszym razem</li>
      </ul>` : ''}
      <div class="share">
        <label for="share-text">Wynik dla znajomych (bez spoilerów)</label>
        <textarea id="share-text" readonly rows="5">${esc(shareText())}</textarea>
        <button class="btn btn-primary" data-act="copy-share">Kopiuj wynik</button>
      </div>`}
      ${c.kind === 'daily' ? (nextIn > 0 ? `<p class="muted">Następna sprawa za ${hh} h ${mm} min.</p>` : '<p><button class="btn" data-act="home">Nowa sprawa dnia już czeka</button></p>') : ''}
    </section>
    ${renderEpilogue()}
    <section class="solution">
      <h2>Rozwiązanie</h2>
      <p class="verdict">${culprit.f ? 'Sprawczynią' : 'Sprawcą'} jest <b>${esc(culprit.full)}</b> (${esc(culprit.role)}). Sfałszowany dowód to <span class="chip">${forged.id}</span> ${esc(forged.title)}, a obala go ${[...proofSet()].map((r) => `<span class="chip">${r}</span>`).join(' lub ')}.</p>
      <p>Dlaczego: ${refsHtml(sol.explain.forged.reason)}.</p>
      ${sol.explain.lies.map((lie) => {
        const liar = suspectById(lie.who);
        const card = cardById(lie.card);
        const head = `<b>Kłamstwo niewinnej osoby:</b> ${esc(liar.full)}, karta <span class="chip">${card.id}</span> ${esc(card.title)}. ${refsHtml(lie.reason.charAt(0).toUpperCase() + lie.reason.slice(1))}.`;
        if (lie.alibi) {
          const cl = (lie.cleared || [])[0];
          const alibi = cl ? `${esc(sol.describeClear(cl))} ${cl.refs.map((r) => `<span class="chip">${r}</span>`).join(' ')}` : '';
          return `<p class="lie-explain">${head} To nie była fałszywka sprawcy, bo ${esc(liar.full)} i tak ${liar.f ? 'miała' : 'miał'} potwierdzone alibi: ${alibi}.</p>`;
        }
        const before = lie.to <= c.window.from - lie.travel;
        const when = lie.from === lie.to ? `o ${fmt(lie.from)}` : `od ${fmt(lie.from)} do ${fmt(lie.to)}`;
        const why = before
          ? `z miejsca podanego na karcie (${PLACES[lie.place]?.name ?? lie.place}, ${when}, dotarcie ${lie.travel} min) ${liar.f ? 'zdążyłaby' : 'zdążyłby'} na kradzież o ${fmt(c.window.from)}`
          : `do miejsca podanego na karcie (${PLACES[lie.place]?.name ?? lie.place}, ${when}, dotarcie ${lie.travel} min) dało się dotrzeć już po kradzieży`;
        return `<p class="lie-explain">${head} Ten dowód i tak nie dawał alibi, bo ${esc(why)}${lie.travelRef ? ` <span class="chip">${lie.travelRef}</span>` : ''}.</p>`;
      }).join('')}
      <div class="cards cards-solution">
        ${renderCard(forged, { noActions: true, highlight: true })}
        ${sol.explain.forged.refs.filter((r) => r !== forged.id).map((r) => renderCard(cardById(r), { noActions: true })).join('')}
      </div>
      <h3 class="sec-label">Alibi pozostałych</h3>
      <ul class="others">${others}</ul>
      <button class="btn" data-act="toggle-all">${state.showAll ? 'Ukryj wszystkie karty' : 'Pokaż wszystkie karty ze wszystkich biurek'}</button>
      ${state.showAll ? DESK_DEFS.map((d) => `<h3 class="sec-label">${esc(d.name)}</h3><div class="cards">${c.cards.filter((k) => k.desk === d.id).map((k) => renderCard(k, { noActions: true })).join('')}</div>`).join('') : ''}
    </section>
    <section class="practice">
      <h2>Chcesz więcej?</h2>
      <button class="btn" data-act="practice-new">Nowa sprawa treningowa</button>
    </section>
  </div>`;
}

// ---------------------------------------------------------------------------
// Gra na żywo (pokój na serwerze)

const onTable = (id) => Boolean(state.live?.rs?.table.some((t) => t.card === id));
const playerName = (id) => state.live?.rs?.players.find((p) => p.id === id)?.name ?? 'ktoś';

function roomLink() {
  return `${window.location.origin}${window.location.pathname}#pokoj-${state.live.room}`;
}

function clientId() {
  let id = store.get('clientId');
  if (!id) {
    id = randomClientId();
    store.set('clientId', id);
  }
  return id;
}

function closeLive() {
  state.live?.conn?.close();
  state.live = null;
}

function createRoom() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  openRoom(code, true);
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#pokoj-${code}`);
  } catch {
    window.location.hash = `pokoj-${code}`;
  }
}

function openRoom(code, create) {
  if (state.live?.room === code) return;
  const createRef = create && state.ref ? state.ref : null;
  const createFp = create && state.c ? state.c.fingerprint : null;
  closeLive();
  state.mode = 'live';
  resetCaseUi();
  state.live = { room: code, conn: null, rs: null, you: null, status: 'connecting', error: '', draft: '' };
  const live = state.live;
  live.conn = connectLive({
    room: code,
    hello: () => ({ t: 'hello', clientId: clientId(), name: store.get('name') || '', caseRef: createRef, fingerprint: createFp }),
    onState: (msg) => onLiveState(live, msg),
    onError: (m) => {
      if (state.live !== live) return;
      live.error = m;
      showToast(m);
      render();
    },
    onStatus: (st) => {
      if (state.live !== live) return;
      live.status = st;
      if (state.screen === 'live-lobby' || state.screen === 'game') render();
    },
  });
  go('live-lobby');
}

function leaveRoom() {
  exitLiveIfAny();
  state.mode = 'solo';
  openDaily();
}

async function onLiveState(live, msg) {
  if (state.live !== live || state.mode !== 'live') return;
  const prev = live.rs;
  live.rs = msg.state;
  live.you = msg.you;
  live.error = '';
  const rs = live.rs;
  if (rs.caseRef && (!state.ref || caseKey(state.ref) !== caseKey(rs.caseRef))) {
    if (!(await loadCase(rs.caseRef)) || state.live !== live) return;
  }
  notifyOthers(prev, rs, live.you);
  syncLiveProgress();
  const me = rs.players.find((p) => p.id === live.you);
  if ((rs.status === 'solved' || rs.status === 'failed') && state.screen !== 'result') {
    if (prev && prev.status === 'playing') recordResult(rs.status === 'solved');
    state.focusResult = true;
    go('result');
    return;
  }
  if (rs.status === 'playing' && me?.seat && state.screen !== 'game' && state.screen !== 'result') {
    resetCaseUi();
    go('game');
    return;
  }
  if (rs.status === 'lobby' && state.screen === 'game') {
    showToast('Serwer uruchomił pokój od nowa. Zacznijcie jeszcze raz.');
    go('live-lobby');
    return;
  }
  render();
}

function notifyOthers(prev, rs, you) {
  if (!prev) return;
  const fresh = rs.table.filter((t) => t.by !== you && !prev.table.some((x) => x.card === t.card));
  if (fresh.length) { showToast(`${playerName(fresh[0].by)} kładzie na stół kartę ${fresh[0].card}.`); return; }
  const lastAt = prev.log.length ? prev.log[prev.log.length - 1].at : -1;
  const logs = rs.log.filter((l) => l.at > lastAt && l.by && l.by !== you);
  if (logs.length) { showToast(`${playerName(logs[0].by)}: ${logs[0].text}`); return; }
  const unl = Object.entries(rs.unlocked).filter(([k, by]) => by !== you && !prev.unlocked[k]);
  if (unl.length) { showToast(`${playerName(unl[0][1])} zleca czynność: karta ${unl[0][0]}.`); return; }
  if (rs.hints > prev.hints) { showToast('Ekipa wzięła podpowiedź (+2:00).'); return; }
  if (rs.attempts.length > prev.attempts.length && rs.status === 'playing') showToast(`${playerName(rs.attempts.at(-1).by)} składa raport: pudło (+5:00).`);
}

/** Przepisuje stan pokoju do lokalnego obiektu `progress`, z którego korzysta reszta interfejsu. */
function syncLiveProgress() {
  const live = state.live;
  const rs = live.rs;
  const me = rs.players.find((p) => p.id === live.you);
  if (rs.teamSize) state.teamSize = rs.teamSize;
  state.seat = me?.seat || 1;
  const local = store.get(`live:${rs.code}`, { marks: {}, sus: {}, notes: '' });
  const off = live.conn?.offset || 0;
  // Stan tylko tego gracza (tablica, odłożone karty) zostaje między aktualizacjami z serwera.
  const keepPins = progress?.pins || local.pins || [];
  const keepAside = progress?.aside || local.aside || {};
  progress = {
    pins: keepPins,
    aside: keepAside,
    marks: local.marks || {},
    sus: local.sus || {},
    notes: local.notes || '',
    startedAt: rs.startedAt != null ? rs.startedAt - off : null,
    endedAt: rs.endedAt != null ? rs.endedAt - off : null,
    penalty: rs.penalty,
    hints: rs.hints,
    attempts: rs.attempts,
    status: rs.status === 'lobby' ? 'playing' : rs.status,
    unlocked: Object.fromEntries(Object.keys(rs.unlocked).map((k) => [k, true])),
    report: rs.report,
    teamSize: state.teamSize,
    seat: state.seat,
  };
}

function renderLobby() {
  const live = state.live;
  const rs = live?.rs;
  const c = state.c;
  const online = rs ? rs.players.filter((p) => p.online) : [];
  const statusText = { connecting: 'Łączenie z serwerem…', open: 'Połączono', closed: 'Rozłączono. Próbuję połączyć ponownie…', stopped: 'Połączenie wstrzymane.' }[live?.status || 'connecting'];
  const fpMismatch = rs?.fingerprint && c && c.fingerprint !== rs.fingerprint;
  const me = rs?.players.find((p) => p.id === live.you);
  return `
  <div class="page">
    <header class="masthead masthead-row">
      <button class="btn btn-ghost" data-act="live-leave">← Wyjdź z pokoju</button>
      ${renderBrand(true)}
    </header>
    <section class="setup">
      <h1 class="setup-title">Pokój <span class="code">${esc(live?.room || '')}</span></h1>
      <p class="live-status ${live?.status === 'open' ? 'ok' : ''}" role="status">${esc(statusText)}</p>
      ${live?.error ? `<p class="warn">${esc(live.error)}</p>` : ''}
      ${live?.status === 'stopped' ? '<button class="btn" data-act="live-reconnect">Połącz ponownie</button>' : ''}
      ${rs && c ? `<p class="fingerprint">Sprawa: <b>${esc(c.kind === 'daily' ? `nr ${c.number}` : `trening ${c.code}`)}</b> · ${esc(c.title)} · odcisk <b class="code">${esc(c.fingerprint)}</b></p>` : ''}
      ${fpMismatch ? '<p class="warn">Masz inną wersję tej sprawy niż gospodarz pokoju. Odśwież stronę, a jeśli to nie pomoże, utwórzcie nowy pokój.</p>' : ''}
      <label class="name-row" for="live-name">Twoje imię
        <input id="live-name" data-act="live-name" maxlength="24" value="${esc(store.get('name') || me?.name || '')}" placeholder="np. Ania" autocomplete="nickname">
      </label>
      <div class="invite">
        <label for="room-link">Link do pokoju dla ekipy</label>
        <textarea id="room-link" readonly rows="2">${esc(live ? roomLink() : '')}</textarea>
        <button class="btn" data-act="copy-room">Kopiuj link</button>
      </div>
      <h2 class="sec-label">W pokoju (${online.length}/5)</h2>
      <ul class="players">
        ${rs ? rs.players.map((p) => `<li class="${p.online ? 'online' : 'offline'}"><span class="dot" aria-hidden="true"></span>${esc(p.name)}${p.id === live.you ? ' <span class="muted">(ty)</span>' : ''}${p.id === rs.hostId ? ' <span class="muted">· gospodarz</span>' : ''}</li>`).join('') : '<li class="muted">Czekam na serwer…</li>'}
      </ul>
      <ul class="setup-notes">
        <li>Każdy dostaje inne biurka (w kolejności wejścia do pokoju). Zegar, podpowiedzi, próby i godziny śledztwa są wspólne.</li>
        <li>Karty możecie kłaść na wspólny stół, a ustalenia zapisywać na stole. Raport może złożyć każdy.</li>
      </ul>
      <button class="btn btn-primary btn-wide" data-act="live-start" ${online.length >= 2 && rs?.status === 'lobby' && !fpMismatch ? '' : 'disabled'}>Zaczynamy${online.length < 2 ? ' (potrzeba 2 osób)' : ''}</button>
    </section>
  </div>`;
}

function renderTable() {
  const rs = state.live?.rs;
  if (!rs) return '';
  const cards = rs.table.map((t) => cardById(t.card)).filter(Boolean);
  return `
  <section class="desk" aria-label="Wspólny stół">
    <header class="desk-head">
      <h2>Wspólny stół</h2>
      <p class="muted small">Karty położone przez ekipę widzą wszyscy.</p>
    </header>
    <form class="log-form" data-act="live-log">
      <label class="sr-only" for="live-draft">Ustalenie dla ekipy</label>
      <input id="live-draft" data-act="live-draft" maxlength="280" value="${esc(state.live.draft || '')}" placeholder="Ustalenie, np. Halina czysta: S6 + M7" autocomplete="off">
      <button class="btn btn-small" type="submit">Zapisz</button>
    </form>
    <ol class="log" reversed>
      ${rs.log.slice().reverse().map((l) => `<li><b>${l.by ? esc(playerName(l.by)) : 'System'}:</b> ${esc(l.text)}</li>`).join('')}
    </ol>
    <div class="cards">
      ${cards.length ? cards.map((k) => {
        const t = rs.table.find((x) => x.card === k.id);
        const sealed = isSealedNow(k);
        return `<div class="table-item"><p class="small muted">${esc(playerName(t.by))}${t.by === state.live.you ? ' (ty)' : ''} kładzie · <button class="link-btn" data-act="untable" data-id="${k.id}">Zdejmij</button></p>${sealed ? `<article class="card card-sealed"><header class="card-head"><span class="card-id">${k.id}</span><div class="card-titles"><h4>${esc(k.title)}</h4></div><span class="card-kind">zapieczętowane</span></header><p class="seal-action">Najpierw ktoś musi zlecić: ${esc(k.action.label)}</p></article>` : renderCard(k, { noActions: true })}</div>`;
      }).join('') : '<p class="muted small">Na stole nic jeszcze nie leży. Użyj „Połóż na stół” pod kartą.</p>'}
    </div>
  </section>`;
}

/** Czy da się grać na żywo: adres w config.js albo serwer `npm run live` pod tym samym adresem. */
async function detectLive() {
  if (CONFIG.liveServer) {
    state.liveAvailable = true;
    return;
  }
  if (!liveServerUrl()) return;
  try {
    const r = await fetch('health', { cache: 'no-store' });
    state.liveAvailable = r.ok && (await r.text()).trim() === 'ok';
  } catch {
    state.liveAvailable = false;
  }
  if (state.liveAvailable && state.c && state.mode !== 'live' && (state.screen === 'home' || state.screen === 'intro')) render();
}

// ---------------------------------------------------------------------------
// Render i zdarzenia

let lastModal = null;
let lastScreen = null;
let modalOpener = null;

function focusKeyOf(el) {
  if (!el || !el.dataset || !el.dataset.act) return null;
  const d = el.dataset;
  return [d.act, d.id || d.place || '', d.tab || '', d.n || '', d.mode || '', d.v || ''].join('|');
}

function findByKey(key) {
  if (!key) return null;
  const [act, id, tab, n, mode, v] = key.split('|');
  return [...app.querySelectorAll(`[data-act="${act}"]`)].find((el) => (el.dataset.id || el.dataset.place || '') === id && (el.dataset.tab || '') === tab && (el.dataset.n || '') === n && (el.dataset.mode || '') === mode && (el.dataset.v || '') === v) || null;
}

function render() {
  clearInterval(timerHandle);
  const active = document.activeElement;
  const focusKey = app.contains(active) ? focusKeyOf(active) : null;
  const modalScroll = app.querySelector('.modal')?.scrollTop ?? 0;
  // Przewinięcia, które nie mogą skakać przy przerysowaniu: pasek zakładek i cała strona.
  const tabsX = app.querySelector('.tabs-inner')?.scrollLeft ?? null;
  const winY = window.scrollY;
  const mapWrap = app.querySelector('.town-wrap');
  state.mapScrolls = state.mapScrolls || {};
  if (mapWrap) state.mapScrolls[mapWrap.dataset.scrollKey] = [mapWrap.scrollLeft, mapWrap.scrollTop];
  const caret = active && app.contains(active) && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  if (state.modal && !lastModal) modalOpener = focusKey;
  let html = '';
  switch (state.screen) {
    case 'home': html = renderHome(); break;
    case 'intro': html = renderIntro(); break;
    case 'setup': html = renderSetup(); break;
    case 'game': html = renderGame(); break;
    case 'live-lobby': html = renderLobby(); break;
    case 'result': html = renderResult(); break;
    default: html = renderHome();
  }
  app.innerHTML = `${html}<div id="toast" class="toast" role="status" ${state.toast ? '' : 'hidden'}>${esc(state.toast)}</div>`;
  document.body.classList.toggle('in-game', state.screen === 'game');
  const head = app.querySelector('.sticky-head');
  if (head) document.documentElement.style.setProperty('--head-h', `${head.offsetHeight}px`);
  const tabsEl = app.querySelector('.tabs-inner');
  if (tabsEl) {
    if (tabsX !== null) tabsEl.scrollLeft = tabsX;
    // Aktywna zakładka zawsze widoczna (bez przewijania całej strony).
    const on = tabsEl.querySelector('.tab.on');
    if (on) {
      const l = on.offsetLeft - tabsEl.offsetLeft;
      if (l < tabsEl.scrollLeft + 8) tabsEl.scrollLeft = Math.max(0, l - 24);
      else if (l + on.offsetWidth > tabsEl.scrollLeft + tabsEl.clientWidth - 8) tabsEl.scrollLeft = l + on.offsetWidth - tabsEl.clientWidth + 24;
    }
  }
  // Strona zostaje tam, gdzie była (przerysowanie podmienia cały widok i przeglądarka potrafi go podskoczyć).
  if (state.screen === lastScreen && !state.modal) window.scrollTo(0, winY);
  // Plan miasta: przy odświeżeniu zostaje przewinięty tam, gdzie był; za pierwszym razem pokazuje miejsce kradzieży.
  const wrap = app.querySelector('.town-wrap');
  const mapScroll = wrap && state.mapScrolls?.[wrap.dataset.scrollKey];
  if (wrap && mapScroll) [wrap.scrollLeft, wrap.scrollTop] = mapScroll;
  else if (wrap) {
    const pin = wrap.querySelector('.t-scene');
    if (pin) {
      const r = pin.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      wrap.scrollLeft += r.left + r.width / 2 - (w.left + w.width / 2);
      wrap.scrollTop += r.top + r.height / 2 - (w.top + w.height / 2);
    }
  }
  const modal = app.querySelector('.modal');
  if (state.modal && state.modal !== lastModal) {
    modal?.querySelector('h2')?.focus({ preventScroll: true });
  } else {
    if (modal && state.modal === lastModal) modal.scrollTop = state.modalTop ? 0 : modalScroll;
    state.modalTop = false;
    const target = findByKey(!state.modal && lastModal ? modalOpener : focusKey);
    if (target) {
      target.focus({ preventScroll: true });
      if (caret && typeof target.setSelectionRange === 'function' && target === document.activeElement) {
        try {
          target.setSelectionRange(caret[0], caret[1]);
        } catch {
          /* pole bez zaznaczenia */
        }
      }
    }
  }
  lastModal = state.modal;
  lastScreen = state.screen;
  if (state.focusResult && state.screen === 'result') {
    state.focusResult = false;
    document.getElementById('result-stamp')?.focus({ preventScroll: true });
  }
  if (state.screen === 'game' && progress?.startedAt && progress.status === 'playing') {
    timerHandle = setInterval(() => {
      const el = document.getElementById('clock');
      if (el) el.textContent = fmtClock(elapsedSec());
    }, 1000);
  }
}

function gotoCard(id) {
  const k = cardById(id);
  if (!myDesks().includes(k.desk)) {
    showToast(`Karta ${id} leży na biurku „${deskName(k.desk)}”. Ma ją gracz ${seatOfDesk(k.desk)}.`);
    return;
  }
  state.tab = 'evidence';
  if (state.deskFilter && state.deskFilter !== 'all' && state.deskFilter !== k.desk) state.deskFilter = k.desk;
  if (state.modal === 'compare') state.modal = null;
  render();
  const el = document.getElementById(`card-${id}`);
  if (el) {
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    el.classList.add('card-flash');
    setTimeout(() => el.classList.remove('card-flash'), 1600);
  }
}

app.addEventListener('click', (e) => {
  const target = e.target.closest('[data-act]');
  if (!target) return;
  const act = target.dataset.act;
  if (act === 'close-modal' && e.target.closest('[data-stop]') && !e.target.closest('.modal-close')) return;
  switch (act) {
    case 'home': openDaily(); break;
    case 'change-team': changeTeam(); break;
    case 'mode': startMode(target.dataset.mode); break;
    case 'back-intro': if (state.ref.type === 'daily') goHome(); else go('intro'); break;
    case 'size':
      state.teamSize = Number(target.dataset.n);
      if (state.seat > state.teamSize) state.seat = 1;
      render();
      break;
    case 'seat': state.seat = Number(target.dataset.n); render(); break;
    case 'copy-invite': copyText(inviteText(), 'Skopiowano wiadomość'); break;
    case 'team-start':
      store.set('seenHow', true);
      startTeam();
      break;
    case 'solo-start':
      startClock();
      store.set('seenHow', true);
      render();
      break;
    case 'leave':
      if (state.mode === 'live') { leaveRoom(); break; }
      saveProgress();
      if (state.ref.type === 'daily') goHome();
      else openDaily();
      break;
    case 'tab':
      state.tab = target.dataset.tab;
      state.confirm = null;
      render();
      window.scrollTo(0, 0);
      break;
    case 'goto-card': gotoCard(target.dataset.id); break;
    case 'map-pick': {
      const key = target.dataset.place;
      const sel = state.mapSel || [];
      if (sel.includes(key)) state.mapSel = sel.filter((x) => x !== key);
      else state.mapSel = sel.length >= 2 ? [key] : [...sel, key];
      render();
      break;
    }
    case 'map-clear': state.mapSel = []; render(); break;
    case 'plaque': showToast(target.dataset.info.replace(/ \| /g, ' · ')); break;
    case 'home-case': app.querySelector('.case-file .actions .btn')?.focus(); app.querySelector('.case-file')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'mark-sus': {
      const { id, v } = target.dataset;
      progress.sus[id] = progress.sus[id] === v ? '' : v;
      saveProgress();
      render();
      break;
    }
    case 'pin-card': {
      const id = target.dataset.id;
      const pins = progress.pins || [];
      progress.pins = pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id];
      saveProgress();
      if (progress.pins.includes(id)) showToast(`Karta ${id} jest na tablicy.`);
      render();
      break;
    }
    case 'board-pick': {
      const id = target.dataset.id;
      const sel = state.boardSel || [];
      state.boardSel = sel.includes(id) ? sel.filter((x) => x !== id) : sel.length >= 2 ? [id] : [...sel, id];
      render();
      break;
    }
    case 'board-clear': state.boardSel = []; render(); break;
    case 'board-view': state.tab = 'board'; state.boardView = target.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'desk-filter': state.deskFilter = target.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'compare-card': {
      const id = target.dataset.id;
      const list = state.compare || [];
      state.compare = list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-3);
      render();
      break;
    }
    case 'open-compare': state.modal = 'compare'; render(); break;
    case 'compare-clear': state.compare = []; render(); break;
    case 'aside-card': {
      const id = target.dataset.id;
      progress.aside = progress.aside || {};
      progress.aside[id] = !progress.aside[id];
      saveProgress();
      render();
      break;
    }
    case 'mark-card': {
      const id = target.dataset.id;
      progress.marks[id] = !progress.marks[id];
      saveProgress();
      render();
      break;
    }
    case 'unlock': {
      const k = cardById(target.dataset.id);
      const after = usedMin() + k.action.cost;
      if (overtimeSec(after) > overtimeSec() && state.confirm !== `unlock:${k.id}`) {
        state.confirm = `unlock:${k.id}`;
        render();
        break;
      }
      state.confirm = null;
      if (state.mode === 'live') {
        // Na żywo karta odpieczętowuje się dopiero, gdy serwer potwierdzi czynność.
        if (!state.live.conn.send({ t: 'unlock', card: k.id })) showToast('Brak połączenia z serwerem. Czynność nie została zlecona.');
        render();
        break;
      }
      progress.unlocked = { ...(progress.unlocked || {}), [k.id]: true };
      saveProgress();
      render();
      break;
    }
    case 'table':
      if (state.live?.conn.send({ t: 'table', card: target.dataset.id })) showToast(`Karta ${target.dataset.id} leży na stole.`);
      break;
    case 'untable':
      state.live?.conn.send({ t: 'untable', card: target.dataset.id });
      break;
    case 'live-create': createRoom(); break;
    case 'live-start':
      if (!state.live?.conn.send({ t: 'start' })) showToast('Brak połączenia z serwerem.');
      break;
    case 'copy-room':
      copyText(roomLink(), 'Skopiowano link do pokoju');
      break;
    case 'live-leave':
      leaveRoom();
      break;
    case 'live-reconnect':
      if (state.live) {
        state.live.error = '';
        state.live.conn.reconnect();
      }
      break;
    case 'copy-card': copyText(cardPlainText(cardById(target.dataset.id)), `Skopiowano kartę ${target.dataset.id}`); break;
    case 'open-hints': state.modal = 'hints'; state.confirm = null; render(); break;
    case 'open-accuse': state.modal = 'accuse'; render(); break;
    case 'open-end': state.modal = 'end'; state.confirm = null; render(); break;
    case 'close-modal': state.modal = null; state.confirm = null; render(); break;
    case 'hint':
      if (state.confirm !== 'hint') {
        state.confirm = 'hint';
        render();
        break;
      }
      state.confirm = null;
      if (state.mode === 'live') {
        if (!state.live.conn.send({ t: 'hint', n: progress.hints })) showToast('Brak połączenia z serwerem.');
        render();
        break;
      }
      progress.hints += 1;
      progress.penalty += CONFIG.hintPenalty;
      saveProgress();
      render();
      break;
    case 'pick-proof': state.accuse.proof = target.dataset.id; render(); break;
    case 'pick-forged': {
      state.accuse.forged = target.dataset.id;
      const kind = forgedKind(cardById(target.dataset.id));
      if (!(REASONS[kind] || []).some(([code]) => code === state.accuse.reason)) state.accuse.reason = null;
      render();
      break;
    }
    case 'pick-reason': state.accuse.reason = target.dataset.id; render(); break;
    case 'accuse': submitAccusation(); break;
    case 'reveal':
      if (state.confirm !== 'reveal') {
        state.confirm = 'reveal';
        render();
        break;
      }
      markSeen('reveal');
      finish('revealed');
      break;
    case 'copy-share': copyText(shareText(), 'Skopiowano wynik'); break;
    case 'toggle-all': state.showAll = !state.showAll; render(); break;
    case 'practice-new': {
      const code = randomPracticeCode();
      window.location.hash = `sprawa-${code}`;
      openPractice(code);
      break;
    }
    default: break;
  }
});

app.addEventListener('submit', (e) => {
  const logForm = e.target.closest('[data-act="live-log"]');
  if (logForm) {
    e.preventDefault();
    const text = (state.live?.draft || '').trim();
    if (text && state.live.conn.send({ t: 'log', text })) state.live.draft = '';
    render();
    return;
  }
  const form = e.target.closest('[data-act="practice-code"]');
  if (!form) return;
  e.preventDefault();
  const code = new FormData(form).get('code').toString().toUpperCase().replace(/\s+/g, '').replace(/^.*#?SPRAWA-/, '').replace(/^#/, '');
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    showToast('Kod ma 4 znaki: litery i cyfry.');
    return;
  }
  window.location.hash = `sprawa-${code}`;
  openPractice(code);
});

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset?.act === 'live-name') {
    const name = el.value.trim().slice(0, 24);
    store.set('name', name);
    state.live?.conn.send({ t: 'name', name });
    return;
  }
  if (el.dataset?.act === 'alibi') {
    state.accuse.alibis[el.dataset.id] = el.value;
    render();
  }
});

app.addEventListener('input', (e) => {
  if (e.target.dataset.act === 'live-draft' && state.live) state.live.draft = e.target.value;
  if (e.target.dataset.act === 'live-name') store.set('name', e.target.value.slice(0, 24));
  if (e.target.dataset.act === 'notes' && progress) {
    progress.notes = e.target.value;
    saveProgress();
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('g[data-act]')) {
    e.preventDefault();
    const place = e.target.dataset.place;
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    app.querySelector(`g[data-place="${place}"]`)?.focus();
    return;
  }
  if (e.key === 'Escape' && state.modal) {
    state.modal = null;
    state.confirm = null;
    render();
    return;
  }
  if (e.key === 'Tab' && state.modal) {
    const modal = app.querySelector('.modal');
    const items = [...modal.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!modal.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// Po powrocie do karty (np. następnego dnia) pokaż aktualną sprawę dnia.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.ref || state.ref.type !== 'daily') return;
  if (state.ref.date !== localTodayIso() && ['home', 'result'].includes(state.screen)) openDaily();
});

function routeFromHash(resume = false) {
  const m = window.location.hash.match(/^#sprawa-([A-Za-z0-9]{4})$/);
  if (m) {
    openPractice(m[1].toUpperCase(), { resume });
    return true;
  }
  const r = window.location.hash.match(/^#pokoj-([A-Za-z2-9]{4,8})$/);
  if (r) {
    openRoom(r[1].toUpperCase(), false);
    return true;
  }
  // Link z datą (np. z zaproszenia wysłanego tuż przed północą) daje wszystkim tę samą sprawę dnia.
  const d = window.location.hash.match(/^#dzien-(\d{4}-\d{2}-\d{2})$/);
  if (d) {
    const iso = d[1];
    const valid = addDays(iso, 0) === iso && iso >= FIRST_CASE && iso <= addDays(localTodayIso(), 1);
    if (!valid) showToast('Ta sprawa jest niedostępna. Pokazujemy dzisiejszą.');
    openDaily({ resume, date: valid ? iso : null });
    return true;
  }
  return false;
}

window.addEventListener('resize', () => {
  const head = app.querySelector('.sticky-head');
  if (head) document.documentElement.style.setProperty('--head-h', `${head.offsetHeight}px`);
});

window.addEventListener('hashchange', () => {
  if (state.live && window.location.hash !== `#pokoj-${state.live.room}` && !/^#pokoj-/.test(window.location.hash) && !window.location.hash) {
    leaveRoom();
    return;
  }
  if (!routeFromHash() && !window.location.hash && (state.ref?.type === 'practice' || isArchive())) openDaily();
});

detectLive();
if (!routeFromHash(true)) openDaily({ resume: true });

// Do testów w konsoli przeglądarki.
window.__falszyweAlibi = { state, get progress() { return progress; } };
