// Ustawienia, które warto zmienić po wdrożeniu.
export const CONFIG = {
  // Adres gry dopisywany do wyniku udostępnianego znajomym, np.
  // 'https://doubbtx.github.io/detectivle-/'. Pusty = bez adresu.
  shareUrl: '',
  // Adres serwera gry na żywo, np. 'wss://falszywe-alibi.twoje-konto.workers.dev'.
  // Pusty = ten sam adres co gra (działa, gdy grę uruchamia `npm run live`).
  liveServer: '',
  // Kara za błędne oskarżenie i za podpowiedź (w sekundach).
  wrongPenalty: 300,
  hintPenalty: 120,
  maxAttempts: 3,
};
