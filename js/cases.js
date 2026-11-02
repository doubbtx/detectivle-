// Wczytywanie spraw dnia. Opublikowane sprawy leżą w plikach cases/RRRR-MM-DD.json
// i nie zmieniają się nawet po zmianach w generatorze. Jeśli pliku nie ma
// (np. dzień jeszcze nieopublikowany albo gra otwarta bez serwera), sprawa
// powstaje w przeglądarce z generatora.

import { buildDailyCase, buildPracticeCase } from './generator.js';

export async function loadDailyCase(iso) {
  try {
    const res = await fetch(`cases/${iso}.json`, { cache: 'no-cache' });
    if (res.ok) {
      const c = await res.json();
      if (c && c.date === iso && Array.isArray(c.cards) && c.solution) return { case: c, source: 'file' };
    }
  } catch {
    /* brak sieci albo plik niedostępny: generujemy lokalnie */
  }
  return { case: buildDailyCase(iso), source: 'generator' };
}

export function loadPracticeCase(code) {
  return { case: buildPracticeCase(code), source: 'generator' };
}
