// Obrazki na kartach: dowody wyglądają jak prawdziwe przedmioty (bilet, paragon, zdjęcie z telefonu,
// ekran kamery, dymek świadka). Rysunek pokazuje to samo, co tekst karty, nic więcej: dane do dedukcji
// (godziny, numery) zostają w liniach karty bez zmian.

import { PLACES } from './data.js';
import { icon } from './icons.js';
import { portrait } from './portraits.js';
import { fmt } from './time.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const claimOf = (k) => (k.facts || []).find((f) => f.t === 'claim');
const has = (k, t) => (k.facts || []).some((f) => f.t === t);

/** Rodzaj wyglądu karty (klasa CSS) albo null. */
export function cardLook(k) {
  const cl = claimOf(k);
  if (cl) return { train: 'ticket', bus: 'ticket', cinema: 'ticket', parking: 'ticket', receipt: 'receipt', photo: 'photo', delivery: 'phone' }[cl.kind] || null;
  if (k.kind === 'witness') return 'witness';
  if (k.title === 'Monitoring miejski') return 'cctv';
  if (has(k, 'train') || has(k, 'bus') || has(k, 'vehicle')) return 'board';
  if (has(k, 'weather')) return 'weather';
  return null;
}

/** Ikona tytułu karty (także zapieczętowanej). */
export function cardIcon(k) {
  const cl = claimOf(k);
  if (cl) return { train: 'train-front', bus: 'bus-front', cinema: 'clapperboard', parking: 'ticket', receipt: 'receipt', photo: 'camera', delivery: 'smartphone' }[cl.kind] || 'file-text';
  if (k.kind === 'witness') return 'message-circle';
  if (/Monitoring|Kamera/.test(k.title)) return 'cctv';
  if (has(k, 'train')) return 'train-front';
  if (has(k, 'bus')) return 'bus-front';
  if (has(k, 'weather')) return 'cloud-rain';
  if (has(k, 'sunset')) return 'sun';
  if (has(k, 'hours')) return 'clock';
  if (has(k, 'pricelist')) return 'tag';
  if (has(k, 'bankcard')) return 'credit-card';
  if (has(k, 'fiscal')) return 'printer';
  if (has(k, 'shows')) return (k.facts || []).find((f) => f.t === 'shows').kind === 'fountain' ? 'droplets' : 'sparkles';
  if (has(k, 'vehicle')) return 'warehouse';
  if (has(k, 'screening')) return 'clapperboard';
  if (has(k, 'grid')) return 'map';
  if (has(k, 'cardlog') || has(k, 'cardowner')) return 'file-text';
  return 'file-text';
}

