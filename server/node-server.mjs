// Serwer gry na żywo bez żadnych zależności (tylko wbudowane moduły Node 18+).
//
//   npm run live            → http://localhost:8787
//   PORT=9000 npm run live  → inny port
//
// Robi dwie rzeczy:
//   1. serwuje statyczną grę z katalogu repozytorium (jak scripts/serve.mjs, ale tylko
//      publiczne pliki: index.html, js/, css/, cases/ …),
//   2. pod adresem /room/<KOD> przyjmuje połączenia WebSocket (RFC 6455 napisany ręcznie)
//      i prowadzi pokoje w pamięci według logiki z server/room.js.
//
// Protokół wiadomości opisuje server/room.js. Stan pokojów żyje tylko w pamięci procesu:
// restart serwera kasuje pokoje (przeglądarki połączą się ponownie i założą je od nowa).

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newRoom, connect, disconnect, reduce, isExpired, isRoomCode } from './room.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// ---------------------------------------------------------------- ustawienia

export const LIMITS = {
  maxMessageBytes: 16 * 1024, // dłuższa wiadomość dostaje błąd
  maxFrameBytes: 256 * 1024, // powyżej tego zrywamy połączenie od razu (bez buforowania)
  rateWindowMs: 10_000,
  rateMax: 30, // wiadomości na okno na gniazdo
  rateKill: 60, // tyle w oknie = zamknięcie połączenia
  helloTimeoutMs: 15_000, // tyle czasu na pierwsze { t: 'hello' }
  closeTimeoutMs: 3_000, // tyle czekamy na odpowiedź na ramkę close
  maxBufferedBytes: 1024 * 1024, // wolny klient, któremu rośnie kolejka wysyłki, zostaje rozłączony
  maxRooms: 5_000,
  maxSocketsPerRoom: 16,
};

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Publiczne są tylko te katalogi i pliki. Reszta repozytorium (server/, tests/, scripts/,
// .git, package.json…) nie wychodzi na zewnątrz, nawet jeśli istnieje na dysku.
const PUBLIC_DIRS = new Set(['js', 'css', 'cases', 'img', 'assets', 'fonts', 'icons']);
const PUBLIC_FILES = new Set([
  'index.html', 'artifact.html', 'favicon.ico', 'favicon.svg', 'manifest.json',
  'manifest.webmanifest', 'robots.txt',
  'server/room.js', // czysta logika pokoju, bez sekretów: klient może jej użyć (np. kody pokojów)
]);

// ---------------------------------------------------------------- pliki statyczne

function publicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  if (decoded.endsWith('/')) decoded += 'index.html';
  const file = resolve(ROOT, `.${decoded.startsWith('/') ? '' : '/'}${decoded}`);
  if (!file.startsWith(ROOT + sep)) return null; // próba wyjścia poza katalog gry
  const rel = file.slice(ROOT.length + 1).split(sep);
  if (rel.some((part) => part.startsWith('.'))) return null; // pliki ukryte
  const relPath = rel.join('/');
  if (PUBLIC_FILES.has(relPath)) return file;
  if (rel.length > 1 && PUBLIC_DIRS.has(rel[0])) return file;
  return null;
}

async function serveStatic(req, res, pathname) {
  const file = publicFile(pathname);
  try {
    if (!file) throw new Error('niepubliczny');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('to nie plik');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    text(res, 404, 'Nie znaleziono');
  }
}

function text(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

// ---------------------------------------------------------------- ramki WebSocket

/** Ramka serwera: zawsze FIN, bez maski (RFC 6455 §5.1). */
function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, payload]);
}

