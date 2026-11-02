// Biblioteka treści: postacie, miejsca, sceny zbrodni i teksty kart.
// Wszystko dzieje się w fikcyjnym mieście Borowice.

export const TOWN = 'Borowice';

/** Podejrzani. Formy: first (mianownik), gen (dopełniacz), acc (biernik), ins (narzędnik). */
export const CHARACTERS = [
  { full: 'Halina Wrona', first: 'Halina', gen: 'Haliny', acc: 'Halinę', ins: 'Haliną', fullAcc: 'Halinę Wronę', f: true },
  { full: 'Celina Mazur', first: 'Celina', gen: 'Celiny', acc: 'Celinę', ins: 'Celiną', fullAcc: 'Celinę Mazur', f: true },
  { full: 'Ewa Nowicka', first: 'Ewa', gen: 'Ewy', acc: 'Ewę', ins: 'Ewą', fullAcc: 'Ewę Nowicką', f: true },
  { full: 'Olga Wiśniewska', first: 'Olga', gen: 'Olgi', acc: 'Olgę', ins: 'Olgą', fullAcc: 'Olgę Wiśniewską', f: true },
  { full: 'Jadwiga Kos', first: 'Jadwiga', gen: 'Jadwigi', acc: 'Jadwigę', ins: 'Jadwigą', fullAcc: 'Jadwigę Kos', f: true },
  { full: 'Lena Dąbrowska', first: 'Lena', gen: 'Leny', acc: 'Lenę', ins: 'Leną', fullAcc: 'Lenę Dąbrowską', f: true },
  { full: 'Zofia Pawlak', first: 'Zofia', gen: 'Zofii', acc: 'Zofię', ins: 'Zofią', fullAcc: 'Zofię Pawlak', f: true },
  { full: 'Agata Sobczak', first: 'Agata', gen: 'Agaty', acc: 'Agatę', ins: 'Agatą', fullAcc: 'Agatę Sobczak', f: true },
  { full: 'Weronika Krawczyk', first: 'Weronika', gen: 'Weroniki', acc: 'Weronikę', ins: 'Weroniką', fullAcc: 'Weronikę Krawczyk', f: true },
  { full: 'Iga Rutkowska', first: 'Iga', gen: 'Igi', acc: 'Igę', ins: 'Igą', fullAcc: 'Igę Rutkowską', f: true },
  { full: 'Bruno Kalinowski', first: 'Bruno', gen: 'Bruna', acc: 'Bruna', ins: 'Brunem', fullAcc: 'Bruna Kalinowskiego', f: false },
  { full: 'Damian Lis', first: 'Damian', gen: 'Damiana', acc: 'Damiana', ins: 'Damianem', fullAcc: 'Damiana Lisa', f: false },
  { full: 'Igor Malinowski', first: 'Igor', gen: 'Igora', acc: 'Igora', ins: 'Igorem', fullAcc: 'Igora Malinowskiego', f: false },
  { full: 'Henryk Sowa', first: 'Henryk', gen: 'Henryka', acc: 'Henryka', ins: 'Henrykiem', fullAcc: 'Henryka Sowę', f: false },
  { full: 'Tadeusz Grab', first: 'Tadeusz', gen: 'Tadeusza', acc: 'Tadeusza', ins: 'Tadeuszem', fullAcc: 'Tadeusza Graba', f: false },
  { full: 'Konrad Wilk', first: 'Konrad', gen: 'Konrada', acc: 'Konrada', ins: 'Konradem', fullAcc: 'Konrada Wilka', f: false },
  { full: 'Rafał Kowalczyk', first: 'Rafał', gen: 'Rafała', acc: 'Rafała', ins: 'Rafałem', fullAcc: 'Rafała Kowalczyka', f: false },
  { full: 'Stanisław Bąk', first: 'Stanisław', gen: 'Stanisława', acc: 'Stanisława', ins: 'Stanisławem', fullAcc: 'Stanisława Bąka', f: false },
  { full: 'Piotr Czarnecki', first: 'Piotr', gen: 'Piotra', acc: 'Piotra', ins: 'Piotrem', fullAcc: 'Piotra Czarneckiego', f: false },
  { full: 'Feliks Urban', first: 'Feliks', gen: 'Feliksa', acc: 'Feliksa', ins: 'Feliksem', fullAcc: 'Feliksa Urbana', f: false },
];

