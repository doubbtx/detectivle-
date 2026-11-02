// Logika pokoju gry na żywo. Czysty JavaScript bez zależności: ten sam kod działa
// w serwerze Node (server/node-server.mjs), w Cloudflare Durable Object (server/worker.js)
// i w testach. Serwer trzyma stan i rozsyła go po każdej zmianie; sprawę (karty,
// rozwiązanie) każda przeglądarka ma u siebie, więc serwer tylko porządkuje ruchy.
//
// Protokół (JSON przez WebSocket):
//   klient → serwer:
//     { t: 'hello', clientId, name, caseRef?, fingerprint? }   wejście do pokoju (pierwszy ustala sprawę)
//     { t: 'name', name }
//     { t: 'start' }                                           start: miejsca wg kolejności wejścia
//     { t: 'table', card } / { t: 'untable', card }            połóż kartę na wspólny stół / zdejmij
//     { t: 'unlock', card }                                    zleć czynność (odpieczętuj kartę)
//     { t: 'log', text }                                       ustalenie na wspólnej tablicy
//     { t: 'hint' }                                            wspólna podpowiedź (+2:00)
//     { t: 'accuse', forged, proof, reason, alibis, ok, report } wspólny raport (ocenia przeglądarka)
//     { t: 'ping' }
//   serwer → klient:
//     { t: 'state', state, you, now }   pełny stan pokoju, id gracza i czas serwera (do zegara)
//     { t: 'error', msg }
//     { t: 'pong', now }

export const ROOM_VERSION = 1;
export const MAX_PLAYERS = 5;
export const MIN_PLAYERS = 2;
export const MAX_ATTEMPTS = 3;
export const HINT_PENALTY = 120;
export const WRONG_PENALTY = 300;
export const MAX_HINTS = 3;
export const MAX_LOG = 100;
export const ROOM_TTL_MS = 24 * 3600 * 1000;

const CARD_RE = /^[DSMZR]\d{1,2}$/;
const ROOM_RE = /^[A-Z2-9]{4,8}$/;
const CLIENT_RE = /^[A-Za-z0-9_-]{6,40}$/;

export const isRoomCode = (code) => ROOM_RE.test(String(code || ''));

function cleanName(name, fallback = 'Detektyw') {
  // Tekst jest zawsze wyświetlany jako tekst (escape po stronie klienta), więc usuwamy tylko znaki sterujące.
  const n = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
  return n || fallback;
}

function cleanCaseRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  if (ref.type === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(ref.date)) return { type: 'daily', date: ref.date };
  if (ref.type === 'practice' && /^[A-Z0-9]{4}$/.test(ref.code)) return { type: 'practice', code: ref.code };
  return null;
}

export function newRoom(code, now) {
  return {
    v: ROOM_VERSION,
    code,
    createdAt: now,
    updatedAt: now,
    caseRef: null,
    fingerprint: null,
    hostId: null,
    players: [],
    teamSize: null,
    status: 'lobby',
    startedAt: null,
    endedAt: null,
    table: [],
    unlocked: {},
    log: [],
    hints: 0,
    penalty: 0,
    attempts: [],
    report: null,
  };
}

const clone = (s) => JSON.parse(JSON.stringify(s));
const player = (s, id) => s.players.find((p) => p.id === id);

/** Gracz łączy się (albo wraca po zerwaniu połączenia). */
export function connect(state, clientId, msg, now) {
  if (!CLIENT_RE.test(String(clientId || ''))) return { state, error: 'Nieprawidłowy identyfikator gracza.' };
  const s = clone(state);
  let p = player(s, clientId);
  if (!p) {
    if (s.status !== 'lobby') return { state, error: 'Śledztwo już trwa. Do pokoju nie można dołączyć w trakcie.' };
    if (s.players.length >= MAX_PLAYERS) return { state, error: 'Pokój jest pełny (najwyżej 5 osób).' };
    p = { id: clientId, name: cleanName(msg.name, `Detektyw ${s.players.length + 1}`), seat: null, online: true, joinedAt: now };
    s.players.push(p);
  } else {
    p.online = true;
    if (msg.name) p.name = cleanName(msg.name);
  }
  if (!s.hostId) s.hostId = clientId;
  if (!s.caseRef) {
    const ref = cleanCaseRef(msg.caseRef);
    if (ref) {
      s.caseRef = ref;
      s.fingerprint = typeof msg.fingerprint === 'string' ? msg.fingerprint.slice(0, 8) : null;
    }
  }
  s.updatedAt = now;
  return { state: s };
}

export function disconnect(state, clientId, now) {
  const s = clone(state);
  const p = player(s, clientId);
  if (!p) return { state };
  if (s.status === 'lobby') {
    s.players = s.players.filter((x) => x.id !== clientId);
    if (s.hostId === clientId) s.hostId = s.players[0]?.id ?? null;
  } else {
    p.online = false;
  }
  s.updatedAt = now;
  return { state: s };
}

