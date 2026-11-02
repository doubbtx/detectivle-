# Fałszywe Alibi

Codzienna gra detektywistyczna w przeglądarce, w stylu gier dziennych typu Wordle. Codziennie o północy pojawia się nowa sprawa, taka sama dla wszystkich graczy. Można ją rozwiązać **razem ze znajomymi** albo **solo**.

## O co chodzi

Pięcioro podejrzanych ma alibi. Sprawca podrzucił **dokładnie jeden sfałszowany dowód**: bilet na pociąg, który tego dnia nie kursuje, paragon z lokalu zamkniętego o tej godzinie, zdjęcie z suchym chodnikiem w czasie ulewy, adres, którego nie ma w spisie ulic… Dowody leżą na pięciu biurkach (Dokumenty, Świadkowie, Mapa i rozkłady, Zdjęcia, Rejestry), a do obalenia fałszywki zawsze potrzebna jest karta z **innego** biurka (rozkład, rejestr, kamera albo czasy dotarcia).

Dowody mają drobne szczegóły, które sprawdza się w tabelach z innych biurek, i to na każdej karcie danego rodzaju, także prawdziwej: paragon ma ceny, numer z kasy i końcówkę karty (albo „GOTÓWKA”), zdjęcie z Placu Wolności opisuje pokaz fontanny lub iluminacji, a zdjęcie z Rynku tarczę zegara na ratuszu, bilet autobusowy ma numer wozu. Fałszywkę może więc zdradzić cena sprzed zmiany w „Cennikach lokali”, karta innej osoby w „Odpowiedzi banku” (paragon opłacony kartą dowodzi obecności właściciela karty), numer niepasujący do „Raportów kas fiskalnych”, pokaz albo zegar niezgodny z „Komunikatem ZGK” czy wóz, który według „Dyspozycji wozów MZK” jeździł wtedy na innej linii albo nie kursował. Każda z tych tabel leży zawsze, gdy w sprawie jest dowód, którego dotyczy (paragon, paragon opłacony kartą, zdjęcie z placu lub Rynku, bilet autobusowy), więc sama jej obecność niczego nie zdradza.

Na koniec składasz **raport z dochodzenia**: sfałszowany dowód, karta, która go obala, co ta karta pokazuje i (nieobowiązkowo) karty potwierdzające alibi pozostałych. Kto dostarczył fałszywkę, ten jest sprawcą. Są 3 próby. Każda pomyłka dodaje 5 minut do czasu, a każda podpowiedź 2 minuty. Raport dostaje do trzech gwiazdek: za trafny powód, za potwierdzone alibi wszystkich niewinnych i za trafienie za pierwszym razem. Po zamknięciu sprawy czytasz protokół zatrzymania i przyznanie się sprawcy.

Od piątku do niedzieli sprawa jest podchwytliwa: **kłamią dwie osoby**. Fałszywy dowód sprawcy daje mu alibi na czas zbrodni i poza nim sprawca nie ma żadnego alibi. Drugi fałszywy dowód należy do niewinnej osoby, która skłamała w innej sprawie. Zwykle wygląda na zwykłe alibi i to on kłóci się z tabelą urzędową, więc pierwsza znaleziona sprzeczność to pułapka: trzeba sprawdzić, że ta osoba ma inne, potwierdzone alibi (świadek, kamera, rejestr), a fałszywkę sprawcy znaleźć po czasach dotarcia. Czasem godzina na kłamstwie wypada tuż poza zasięgiem miejsca zbrodni.

**Dedukcja rośnie w ciągu tygodnia.** W poniedziałek i wtorek fałszywkę obala karta urzędowa (jedno sprawdzenie). Od środy fałszywka zgadza się ze wszystkimi tabelami, a zdradza ją fizyczna niemożliwość: świadek albo kamera widzi sprawcę gdzie indziej o godzinie, z której nie zdążyłby dotrzeć (trzeba zestawić czasy dotarcia z kilku kart). W sobotę i niedzielę dochodzi **alibi krzyżowe**: sprawca pokazuje wspólny dowód z niewinną osobą, a fałsz wychodzi dopiero po sprawdzeniu, gdzie naprawdę była ta druga osoba (jej prawdziwy pobyt jest na zapieczętowanym nagraniu albo w rejestrze wejść, więc trzeba to zlecić); obok leżą prawdziwe wspólne dowody jako zmyłki. Na nagrania naprowadzają zeznania bez godziny („widziałam go przy Rynku, ale nie wiem, o której”). Solver liczy „głębokość dowodu” (ile kart trzeba zestawić): pn–wt 2, śr–czw 3–4, pt–nd 6–9, a testy pilnują tych progów i tego, że sprawy nie da się rozwiązać samym wykluczaniem bez karty obalającej fałszywkę.

