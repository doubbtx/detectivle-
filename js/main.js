// Interfejs gry „Fałszywe Alibi”. Czysty JavaScript, bez bibliotek.

import { buildDailyCase, buildPracticeCase, randomPracticeCode, DIFFICULTY_LABELS } from './generator.js';
import { solveCase } from './solver.js';
import { TEAM_DESKS, RULES, DESK_DEFS } from './data.js';
import { fmt, localTodayIso, addDays } from './time.js';
import { store } from './storage.js';
import { CONFIG } from './config.js';

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
  accuse: { forged: null, proof: null, last: null },
  confirm: null,
  showAll: false,
  toast: '',
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
const isCaptain = () => state.mode === 'solo' || state.seat === 1;

function loadCase(ref) {
  state.ref = ref;
  state.c = ref.type === 'daily' ? buildDailyCase(ref.date) : buildPracticeCase(ref.code);
  state.sol = solveCase(state.c);
  resetCaseUi();
}

function resetCaseUi() {
  state.accuse = { forged: null, proof: null, last: null };
  state.showAll = false;
  state.tab = 'akta';
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

/** Ostatnio używane ustawienie ekipy dla tej sprawy: { size, seat }. */
function lastTeam(ref = state.ref) {
  return store.get(`lastTeam:${caseKey(ref)}`);
}

function savedProgress(mode, ref = state.ref) {
  if (mode === 'solo') return store.get(progressKey('solo', ref));
  const lt = lastTeam(ref);
  return lt ? store.get(progressKey('team', ref, lt.size, lt.seat)) : null;
}

function freshProgress() {
  return {
    startedAt: null, endedAt: null, penalty: 0, hints: 0, attempts: [],
    status: 'playing', marks: {}, sus: {}, notes: '', teamSize: state.teamSize, seat: state.seat,
  };
}

function saveProgress() {
  if (progress) store.set(progressKey(), progress);
}

function elapsedSec() {
  if (!progress?.startedAt) return 0;
  const end = progress.endedAt ?? Date.now();
  return Math.max(0, Math.floor((end - progress.startedAt) / 1000)) + progress.penalty;
}

function fmtClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtPenalty(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
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

function recordResult(solved) {
  if (state.ref.type !== 'daily') return;
  const mode = state.mode;
  const st = getStats(mode);
  if (st.lastPlayed === state.ref.date) return;
  st.played += 1;
  st.lastPlayed = state.ref.date;
  if (solved) {
    st.solved += 1;
    st.streak = st.last === addDays(state.ref.date, -1) ? st.streak + 1 : 1;
    st.last = state.ref.date;
    st.best = Math.max(st.best, st.streak);
    const t = elapsedSec();
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
  if (!/^#sprawa-/.test(window.location.hash)) return;
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    window.location.hash = '';
  }
}

/** Otwiera sprawę dnia. Przy pierwszym wejściu wraca od razu do rozpoczętej gry. */
function openDaily({ resume = false } = {}) {
  clearPracticeHash();
  loadCase({ type: 'daily', date: localTodayIso() });
  if (resume && tryResume()) return;
  go('home');
}

function openPractice(code, { resume = false } = {}) {
  loadCase({ type: 'practice', code });
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
  const saved = store.get(progressKey('team'));
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
  const label = c.kind === 'daily' ? `Sprawa nr ${c.number}` : `Trening · kod ${c.code}`;
  return `
    <div class="file-tab">${esc(label)}</div>
    <h1 class="case-title">${esc(c.title)}</h1>
    <p class="case-meta">Data kradzieży: ${esc(c.crimeDate.label)}</p>
    <p class="case-meta">Trudność ${difficultyDots(c.difficulty)} ${esc(DIFFICULTY_LABELS[c.difficulty])}</p>`;
}

function playedLine(mode) {
  const p = savedProgress(mode);
  if (!p) return '';
  const label = mode === 'solo' ? 'Solo' : `Z ekipą (gracz ${p.seat} z ${p.teamSize})`;
  const change = mode === 'team' ? ` <button class="link-btn" data-act="change-team">Zmień ekipę lub numer</button>` : '';
  let text = '';
  if (p.status === 'solved') text = `rozwiązana w ${fmtClock(Math.floor((p.endedAt - p.startedAt) / 1000) + p.penalty)}`;
  else if (p.status === 'failed') text = 'nierozwiązana';
  else if (p.status === 'revealed') text = 'rozwiązanie odsłonięte';
  else if (p.startedAt) text = `w toku · <button class="link-btn" data-act="mode" data-mode="${mode}">Wróć do gry</button>`;
  else return '';
  return `<li><b>${label}:</b> ${text}${change}</li>`;
}

function renderHow() {
  return `
  <details class="how" ${store.get('seenHow') ? '' : 'open'}>
    <summary>Jak grać</summary>
    <ol class="how-list">
      <li>Pięcioro podejrzanych ma alibi. Jedno z nich jest fałszywe: sprawca dostarczył <b>dokładnie jeden sfałszowany dowód</b>.</li>
      <li>Dowody leżą na pięciu biurkach: Dokumenty, Świadkowie, Mapa i rozkłady, Zdjęcia, Rejestry. Fałszywkę zawsze obala karta z <b>innego</b> biurka.</li>
      <li>Liczcie czasy. Jeśli kogoś widziano o 19:40 w teatrze, a z teatru na miejsce zbrodni najszybciej dociera się w 25 minut, to nie mógł być w środku o 19:52.</li>
      <li>Oskarżenie to dwie karty: <b>sfałszowany dowód</b> i <b>karta, która go obala</b>. Kto dostarczył fałszywkę, ten jest sprawcą. Masz ${CONFIG.maxAttempts} próby, każda pomyłka to +${fmtPenalty(CONFIG.wrongPenalty)}, a podpowiedź +${fmtPenalty(CONFIG.hintPenalty)}.</li>
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
        <button class="btn btn-primary" data-act="mode" data-mode="team">Graj z ekipą <small>2–5 osób</small></button>
        <button class="btn" data-act="mode" data-mode="solo">Graj solo</button>
      </div>
      ${lines ? `<ul class="played">${lines}</ul>` : ''}
    </section>
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
        <button class="btn btn-primary" data-act="mode" data-mode="team">Graj z ekipą <small>2–5 osób</small></button>
        <button class="btn" data-act="mode" data-mode="solo">Graj solo</button>
      </div>
      ${[playedLine('solo'), playedLine('team')].join('') ? `<ul class="played">${playedLine('solo')}${playedLine('team')}</ul>` : ''}
      <p class="muted">Podaj znajomym kod <b class="code">${esc(state.c.code)}</b>, żeby dostali tę samą sprawę.</p>
    </section>
  </div>`;
}

function inviteText() {
  const c = state.c;
  const what = c.kind === 'daily' ? `sprawę dnia nr ${c.number}` : `sprawę treningową z kodem ${c.code}`;
  const seats = Array.from({ length: state.teamSize }, (_, i) => i + 1).filter((n) => n !== state.seat).join(', ');
  const url = CONFIG.shareUrl ? ` ${CONFIG.shareUrl}${c.kind === 'practice' ? `#sprawa-${c.code}` : ''}` : '';
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
      <p class="fingerprint">Sprawdźcie, czy wszyscy macie tę samą sprawę: <b>${esc(state.c.kind === 'daily' ? `nr ${state.c.number}` : `kod ${state.c.code}`)}</b>, podejrzani: ${esc(state.c.suspects.map((x) => `${x.first[0]}. ${x.full.split(' ').slice(1).join(' ')}`).join(', '))}.</p>
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
      <span class="avatar" aria-hidden="true">${esc(initials(s.full))}</span>
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
  const team = state.mode === 'team';
  return `
  <section class="akta" aria-label="Akta sprawy">
    <div class="akta-head">
      <h2 class="akta-title">${esc(c.title)}</h2>
      <p class="intro">${esc(c.intro)}</p>
      <div class="window" aria-label="Drzwi były otwarte od ${fmt(c.window.from)} do ${fmt(c.window.to)}">
        <div><span class="w-label">otwarcie</span><span class="w-time">${fmt(c.window.from)}</span></div>
        <div class="w-line" aria-hidden="true"></div>
        <div><span class="w-label">zamknięcie</span><span class="w-time">${fmt(c.window.to)}</span></div>
      </div>
      <p class="w-note">Sprawca był w środku przez cały ten czas (${c.window.to - c.window.from} min).</p>
    </div>
    <h3 class="sec-label">Podejrzani i ich alibi</h3>
    <ul class="suspects">${renderSuspects()}</ul>
    ${team ? `<p class="muted small">Szare kody to karty z biurek innych graczy. Kliknij kod, żeby sprawdzić, kto ma tę kartę.</p>` : ''}
    <details class="rules" open>
      <summary>Zasady śledztwa</summary>
      <ol>${RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
    </details>
  </section>`;
}

function renderCard(k, opts = {}) {
  const by = k.by ? suspectById(k.by) : null;
  const marked = progress?.marks?.[k.id];
  const kindLabel = k.kind === 'witness' ? 'zeznanie' : k.kind === 'supplied' ? 'od podejrzanego' : 'urzędowe';
  return `
  <article class="card card-${k.kind}${marked ? ' card-marked' : ''}${opts.highlight ? ' card-hl' : ''}" id="card-${k.id}" data-card="${k.id}">
    <header class="card-head">
      <span class="card-id">${k.id}</span>
      <div class="card-titles">
        <h4>${esc(k.title)}</h4>
        ${k.sub ? `<p class="card-sub">${esc(k.sub)}</p>` : ''}
      </div>
      <span class="card-kind">${kindLabel}</span>
    </header>
    ${by ? `<p class="stamp">${by.f ? 'Dostarczyła' : 'Dostarczył'}: ${esc(by.full)}</p>` : ''}
    <div class="card-lines">${k.lines.map((l) => `<p>${esc(l).replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2')}</p>`).join('')}</div>
    ${opts.noActions ? '' : `
    <footer class="card-foot">
      <button class="link-btn" data-act="mark-card" data-id="${k.id}" aria-pressed="${Boolean(marked)}">${marked ? '★ Zaznaczona' : '☆ Zaznacz'}</button>
      <button class="link-btn" data-act="copy-card" data-id="${k.id}">Kopiuj</button>
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

function renderNotes() {
  return `
  <section class="notes-panel" aria-label="Notatki">
    <h2>Notatki</h2>
    <p class="muted small">Zapisują się tylko na tym urządzeniu.</p>
    <label class="sr-only" for="notes">Notatki</label>
    <textarea id="notes" data-act="notes" rows="12" placeholder="np. Halina: teatr 19:40 + 25 min → czysta">${esc(progress.notes)}</textarea>
    <h3 class="sec-label">Zaznaczone karty</h3>
    <div class="cards">${state.c.cards.filter((k) => progress.marks[k.id] && myDesks().includes(k.desk)).map((k) => renderCard(k)).join('') || '<p class="muted small">Nic jeszcze nie zaznaczono. Użyj „☆ Zaznacz” na karcie.</p>'}</div>
  </section>`;
}

function renderTopbar() {
  const c = state.c;
  const label = c.kind === 'daily' ? `Sprawa nr ${c.number}` : `Trening ${c.code}`;
  const who = state.mode === 'solo' ? 'solo' : `gracz ${state.seat} z ${state.teamSize}`;
  const left = CONFIG.maxAttempts - progress.attempts.length;
  return `
  <div class="topbar">
    <div class="topbar-inner">
      <button class="btn btn-ghost btn-icon" data-act="leave" aria-label="Wyjdź do strony głównej">←</button>
      <div class="tb-title"><b>${esc(label)}</b><span>${esc(who)}</span></div>
      <div class="tb-clock" aria-live="off"><span id="clock">${fmtClock(elapsedSec())}</span>${progress.penalty ? `<small>w tym +${fmtPenalty(progress.penalty)}</small>` : ''}</div>
      <div class="tb-actions">
        <button class="btn btn-small" data-act="open-hints">Podpowiedź <span class="pill">${progress.hints}/3</span></button>
        ${isCaptain()
          ? `<button class="btn btn-small btn-primary" data-act="open-accuse">Oskarż <span class="pill">${left}</span></button>`
          : `<button class="btn btn-small" data-act="open-end">Koniec</button>`}
      </div>
    </div>
  </div>`;
}

function renderTabs() {
  const tabs = [{ id: 'akta', label: 'Akta' }, ...myDesks().map((d) => ({ id: d, label: deskName(d) })), { id: 'notes', label: 'Notatki' }];
  return `
  <nav class="tabs" aria-label="Biurka">
    <div class="tabs-inner">
      ${tabs.map((t) => `<button class="tab${state.tab === t.id ? ' on' : ''}${t.id === 'akta' ? ' tab-akta' : ''}" data-act="tab" data-tab="${t.id}" aria-current="${state.tab === t.id ? 'page' : 'false'}">${esc(t.label)}${['akta', 'notes'].includes(t.id) ? '' : ` <span class="tab-n">${state.c.cards.filter((k) => k.desk === t.id).length}</span>`}</button>`).join('')}
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
  let right = state.tab;
  if (right === 'akta') right = mine[0];
  const rightHtml = right === 'notes' ? renderNotes() : renderDesk(right);
  return `
  <div class="sticky-head">${renderTopbar()}${renderTabs()}</div>
  <div class="game view-${state.tab === 'akta' ? 'akta' : 'other'}">
    <div class="col-left">${renderAkta()}</div>
    <div class="col-right">${rightHtml}</div>
  </div>
  ${renderModal()}`;
}

// ---------------------------------------------------------------------------
// Podpowiedzi, oskarżenie

function hintTexts() {
  const sol = state.sol;
  const out = [];
  const neutral = Object.entries(sol.explain.suspects).find(([, items]) => items.some((i) => i.type === 'neutral'));
  if (neutral) {
    const [id, items] = neutral;
    const it = items.find((i) => i.type === 'neutral');
    out.push(`${suspectById(id).full} ma alibi potwierdzone przez niezależne źródło. Zobacz karty ${it.refs.slice(0, -1).join(', ')} i ${it.refs[it.refs.length - 1]}.`);
  } else {
    out.push(`${state.mode === 'team' ? 'Zacznijcie' : 'Zacznij'} od czasów dotarcia na biurku „Mapa i rozkłady”.`);
  }
  const forged = sol.explain.forged;
  const refDesk = cardById(forged.refs.find((r) => r !== forged.card))?.desk;
  out.push(`Fałszywkę obala karta z biurka „${deskName(refDesk)}”.${state.mode === 'team' ? ` Ma je gracz ${seatOfDesk(refDesk)}.` : ''}`);
  const keyRef = forged.refs.find((r) => r !== forged.card);
  out.push(`${state.mode === 'team' ? 'Porównajcie' : 'Porównaj'} dokładnie kartę ${keyRef} z dowodami dostarczonymi przez podejrzanych.`);
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
    const sq = (v) => (v === null ? 'skip' : v ? 'ok' : 'bad');
    const tried = progress.attempts.some((t) => t.forged === a.forged && t.proof === a.proof);
    body = `
      <h2 tabindex="-1">Oskarżenie</h2>
      <p class="muted small">Pozostałe próby: ${left}. Pomyłka dodaje ${fmtPenalty(CONFIG.wrongPenalty)} do czasu.</p>
      ${a.last ? `<p class="feedback" role="status"><span class="fb"><span class="sq ${sq(a.last[0])}"></span> fałszywka: ${a.last[0] ? 'trafiona' : 'pudło'}</span> <span class="fb"><span class="sq ${sq(a.last[1])}"></span> obalenie: ${a.last[1] === null ? 'nie sprawdzono' : a.last[1] ? 'trafione' : 'pudło'}</span></p>` : ''}
      ${progress.attempts.length ? `<div class="history"><span class="history-label">Wcześniejsze próby:</span> ${progress.attempts.map((t) => `<span class="fb"><span class="chip">${t.forged}</span> + <span class="chip">${t.proof}</span> <span class="sq ${sq(t.ok[0])}"></span><span class="sq ${sq(t.ok[1])}"></span></span>`).join(' ')}</div>` : ''}
      <fieldset class="pick">
        <legend>1. Który dowód jest sfałszowany?</legend>
        <div class="pick-list">
          ${supplied.map((k) => `<button class="pick-btn pick-row${a.forged === k.id ? ' on' : ''}" data-act="pick-forged" data-id="${k.id}" aria-pressed="${a.forged === k.id}"><span class="chip">${k.id}</span> <span class="pick-main">${esc(k.title)}<span class="pick-sub">${esc(suspectById(k.by).full)}</span></span></button>`).join('')}
        </div>
      </fieldset>
      <fieldset class="pick">
        <legend>2. Która karta to udowadnia?</legend>
        ${state.mode === 'team' ? '<p class="muted small">Kody kart z innych biurek podają ci pozostali gracze.</p>' : ''}
        <div class="proof-grid">
          ${DESK_DEFS.map((d) => {
            const ids = state.c.cards.filter((k) => k.desk === d.id && k.kind !== 'supplied');
            if (!ids.length) return '';
            return `<div class="proof-row"><span class="proof-desk">${esc(d.name)}</span><div class="proof-chips">${ids.map((k) => `<button class="proof-chip${a.proof === k.id ? ' on' : ''}" data-act="pick-proof" data-id="${k.id}" aria-pressed="${a.proof === k.id}" ${mine.includes(k.desk) ? `title="${esc(k.title)}"` : ''}>${k.id}</button>`).join('')}</div></div>`;
          }).join('')}
        </div>
        ${proofCard ? `<p class="small">Wybrana karta: <span class="chip">${proofCard.id}</span> ${mine.includes(proofCard.desk) ? esc(proofCard.title) : `z biurka „${esc(deskName(proofCard.desk))}”`}</p>` : ''}
      </fieldset>
      ${accused ? `<p class="accused">Oskarżasz: <b>${esc(accused.full)}</b></p>` : ''}
      ${tried ? '<p class="small muted">Ta para kart była już sprawdzona. Wybierz inną.</p>' : ''}
      <button class="btn btn-primary btn-wide" data-act="accuse" ${a.forged && a.proof && !tried ? '' : 'disabled'}>Oskarżam</button>`;
  }
  if (state.modal === 'end') {
    const confirming = state.confirm === 'reveal';
    body = `
      <h2 tabindex="-1">Koniec śledztwa</h2>
      <p>Oskarżenie składa kapitan, czyli gracz 1. Kiedy zamknie sprawę, możesz tu zobaczyć rozwiązanie i wszystkie karty.</p>
      <button class="btn ${confirming ? 'btn-primary' : ''}" data-act="reveal">${confirming ? 'Na pewno? To odsłoni rozwiązanie' : 'Pokaż rozwiązanie'}</button>`;
  }
  return `
  <div class="overlay" data-act="close-modal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="${({ hints: 'Podpowiedzi', accuse: 'Oskarżenie', end: 'Koniec śledztwa' })[state.modal]}" data-stop>
      <button class="btn btn-ghost btn-icon modal-close" data-act="close-modal" aria-label="Zamknij">✕</button>
      ${body}
    </div>
  </div>`;
}

function proofSet() {
  const f = state.sol.explain.forged;
  return new Set(f.refs.filter((r) => r !== f.card));
}

function submitAccusation() {
  const a = state.accuse;
  // Po pomyłce karta-obalenie jest czyszczona, więc podwójne kliknięcie nie wyśle drugiej próby.
  if (!a.forged || !a.proof || progress.status !== 'playing') return;
  if (progress.attempts.some((t) => t.forged === a.forged && t.proof === a.proof)) return;
  const sol = state.c.solution;
  const forgedOk = a.forged === sol.forged;
  const ok = [forgedOk, forgedOk ? proofSet().has(a.proof) : null];
  progress.attempts.push({ forged: a.forged, proof: a.proof, ok });
  a.last = ok;
  if (ok[0] && ok[1]) return finish('solved');
  progress.penalty += CONFIG.wrongPenalty;
  a.proof = null;
  saveProgress();
  if (progress.attempts.length >= CONFIG.maxAttempts) return finish('failed');
  render();
}

// ---------------------------------------------------------------------------
// Wynik

function shareText() {
  const c = state.c;
  const head = c.kind === 'daily' ? `Fałszywe Alibi nr ${c.number}` : `Fałszywe Alibi · trening ${c.code}`;
  const mode = state.mode === 'solo' ? 'solo' : `ekipa · ${state.teamSize} ${state.teamSize === 5 ? 'osób' : 'osoby'}`;
  const rows = progress.attempts.map((a) => a.ok.map((x) => (x === null ? '⬜' : x ? '🟩' : '🟥')).join('')).join('\n');
  const tail = progress.status === 'solved'
    ? `⏱ ${fmtClock(elapsedSec())} · 💡 ${progress.hints}`
    : 'Sprawa nierozwiązana';
  return [`${head} · ${mode}`, rows, tail, CONFIG.shareUrl].filter(Boolean).join('\n');
}

/** Ile zostało do następnej sprawy dnia (liczone od daty sprawy na ekranie). */
function msToNextCase() {
  const [y, m, d] = state.ref.date.split('-').map(Number);
  return new Date(y, m - 1, d + 1) - new Date();
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
      <p class="big-stamp ${solved ? 'ok' : revealed ? 'neutral' : 'bad'}">${stampText}</p>
      <h1 class="case-title">${esc(c.title)}</h1>
      ${revealed ? '<p class="muted">Wynik ekipy podaje kapitan.</p>' : `
      <dl class="result-stats">
        <div><dt>Czas</dt><dd>${solved ? fmtClock(elapsedSec()) : '–'}</dd></div>
        <div><dt>Próby</dt><dd>${progress.attempts.length}/${CONFIG.maxAttempts}</dd></div>
        <div><dt>Podpowiedzi</dt><dd>${progress.hints}</dd></div>
        <div><dt>Kary</dt><dd>+${fmtPenalty(progress.penalty)}</dd></div>
      </dl>
      <div class="share">
        <label for="share-text">Wynik dla znajomych (bez spoilerów)</label>
        <textarea id="share-text" readonly rows="5">${esc(shareText())}</textarea>
        <button class="btn btn-primary" data-act="copy-share">Kopiuj wynik</button>
      </div>`}
      ${c.kind === 'daily' ? (nextIn > 0 ? `<p class="muted">Następna sprawa za ${hh} h ${mm} min.</p>` : '<p><button class="btn" data-act="home">Nowa sprawa dnia już czeka</button></p>') : ''}
    </section>
    <section class="solution">
      <h2>Rozwiązanie</h2>
      <p class="verdict">${culprit.f ? 'Sprawczynią' : 'Sprawcą'} jest <b>${esc(culprit.full)}</b> (${esc(culprit.role)}). Sfałszowany dowód to <span class="chip">${forged.id}</span> ${esc(forged.title)}, a obala go ${[...proofSet()].map((r) => `<span class="chip">${r}</span>`).join(' lub ')}.</p>
      <p>Dlaczego: ${refsHtml(sol.explain.forged.reason)}.</p>
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
// Render i zdarzenia

let lastModal = null;
let modalOpener = null;

function focusKeyOf(el) {
  if (!el || !el.dataset || !el.dataset.act) return null;
  const d = el.dataset;
  return [d.act, d.id || '', d.tab || '', d.n || '', d.mode || '', d.v || ''].join('|');
}

function findByKey(key) {
  if (!key) return null;
  const [act, id, tab, n, mode, v] = key.split('|');
  return [...app.querySelectorAll(`[data-act="${act}"]`)].find((el) => (el.dataset.id || '') === id && (el.dataset.tab || '') === tab && (el.dataset.n || '') === n && (el.dataset.mode || '') === mode && (el.dataset.v || '') === v) || null;
}

function render() {
  clearInterval(timerHandle);
  const active = document.activeElement;
  const focusKey = app.contains(active) ? focusKeyOf(active) : null;
  const modalScroll = app.querySelector('.modal')?.scrollTop ?? 0;
  if (state.modal && !lastModal) modalOpener = focusKey;
  let html = '';
  switch (state.screen) {
    case 'home': html = renderHome(); break;
    case 'intro': html = renderIntro(); break;
    case 'setup': html = renderSetup(); break;
    case 'game': html = renderGame(); break;
    case 'result': html = renderResult(); break;
    default: html = renderHome();
  }
  app.innerHTML = `${html}<div id="toast" class="toast" role="status" ${state.toast ? '' : 'hidden'}>${esc(state.toast)}</div>`;
  document.body.classList.toggle('in-game', state.screen === 'game');
  const head = app.querySelector('.sticky-head');
  if (head) document.documentElement.style.setProperty('--head-h', `${head.offsetHeight}px`);
  const modal = app.querySelector('.modal');
  if (state.modal && state.modal !== lastModal) {
    modal?.querySelector('h2')?.focus({ preventScroll: true });
  } else {
    if (modal && state.modal === lastModal) modal.scrollTop = modalScroll;
    const target = findByKey(!state.modal && lastModal ? modalOpener : focusKey);
    if (target) target.focus({ preventScroll: true });
  }
  lastModal = state.modal;
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
  state.tab = k.desk;
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
      saveProgress();
      if (state.ref.type === 'daily') goHome();
      else openDaily();
      break;
    case 'tab':
      state.tab = target.dataset.tab;
      render();
      window.scrollTo(0, 0);
      break;
    case 'goto-card': gotoCard(target.dataset.id); break;
    case 'mark-sus': {
      const { id, v } = target.dataset;
      progress.sus[id] = progress.sus[id] === v ? '' : v;
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
      progress.hints += 1;
      progress.penalty += CONFIG.hintPenalty;
      saveProgress();
      render();
      break;
    case 'pick-proof': state.accuse.proof = target.dataset.id; render(); break;
    case 'pick-forged': state.accuse.forged = target.dataset.id; render(); break;
    case 'accuse': submitAccusation(); break;
    case 'reveal':
      if (state.confirm !== 'reveal') {
        state.confirm = 'reveal';
        render();
        break;
      }
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

app.addEventListener('input', (e) => {
  if (e.target.dataset.act === 'notes' && progress) {
    progress.notes = e.target.value;
    saveProgress();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.modal) {
    state.modal = null;
    state.confirm = null;
    render();
    return;
  }
  if (e.key === 'Tab' && state.modal) {
    const modal = app.querySelector('.modal');
    const items = [...modal.querySelectorAll('button:not([disabled]), [href], input, textarea, [tabindex]:not([tabindex="-1"])')];
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
  return false;
}

window.addEventListener('resize', () => {
  const head = app.querySelector('.sticky-head');
  if (head) document.documentElement.style.setProperty('--head-h', `${head.offsetHeight}px`);
});

window.addEventListener('hashchange', () => {
  if (!routeFromHash() && state.ref?.type === 'practice' && !window.location.hash) openDaily();
});

if (!routeFromHash(true)) openDaily({ resume: true });

// Do testów w konsoli przeglądarki.
window.__falszyweAlibi = { state, get progress() { return progress; } };
