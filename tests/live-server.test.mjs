// Testy serwera gry na żywo (server/node-server.mjs): prawdziwy serwer na losowym porcie,
// trzech graczy przez wbudowany WebSocket z Node 22 i kilka połączeń „na surowo” przez TCP,
// żeby sprawdzić ręcznie napisany protokół RFC 6455.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect as tcpConnect } from 'node:net';
import { request } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { startServer } from '../server/node-server.mjs';

const WAIT_MS = 3000;
const ref = { type: 'practice', code: 'K7Q2' };
const hasWebSocket = typeof globalThis.WebSocket === 'function';

// ---------------------------------------------------------------- klienci

/** Klient z kolejką wiadomości: waitFor() czeka na pierwszą pasującą (i zjada wcześniejsze). */
class Client {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.queue = [];
    this.waiters = [];
    this.closeInfo = null;
    this.opened = new Promise((ok, fail) => {
      this.ws.addEventListener('open', () => ok(), { once: true });
      this.ws.addEventListener('error', () => fail(new Error('Nie udało się połączyć')), { once: true });
    });
    this.closed = new Promise((ok) => {
      this.ws.addEventListener('close', (e) => {
        this.closeInfo = { code: e.code, reason: e.reason };
        ok(this.closeInfo);
      });
    });
    this.ws.addEventListener('message', (e) => {
      this.queue.push(JSON.parse(e.data));
      this.flush();
    });
  }

  flush() {
    for (const w of [...this.waiters]) {
      const i = this.queue.findIndex(w.pred);
      if (i < 0) continue;
      const [msg] = this.queue.splice(0, i + 1).slice(-1);
      this.waiters.splice(this.waiters.indexOf(w), 1);
      clearTimeout(w.timer);
      w.ok(msg);
    }
  }

  waitFor(pred, what = 'wiadomość', ms = WAIT_MS) {
    return new Promise((ok, fail) => {
      const w = { pred, ok };
      w.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        fail(new Error(`Nie doczekano się: ${what}. Ostatnie: ${JSON.stringify(this.queue.slice(-3)).slice(0, 400)}`));
      }, ms);
      this.waiters.push(w);
      this.flush();
    });
  }

  state(pred = () => true, what = 'stan') {
    return this.waitFor((m) => m.t === 'state' && pred(m.state, m), what).then((m) => m.state);
  }

  error(what = 'błąd') {
    return this.waitFor((m) => m.t === 'error', what);
  }

  send(obj) {
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }

  close() {
    try { this.ws.close(); } catch { /* już zamknięte */ }
  }
}

const withTimeout = (p, what, ms = WAIT_MS) => Promise.race([
  p,
  new Promise((_, fail) => setTimeout(() => fail(new Error(`Przekroczony czas: ${what}`)), ms).unref()),
]);

/** Surowe połączenie TCP do ręcznego sprawdzania ramek. */
function rawSocket(port, path, key = randomBytes(16).toString('base64')) {
  return new Promise((ok, fail) => {
    const sock = tcpConnect(port, '127.0.0.1');
    let buf = Buffer.alloc(0);
    let headers = null;
    const frames = [];
    const waiters = [];
    let ended = false;
    const flush = () => {
      for (const w of [...waiters]) {
        const i = frames.findIndex(w.pred);
        if (i >= 0) {
          const [f] = frames.splice(0, i + 1).slice(-1);
          waiters.splice(waiters.indexOf(w), 1);
          clearTimeout(w.timer);
          w.ok(f);
        } else if (ended) {
          waiters.splice(waiters.indexOf(w), 1);
          clearTimeout(w.timer);
          w.fail(new Error('Połączenie zamknięte przed ramką'));
        }
      }
    };
    const api = {
      sock,
      frames,
      get ended() { return ended; },
      endedP: new Promise((done) => sock.on('close', () => { ended = true; flush(); done(); })),
      write: (b) => sock.write(b),
      frame: (pred = () => true, ms = WAIT_MS) => new Promise((ok2, fail2) => {
        const w = { pred, ok: ok2, fail: fail2 };
        w.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          fail2(new Error('Nie doczekano się ramki'));
        }, ms);
        waiters.push(w);
        flush();
      }),
    };
    sock.on('error', () => {});
    sock.on('connect', () => {
      sock.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://example.com\r\n\r\n`,
      );
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!headers) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        headers = buf.subarray(0, end).toString('utf8');
        buf = buf.subarray(end + 4);
        ok({ ...api, headers });
      }
      // ramki serwera: bez maski
      while (buf.length >= 2) {
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) break;
        frames.push({ fin: !!(buf[0] & 0x80), opcode: buf[0] & 0x0f, masked: !!(buf[1] & 0x80), payload: buf.subarray(off, off + len) });
        buf = buf.subarray(off + len);
      }
      flush();
    });
    sock.on('close', () => { if (!headers) fail(new Error('Brak odpowiedzi na handshake')); });
  });
}