**Nie tylko kradzieże.** Od generatora v10 sprawa ma rodzaj zbrodni (`crimeType`; stare sprawy bez tego pola to kradzieże). Pierwszy nowy rodzaj to **podpalenie z minutnikiem** (szopa kajakowa na przystani „Wiosło” albo magazyn galerii; nikt nie ucierpiał). Rejestr alarmu zapisał dwa otwarcia drzwi, czujka dymu podaje godzinę zapłonu, a opinia biegłego widełki nastawu minutnika. W te widełki trafia tylko jedno otwarcie i to ono jest oknem zbrodni (raz pierwsze, raz drugie). Drugie tłumaczy zeznanie właściciela, który wracał i nie pamięta, o której (oba otwarcia mają długości z tego samego zakresu, więc po długości nie widać, które jest właściwe). Kilka osób ma prawdziwe alibi na samą godzinę zapłonu, ale liczy się chwila podłożenia. Bez opinii biegłego zostają dwie hipotezy w dwóch różnych oknach, więc okna nie da się wybrać przez wykluczanie; solver wybiera je sam (krok „wybór okna” w wyjaśnieniu). Oba okna dają jednak to samo rozwiązanie, więc okno jest częścią opowieści, a nie dowodu, i nie wlicza się do głębokości dowodu (`windowStepNeeded`). Reszta działa jak przy kradzieży. Podpalenia są w czwartki od 12 listopada 2026 i w mniej więcej co trzeciej sprawie treningowej. Teksty zależne od rodzaju zbrodni (zasady, akta, plan, tablica, epilog) są w tablicy `CRIMES` w `js/data.js`.

Drugi nowy rodzaj to **otrucie** (środek nasenny w karafce: sala kominkowa hotelu „Zacisze” albo garderoba dyrygentki w Domu Kultury „Jutrzenka”; poszkodowany przesypia wieczór, nikt nie ucierpiał). To pierwszy **tryb chwili** (`windowFrom: 'moment'`): sprawca był na miejscu tylko przez moment w oknie od wymiany wody w karafce (zeznanie obsługi; raz przy pierwszym, raz przy drugim wejściu) do szklanki, w której według lekarza na pewno był środek (raz pierwsza, raz druga). Pobyt od X do Y w miejscu odległym o d min daje alibi tylko wtedy, gdy X − d < początek okna i Y + d > koniec (zasada `RULE_MOMENT` z przykładem), więc krótki pobyt w pobliżu nie oczyszcza. Każdy pobyt liczy się osobno (dwa doręczenia nie składają się w jedno alibi). Krótki pobyt w oknie mają niewinni tak samo często jak sprawca. Zeszyt obsługi i zeznanie poszkodowanego podają też inne godziny (drugie wejście obsługi, druga szklanka, czasem druga karafka w barze): bez zeznania obsługi albo bez opinii lekarza zostaje kilka możliwych okien. Otrucia są w co drugą środę od 18 listopada 2026 i w mniej więcej co trzeciej sprawie treningowej (bez alibi krzyżowego: przy weekendowej trudności fałszywkę obala fizyczna niemożliwość).

Trudność rośnie w ciągu tygodnia: poniedziałek to około 25 kart i 2 dowody do sprawdzenia, niedziela około 45 kart, pułapki z czasami dotarcia i około 10 dowodów od podejrzanych (część to prawdziwe dowody bez alibi, tzw. przykrywki, żeby samo liczenie kart nie wskazywało sprawcy). W weekend leżą dwa wspólne dowody o identycznej budowie: fałszywy i prawdziwy. Który jest który, wychodzi dopiero z zapieczętowanego nagrania albo rejestru.