/** Zastosuj wiadomość gracza. Zwraca { state } albo { state, error }. */
export function reduce(state, clientId, msg, now) {
  const p = player(state, clientId);
  if (!p) return { state, error: 'Najpierw wejdź do pokoju.' };
  if (!msg || typeof msg !== 'object') return { state, error: 'Nieprawidłowa wiadomość.' };
  const s = clone(state);
  const me = player(s, clientId);
  const playing = s.status === 'playing';
  const fail = (error) => ({ state, error });
  switch (msg.t) {
    case 'name':
      me.name = cleanName(msg.name);
      break;
    case 'start': {
      if (s.status !== 'lobby') return fail('Śledztwo już się zaczęło.');
      if (!s.caseRef) return fail('Pokój nie ma jeszcze sprawy.');
      const online = s.players.filter((x) => x.online);
      if (online.length < MIN_PLAYERS) return fail('Potrzeba co najmniej 2 osób.');
      s.players = online;
      s.players.forEach((x, i) => { x.seat = i + 1; });
      s.teamSize = s.players.length;
      s.status = 'playing';
      s.startedAt = now;
      s.log.push({ by: null, text: `Śledztwo rozpoczęte: ${s.teamSize} detektywów.`, at: now });
      break;
    }
    case 'table': {
      if (!playing) return fail('Śledztwo nie trwa.');
      if (!CARD_RE.test(msg.card)) return fail('Nieprawidłowa karta.');
      if (!s.table.some((x) => x.card === msg.card)) s.table.push({ card: msg.card, by: clientId, at: now });
      break;
    }
    case 'untable':
      if (!playing) return fail('Śledztwo nie trwa.');
      s.table = s.table.filter((x) => x.card !== msg.card);
      break;
    case 'unlock':
      if (!playing) return fail('Śledztwo nie trwa.');
      if (!CARD_RE.test(msg.card)) return fail('Nieprawidłowa karta.');
      if (!s.unlocked[msg.card]) s.unlocked[msg.card] = clientId;
      break;
    case 'log': {
      if (!playing) return fail('Śledztwo nie trwa.');
      const text = String(msg.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 280);
      if (!text) return fail('Puste ustalenie.');
      s.log.push({ by: clientId, text, at: now });
      if (s.log.length > MAX_LOG) s.log = s.log.slice(-MAX_LOG);
      break;
    }
    case 'hint':
      if (!playing) return fail('Śledztwo nie trwa.');
      if (s.hints >= MAX_HINTS) return fail('To już wszystkie podpowiedzi.');
      // Dwie osoby klikające „podpowiedź 2” naraz nie zużyją dwóch podpowiedzi.
      if (typeof msg.n === 'number' && msg.n !== s.hints) return fail('Ktoś z ekipy właśnie wziął tę podpowiedź.');
      s.hints += 1;
      s.penalty += HINT_PENALTY;
      break;
    case 'accuse': {
      if (!playing) return fail('Śledztwo nie trwa.');
      if (!CARD_RE.test(msg.forged) || !CARD_RE.test(msg.proof)) return fail('Raport musi wskazywać dwie karty.');
      if (s.attempts.some((a) => a.forged === msg.forged && a.proof === msg.proof)) return fail('Ta para kart była już sprawdzona.');
      const ok = Array.isArray(msg.ok) ? [Boolean(msg.ok[0]), msg.ok[1] === null ? null : Boolean(msg.ok[1])] : [false, null];
      const alibis = {};
      for (const [k, v] of Object.entries(msg.alibis || {})) if (/^s\d$/.test(k) && CARD_RE.test(v)) alibis[k] = v;
      s.attempts.push({ by: clientId, forged: msg.forged, proof: msg.proof, reason: String(msg.reason || '').slice(0, 40), alibis, ok, at: now });
      if (ok[0] && ok[1]) {
        s.status = 'solved';
        s.endedAt = now;
        if (msg.report && typeof msg.report === 'object') {
          // „Za pierwszym razem” liczy serwer: liczy się kolejność raportów całej ekipy.
          const reasonOk = Boolean(msg.report.reasonOk);
          const alibiCorrect = Number(msg.report.alibiCorrect) || 0;
          const alibiTotal = Number(msg.report.alibiTotal) || 0;
          const firstTry = s.attempts.length === 1;
          s.report = { reasonOk, alibiCorrect, alibiTotal, firstTry, stars: Number(reasonOk) + Number(alibiTotal > 0 && alibiCorrect === alibiTotal) + Number(firstTry) };
        } else s.report = null;
      } else {
        s.penalty += WRONG_PENALTY;
        if (s.attempts.length >= MAX_ATTEMPTS) {
          s.status = 'failed';
          s.endedAt = now;
        }
      }
      break;
    }
    default:
      return fail('Nieznana wiadomość.');
  }
  s.updatedAt = now;
  return { state: s };
}

/** Czy pokój można już usunąć (długo bez zmian i bez graczy online). */
export function isExpired(state, now) {
  return now - state.updatedAt > ROOM_TTL_MS && !state.players.some((p) => p.online);
}

/** Losowy kod pokoju (bez mylących znaków 0/O, 1/I). */
export function randomRoomCode(rand = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}