/** Scena na „zdjęciu z telefonu”: niebo, latarnie, deszcz i kałuże, charakterystyczne miejsce, osoby. */
function photoScene(cl) {
  const night = cl.sky !== 'day';
  const wet = cl.ground === 'wet';
  const two = Boolean(cl.with?.length);
  const W = 280;
  const H = 150;
  const p = [];
  p.push(`<svg class="ph-scene" viewBox="0 0 ${W} ${H}" aria-hidden="true">`);
  p.push(`<defs><linearGradient id="sky-${night ? 'n' : 'd'}" x1="0" y1="0" x2="0" y2="1">${night ? '<stop offset="0" stop-color="#1c2340"/><stop offset="1" stop-color="#3b3f63"/>' : '<stop offset="0" stop-color="#9cc6e8"/><stop offset="1" stop-color="#f3d9a8"/>'}</linearGradient></defs>`);
  p.push(`<rect width="${W}" height="${H}" fill="url(#sky-${night ? 'n' : 'd'})"/>`);
  if (night) for (let i = 0; i < 14; i++) p.push(`<circle cx="${(i * 47) % W}" cy="${8 + ((i * 29) % 46)}" r="${i % 3 ? 0.8 : 1.3}" fill="#fff" opacity="0.8"/>`);
  else p.push('<circle cx="236" cy="78" r="16" fill="#f7c35f" opacity="0.9"/>');
  // Tło: charakterystyczne miejsce
  const ink = night ? '#141830' : '#6b5a4a';
  const place = cl.place;
  if (place === 'park') {
    for (const [x, r] of [[40, 26], [92, 32], [200, 28], [250, 22]]) p.push(`<circle cx="${x}" cy="${100 - r * 0.6}" r="${r}" fill="${night ? '#1f3a2c' : '#5f8a4f'}"/><rect x="${x - 3}" y="${96}" width="6" height="18" fill="${ink}"/>`);
  } else if (place === 'bulwar') {
    p.push(`<rect x="0" y="92" width="${W}" height="14" fill="${night ? '#22305a' : '#7fb0d6'}"/><line x1="0" y1="92" x2="${W}" y2="92" stroke="${ink}" stroke-width="2"/>`);
    for (let x = 6; x < W; x += 18) p.push(`<line x1="${x}" y1="82" x2="${x}" y2="92" stroke="${ink}" stroke-width="2"/>`);
    p.push(`<line x1="0" y1="82" x2="${W}" y2="82" stroke="${ink}" stroke-width="2"/>`);
  } else if (place === 'plac') {
    p.push(`<rect x="10" y="70" width="70" height="44" fill="${ink}" opacity="0.7"/><rect x="200" y="64" width="72" height="50" fill="${ink}" opacity="0.7"/>`);
    // Pokaz z komunikatu ZGK: latem strumienie fontanny, zimą kolorowe światła na pomniku (rysunek = tekst karty).
    if (cl.show && cl.showKind === 'lights') {
      for (const [x, c] of [[96, '#e05a9b'], [184, '#4fb3e8'], [140, '#f2c94c']]) p.push(`<polygon points="${x},112 ${x === 140 ? 128 : x < 140 ? 122 : 146},40 ${x === 140 ? 152 : x < 140 ? 136 : 160},40" fill="${c}" opacity="0.35"/>`);
    }
    p.push(`<rect x="126" y="54" width="28" height="56" fill="${ink}"/><rect x="118" y="104" width="44" height="8" fill="${ink}"/><circle cx="140" cy="48" r="9" fill="${ink}"/>`);
    if (cl.showKind === 'fountain') {
      p.push(`<ellipse cx="140" cy="112" rx="46" ry="6" fill="${night ? '#2f4f7a' : '#8fc1e3'}" stroke="${ink}" stroke-width="2"/>`);
      if (cl.show) for (const dx of [-34, -18, 18, 34]) p.push(`<path d="M ${140 + dx} 110 Q ${140 + dx * 0.6} ${62} ${140 + dx * 0.25} 108" fill="none" stroke="${night ? '#9fd4ff' : '#e9f6ff'}" stroke-width="3" opacity="0.9"/>`);
    }
  } else {
    // Rynek z ratuszem; tarcza zegara podświetlona, ciemna albo zasłonięta rusztowaniem (jak w opisie zdjęcia).
    const clock = cl.clock || (night ? 'lit' : 'day');
    p.push(`<rect x="96" y="52" width="88" height="62" fill="${ink}"/><rect x="128" y="22" width="24" height="32" fill="${ink}"/><polygon points="126,22 140,8 154,22" fill="${ink}"/>`);
    if (clock === 'scaffold') {
      for (let x = 122; x <= 158; x += 9) p.push(`<line x1="${x}" y1="14" x2="${x}" y2="56" stroke="#b08a4a" stroke-width="2"/>`);
      for (let y = 18; y <= 54; y += 9) p.push(`<line x1="120" y1="${y}" x2="160" y2="${y}" stroke="#b08a4a" stroke-width="2"/>`);
    } else {
      if (clock === 'lit') p.push('<circle cx="140" cy="36" r="11" fill="#f2d27a" opacity="0.3"/>');
      p.push(`<circle cx="140" cy="36" r="6" fill="${clock === 'lit' ? '#f2d27a' : clock === 'dark' ? '#3a3f55' : '#efe6d2'}"/>`);
    }
    p.push(`<rect x="8" y="72" width="70" height="42" fill="${ink}" opacity="0.7"/><rect x="204" y="68" width="68" height="46" fill="${ink}" opacity="0.7"/>`);
    if (night) for (const [x, y] of [[106, 66], [120, 66], [160, 66], [174, 66], [20, 84], [44, 84], [216, 80], [244, 80]]) p.push(`<rect x="${x}" y="${y}" width="6" height="8" fill="#f2d27a" opacity="0.85"/>`);
  }
  // Latarnie
  for (const x of [22, 258]) {
    p.push(`<line x1="${x}" y1="114" x2="${x}" y2="74" stroke="${ink}" stroke-width="3"/><rect x="${x - 5}" y="68" width="10" height="8" rx="2" fill="${night ? '#f6d77c' : ink}"/>`);
    if (night) p.push(`<circle cx="${x}" cy="74" r="16" fill="#f6d77c" opacity="0.18"/>`);
  }
  // Chodnik
  p.push(`<rect x="0" y="112" width="${W}" height="${H - 112}" fill="${wet ? (night ? '#2a2d40' : '#7b7f8c') : (night ? '#4a4558' : '#cdbb9a')}"/>`);
  if (wet) {
    for (const [x, w] of [[30, 46], [150, 60], [226, 34]]) p.push(`<ellipse cx="${x}" cy="${132}" rx="${w / 2}" ry="4" fill="${night ? '#5b6a9a' : '#a9c4dc'}" opacity="0.7"/>`);
    for (let i = 0; i < 40; i++) p.push(`<line x1="${(i * 37) % W}" y1="${(i * 23) % 110}" x2="${((i * 37) % W) - 4}" y2="${((i * 23) % 110) + 10}" stroke="#cfe0f5" stroke-width="1" opacity="0.6"/>`);
  }
  // Osoby (sylwetki); w deszczu z parasolem
  const people = two ? [128, 152] : [140];
  for (const x of people) {
    p.push(`<circle cx="${x}" cy="${96}" r="7" fill="${night ? '#e9e4ff' : '#3a3550'}"/><path d="M ${x - 10} 128 Q ${x} 100 ${x + 10} 128 Z" fill="${night ? '#e9e4ff' : '#3a3550'}"/>`);
  }
  if (wet) p.push(`<path d="M ${people[0] - 22} 88 Q ${people[0]} 66 ${people[0] + 22} 88 Z" fill="#b3261e" opacity="0.9"/><line x1="${people[0]}" y1="88" x2="${people[0]}" y2="100" stroke="#3a3550" stroke-width="1.5"/>`);
  p.push('</svg>');
  return p.join('');
}