/** Kim podejrzani są dla poszkodowanego (skąd znali kod do drzwi). */
export const ROLES = [
  { m: 'były pracownik', f: 'była pracownica' },
  { m: 'stały bywalec', f: 'stała bywalczyni' },
  { m: 'księgowy', f: 'księgowa' },
  { m: 'sprzątacz', f: 'sprzątaczka' },
  { m: 'dozorca kamienicy', f: 'dozorczyni kamienicy' },
  { m: 'praktykant', f: 'praktykantka' },
  { m: 'wspólnik', f: 'wspólniczka' },
  { m: 'sąsiad zza ściany', f: 'sąsiadka zza ściany' },
  { m: 'rzeczoznawca', f: 'rzeczoznawczyni' },
  { m: 'konserwator zabytków', f: 'konserwatorka zabytków' },
  { m: 'siostrzeniec', f: 'siostrzenica' },
  { m: 'serwisant alarmu', f: 'serwisantka alarmu' },
];

/** Niezależni świadkowie (nie są podejrzanymi). */
export const WITNESSES = [
  { full: 'Marta Kowal', f: true },
  { full: 'Jan Bielecki', f: false },
  { full: 'Teresa Gaj', f: true },
  { full: 'Wojciech Rak', f: false },
  { full: 'Barbara Sikora', f: true },
  { full: 'Krzysztof Duda', f: false },
  { full: 'Irena Wójcik', f: true },
  { full: 'Paweł Jasiński', f: false },
  { full: 'Danuta Kurek', f: true },
  { full: 'Adam Szulc', f: false },
  { full: 'Monika Kaczmarek', f: true },
  { full: 'Leszek Baran', f: false },
  { full: 'Grzegorz Mróz', f: false },
  { full: 'Elżbieta Pająk', f: true },
];

/** Mianownik przedmiotów, których biernik brzmi inaczej (do kart „Przedmiot: …”). */
export const ITEM_NOM = {
  'kolekcję przedwojennych pocztówek z Borowic': 'kolekcja przedwojennych pocztówek z Borowic',
  'brązową rzeźbę tancerki': 'brązowa rzeźba tancerki',
  'teczkę szkiców węglem': 'teczka szkiców węglem',
  'kasetkę z utargiem': 'kasetka z utargiem',
  'srebrną papierośnicę': 'srebrna papierośnica',
  'srebrną szablę z 1831 roku': 'srebrna szabla z 1831 roku',
  'szkatułkę z dawnymi monetami': 'szkatułka z dawnymi monetami',
  'wiolonczelę z kolekcji hrabiego Borowskiego': 'wiolonczela z kolekcji hrabiego Borowskiego',
  'kolekcję starych map Borowic': 'kolekcja starych map Borowic',
  'kolekcję szklanych negatywów': 'kolekcja szklanych negatywów',
  'srebrną tacę z 1910 roku': 'srebrna taca z 1910 roku',
};

