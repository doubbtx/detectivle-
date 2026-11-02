// Serwer gry na żywo w Cloudflare Workers + Durable Objects.
//
// Każdy pokój (kod np. K7Q2X) to osobny Durable Object „Room”. Wszystkie połączenia
// danego pokoju trafiają do tego samego obiektu, który trzyma stan, stosuje ruchy
// (logika w ./room.js, wspólna z serwerem Node) i rozsyła pełny stan po każdej zmianie.
//
// Używamy WebSocket Hibernation API: gdy w pokoju nic się nie dzieje, obiekt może zostać
// uśpiony, a połączenia zostają otwarte (płaci się tylko za czas pracy, nie za czekanie).
// Dlatego wszystko, co musimy pamiętać o gnieździe (clientId, licznik wiadomości), trzymamy
// w serializeAttachment, a stan pokoju w this.ctx.storage.
//
// Adresy:
//   GET /health          → "ok"
//   /room/<KOD>          → WebSocket do pokoju (kod bez względu na wielkość liter)
//   wszystko inne        → 404 (sama gra leży na GitHub Pages)

import { newRoom, connect, disconnect, reduce, isExpired, isRoomCode, ROOM_TTL_MS } from './room.js';

const MAX_MESSAGE_BYTES = 16 * 1024;   // większe wiadomości odrzucamy
const RATE_WINDOW_MS = 10_000;         // okno limitu wiadomości
const RATE_LIMIT = 30;                 // tyle wiadomości na okno na jedno połączenie
const RATE_KICK = 60;                  // po tylu w jednym oknie rozłączamy
const MAX_SOCKETS = 16;                // twardy limit połączeń na pokój (5 graczy + zapas na powroty)
const ALARM_SLACK_MS = 60_000;
const TOO_BIG = `Wiadomość jest za długa (najwyżej ${MAX_MESSAGE_BYTES / 1024} KB).`;

const ROOM_PATH = /^\/room\/([A-Za-z0-9]{1,16})\/?$/;

function roomCodeFrom(url) {
  const m = ROOM_PATH.exec(new URL(url).pathname);
  if (!m) return null;
  const code = m[1].toUpperCase();
  return isRoomCode(code) ? code : null;
}