/** Obrazek nad liniami karty (albo pusty napis). */
export function cardVisual(k, { suspectById }) {
  const look = cardLook(k);
  const cl = claimOf(k);
  if (look === 'witness') {
    const name = k.title.replace(/^Zeznanie:\s*/, '');
    const face = portrait(name, 'portrait portrait-witness');
    return face ? `<div class="wit-face">${face}</div>` : `<div class="wit-face wit-initials" aria-hidden="true">${esc(name.split(' ').map((x) => x[0]).join(''))}</div>`;
  }
  if (look === 'photo' && cl) {
    return `<figure class="ph-polaroid">${photoScene(cl)}<figcaption>${esc(PLACES[cl.place]?.name || '')} · ${fmt(cl.time)}</figcaption></figure>`;
  }
  if (look === 'weather') {
    // Pasek 16:00–24:00 z zaznaczonym deszczem (godziny zostają w liniach karty).
    const rains = (k.facts || []).filter((f) => f.t === 'rain');
    const A = 16 * 60;
    const B = 24 * 60;
    const pct = (m) => ((Math.min(B, Math.max(A, m)) - A) / (B - A)) * 100;
    const ticks = [16, 18, 20, 22, 24].map((h) => `<span class="wx-tick" style="left:${pct(h * 60)}%">${h}</span>`).join('');
    const segs = rains.map((r) => `<span class="wx-rain" style="left:${pct(r.from)}%;width:${pct(r.to) - pct(r.from)}%">${icon('cloud-rain')}</span>`).join('');
    return `<div class="wx-bar" aria-hidden="true"><div class="wx-track">${segs}</div>${ticks}</div>`;
  }
  if (look === 'cctv') {
    const time = (k.lines[1] || '').match(/(\d{1,2}:\d{2})/)?.[1] || '';
    const cam = (k.lines[0] || '').match(/nr (\d+)/)?.[1] || '';
    return `<div class="cctv-screen" aria-hidden="true"><span class="cctv-rec">● REC</span><span class="cctv-cam">CAM ${esc(cam)}</span><svg viewBox="0 0 120 50" class="cctv-fig"><circle cx="60" cy="16" r="7" fill="#9fb3a3"/><path d="M48 46 Q60 18 72 46 Z" fill="#9fb3a3"/></svg><span class="cctv-time">${esc(time)}</span></div>`;
  }
  return '';
}