/** Powód zamknięcia ucięty do 123 bajtów bez rozcinania znaku UTF-8. */
function closePayload(code, reason = '') {
  let r = Buffer.from(String(reason), 'utf8');
  if (r.length > 123) {
    let end = 123;
    while (end > 0 && (r[end] & 0xc0) === 0x80) end--;
    r = r.subarray(0, end);
  }
  const buf = Buffer.alloc(2 + r.length);
  buf.writeUInt16BE(code, 0);
  r.copy(buf, 2);
  return buf;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** Kody close, które klient może legalnie przysłać (RFC 6455 §7.4). */
const validCloseCode = (c) => (c >= 1000 && c <= 1003) || (c >= 1007 && c <= 1011) || (c >= 3000 && c <= 4999);

/**
 * Jedno połączenie WebSocket: parsuje ramki klienta, składa fragmenty, odpowiada na ping,
 * pilnuje zamknięcia. Gotowe wiadomości tekstowe trafiają do onText, a duże do onTooBig.
 */
class Connection {
  constructor(socket, { onText, onTooBig, onClose }) {
    this.socket = socket;
    this.onText = onText;
    this.onTooBig = onTooBig;
    this.onClose = onClose;
    this.buf = Buffer.alloc(0);
    this.fragments = null; // { size, parts, tooBig } w trakcie wiadomości z kilku ramek
    this.closing = false; // wysłaliśmy close
    this.closed = false;
    this.lastSeen = Date.now();
    this.closeTimer = null;
    // dane pokoju
    this.clientId = null;
    this.code = null;
    this.helloTimer = null;
    this.replaced = false;
    this.rate = [];
    this.rateWarned = 0;
    this.discard = false;

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => this.finish());
    socket.on('end', () => { if (!this.closed) socket.end(); });
  }

  onData(chunk) {
    this.lastSeen = Date.now();
    if (this.discard) return; // po błędzie protokołu reszta danych to śmieci
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    try {
      while (!this.closed && this.parseFrame());
    } catch (err) {
      this.fail(1011, 'Błąd serwera');
      console.error('Błąd połączenia:', err);
    }
  }

  /** Zwraca true, jeśli zjadł całą ramkę i warto próbować dalej. */
  parseFrame() {
    const b = this.buf;
    if (b.length < 2) return false;
    const fin = (b[0] & 0x80) !== 0;
    const rsv = b[0] & 0x70;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (rsv) return this.fail(1002, 'Nieobsługiwane rozszerzenie'), false;
    if (!masked) return this.fail(1002, 'Ramki klienta muszą być maskowane'), false;
    if (len === 126) {
      if (b.length < 4) return false;
      len = b.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (b.length < 10) return false;
      const big = b.readBigUInt64BE(2);
      if (big > BigInt(LIMITS.maxFrameBytes)) return this.fail(1009, 'Wiadomość jest za długa'), false;
      len = Number(big);
      off = 10;
    }
    const isControl = opcode >= 0x8;
    if (isControl && (!fin || len > 125)) return this.fail(1002, 'Nieprawidłowa ramka kontrolna'), false;
    if (len > LIMITS.maxFrameBytes) return this.fail(1009, 'Wiadomość jest za długa'), false;
    if (b.length < off + 4 + len) return false; // czekamy na resztę ramki
    const mask = b.subarray(off, off + 4);
    const payload = Buffer.from(b.subarray(off + 4, off + 4 + len)); // kopia: bufor wejściowy się przesuwa
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    this.buf = b.subarray(off + 4 + len);

    if (this.closing && opcode !== OP.CLOSE) return true; // po wysłaniu close czekamy już tylko na close

    switch (opcode) {
      case OP.TEXT:
      case OP.BINARY:
      case OP.CONT:
        return this.dataFrame(opcode, fin, payload);
      case OP.PING:
        this.write(encodeFrame(OP.PONG, payload));
        return true;
      case OP.PONG:
        return true; // lastSeen już odświeżone
      case OP.CLOSE:
        this.gotClose(payload);
        return false;
      default:
        this.fail(1002, 'Nieznany typ ramki');
        return false;
    }
  }

  dataFrame(opcode, fin, payload) {
    if (opcode === OP.CONT) {
      if (!this.fragments) return this.fail(1002, 'Nieoczekiwana ramka kontynuacji'), false;
    } else {
      if (this.fragments) return this.fail(1002, 'Nowa wiadomość przed końcem poprzedniej'), false;
      if (opcode === OP.BINARY) return this.fail(1003, 'Serwer przyjmuje tylko tekst (JSON)'), false;
      this.fragments = { size: 0, parts: [], tooBig: false };
    }
    const f = this.fragments;
    f.size += payload.length;
    if (f.size > LIMITS.maxFrameBytes) return this.fail(1009, 'Wiadomość jest za długa'), false;
    if (f.size > LIMITS.maxMessageBytes) {
      f.tooBig = true;
      f.parts = []; // i tak odrzucimy, nie trzymajmy danych
    } else {
      f.parts.push(payload);
    }
    if (!fin) return true;
    this.fragments = null;
    if (f.tooBig) {
      this.onTooBig(this);
      return !this.closed;
    }
    let str;
    try {
      str = utf8.decode(f.parts.length === 1 ? f.parts[0] : Buffer.concat(f.parts));
    } catch {
      return this.fail(1007, 'Nieprawidłowy UTF-8'), false;
    }
    this.onText(this, str);
    return !this.closed;
  }

  gotClose(payload) {
    let code = 1000;
    if (payload.length === 1) code = 1002;
    else if (payload.length >= 2) {
      const c = payload.readUInt16BE(0);
      code = validCloseCode(c) ? 1000 : 1002;
      try { utf8.decode(payload.subarray(2)); } catch { code = 1007; }
    }
    if (!this.closing) {
      this.closing = true;
      this.write(encodeFrame(OP.CLOSE, closePayload(code)));
    }
    this.socket.end();
    this.finishSoon();
  }

  write(frame) {
    if (this.closed || this.socket.destroyed) return;
    if (this.socket.writableLength > LIMITS.maxBufferedBytes) {
      this.socket.destroy(); // klient nie odbiera, nie będziemy mu buforować bez końca
      return;
    }
    this.socket.write(frame);
  }

  send(obj) {
    if (this.closing) return;
    this.write(encodeFrame(OP.TEXT, Buffer.from(JSON.stringify(obj), 'utf8')));
  }

  ping() {
    if (!this.closing) this.write(encodeFrame(OP.PING));
  }

  /** Grzeczne zamknięcie: ramka close i czekamy chwilę na odpowiedź. */
  close(code = 1000, reason = '') {
    if (this.closing || this.closed) return;
    this.closing = true;
    this.write(encodeFrame(OP.CLOSE, closePayload(code, reason)));
    this.finishSoon();
  }

  /** Błąd protokołu: ramka close i od razu koniec TCP (na odpowiedź nie czekamy, RFC 6455 §7.1.7). */
  fail(code, reason) {
    this.close(code, reason);
    this.discard = true;
    this.buf = Buffer.alloc(0);
    this.socket.end();
  }

  finishSoon() {
    if (this.closeTimer) return;
    this.closeTimer = setTimeout(() => this.socket.destroy(), LIMITS.closeTimeoutMs);
    this.closeTimer.unref();
  }

  destroy() {
    this.socket.destroy();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    this.closing = true;
    clearTimeout(this.closeTimer);
    this.onClose(this);
  }
}