/** Sceny zbrodni. */
export const SCENES = [
  {
    id: 'antykwariat', name: 'Antykwariat „Pod Sową”', inLoc: 'w antykwariacie „Pod Sową”', short: 'antykwariatu', ownerIns: 'z właścicielem', address: 'ul. Szeroka 12',
    owner: { full: 'Zenon Kruk', f: false }, ownerRole: 'właściciel',
    items: ['XVII-wieczny atlas morski', 'pierwsze wydanie „Lalki” z autografem', 'kolekcję przedwojennych pocztówek z Borowic'],
  },
  {
    id: 'galeria', name: 'Galeria „Pod Arkadami”', inLoc: 'w galerii „Pod Arkadami”', short: 'galerii', ownerIns: 'z właścicielką', address: 'ul. Rycerska 7',
    owner: { full: 'Ilona Kamińska', f: true }, ownerRole: 'właścicielka',
    items: ['obraz olejny „Zima w Borowicach”', 'brązową rzeźbę tancerki', 'teczkę szkiców węglem'],
  },
  {
    id: 'zegarmistrz', name: 'Pracownia zegarmistrzowska „Tik-Tak”', inLoc: 'w pracowni zegarmistrzowskiej „Tik-Tak”', short: 'pracowni', ownerIns: 'z zegarmistrzem', address: 'ul. Kościelna 3',
    owner: { full: 'Edmund Zając', f: false }, ownerRole: 'zegarmistrz',
    items: ['złoty zegarek kieszonkowy z 1890 roku', 'zabytkowy zegar kominkowy', 'kasetkę z utargiem'],
  },
  {
    id: 'jubiler', name: 'Jubiler „Szafir”', inLoc: 'u jubilera „Szafir”', short: 'jubilera', ownerIns: 'z właścicielką', address: 'ul. Złota 21',
    owner: { full: 'Grażyna Lewandowska', f: true }, ownerRole: 'właścicielka',
    items: ['pierścionek z szafirem', 'perłowy naszyjnik', 'srebrną papierośnicę'],
  },
  {
    id: 'muzeum', name: 'Muzeum Regionalne', inLoc: 'w Muzeum Regionalnym', short: 'muzeum', ownerIns: 'z kustoszem', address: 'ul. Muzealna 1',
    owner: { full: 'Wiesław Górski', f: false }, ownerRole: 'kustosz',
    items: ['srebrną szablę z 1831 roku', 'cechowy puchar piekarzy', 'szkatułkę z dawnymi monetami'],
  },
  {
    id: 'lutnik', name: 'Pracownia lutnicza „Struna”', inLoc: 'w pracowni lutniczej „Struna”', short: 'pracowni', ownerIns: 'z lutnikiem', address: 'ul. Cicha 5',
    owner: { full: 'Roman Pietrzak', f: false }, ownerRole: 'lutnik',
    items: ['XVIII-wieczne skrzypce', 'wiolonczelę z kolekcji hrabiego Borowskiego', 'smyczek z pernambuku'],
  },
  {
    id: 'ksiegarnia', name: 'Księgarnia „Zakładka”', inLoc: 'w księgarni „Zakładka”', short: 'księgarni', ownerIns: 'z właścicielką', address: 'ul. Długa 9',
    owner: { full: 'Bożena Wrzos', f: true }, ownerRole: 'właścicielka',
    items: ['rękopis powieści miejscowego pisarza', 'kasetkę z utargiem', 'kolekcję starych map Borowic'],
  },
  {
    id: 'fotograf', name: 'Zakład fotograficzny „Kadr”', inLoc: 'w zakładzie fotograficznym „Kadr”', short: 'zakładu fotograficznego', ownerIns: 'z fotografem', address: 'ul. Ogrodnicza 14',
    owner: { full: 'Marek Jaworski', f: false }, ownerRole: 'fotograf',
    items: ['zabytkowy aparat mieszkowy', 'kolekcję szklanych negatywów', 'obiektyw z lat trzydziestych'],
  },
  {
    id: 'cukiernia', name: 'Cukiernia „Pod Kogutem”', inLoc: 'w cukierni „Pod Kogutem”', short: 'cukierni', ownerIns: 'z cukiernikiem', address: 'ul. Piekarska 2',
    owner: { full: 'Józef Kogut', f: false }, ownerRole: 'cukiernik',
    items: ['kasetkę z utargiem', 'zeszyt z rodzinnymi przepisami', 'srebrną tacę z 1910 roku'],
  },
];

