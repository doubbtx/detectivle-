// Połączenie z serwerem gry na żywo (WebSocket). Łączy się ponownie po zerwaniu,
// wysyła ping i liczy różnicę między zegarem serwera a zegarem przeglądarki.

import { CONFIG } from './config.js';

/** Adres serwera: z config.js albo ten sam host, z którego wczytano grę (serwer lokalny `npm run live`). */
export function liveServerUrl() {
  if (CONFIG.liveServer) return CONFIG.liveServer.replace(/\/$/, '');
  if (!/^https?:$/.test(window.location.protocol)) return '';
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
}

export function randomClientId() {
  const a = 'abcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/**
 * @param {object} o
 * @param {string} o.room kod pokoju
 * @param {() => object} o.hello funkcja zwracająca wiadomość hello (wywoływana przy każdym połączeniu)
 * @param {(msg: object) => void} o.onState
 * @param {(msg: string) => void} o.onError
 * @param {(status: 'connecting'|'open'|'closed') => void} o.onStatus
 */
export function connectLive({ room, hello, onState, onError, onStatus }) {
  const base = liveServerUrl();
  let ws = null;
  let closedByUser = false;
  let retry = 0;
  let pingTimer = null;
  let retryTimer = null;
  let everOpened = false;
  const live = { offset: 0, send, close, get open() { return ws?.readyState === 1; } };

  function open() {
    if (!base) {
      onError('Brak adresu serwera gry na żywo. Ustaw liveServer w js/config.js albo uruchom grę przez „npm run live”.');
      onStatus('closed');
      return;
    }
    onStatus('connecting');
    try {
      ws = new WebSocket(`${base}/room/${room}`);
    } catch {
      onError('Nie udało się połączyć z serwerem gry na żywo.');
      scheduleRetry();
      return;
    }
    ws.addEventListener('open', () => {
      everOpened = true;
      retry = 0;
      onStatus('open');
      ws.send(JSON.stringify(hello()));
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ t: 'ping' }), 20000);
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (typeof msg.now === 'number') live.offset = msg.now - Date.now();
      if (msg.t === 'state') onState(msg);
      else if (msg.t === 'error') onError(msg.msg);
    });
    ws.addEventListener('close', () => {
      clearInterval(pingTimer);
      onStatus('closed');
      if (!closedByUser) scheduleRetry();
    });
    ws.addEventListener('error', () => {
      if (!everOpened && retry === 0) onError('Serwer gry na żywo nie odpowiada. Próbuję ponownie…');
    });
  }

  function scheduleRetry() {
    if (closedByUser) return;
    clearTimeout(retryTimer);
    const delay = Math.min(15000, 1000 * 2 ** retry);
    retry += 1;
    retryTimer = setTimeout(open, delay);
  }

  function send(msg) {
    if (ws?.readyState === 1) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  function close() {
    closedByUser = true;
    clearInterval(pingTimer);
    clearTimeout(retryTimer);
    try {
      ws?.close();
    } catch {
      /* już zamknięte */
    }
  }

  open();
  return live;
}