// ---------------------------------------------------------------- serwer

/**
 * Tworzy serwer (HTTP + WebSocket + pokoje). Nie zaczyna nasłuchiwać sam z siebie,
 * użyj startServer() albo server.listen().
 */
export function createLiveServer({ heartbeatMs = 25_000, timeoutMs = 60_000, cleanupMs = 10 * 60_000 } = {}) {
  /** @type {Map<string, { state: object, sockets: Set<Connection> }>} */
  const rooms = new Map();
  const conns = new Set();

  function broadcast(room) {
    const now = Date.now();
    for (const c of room.sockets) if (c.clientId) c.send({ t: 'state', state: room.state, you: c.clientId, now });
  }

  function dropRoomIfEmpty(code) {
    const room = rooms.get(code);
    // Pusty pokój (nikt nie jest podłączony i nikogo nie ma na liście) nie niesie nic cennego.
    if (room && room.sockets.size === 0 && room.state.players.length === 0) rooms.delete(code);
  }

  function rateLimited(c) {
    const now = Date.now();
    c.rate = c.rate.filter((t) => now - t < LIMITS.rateWindowMs);
    c.rate.push(now);
    if (c.rate.length > LIMITS.rateKill) {
      c.send({ t: 'error', msg: 'Za dużo wiadomości. Połączenie zostało zamknięte.' });
      c.close(1008, 'Za dużo wiadomości');
      return true;
    }
    if (c.rate.length > LIMITS.rateMax) {
      if (now - c.rateWarned > 2_000) {
        c.rateWarned = now;
        c.send({ t: 'error', msg: 'Za dużo wiadomości naraz. Zwolnij trochę.' });
      }
      return true;
    }
    return false;
  }

  function onTooBig(c) {
    if (c.closing || rateLimited(c)) return;
    c.send({ t: 'error', msg: `Wiadomość jest za długa (najwyżej ${LIMITS.maxMessageBytes / 1024} KB).` });
  }

  function onText(c, raw) {
    if (c.closing || rateLimited(c)) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      c.send({ t: 'error', msg: 'Nieprawidłowa wiadomość (to nie jest JSON).' });
      return;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      c.send({ t: 'error', msg: 'Nieprawidłowa wiadomość.' });
      return;
    }
    const now = Date.now();
    if (msg.t === 'ping') {
      c.send({ t: 'pong', now });
      return;
    }
    const room = rooms.get(c.code);
    if (!room) return; // pokój właśnie wygasł, gniazdo się zamyka

    if (!c.clientId) {
      if (msg.t !== 'hello') {
        c.send({ t: 'error', msg: 'Najpierw przywitaj się z pokojem (hello).' });
        c.close(1008, 'Brak powitania');
        return;
      }
      const res = connect(room.state, msg.clientId, msg, now);
      if (res.error) {
        c.send({ t: 'error', msg: res.error });
        c.close(1008, 'Odmowa wejścia');
        return;
      }
      clearTimeout(c.helloTimer);
      c.clientId = msg.clientId;
      // Ten sam gracz połączył się jeszcze raz (np. odświeżył kartę): stare gniazdo wylatuje,
      // ale bez disconnect(), żeby gracz nie zniknął z pokoju.
      for (const other of room.sockets) {
        if (other !== c && other.clientId === c.clientId) {
          other.replaced = true;
          room.sockets.delete(other);
          other.send({ t: 'error', msg: 'Połączono z tego pokoju w innym oknie.' });
          other.close(4000, 'Zastąpione nowym połączeniem');
        }
      }
      room.state = res.state;
      broadcast(room);
      return;
    }

    let res;
    if (msg.t === 'hello') {
      // Ponowne powitanie na tym samym gnieździe: wolno tylko odświeżyć dane tego samego gracza.
      if (msg.clientId !== c.clientId) {
        c.send({ t: 'error', msg: 'Na jednym połączeniu gra jeden detektyw.' });
        return;
      }
      res = connect(room.state, c.clientId, msg, now);
    } else {
      res = reduce(room.state, c.clientId, msg, now);
    }
    if (res.error) {
      c.send({ t: 'error', msg: res.error });
      return;
    }
    room.state = res.state;
    broadcast(room);
  }

  function onClose(c) {
    conns.delete(c);
    clearTimeout(c.helloTimer);
    const room = rooms.get(c.code);
    if (!room) return;
    const wasMember = room.sockets.delete(c);
    if (wasMember && c.clientId && !c.replaced) {
      const stillHere = [...room.sockets].some((o) => o.clientId === c.clientId);
      if (!stillHere) {
        const res = disconnect(room.state, c.clientId, Date.now());
        if (!res.error && res.state !== room.state) {
          room.state = res.state;
          broadcast(room);
        }
      }
    }
    dropRoomIfEmpty(c.code);
  }

  function rejectUpgrade(socket, status, message, extra = '') {
    const body = Buffer.from(message, 'utf8');
    socket.end(
      `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n${extra}` +
      `Content-Length: ${body.length}\r\n\r\n${message}`,
    );
    setTimeout(() => socket.destroy(), 1_000).unref();
  }

  const server = createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://x');
    } catch {
      return text(res, 400, 'Nieprawidłowy adres');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Niedozwolona metoda', { Allow: 'GET, HEAD' });
    if (url.pathname === '/health') return text(res, 200, 'ok', { 'Cache-Control': 'no-store' });
    if (url.pathname.startsWith('/room/')) return text(res, 426, 'Tu łączy się gra przez WebSocket.', { Upgrade: 'websocket' });
    serveStatic(req, res, url.pathname);
  });

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    let url;
    try {
      url = new URL(req.url, 'http://x');
    } catch {
      return rejectUpgrade(socket, '400 Bad Request', 'Nieprawidłowy adres');
    }
    const m = /^\/room\/([^/]+)\/?$/.exec(url.pathname);
    const code = m ? m[1].toUpperCase() : '';
    if (!m || !isRoomCode(code)) return rejectUpgrade(socket, '404 Not Found', 'Nie ma takiego pokoju (zły kod).');
    const key = String(req.headers['sec-websocket-key'] || '');
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    if (req.method !== 'GET' || upgrade !== 'websocket' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
      return rejectUpgrade(socket, '400 Bad Request', 'Nieprawidłowe żądanie WebSocket');
    }
    if (req.headers['sec-websocket-version'] !== '13') {
      return rejectUpgrade(socket, '426 Upgrade Required', 'Obsługiwana jest tylko wersja 13 protokołu WebSocket.', 'Sec-WebSocket-Version: 13\r\n');
    }
    // Origin: celowo akceptujemy każdy. To gra dla znajomych bez kont i ciasteczek, więc
    // połączenie z obcej strony nie daje dostępu do niczego, czego nie ma ktoś znający kod pokoju.
    let room = rooms.get(code);
    if (!room) {
      if (rooms.size >= LIMITS.maxRooms) return rejectUpgrade(socket, '503 Service Unavailable', 'Serwer jest pełny, spróbuj później.');
      room = { state: newRoom(code, Date.now()), sockets: new Set() };
      rooms.set(code, room);
    }
    if (room.sockets.size >= LIMITS.maxSocketsPerRoom) {
      return rejectUpgrade(socket, '503 Service Unavailable', 'Za dużo połączeń w tym pokoju.');
    }

    const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const c = new Connection(socket, { onText, onTooBig, onClose });
    c.code = code;
    c.helloTimer = setTimeout(() => {
      if (!c.clientId) {
        c.send({ t: 'error', msg: 'Nie przywitano się z pokojem na czas.' });
        c.close(1008, 'Brak powitania');
      }
    }, LIMITS.helloTimeoutMs);
    c.helloTimer.unref();
    room.sockets.add(c);
    conns.add(c);
    if (head && head.length) c.onData(head);
  });

  // Bicie serca: ping co 25 s; kto nie odezwał się od 60 s, zostaje rozłączony.
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const c of conns) {
      if (now - c.lastSeen > timeoutMs) c.destroy();
      else c.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (isExpired(room.state, now)) {
        for (const c of room.sockets) c.close(1001, 'Pokój wygasł');
        rooms.delete(code);
      }
    }
  }, cleanupMs);
  cleanup.unref();

  server.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(cleanup);
  });

  /** Zamyka serwer razem z otwartymi połączeniami WebSocket. */
  server.shutdown = () => new Promise((done) => {
    for (const c of conns) c.close(1001, 'Serwer się wyłącza');
    server.close(() => done());
    setTimeout(() => {
      for (const c of conns) c.destroy();
      server.closeAllConnections?.();
    }, 500).unref();
  });

  server.rooms = rooms; // do podglądu w testach
  return server;
}

/** Startuje serwer na danym porcie (0 = dowolny wolny). Zwraca { server, port }. */
export function startServer({ port = Number(process.env.PORT || 8787), host, ...opts } = {}) {
  const server = createLiveServer(opts);
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      server.off('error', fail);
      ok({ server, port: server.address().port });
    });
  });
}

// Uruchomienie bezpośrednie: `node server/node-server.mjs`
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server, port } = await startServer();
  console.log(`Fałszywe Alibi (na żywo): http://localhost:${port}`);
  const stop = () => server.shutdown().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