/**
 * Miejsca w mieście. Flagi mówią, do czego miejsce może służyć:
 * witness – zeznanie pracownika, cctv – kamera miejska, cardlog – rejestr wejść na kartę,
 * venue – lokal z paragonem, photo – miejsce na zdjęcie, street – ulica (kurier), parking, stop – przystanek.
 */
export const PLACES = {
  teatr: { name: 'Teatr Miejski', loc: 'w Teatrze Miejskim', witness: { m: 'bileter', f: 'bileterka' } },
  pub: { name: 'Pub „Kotwica”', loc: 'w pubie „Kotwica”', witness: { m: 'barman', f: 'barmanka' } },
  restauracja: { name: 'Restauracja „Pod Lipami”', loc: 'w restauracji „Pod Lipami”', witness: { m: 'kelner', f: 'kelnerka' }, venue: true, address: 'ul. Lipowa 2' },
  kregielnia: { name: 'Kręgielnia „Strzał”', loc: 'w kręgielni „Strzał”', witness: { m: 'kierownik zmiany', f: 'kierowniczka zmiany' } },
  hotel: { name: 'Hotel „Zacisze”', loc: 'w hotelu „Zacisze”', witness: { m: 'recepcjonista', f: 'recepcjonistka' } },
  biblioteka: { name: 'Biblioteka Miejska', loc: 'w Bibliotece Miejskiej', witness: { m: 'bibliotekarz', f: 'bibliotekarka' }, cardlog: true },
  basen: { name: 'Basen „Delfin”', loc: 'na basenie „Delfin”', cardlog: true },
  silownia: { name: 'Siłownia „Atlas”', loc: 'w siłowni „Atlas”', cardlog: true },
  dworzec: { name: 'Dworzec kolejowy', loc: 'na dworcu kolejowym', cctv: true },
  rynek: { name: 'Rynek', loc: 'na Rynku', walk: 'po Rynku', cctv: true, photo: true },
  plac: { name: 'Plac Wolności', loc: 'na Placu Wolności', walk: 'po Placu Wolności', cctv: true, photo: true },
  bulwar: { name: 'Bulwar nad rzeką', loc: 'na bulwarze nad rzeką', walk: 'po bulwarze nad rzeką', cctv: true, photo: true },
  park: { name: 'Park Zdrojowy', loc: 'w Parku Zdrojowym', walk: 'po Parku Zdrojowym', photo: true },
  kino: { name: 'Kino „Mewa”', loc: 'w kinie „Mewa”' },
  kawiarnia: { name: 'Kawiarnia „Filiżanka”', loc: 'w kawiarni „Filiżanka”', venue: true, address: 'ul. Rynkowa 4' },
  apteka: { name: 'Apteka „Pod Orłem”', loc: 'w aptece „Pod Orłem”', venue: true, address: 'ul. Szpitalna 9' },
  delikatesy: { name: 'Delikatesy „U Basi”', loc: 'w delikatesach „U Basi”', venue: true, address: 'ul. Targowa 15' },
  pizzeria: { name: 'Pizzeria „Napoli”', loc: 'w pizzerii „Napoli”', venue: true, address: 'ul. Mostowa 8' },
  kwiatowa: { name: 'ul. Kwiatowa', loc: 'na ulicy Kwiatowej', street: true },
  jasminowa: { name: 'ul. Jaśminowa', loc: 'na ulicy Jaśminowej', street: true },
  polna: { name: 'ul. Polna', loc: 'na ulicy Polnej', street: true },
  ogrodowa: { name: 'ul. Ogrodowa', loc: 'na ulicy Ogrodowej', street: true },
  sloneczna: { name: 'ul. Słoneczna', loc: 'na ulicy Słonecznej', street: true },
  brzozowa: { name: 'ul. Brzozowa', loc: 'na ulicy Brzozowej', street: true },
  akacjowa: { name: 'ul. Akacjowa', loc: 'na ulicy Akacjowej', street: true },
  wrzosowa: { name: 'ul. Wrzosowa', loc: 'na ulicy Wrzosowej', street: true },
  krotka: { name: 'ul. Krótka', loc: 'przy ulicy Krótkiej', parking: true },
  ratuszowa: { name: 'ul. Ratuszowa', loc: 'przy ulicy Ratuszowej', parking: true },
  zamkowa: { name: 'ul. Zamkowa', loc: 'przy ulicy Zamkowej', parking: true },
  garbarska: { name: 'ul. Garbarska', loc: 'przy ulicy Garbarskiej', parking: true },
  stopLesne: { name: 'przystanek Osiedle Leśne', loc: 'na przystanku Osiedle Leśne', stop: 'Osiedle Leśne' },
  stopSzpital: { name: 'przystanek Szpital', loc: 'na przystanku Szpital', stop: 'Szpital' },
  stopStadion: { name: 'przystanek Stadion', loc: 'na przystanku Stadion', stop: 'Stadion' },
  stopZajezdnia: { name: 'przystanek Zajezdnia', loc: 'na przystanku Zajezdnia', stop: 'Zajezdnia' },
  stopZielone: { name: 'przystanek Osiedle Zielone', loc: 'na przystanku Osiedle Zielone', stop: 'Osiedle Zielone' },
  // miejsca tylko do szumu na mapie
  stadion: { name: 'Hala sportowa OSiR', loc: 'w hali sportowej OSiR' },
  szpital: { name: 'Szpital Powiatowy', loc: 'w Szpitalu Powiatowym' },
  ratusz: { name: 'Ratusz', loc: 'w ratuszu' },
  cmentarz: { name: 'Stary cmentarz', loc: 'na starym cmentarzu' },
};

