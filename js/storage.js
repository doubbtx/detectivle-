// Bezpieczny dostęp do localStorage: w trybie prywatnym albo przy zablokowanych
// danych strony gra działa dalej, tylko bez zapamiętywania postępu.
const PREFIX = 'fa1:';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* brak miejsca albo zablokowane dane: ignorujemy */
    }
  },
};
