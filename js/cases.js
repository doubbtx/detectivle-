// Wczytywanie spraw dnia. Opublikowane sprawy leżą w plikach cases/RRRR-MM-DD.json
// i nie zmieniają się nawet po zmianach w generatorze. Jeśli pliku nie ma albo nie pasuje
// do obecnej wersji gry, sprawa powstaje w przeglądarce z generatora.

import { buildDailyCase, buildPracticeCase, caseFingerprint } from './generator.js';
import { solveCase } from './solver.js';

let manifestPromise = null;
function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch('cases/manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { files: {} }))
      .catch(() => ({ files: {} }));
  }
  return manifestPromise;
}

/** Plik jest przyjmowany tylko wtedy, gdy odcisk się zgadza, a obecny solver znajduje to samo jedyne rozwiązanie. */
function usable(c, iso) {
  if (!c || c.date !== iso || !Array.isArray(c.cards) || !c.solution) return false;
  if (c.fingerprint !== caseFingerprint(c)) return false;
  const u = solveCase(c).unique;
  return Boolean(u) && u.culprit === c.solution.culprit && u.forged === c.solution.forged;
}

export async function loadDailyCase(iso) {
  try {
    const manifest = await loadManifest();
    if (manifest.files && manifest.files[iso]) {
      const res = await fetch(`cases/${iso}.json`, { cache: 'no-cache' });
      if (res.ok) {
        const c = await res.json();
        if (usable(c, iso)) return { case: c, source: 'file' };
      }
    }
  } catch {
    /* brak sieci albo plik niedostępny: generujemy lokalnie */
  }
  return { case: buildDailyCase(iso), source: 'generator' };
}

export function loadPracticeCase(code) {
  return { case: buildPracticeCase(code), source: 'generator' };
}