export const TRAIN_DESTINATIONS = [
  { name: 'Warszawa Centralna', gen: 'Warszawy' },
  { name: 'Kraków Główny', gen: 'Krakowa' },
  { name: 'Poznań Główny', gen: 'Poznania' },
  { name: 'Łódź Fabryczna', gen: 'Łodzi' },
  { name: 'Radom', gen: 'Radomia' },
  { name: 'Kielce', gen: 'Kielc' },
  { name: 'Lublin Główny', gen: 'Lublina' },
  { name: 'Toruń Główny', gen: 'Torunia' },
  { name: 'Gdynia Główna', gen: 'Gdyni' },
  { name: 'Wrocław Główny', gen: 'Wrocławia' },
];

/** Oznaczenia w rozkładzie jazdy pociągów. */
export const TRAIN_NOTES = {
  '': { text: '', runs: () => true },
  '†': { text: 'nie kursuje w niedziele', runs: (wd) => wd !== 0 },
  '‡': { text: 'nie kursuje w soboty', runs: (wd) => wd !== 6 },
  '◊': { text: 'kursuje tylko w soboty i niedziele', runs: (wd) => wd === 0 || wd === 6 },
  '*': { text: 'kursuje tylko od poniedziałku do piątku', runs: (wd) => wd >= 1 && wd <= 5 },
};

export const FILMS = [
  'Ostatni pociąg do Borowic', 'Cisza nad jeziorem', 'Kot, który wiedział za dużo', 'Złoty kłos',
  'Nocny dyżur', 'Wakacje z duchami', 'Sprawa pani Hanki', 'Lodowa przełęcz', 'Czwarty lokator', 'Mgła nad portem',
];

