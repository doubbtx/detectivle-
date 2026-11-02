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
  { m: 'stały klient', f: 'stała klientka' },
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
  rynek: { name: 'Rynek', loc: 'na Rynku', cctv: true, photo: true },
  plac: { name: 'Plac Wolności', loc: 'na Placu Wolności', cctv: true, photo: true },
  bulwar: { name: 'Bulwar nad rzeką', loc: 'na bulwarze nad rzeką', cctv: true, photo: true },
  park: { name: 'Park Zdrojowy', loc: 'w Parku Zdrojowym', photo: true },
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
  stopSloneczne: { name: 'przystanek Osiedle Słoneczne', loc: 'na przystanku Osiedle Słoneczne', stop: 'Osiedle Słoneczne' },
  // miejsca tylko do szumu na mapie
  stadion: { name: 'Stadion OSiR', loc: 'na stadionie OSiR' },
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
  'kupuje coś w automacie z biletami', 'rozmawia przez telefon', 'idzie szybkim krokiem w stronę przystanku',
  'siedzi na ławce', 'zapina kurtkę i rozgląda się', 'czeka na kogoś pod zegarem',
];

export const PHOTO_POSES = [
  'uśmiecha się do obiektywu przy fontannie', 'pozuje na tle podświetlonego ratusza', 'stoi przy barierce',
  'trzyma kubek z herbatą', 'robi minę do aparatu',
];

export const DESK_DEFS = [
  { id: 'D', name: 'Dokumenty', hint: 'bilety, paragony, akta' },
  { id: 'S', name: 'Świadkowie', hint: 'zeznania' },
  { id: 'M', name: 'Mapa i rozkłady', hint: 'czasy dojścia, rozkłady jazdy' },
  { id: 'Z', name: 'Zdjęcia', hint: 'monitoring, zdjęcia, zrzuty ekranu' },
  { id: 'R', name: 'Rejestry', hint: 'godziny otwarcia, pogoda, karty wejściowe' },
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
  'Dowody dostarczone przez podejrzanych są prawdziwe, z wyjątkiem dokładnie jednego. Ten jeden sfałszował sprawca, żeby mieć alibi.',
  'Czasy dojścia na mapie to najszybsza możliwa droga, w obie strony, co do minuty.',
  'Wszystkie zegary są zgodne, a sprawa wydarzyła się dzień przed datą gry.',
];
