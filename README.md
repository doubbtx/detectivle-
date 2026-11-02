# Fałszywe Alibi

Codzienna gra detektywistyczna w przeglądarce, w stylu gier dziennych typu Wordle. Codziennie o północy pojawia się nowa sprawa, taka sama dla wszystkich graczy. Można ją rozwiązać **razem ze znajomymi** albo **solo**.

## O co chodzi

Pięcioro podejrzanych ma alibi. Sprawca podrzucił **dokładnie jeden sfałszowany dowód**: bilet na pociąg, który tego dnia nie kursuje, paragon z lokalu zamkniętego o tej godzinie, zdjęcie z suchym chodnikiem w czasie ulewy, adres, którego nie ma w spisie ulic… Dowody leżą na pięciu biurkach (Dokumenty, Świadkowie, Mapa i rozkłady, Zdjęcia, Rejestry), a fałszywkę zawsze obala karta z **innego** biurka.

Na koniec składasz **raport z dochodzenia**: sfałszowany dowód, karta, która go obala, co ta karta pokazuje i (nieobowiązkowo) karty potwierdzające alibi pozostałych. Kto dostarczył fałszywkę, ten jest sprawcą. Są 3 próby. Każda pomyłka dodaje 5 minut do czasu, a każda podpowiedź 2 minuty. Raport dostaje do trzech gwiazdek: za trafny powód, za potwierdzone alibi wszystkich niewinnych i za trafienie za pierwszym razem. Po zamknięciu sprawy czytasz protokół zatrzymania i przyznanie się sprawcy.

Trudność rośnie w ciągu tygodnia: poniedziałek to około 25 kart i 2 dowody do sprawdzenia, niedziela około 45 kart, pułapki z czasami dotarcia i 5 dowodów od podejrzanych.

### Gra z ekipą (2–5 osób)

Każdy otwiera grę na swoim telefonie lub komputerze, klika **Graj z ekipą**, wybiera tę samą liczbę osób i **inny numer gracza**. Każdy widzi tylko swoje biurka, więc trzeba rozmawiać: na Discordzie, przez telefon albo przy stole. Karty można wklejać na czat przyciskiem „Kopiuj”. Oskarżenie składa gracz 1 (kapitan), a jego czas jest wynikiem ekipy.

Biurka są podzielone tak, że fałszywka i karta, która ją obala, zawsze trafiają do różnych osób. Nikt nie rozwiąże sprawy sam.

Pomyłka przy wyborze liczby osób albo numeru? Na stronie głównej jest „Zmień ekipę lub numer”. Każde ustawienie ma osobny zapis postępu. Po przeładowaniu strony gra wraca prosto do rozpoczętej sprawy.

### Solo

Ta sama sprawa dnia, ale widzisz wszystkie biurka.

### Trening

Sprawy treningowe nie liczą się do serii. Każda ma 4-znakowy kod, np. `K7Q2`. Ten sam kod daje tę samą sprawę, więc ekipa może zagrać razem dowolną liczbę spraw dziennie. Link do sprawy treningowej: `adres-gry/#sprawa-K7Q2`.

## Uruchomienie

Gra to zwykłe pliki HTML, CSS i JavaScript, bez bibliotek i bez kroku budowania. Potrzebny jest tylko dowolny serwer plików statycznych, bo moduły JavaScript nie działają po otwarciu `index.html` prosto z dysku.

```bash
npm start          # http://localhost:8080
npm test           # testy generatora i solvera
npm run case 2026-11-08 -- --solution   # podgląd sprawy z danego dnia w terminalu
```

Wymagany Node.js 18 lub nowszy (tylko do serwera i testów; sama gra działa w przeglądarce).

## Zamrożone akta

Sprawy dnia są zapisane w plikach `cases/RRRR-MM-DD.json`, a ich sumy kontrolne w `cases/manifest.json`. Gra najpierw czyta plik, więc późniejsza zmiana generatora nie przepisze już opublikowanych spraw. Jeśli pliku dla danego dnia nie ma, sprawa powstaje w przeglądarce z generatora. Ekipa porównuje 4-znakowy odcisk sprawy (np. `V8V4`) widoczny na ekranie ustawienia ekipy.