export const VENUE_ITEMS = {
  kawiarnia: [['Cappuccino', '14,00'], ['Sernik', '16,00'], ['Woda gaz.', '6,00']],
  restauracja: [['Żurek', '18,00'], ['Pierogi ruskie', '26,00'], ['Kompot', '7,00']],
  pizzeria: [['Pizza Margherita', '32,00'], ['Lemoniada', '9,00']],
  apteka: [['Syrop na kaszel', '21,99'], ['Plastry', '8,50']],
  delikatesy: [['Chleb żytni', '7,50'], ['Ser żółty', '12,80'], ['Herbata', '11,20']],
};

export const CCTV_DETAILS = [
  'kupuje coś w automacie', 'rozmawia przez telefon', 'idzie szybkim krokiem w stronę przystanku',
  'siedzi na ławce', 'zapina kurtkę i rozgląda się', 'czeka na kogoś pod zegarem',
];

export const PHOTO_POSES = [
  'uśmiecha się do obiektywu przy fontannie', 'pozuje na tle ratusza', 'stoi przy barierce',
  'trzyma kubek z herbatą', 'robi minę do aparatu',
];

export const DESK_DEFS = [
  { id: 'D', name: 'Dokumenty', hint: 'bilety, paragony, akta' },
  { id: 'S', name: 'Świadkowie', hint: 'zeznania' },
  { id: 'M', name: 'Mapa i rozkłady', hint: 'plan miasta, rozkłady jazdy' },
  { id: 'Z', name: 'Zdjęcia', hint: 'zdjęcia, zrzuty ekranu' },
  { id: 'R', name: 'Rejestry', hint: 'nagrania z kamer, godziny otwarcia, pogoda, karty wejściowe' },
];

/**
 * Podział biurek między graczy. Pary biurek, które razem odsłaniają fałszerstwo
 * (Dokumenty–Mapa, Dokumenty–Rejestry, Zdjęcia–Rejestry, Zdjęcia–Mapa),
 * zawsze trafiają do różnych osób.
 */
export const TEAM_DESKS = {
  1: [['D', 'S', 'M', 'Z', 'R']],
  2: [['D', 'Z'], ['M', 'R', 'S']],
  3: [['D', 'Z'], ['M'], ['R', 'S']],
  4: [['D'], ['M'], ['R'], ['Z', 'S']],
  5: [['D'], ['S'], ['M'], ['Z'], ['R']],
};

export const RULES = [
  'Sprawca jest jednym z pięciorga podejrzanych i działał sam. Przez cały czas od otwarcia do zamknięcia drzwi był w środku.',
  'Dokumenty urzędowe, rejestry, rozkłady, mapy, nagrania z kamer i świadkowie spoza grona podejrzanych mówią prawdę.',
  'Dowody dostarczone przez podejrzanych są prawdziwe, z wyjątkiem dokładnie jednego. Ten jeden sfałszował sprawca. Gdyby był prawdziwy, dawałby mu alibi na czas kradzieży.',
  'Czasy dotarcia na mapie podano dla najszybszego możliwego sposobu (pieszo, rowerem albo autem). Są dokładne co do minuty i takie same w każdą stronę. Mapa podaje tylko czasy do miejsca kradzieży, więc między dwoma innymi miejscami liczcie tak: przejście z A do B trwa co najmniej różnicę ich czasów (np. 31 i 15 min → co najmniej 16 min). Krócej się nie da, bo inaczej droga przez B do miejsca kradzieży byłaby szybsza niż podany czas z A.',
  'Fałszywkę zdradza albo karta urzędowa (rozkład, rejestr, pogoda…), albo to, że osobę z dowodu widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć (liczcie czasy dotarcia). Dowód może dotyczyć dwóch osób, np. wspólne zdjęcie: należy do tego, kto go dostarczył, ale jeśli jest prawdziwy, obie osoby naprawdę tam były i obie mają alibi. Jeśli prawdziwy pobyt tej drugiej osoby mu przeczy, dowód jest fałszywy.',
  'Prawdziwy bilet, paragon, zdjęcie, doręczenie w aplikacji kurierskiej albo zapis w rejestrze oznacza, że ta osoba naprawdę była w tym miejscu o tej porze. Wejście i wyjście w rejestrze kart, tak jak dwie godziny w jednym zeznaniu („przyszedł o…, zapłacił o…”), to pobyt w tym miejscu przez cały ten czas. Bilet do kina oznacza obecność na całym seansie, od początku do końca filmu (długość filmu podaje repertuar). Wyjazd pociągiem oznacza, że potem tej osoby nie było już w mieście. Zeznanie bez godziny („widziałam go przy Rynku”) niczego nie dowodzi, najwyżej podpowiada, gdzie szukać.',
  'Wszystkie zegary są zgodne. Rozkłady, godziny otwarcia i strefy parkowania obowiązują dokładnie tak, jak zapisano je na kartach, także w święta. Liczy się dzień tygodnia podany w aktach.',
];