### Czynności śledcze

Część kart urzędowych (rozkłady, rejestry, nagrania z kamer, pogoda, godziny otwarcia) jest na start zapieczętowana. Widać tylko tytuł i czynność, np. „Zabezpiecz nagranie: kamera nr 7 · Rynek” (60 min). Każdy gracz ma budżet godzin śledztwa wyliczony z tego, co naprawdę trzeba sprawdzić. Każde rozpoczęte pół godziny nadgodzin dodaje 2 minuty do czasu rozwiązania. Kartą obalającą w raporcie może być tylko otwarta karta. Po pierwszej pomyłce gra mówi tylko „raport nietrafny”, a dopiero po drugiej, która część była zła. Gra w innym trybie po podejrzeniu rozwiązania albo próbach to „powtórka” bez serii i statystyk. W grze zespołowej każdy ma własny budżet, a godziny są tylko informacją (wynikiem jest czas kapitana). Zeznania świadków, czasy dotarcia i dowody od podejrzanych są odkryte od początku.

### Gra z ekipą (2–5 osób)

Każdy otwiera grę na swoim telefonie lub komputerze, klika **Graj z ekipą**, wybiera tę samą liczbę osób i **inny numer gracza**. Każdy widzi tylko swoje biurka, więc trzeba rozmawiać: na Discordzie, przez telefon albo przy stole. Karty można wklejać na czat przyciskiem „Kopiuj”. Oskarżenie składa gracz 1 (kapitan), a jego czas jest wynikiem ekipy.

Biurka są podzielone tak, że fałszywka i karta, która ją obala (rozkład, rejestr, nagranie z kamery albo zeznanie z tej sprawy), zawsze trafiają do różnych osób. Plan miasta się nie liczy, bo jest co dzień ten sam. Nikt nie rozwiąże sprawy sam.

Pomyłka przy wyborze liczby osób albo numeru? Na stronie głównej jest „Zmień ekipę lub numer”. Każde ustawienie ma osobny zapis postępu. Po przeładowaniu strony gra wraca prosto do rozpoczętej sprawy.

### Gra na żywo (wspólny pokój)

Jeden link dla całej ekipy: „Graj z ekipą na żywo” tworzy pokój (np. `#pokoj-AX8L4`), reszta otwiera ten link i wpisuje imię. Miejsca przydzielają się w kolejności wejścia. Zegar, podpowiedzi, próby, budżet godzin śledztwa i wynik są wspólne. Karty można kłaść na wspólny stół, a ustalenia zapisywać na tablicy. Raport może złożyć każdy. Po zerwaniu połączenia albo odświeżeniu strony gra wraca do pokoju.

Potrzebny jest serwer:

- **na komputerze:** `npm run live`, potem http://localhost:8787 (serwer obsługuje też samą grę; znajomi w tej samej sieci wchodzą na adres twojego komputera),
- **publicznie:** darmowy Cloudflare Workers z Durable Objects, instrukcja w [`server/README.md`](server/README.md); adres serwera wpisz w `js/config.js` jako `liveServer`.

Przycisk gry na żywo pojawia się tylko wtedy, gdy serwer jest dostępny. W podglądzie na claude.ai tryb na żywo nie działa, bo strona nie może łączyć się z zewnętrznymi serwerami.

### Solo

Ta sama sprawa dnia, ale widzisz wszystkie biurka.

### Trening

Sprawy treningowe nie liczą się do serii. Każda ma 4-znakowy kod, np. `K7Q2`. Ten sam kod daje tę samą sprawę, więc ekipa może zagrać razem dowolną liczbę spraw dziennie. Link do sprawy treningowej: `adres-gry/#sprawa-K7Q2`.

### Nawigacja i porównywanie

W grze są trzy miejsca: **Sprawa** (akta, podejrzani, zasady), **Dowody** (wszystkie karty z twoich biurek, z filtrami biurek i „★ Ważne”) i **Tablica** (oś czasu z teczkami osób, plan miasta i notatki). Przycisk **„Porównaj”** na karcie dodaje ją do porównania (do 3 kart): okno pokazuje karty obok siebie, odstępy między godzinami, drogę po planie i odległość do miejsca zdarzenia. Gra tylko zestawia liczby z kart, nie ocenia, co jest sprzeczne.