```bash
node scripts/publish-cases.mjs            # dopisz sprawy do dziś + 60 dni (istniejących nie rusza)
node scripts/publish-cases.mjs --days 90  # dalej w przyszłość
```

Skrypt warto uruchamiać co kilka tygodni, zanim skończą się opublikowane dni. Test `tests/cases.test.mjs` pilnuje, że nikt nie zmienił opublikowanych plików. Link `adres-gry/#dzien-RRRR-MM-DD` otwiera sprawę z danego dnia (np. w zaproszeniu wysłanym tuż przed północą). Starsze sprawy nie liczą się do serii.

## Wdrożenie na GitHub Pages

1. Wypchnij repozytorium na GitHuba.
2. W repozytorium: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, wybierz gałąź i folder `/ (root)`.
3. Po minucie gra będzie pod adresem `https://<użytkownik>.github.io/<repozytorium>/`.
4. Wpisz ten adres w `js/config.js` (`shareUrl`), żeby trafiał do wyników udostępnianych znajomym.

## Jak to działa

| Plik | Co robi |
|---|---|
| `js/generator.js` | Tworzy sprawę z daty (ten sam dzień = ta sama sprawa u wszystkich). Losuje scenę, podejrzanych, okno czasowe, alibi, jeden sfałszowany dowód i karty-szum. |
| `js/solver.js` | Niezależny solver. Czyta tylko fakty zapisane na kartach i sprawdza wszystkie hipotezy „kto i którym dowodem”, łącznie ze spójnością fizyczną (nikt nie jest w dwóch miejscach naraz, a przejście z A do B trwa co najmniej różnicę ich czasów dotarcia). Sprawa trafia do gry tylko wtedy, gdy ma **dokładnie jedno** rozwiązanie i przechodzi kontrolę jakości: każdy niewinny ma potwierdzone alibi, fałszywka dawałaby sprawcy alibi i obala ją tylko jedna karta, a przy każdej wielkości ekipy fałszywka i jej obalenie są u różnych graczy. |
| `js/data.js` | Treści: postacie z odmianą imion, miejsca, sceny, podział biurek między graczy, zasady. |
| `js/main.js` | Interfejs: ekrany, zegar, podpowiedzi, oskarżenie, wynik do udostępnienia, statystyki. |
| `js/config.js` | Ustawienia: adres gry do wyników, kary czasowe, liczba prób. |
| `tests/` | Testy: 400 kolejnych dni i 300 spraw treningowych, deterministyczność, wykrywanie zepsutych spraw, osobna (niezależna od solvera) kontrola spójności pobytów. |

Postęp gry, notatki i statystyki zapisują się w `localStorage` przeglądarki. Gra nie ma serwera, więc nie ma też globalnego rankingu ani synchronizacji między graczami.

### Rodzaje fałszerstw

| Dowód od podejrzanego | Co go obala |
|---|---|
| Bilet kolejowy | Rozkład jazdy (pociąg nie kursuje tego dnia albo odjeżdża o innej godzinie) |
| Paragon | Godziny otwarcia lokali |
| Zdjęcie z telefonu | Stacja meteo (deszcz) albo kalendarz astronomiczny (zachód słońca) |
| Bilet do kina | Repertuar kina |
| Zrzut ekranu z aplikacji kurierskiej | Spis ulic i numeracji |
| Bilet parkingowy | Godziny działania strefy płatnego parkowania |
| Bilet autobusowy | Rozkład odjazdów z przystanku |

## Pomysły na dalszy rozwój

- **Wspólna tablica na żywo**: mały serwer (np. Supabase, PartyKit albo Cloudflare Durable Objects) z jednym „pokojem” na ekipę: przypinanie kart, wspólny zegar, ranking ekip.
- **Ukrycie rozwiązania**: dziś całą sprawę liczy przeglądarka, więc da się ją podejrzeć w narzędziach dla programistów. Serwer mógłby wysyłać każdemu tylko jego biurka.
- Nowe rodzaje fałszerstw i scen, archiwum spraw z poprzednich dni.