/** Zasada nr 3 w sprawach, w których kłamie też niewinna osoba (od piątku). */
export const RULE_LIE = 'W tej sprawie fałszywe są dwa dowody dostarczone przez podejrzanych. Jeden sfałszował sprawca: gdyby był prawdziwy, dawałby mu alibi na czas kradzieży. Drugi to kłamstwo niewinnej osoby (ukrywała coś niezwiązanego z kradzieżą). Kłamca nie jest sprawcą i zawsze ma inne, potwierdzone alibi (od świadka, z kamery, rejestru albo z prawdziwego dowodu). Sprawca poza fałszywką nie ma żadnego potwierdzonego alibi. Pozostałe dowody od podejrzanych są prawdziwe.';

/** Zasada nr 4 w sprawach z planem miasta (od generatora v8): czasy liczy się z przecznic. */
export const RULE_MAP = 'Czasy dotarcia liczycie z planu Borowic (biurko „Mapa i rozkłady”). Ulice tworzą siatkę, a przejście o jedną przecznicę, czyli jedno pole planu w poziomie albo w pionie, trwa 2 minuty, pieszo, rowerem czy autem tak samo. Czas między dwoma miejscami to liczba przecznic w poziomie plus w pionie razy 2 min (np. z C14 do M10: 10 + 4 = 14 przecznic, czyli 28 min). Szybciej się nie da, a w każdą stronę jest tyle samo. Przez rzekę prowadzi most na każdej ulicy.';

/** Czy sprawa ma plan miasta (karta z polami miejsc). */
export const hasTownMap = (c) => c.cards.some((k) => (k.facts || []).some((f) => f.t === 'grid'));

/** Zasady w skrócie (ikona Lucide + jedno zdanie); pełna treść w rulesFor(). */
export function rulesShortFor(c) {
  const map = hasTownMap(c);
  return [
    ['lock', 'Sprawca był w środku przez cały czas, od otwarcia do zamknięcia drzwi.'],
    ['landmark', 'Urzędy, rejestry, kamery i świadkowie spoza piątki mówią prawdę.'],
    c.innocentLie
      ? ['ticket', 'Fałszywe są dwa dowody od podejrzanych: fałszywka sprawcy (dałaby mu alibi) i kłamstwo niewinnej osoby, która ma inne, potwierdzone alibi.']
      : ['ticket', 'Dokładnie jeden dowód od podejrzanych jest fałszywy. Podrzucił go sprawca i dałby mu alibi.'],
    map ? ['map', '1 przecznica = 2 min. Liczcie przecznice w poziomie i w pionie na planie miasta.'] : ['map', 'Czasy dotarcia są najkrótsze możliwe; między dwoma miejscami co najmniej różnica ich czasów.'],
    ['search', 'Fałszywkę zdradza tabela urzędowa albo to, że ktoś był gdzie indziej i nie zdążyłby dotrzeć.'],
    ['footprints', 'Prawdziwy dowód = ta osoba tam była. Kino: cały seans. Pociąg: potem nie było jej w mieście.'],
    ['clock', 'Zegary są zgodne, rozkłady i godziny obowiązują dokładnie tak, jak na kartach.'],
  ];
}