/** Ramka klienta (zamaskowana). */
function clientFrame(opcode, payload, { fin = true, mask = true } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const len = data.length;
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = (fin ? 0x80 : 0) | opcode;
  if (!mask) return Buffer.concat([head, data]);
  head[1] |= 0x80;
  const key = randomBytes(4);
  const body = Buffer.from(data);
  for (let i = 0; i < body.length; i++) body[i] ^= key[i & 3];
  return Buffer.concat([head, key, body]);
}

function httpGet(port, path) {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', fail);
    req.setTimeout(WAIT_MS, () => req.destroy(new Error('timeout HTTP')));
    req.end();
  });
}

// ---------------------------------------------------------------- testy

describe('serwer gry na żywo (Node, bez zależności)', { timeout: 30_000 }, () => {
  let server;
  let port;
  const clients = [];
  const raws = [];
  const open = async (code) => {
    const c = new Client(`ws://127.0.0.1:${port}/room/${code}`);
    clients.push(c);
    await withTimeout(c.opened, 'otwarcie WebSocket');
    return c;
  };
  const raw = async (path, key) => {
    const r = await withTimeout(rawSocket(port, path, key), 'surowe połączenie');
    raws.push(r);
    return r;
  };

  before(async () => {
    ({ server, port } = await startServer({ port: 0, host: '127.0.0.1' }));
  });

  after(async () => {
    for (const c of clients) c.close();
    for (const r of raws) r.sock.destroy();
    if (server) await withTimeout(server.shutdown(), 'zamknięcie serwera', 5000);
  });

  test('GET /health i pliki statyczne', async () => {
    const health = await httpGet(port, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body, 'ok');

    for (const path of ['/', '/index.html']) {
      const page = await httpGet(port, path);
      assert.equal(page.status, 200, path);
      assert.match(page.headers['content-type'], /^text\/html/);
      assert.match(page.body, /Fałszywe Alibi/);
    }
    const js = await httpGet(port, '/js/main.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /^text\/javascript/);
    const css = await httpGet(port, '/css/style.css');
    assert.match(css.headers['content-type'], /^text\/css/);
    const manifest = await httpGet(port, '/cases/manifest.json');
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers['content-type'], /^application\/json/);

    // poza grę nic nie wychodzi
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/js/..%2f..%2fpackage.json', '/package.json',
      '/server/node-server.mjs', '/.git/HEAD', '/tests/room.test.mjs', '/nie-ma.html', '/js/']) {
      const res = await httpGet(port, path);
      assert.equal(res.status, 404, path);
    }
    const ws = await httpGet(port, '/room/ABCDE');
    assert.equal(ws.status, 426);
  });

  test('handshake: Sec-WebSocket-Accept według RFC 6455, zły kod pokoju odrzucony', async () => {
    // przykład z RFC 6455 §1.3
    const r = await raw('/room/RFCAB', 'dGhlIHNhbXBsZSBub25jZQ==');
    assert.match(r.headers, /^HTTP\/1\.1 101/);
    assert.match(r.headers, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/i);
    const expect = createHash('sha1').update('dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    assert.equal(expect, 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
    r.sock.destroy();

    const bad = await raw('/room/ab');
    assert.match(bad.headers, /^HTTP\/1\.1 404/);
    const bad2 = await raw('/room/ABCD0');
    assert.match(bad2.headers, /^HTTP\/1\.1 404/);
  });

  test('trzech graczy: powitanie, start, stół, czynności, ustalenia, podpowiedź, raporty, powroty', { skip: !hasWebSocket && 'brak globalnego WebSocket (Node < 22)' }, async () => {
    // kod pokoju małymi literami: serwer zamienia na wielkie
    const a = await open('abcde');
    a.send({ t: 'hello', clientId: 'alice01', name: 'Ala', caseRef: ref, fingerprint: 'QF7K' });
    let s = await a.state((st) => st.players.length === 1, 'stan po wejściu Ali');
    assert.equal(s.code, 'ABCDE');
    assert.equal(s.hostId, 'alice01');
    assert.deepEqual(s.caseRef, ref);

    const b = await open('ABCDE');
    b.send({ t: 'hello', clientId: 'bobby02', name: 'Bob' });
    const c = await open('AbCdE');
    c.send({ t: 'hello', clientId: 'carol03', name: 'Celina' });
    const all = [a, b, c];
    const ids = ['alice01', 'bobby02', 'carol03'];
    for (const [i, cl] of all.entries()) {
      const m = await cl.waitFor((x) => x.t === 'state' && x.state.players.length === 3, 'stan z trzema graczami');
      assert.equal(m.you, ids[i], 'pole you to id tego gracza');
      assert.equal(typeof m.now, 'number');
      assert.deepEqual(m.state.players.map((p) => p.name), ['Ala', 'Bob', 'Celina']);
    }

    // ping → pong tylko do pytającego
    b.send({ t: 'ping' });
    const pong = await b.waitFor((x) => x.t === 'pong', 'pong');
    assert.ok(Math.abs(pong.now - Date.now()) < 5000);

    // start (może go dać ktokolwiek), miejsca wg kolejności wejścia
    b.send({ t: 'start' });
    for (const cl of all) {
      s = await cl.state((st) => st.status === 'playing', 'start');
      assert.deepEqual(s.players.map((p) => [p.id, p.seat]), [['alice01', 1], ['bobby02', 2], ['carol03', 3]]);
      assert.equal(s.teamSize, 3);
    }
    assert.ok(!a.queue.some((x) => x.t === 'pong') && !c.queue.some((x) => x.t === 'pong'), 'pong nie jest rozsyłany');

    a.send({ t: 'table', card: 'D3' });
    for (const cl of all) {
      s = await cl.state((st) => st.table.length === 1, 'karta na stole');
      assert.deepEqual(s.table.map((x) => [x.card, x.by]), [['D3', 'alice01']]);
    }
    b.send({ t: 'unlock', card: 'M2' });
    for (const cl of all) assert.equal((await cl.state((st) => st.unlocked.M2, 'odpieczętowanie')).unlocked.M2, 'bobby02');
    c.send({ t: 'log', text: 'Halina czysta: S6 + M7' });
    for (const cl of all) {
      s = await cl.state((st) => st.log.some((l) => l.by === 'carol03'), 'ustalenie');
      assert.equal(s.log.at(-1).text, 'Halina czysta: S6 + M7');
    }
    a.send({ t: 'hint' });
    for (const cl of all) {
      s = await cl.state((st) => st.hints === 1, 'podpowiedź');
      assert.equal(s.penalty, 120);
    }

    // błędny raport: kara dla wszystkich, sprawa trwa
    b.send({ t: 'accuse', forged: 'D1', proof: 'M1', reason: 'x', ok: [false, null] });
    for (const cl of all) {
      s = await cl.state((st) => st.attempts.length === 1, 'pierwszy raport');
      assert.equal(s.status, 'playing');
      assert.equal(s.penalty, 420);
    }
    // ta sama para jeszcze raz: błąd tylko do nadawcy
    b.send({ t: 'accuse', forged: 'D1', proof: 'M1', ok: [false, null] });
    assert.match((await b.error('błąd powtórzonego raportu')).msg, /już sprawdzona/);

    // błędy na wejściu: nie-JSON i za długa wiadomość (połączenie zostaje)
    a.send('to nie json');
    assert.match((await a.error('błąd nie-JSON')).msg, /JSON/);
    a.send({ t: 'log', text: 'x'.repeat(17 * 1024) });
    assert.match((await a.error('błąd za długiej wiadomości')).msg, /za długa/);
    a.send({ t: 'ping' });
    await a.waitFor((x) => x.t === 'pong', 'pong po odrzuconej wiadomości');

    // czwarty gracz po starcie: błąd i zamknięcie
    const d = await open('ABCDE');
    d.send({ t: 'hello', clientId: 'dave004', name: 'Darek' });
    assert.match((await d.error('odmowa wejścia')).msg, /Śledztwo już trwa/);
    await withTimeout(d.closed, 'zamknięcie czwartego gracza');
    assert.ok(!d.queue.some((x) => x.t === 'state'), 'odrzucony gracz nie dostaje stanu');

    // Celina otwiera grę w nowej karcie z tym samym clientId: stare gniazdo wylatuje, miejsce zostaje
    const c2 = await open('ABCDE');
    c2.send({ t: 'hello', clientId: 'carol03' });
    s = await c2.state(() => true, 'stan po powrocie Celiny');
    const carol = s.players.find((p) => p.id === 'carol03');
    assert.equal(carol.seat, 3);
    assert.equal(carol.online, true);
    assert.equal(carol.name, 'Celina');
    const old = await withTimeout(c.closed, 'zamknięcie starego gniazda Celiny');
    assert.equal(old.code, 4000);

    // Bob traci połączenie: reszta widzi go offline; wraca i ma to samo miejsce
    b.close();
    s = await a.state((st) => st.players.find((p) => p.id === 'bobby02').online === false, 'Bob offline');
    assert.equal(s.players.length, 3);
    const b2 = await open('ABCDE');
    b2.send({ t: 'hello', clientId: 'bobby02' });
    s = await a.state((st) => st.players.find((p) => p.id === 'bobby02').online === true, 'Bob wraca');
    assert.equal(s.players.find((p) => p.id === 'bobby02').seat, 2);
    await b2.state(() => true, 'Bob dostaje stan');

    // trafny raport zamyka sprawę u wszystkich
    c2.send({ t: 'accuse', forged: 'D2', proof: 'M3', reason: 'y', ok: [true, true], report: { stars: 2, reasonOk: true } });
    for (const cl of [a, b2, c2]) {
      s = await cl.state((st) => st.status === 'solved', 'sprawa rozwiązana');
      assert.equal(s.attempts.length, 2);
      // Gwiazdki liczy serwer: trafny powód (1) + brak alibi (0) + nie za pierwszym razem (0).
      assert.equal(s.report.stars, 1);
    }
    a.send({ t: 'hint' });
    assert.match((await a.error('błąd po zamknięciu sprawy')).msg, /nie trwa/);
  });

  test('pierwsza wiadomość musi być powitaniem', { skip: !hasWebSocket && 'brak globalnego WebSocket' }, async () => {
    const x = await open('HELLO');
    x.send({ t: 'start' });
    assert.match((await x.error()).msg, /przywitaj/);
    await withTimeout(x.closed, 'zamknięcie bez powitania');
  });

  test('limit wiadomości: ostrzeżenie, a przy nadużyciu zamknięcie', { skip: !hasWebSocket && 'brak globalnego WebSocket' }, async () => {
    const x = await open('FLOOD');
    x.send({ t: 'hello', clientId: 'flood01' });
    await x.state();
    for (let i = 0; i < 35; i++) x.send({ t: 'ping' });
    assert.match((await x.error('ostrzeżenie o limicie')).msg, /Za dużo/);
    assert.ok(x.ws.readyState === WebSocket.OPEN);
    for (let i = 0; i < 40; i++) x.send({ t: 'ping' });
    const closed = await withTimeout(x.closed, 'zamknięcie za zalewanie');
    assert.equal(closed.code, 1008);
  });

  test('ramki na surowo: fragmenty, ping w środku, długości 16 i 64 bity, close', async () => {
    const r = await raw('/room/RAWAB');
    assert.match(r.headers, /^HTTP\/1\.1 101/);
    const hello = JSON.stringify({ t: 'hello', clientId: 'rawraw1', name: 'R'.repeat(20), caseRef: ref });
    // wiadomość w trzech ramkach, a między nimi ping (dozwolony w trakcie fragmentacji)
    r.write(clientFrame(0x1, hello.slice(0, 10), { fin: false }));
    r.write(clientFrame(0x9, 'hej'));
    r.write(clientFrame(0x0, hello.slice(10, 30), { fin: false }));
    r.write(clientFrame(0x0, hello.slice(30)));
    const pong = await r.frame((f) => f.opcode === 0xa);
    assert.equal(pong.payload.toString(), 'hej');
    assert.equal(pong.masked, false);
    const st = await r.frame((f) => f.opcode === 0x1);
    const msg = JSON.parse(st.payload.toString('utf8'));
    assert.equal(msg.t, 'state');
    assert.equal(msg.you, 'rawraw1');

    // długość 16-bitowa (126..65535): ok
    r.write(clientFrame(0x1, JSON.stringify({ t: 'name', name: 'Z'.repeat(300) })));
    const renamed = JSON.parse((await r.frame((f) => f.opcode === 0x1)).payload.toString('utf8'));
    assert.equal(renamed.state.players[0].name, 'Z'.repeat(24));

    // długość 64-bitowa (> 65535): za długa wiadomość, błąd, ale połączenie żyje
    r.write(clientFrame(0x1, JSON.stringify({ t: 'log', text: 'y'.repeat(70_000) })));
    const err = JSON.parse((await r.frame((f) => f.opcode === 0x1)).payload.toString('utf8'));
    assert.equal(err.t, 'error');
    assert.match(err.msg, /za długa/);

    // fragmenty, które razem przekraczają 16 KB, też są odrzucane
    r.write(clientFrame(0x1, '"' + 'q'.repeat(10_000), { fin: false }));
    r.write(clientFrame(0x0, 'q'.repeat(10_000) + '"'));
    const err2 = JSON.parse((await r.frame((f) => f.opcode === 0x1)).payload.toString('utf8'));
    assert.match(err2.msg, /za długa/);

    // grzeczne zamknięcie: serwer odsyła close i kończy połączenie
    r.write(clientFrame(0x8, Buffer.from([0x03, 0xe8])));
    const close = await r.frame((f) => f.opcode === 0x8);
    assert.equal(close.payload.readUInt16BE(0), 1000);
    await withTimeout(r.endedP, 'koniec TCP po close');
  });

  test('ramki na surowo: brak maski i ramki binarne kończą połączenie', async () => {
    const r = await raw('/room/RAWCD');
    r.write(clientFrame(0x1, '{"t":"ping"}', { mask: false }));
    const close = await r.frame((f) => f.opcode === 0x8);
    assert.equal(close.payload.readUInt16BE(0), 1002);
    await withTimeout(r.endedP, 'koniec TCP po błędzie protokołu', 5000);

    const r2 = await raw('/room/RAWCD');
    r2.write(clientFrame(0x2, Buffer.from([1, 2, 3])));
    const close2 = await r2.frame((f) => f.opcode === 0x8);
    assert.equal(close2.payload.readUInt16BE(0), 1003);
  });
});

describe('bicie serca', { timeout: 10_000 }, () => {
  test('serwer pinguje i rozłącza gniazdo, które milczy', async () => {
    const { server, port } = await startServer({ port: 0, host: '127.0.0.1', heartbeatMs: 100, timeoutMs: 350 });
    let r;
    try {
      r = await withTimeout(rawSocket(port, '/room/BEATS'), 'surowe połączenie');
      r.write(clientFrame(0x1, JSON.stringify({ t: 'hello', clientId: 'silent1' })));
      const ping = await r.frame((f) => f.opcode === 0x9, 2000);
      assert.equal(ping.payload.length, 0);
      // nie odpowiadamy: serwer musi zerwać połączenie
      await withTimeout(r.endedP, 'rozłączenie milczącego gniazda', 3000);
      // serwer może zauważyć zamknięcie chwilę po kliencie
      for (let i = 0; i < 50 && server.rooms.size; i++) await new Promise((ok) => setTimeout(ok, 20));
      assert.equal(server.rooms.size, 0, 'pusty pokój znika');
    } finally {
      r?.sock.destroy();
      await withTimeout(server.shutdown(), 'zamknięcie serwera', 5000);
    }
  });
});