const text = (body, status = 200) => new Response(body, {
  status,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return text('ok');
    if (url.pathname.startsWith('/room/')) {
      const code = roomCodeFrom(request.url);
      if (!code) return text('Nieprawidłowy kod pokoju.', 400);
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return text('Tu łączy się tylko przez WebSocket.', 426);
      }
      // Nagłówka Origin celowo NIE sprawdzamy: to gra dla znajomych, klient może stać
      // na GitHub Pages, localhost albo gdziekolwiek indziej. Pokój chroni tylko jego kod.
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }
    return text('Nie ma tu nic do oglądania. Gra jest pod innym adresem.', 404);
  },
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = undefined; // undefined = jeszcze nie wczytany, null = pokój nie istnieje
    this.alarmSet = false;
  }

  // ── wejście nowego połączenia ───────────────────────────────────────────────
  async fetch(request) {
    const code = roomCodeFrom(request.url);
    if (!code) return text('Nieprawidłowy kod pokoju.', 400);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return text('Tu łączy się tylko przez WebSocket.', 426);
    }
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      return text('Za dużo połączeń z tym pokojem.', 429);
    }
    const { 0: client, 1: server } = new WebSocketPair();
    // Tagi da się nadać tylko przy acceptWebSocket, a clientId znamy dopiero z „hello”,
    // więc zapamiętujemy go w załączniku gniazda (przeżywa hibernację).
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ code, clientId: null, win: Date.now(), n: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── wiadomości ──────────────────────────────────────────────────────────────
  async webSocketMessage(ws, raw) {
    const att = ws.deserializeAttachment() || { code: null, clientId: null, win: 0, n: 0 };
    if (att.closed || att.replaced) return;

    // Limit: 30 wiadomości na 10 s. Ostrzegamy raz, potem ignorujemy, a przy uporczywym
    // zasypywaniu zamykamy połączenie.
    const now = Date.now();
    if (now - att.win >= RATE_WINDOW_MS) { att.win = now; att.n = 0; }
    att.n += 1;
    ws.serializeAttachment(att);
    if (att.n > RATE_KICK) {
      att.closed = true;
      ws.serializeAttachment(att);
      this.sendError(ws, 'Za dużo wiadomości. Połączenie zostało zamknięte.');
      this.closeSocket(ws, 1008, 'Za dużo wiadomości');
      await this.leaveAs(att);
      return;
    }
    if (att.n > RATE_LIMIT) {
      if (att.n === RATE_LIMIT + 1) this.sendError(ws, 'Za dużo wiadomości naraz. Zwolnij trochę.');
      return;
    }

    let data = raw;
    if (typeof data !== 'string') {
      if (data.byteLength > MAX_MESSAGE_BYTES) return this.sendError(ws, TOO_BIG);
      data = new TextDecoder().decode(data);
    }
    if (byteLength(data) > MAX_MESSAGE_BYTES) return this.sendError(ws, TOO_BIG);
    let msg;
    try { msg = JSON.parse(data); } catch { return this.sendError(ws, 'Nieprawidłowa wiadomość (to nie jest JSON).'); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return this.sendError(ws, 'Nieprawidłowa wiadomość.');

    if (msg.t === 'ping') {
      this.send(ws, { t: 'pong', now: Date.now() });
      return;
    }

    await this.load();

    if (!att.clientId) {
      if (msg.t !== 'hello') {
        this.sendError(ws, 'Najpierw przywitaj się z pokojem (hello).');
        this.closeSocket(ws, 1008, 'Brak powitania');
        return;
      }
      return this.hello(ws, att, msg);
    }
    if (msg.t === 'hello') {
      // Ponowne „hello” na tym samym połączeniu: odśwież dane gracza (np. imię).
      if (msg.clientId !== att.clientId) return this.sendError(ws, 'Na jednym połączeniu gra jeden detektyw.');
      return this.apply(ws, connect(this.room, att.clientId, msg, Date.now()));
    }
    if (!this.room) return this.sendError(ws, 'Pokój wygasł. Wejdź do niego jeszcze raz.');
    return this.apply(ws, reduce(this.room, att.clientId, msg, Date.now()));
  }

  async hello(ws, att, msg) {
    const now = Date.now();
    const base = this.room || newRoom(att.code, now);
    const res = connect(base, msg.clientId, msg, now);
    if (res.error) {
      // Gracz nie wszedł (pełny pokój, śledztwo trwa, zły id) – nic tu po nim.
      this.sendError(ws, res.error);
      this.closeSocket(ws, 1008, 'Odmowa wejścia');
      return;
    }
    const clientId = String(msg.clientId);
    // Ten sam gracz z nowego połączenia (odświeżona karta, druga zakładka, powrót po
    // zerwaniu): stare gniazdo zamykamy i oznaczamy, żeby jego zamknięcie nie wyrzuciło
    // gracza z pokoju.
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const o = other.deserializeAttachment();
      if (o && o.clientId === clientId && !o.replaced) {
        other.serializeAttachment({ ...o, replaced: true });
        this.sendError(other, 'Połączono z tego pokoju w innym oknie.');
        this.closeSocket(other, 4000, 'Zastąpione nowym połączeniem');
      }
    }
    att.clientId = clientId;
    ws.serializeAttachment(att);
    await this.commit(res.state);
  }

  async apply(ws, res) {
    if (res.error) return this.sendError(ws, res.error);
    await this.commit(res.state);
  }

  // ── zamknięcie połączenia ───────────────────────────────────────────────────
  async webSocketClose(ws, code, reason) {
    await this.leave(ws);
    // Odpowiadamy ramką zamknięcia (kodów 1005/1006 nie wolno odsyłać).
    this.closeSocket(ws, code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, 'Do zobaczenia');
  }

  async webSocketError(ws) {
    await this.leave(ws);
  }

  async leave(ws) {
    const att = ws.deserializeAttachment();
    if (!att || att.closed) return;
    ws.serializeAttachment({ ...att, closed: true });
    await this.leaveAs(att);
  }

  /** Gracz z tego gniazda wychodzi z pokoju (chyba że zastąpiło je nowsze połączenie). */
  async leaveAs(att) {
    if (!att.clientId || att.replaced) return;
    await this.load();
    if (!this.room) return;
    const res = disconnect(this.room, att.clientId, Date.now());
    if (res.state !== this.room) await this.commit(res.state);
  }

  // ── sprzątanie wygasłych pokoi ──────────────────────────────────────────────
  async alarm() {
    this.room = undefined; // wczytaj świeżo i uzgodnij, kto naprawdę jest online
    await this.load();
    if (!this.room) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const now = Date.now();
    const wait = this.room.updatedAt + ROOM_TTL_MS + ALARM_SLACK_MS - now;
    await this.ctx.storage.setAlarm(now + Math.max(wait, 3600_000));
    this.alarmSet = true;
  }

  // ── stan pokoju ─────────────────────────────────────────────────────────────

  /** Wczytaj stan przy pierwszym użyciu (także po wybudzeniu z hibernacji). */
  async load() {
    if (this.room !== undefined) return;
    let room = (await this.ctx.storage.get('room')) ?? null;
    if (room) {
      // Po restarcie obiektu (np. nowe wdrożenie) połączenia mogły zniknąć bez
      // webSocketClose. Gracze bez otwartego gniazda nie są online.
      const live = new Set(this.openClientIds());
      const now = Date.now();
      let changed = false;
      for (const p of room.players) {
        if (p.online && !live.has(p.id)) {
          room = disconnect(room, p.id, now).state;
          changed = true;
        }
      }
      if (isExpired(room, now)) {
        await this.destroy();
        return;
      }
      this.room = room;
      if (changed) await this.commit(room);
      return;
    }
    this.room = null;
  }

  /** Zapisz nowy stan i roześlij go wszystkim w pokoju. */
  async commit(state) {
    this.room = state;
    await this.ctx.storage.put('room', state);
    if (!this.alarmSet) {
      this.alarmSet = true;
      const at = await this.ctx.storage.getAlarm();
      if (at == null) await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS + ALARM_SLACK_MS);
    }
    this.broadcast();
  }

  async destroy() {
    for (const ws of this.ctx.getWebSockets()) this.closeSocket(ws, 1001, 'Pokój wygasł');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.alarmSet = false;
  }

  broadcast() {
    const now = Date.now();
    const state = this.room;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att || !att.clientId || att.replaced || att.closed) continue;
      this.send(ws, { t: 'state', state, you: att.clientId, now });
    }
  }

  openClientIds() {
    const ids = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.clientId && !att.replaced && !att.closed) ids.push(att.clientId);
    }
    return ids;
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { /* gniazdo już zamknięte */ }
  }

  sendError(ws, msg) {
    this.send(ws, { t: 'error', msg });
  }

  closeSocket(ws, code, reason) {
    try { ws.close(code, reason); } catch { /* już zamknięte */ }
  }
}

/** Długość tekstu w bajtach UTF-8 (liczymy dokładnie tylko wtedy, gdy to potrzebne). */
function byteLength(str) {
  if (str.length > MAX_MESSAGE_BYTES) return str.length;
  if (str.length * 3 <= MAX_MESSAGE_BYTES) return str.length;
  return new TextEncoder().encode(str).length;
}
