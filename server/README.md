# Serwer gry na żywo

Gra na żywo potrzebuje małego serwera, który trzyma stan pokoju i rozsyła ruchy
wszystkim graczom. Sama gra (strona) dalej leży na GitHub Pages – serwer to osobna rzecz.

Pliki:

- `room.js` – logika pokoju (wspólna dla obu serwerów, testy w `tests/room.test.mjs`),
- `node-server.mjs` – serwer do grania lokalnie (`npm run live`),
- `worker.js` + `../wrangler.toml` – ten sam serwer w Cloudflare (za darmo, działa 24/7).

## Granie lokalnie

```
npm run live
```

Otwórz adres wypisany w terminalu (domyślnie http://localhost:8787). Gra i serwer działają
wtedy pod tym samym adresem, więc w `js/config.js` niczego nie trzeba ustawiać. Znajomi
w tej samej sieci Wi-Fi mogą wejść przez adres IP twojego komputera.

## Wdrożenie w Cloudflare (krok po kroku)

Potrzebujesz Node.js 18 lub nowszego. Plan darmowy wystarcza.

1. Załóż darmowe konto na https://dash.cloudflare.com/sign-up (wystarczy e-mail).
   Przy pierwszym wejściu w „Workers & Pages” wybierz sobie subdomenę `<konto>.workers.dev`.
2. W folderze gry zaloguj się (otworzy się przeglądarka, kliknij „Allow”):
   ```
   npx wrangler login
   ```
3. Wdróż serwer:
   ```
   npx wrangler deploy
   ```
   Na końcu zobaczysz adres w rodzaju `https://falszywe-alibi.<konto>.workers.dev`.
4. Sprawdź, że działa: otwórz `https://falszywe-alibi.<konto>.workers.dev/health` –
   powinno się pokazać `ok`.
5. Wpisz adres w `js/config.js`, zamieniając `https://` na `wss://`:
   ```js
   liveServer: 'wss://falszywe-alibi.<konto>.workers.dev',
   ```
   (Klucz `liveServer` dodaje osoba, która robi interfejs gry; jeśli go jeszcze nie ma,
   poczekaj na jej zmiany.)
6. Wypchnij zmianę na GitHuba, żeby GitHub Pages pokazał nową wersję gry. Gotowe.

Po każdej zmianie w `server/worker.js` albo `server/room.js` wystarczy znów
`npx wrangler deploy`. Podgląd błędów na żywo: `npx wrangler tail`.

## Dobrze wiedzieć

- Każdy pokój to osobny Durable Object. Pokój bez graczy znika sam po 24 godzinach.
- Limity: do 5 graczy w pokoju, wiadomość do 16 KB, 30 wiadomości na 10 sekund na
  połączenie (przy zasypywaniu serwer się rozłącza).
- Serwer przyjmuje połączenia z każdej strony (nie sprawdza nagłówka Origin) – to gra
  dla znajomych, pokój chroni tylko jego kod.
- Lokalny podgląd wersji Cloudflare (bez wdrażania): `npx wrangler dev`.