### Plan miasta

Wszystkie sprawy dzieją się w tym samym miasteczku, Borowicach. Na biurku „Mapa i rozkłady” leży plan miasta z polami miejsc (jak w skorowidzu papierowego planu: kolumny A–T, wiersze 1–14), a w grze zakładka **Plan miasta** pokazuje go jako ilustrowaną mapę. Ulice tworzą siatkę, więc czas między dwoma miejscami to liczba przecznic w poziomie plus w pionie razy 2 minuty. Dotknięcie dwóch miejsc rysuje trasę po ulicach i podaje czas. W grze z ekipą plan ma osoba z biurkiem „Mapa i rozkłady”, więc reszta pyta ją o odległości.

## Uruchomienie

Gra to zwykłe pliki HTML, CSS i JavaScript, bez bibliotek i bez kroku budowania. Potrzebny jest tylko dowolny serwer plików statycznych, bo moduły JavaScript nie działają po otwarciu `index.html` prosto z dysku.

```bash
npm start          # http://localhost:8080
npm test           # testy generatora i solvera
npm run case 2026-11-08 -- --solution   # podgląd sprawy z danego dnia w terminalu
```

Wymagany Node.js 18 lub nowszy (tylko do serwera i testów; sama gra działa w przeglądarce).

## Zamrożone akta

Sprawy dnia są zapisane w plikach `cases/RRRR-MM-DD.json`, a ich sumy kontrolne w `cases/manifest.json`. Gra najpierw czyta plik, więc późniejsza zmiana generatora nie przepisze już opublikowanych spraw. Jeśli pliku dla danego dnia nie ma, sprawa powstaje w przeglądarce z generatora. Ekipa porównuje 4-znakowy odcisk sprawy (np. `V8V4`) widoczny na ekranie ustawienia ekipy. Odcisk liczy się z całej sprawy razem z `generatorVersion`, więc po podbiciu wersji zmienia się odcisk każdej generowanej sprawy (także treningowej z kradzieżą), choć jej treść zostaje ta sama. Plik `cases/2026-11-02.json` powstał na generatorze v8 i różni się od tego, co dziś daje generator dla tej daty: tę sprawę chroni wyłącznie plik.

```bash
node scripts/publish-cases.mjs            # dopisz sprawy do dziś + 60 dni (istniejących nie rusza)
node scripts/publish-cases.mjs --days 90  # dalej w przyszłość
node scripts/publish-cases.mjs --force --from 2026-12-20   # przegeneruj przyszłe dni (minione wymagają --i-know)
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
| `js/town.js` | Stały plan Borowic: pole (A–T × 1–14) każdego miejsca i każdej sceny. Czas dotarcia = przecznice w poziomie + w pionie × 2 min. |
| `js/map.js` | Ilustrowany plan miasta (SVG): ulice z nazwami, kamienice, rynek, rzeka z mostami, park, tory; trasa między dwoma wybranymi miejscami. |
| `js/icons.js` | Wybrane ikony [Lucide](https://lucide.dev) (licencja ISC, tekst licencji w pliku). |
| `js/main.js` | Interfejs: ekrany, zegar, podpowiedzi, oskarżenie, wynik do udostępnienia, statystyki. |
| `server/room.js` | Logika pokoju gry na żywo i protokół WebSocket, wspólna dla obu serwerów i testów. |
| `server/node-server.mjs` | Serwer lokalny bez zależności: gra + WebSocket (`npm run live`). |
| `server/worker.js`, `wrangler.toml` | Wersja serwera na Cloudflare Workers z Durable Objects. |
| `js/live.js` | Połączenie z serwerem w przeglądarce (ponowne łączenie, zegar serwera). |
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

- **Ranking ekip** i stałe ekipy z historią na serwerze gry na żywo.
- **Ukrycie rozwiązania**: dziś całą sprawę liczy przeglądarka, więc da się ją podejrzeć w narzędziach dla programistów. Serwer mógłby wysyłać każdemu tylko jego biurka.
- Nowe rodzaje fałszerstw i scen, archiwum spraw z poprzednich dni.