/** Zasady dla danej sprawy. */
export function rulesFor(c) {
  const map = hasTownMap(c);
  return RULES.map((r, i) => (i === 2 && c.innocentLie ? RULE_LIE : i === 3 && map ? RULE_MAP : r));
}

/**
 * Powody do wyboru w raporcie z dochodzenia, osobno dla każdego rodzaju dowodu.
 * Kody odpowiadają `reasonCodes` z solvera. Część powodów nigdy nie jest prawdziwa (zmyłki).
 */
export const REASONS = {
  train: [
    ['train-day', 'pociąg nie kursuje w ten dzień tygodnia'],
    ['train-time', 'pociąg odjeżdża o innej godzinie'],
    ['train-missing', 'takiego pociągu nie ma w rozkładzie'],
    ['physical', 'tę osobę widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć'],
    ['physical-other', 'drugą osobę z dowodu widziano wtedy gdzie indziej'],
  ],
  receipt: [
    ['closed-day', 'lokal był w ten dzień tygodnia nieczynny'],
    ['closed-early', 'o tej godzinie lokal był już zamknięty'],
    ['receipt-items', 'w tym lokalu nie sprzedaje się takich rzeczy'],
    ['physical', 'tę osobę widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć'],
    ['physical-other', 'drugą osobę z dowodu widziano wtedy gdzie indziej'],
  ],
  photo: [
    ['photo-daylight', 'na zdjęciu jest jasno, a słońce już zaszło'],
    ['photo-dark', 'na zdjęciu jest ciemno, a słońce jeszcze nie zaszło'],
    ['photo-dry', 'na zdjęciu jest sucho, a wtedy padało'],
    ['photo-wet', 'na zdjęciu są kałuże, a od dawna nie padało'],
    ['physical', 'tę osobę widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć'],
    ['physical-other', 'drugą osobę z dowodu widziano wtedy gdzie indziej'],
  ],
  cinema: [
    ['no-screening', 'tego filmu nie grano o tej godzinie'],
    ['cinema-closed', 'kino było tego dnia zamknięte'],
    ['cinema-short', 'seans skończył się przed kradzieżą'],
    ['physical', 'tę osobę widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć'],
    ['physical-other', 'drugą osobę z dowodu widziano wtedy gdzie indziej'],
  ],
  delivery: [
    ['no-number', 'na tej ulicy nie ma domu o takim numerze'],
    ['parity', 'ta ulica ma tylko numery parzyste albo tylko nieparzyste'],
    ['delivery-fast', 'kurier nie zdążyłby przejechać od jednego adresu do drugiego'],
    ['physical', 'tę osobę widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć'],
    ['physical-other', 'drugą osobę z dowodu widziano wtedy gdzie indziej'],
  ],
  parking: [
    ['zone-off-day', 'w ten dzień tygodnia parkomaty w tej strefie nie działają'],
    ['zone-ended', 'o tej godzinie parkomaty w tej strefie były już wyłączone'],
    ['no-zone', 'ta ulica nie należy do strefy płatnego parkowania'],
    ['physical', 'tę osobę widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć'],
    ['physical-other', 'drugą osobę z dowodu widziano wtedy gdzie indziej'],
  ],
  bus: [
    ['bus-after-last', 'ostatni autobus odjechał wcześniej'],
    ['bus-no-departure', 'o tej godzinie żaden autobus nie odjeżdżał z przystanku'],
    ['bus-no-stop', 'ta linia nie zatrzymuje się na tym przystanku'],
    ['physical', 'tę osobę widziano wtedy gdzie indziej i nie zdążyłaby dotrzeć'],
    ['physical-other', 'drugą osobę z dowodu widziano wtedy gdzie indziej'],
  ],
};
