// Epilog sprawy: protokół zatrzymania i przyznanie się sprawcy.
// Tekst powstaje z faktów sprawy i z wyjaśnienia solvera, zawsze tak samo dla danej sprawy.

import { makeRng } from './rng.js';
import { addDays, dateLong, WEEKDAYS_ACC } from './time.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function confession(code, p, weekday) {
  const g = (m, f) => (p.f ? f : m);
  const T = {
    'train-day': `${g('Kupiłem', 'Kupiłam')} bilet na pociąg, którym zwykle jeżdżę. Nie ${g('sprawdziłem', 'sprawdziłam')}, czy ${WEEKDAYS_ACC[weekday]} też kursuje.`,
    'train-time': `Godzinę odjazdu ${g('wpisałem', 'wpisałam')} na bilecie z pamięci i ${g('pomyliłem', 'pomyliłam')} się.`,
    'train-missing': `Bilet ${g('zrobiłem', 'zrobiłam')} na komputerze. Numer pociągu ${g('wymyśliłem', 'wymyśliłam')}.`,
    'closed-day': `Paragon był z innego dnia, ${g('zmieniłem', 'zmieniłam')} tylko datę. Nie ${g('pomyślałem', 'pomyślałam')}, że ${WEEKDAYS_ACC[weekday]} lokal jest zamknięty.`,
    'closed-early': `Paragon ${g('przerobiłem', 'przerobiłam')} w domu. Nie ${g('wiedziałem', 'wiedziałam')}, że tego dnia zamykają tak wcześnie.`,
    'photo-daylight': `Zdjęcie ${g('zrobiłem', 'zrobiłam')} innego dnia, jeszcze za widna, i ${g('zmieniłem', 'zmieniłam')} datę w pliku. ${g('Zapomniałem', 'Zapomniałam')}, że o tej porze było już ciemno.`,
    'photo-dark': `Zdjęcie było z innego wieczoru. ${g('Zapomniałem', 'Zapomniałam')}, że o tej porze było jeszcze jasno.`,
    'photo-dry': `Zdjęcie było z innego wieczoru. Nie ${g('wiedziałem', 'wiedziałam')}, że tamtego wieczoru lało jak z cebra.`,
    'photo-wet': `Zdjęcie było z deszczowego dnia. Nie ${g('pomyślałem', 'pomyślałam')}, że tamtego wieczoru było sucho.`,
    'no-screening': `Bilet był z innego seansu. ${g('Przerobiłem', 'Przerobiłam')} godzinę i nie ${g('sprawdziłem', 'sprawdziłam')} repertuaru.`,
    'no-number': `W aplikacji ${g('dopisałem', 'dopisałam')} jedno doręczenie pod wymyślony adres. Nie ${g('wiedziałem', 'wiedziałam')}, że takiego numeru nie ma.`,
    parity: `W aplikacji ${g('dopisałem', 'dopisałam')} doręczenie pod wymyślony numer. Nie ${g('wiedziałem', 'wiedziałam')}, że po tej stronie ulicy takich numerów nie ma.`,
    'zone-off-day': `Bilet parkingowy był z innego dnia, ${g('przerobiłem', 'przerobiłam')} datę. Nie ${g('wiedziałem', 'wiedziałam')}, że ${WEEKDAYS_ACC[weekday]} parkomaty nie działają.`,
    'zone-ended': `Bilet parkingowy był z innego dnia, ${g('przerobiłem', 'przerobiłam')} datę i godzinę. Nie ${g('wiedziałem', 'wiedziałam')}, że o tej porze parkomaty były już wyłączone.`,
    'bus-after-last': `Bilet ${g('skasowałem', 'skasowałam')} kiedy indziej i ${g('przerobiłem', 'przerobiłam')} godzinę. Nie ${g('wiedziałem', 'wiedziałam')}, że ostatni autobus odjechał wcześniej.`,
    'bus-no-departure': `Bilet ${g('skasowałem', 'skasowałam')} kiedy indziej i ${g('przerobiłem', 'przerobiłam')} godzinę. O tej porze żaden autobus stamtąd nie odjeżdżał.`,
  };
  T.physical = `Ten dowód ${g('przygotowałem', 'przygotowałam')} wcześniej. Nie ${g('przewidziałem', 'przewidziałam')}, że ktoś zobaczy mnie wtedy zupełnie gdzie indziej.`;
  T['physical-other'] = `${g('Myślałem', 'Myślałam')}, że dowód na dwie osoby będzie mocniejszy, bo nikt nie sprawdzi obu. Nie ${g('pomyślałem', 'pomyślałam')}, że tamtą osobę widziano wtedy zupełnie gdzie indziej.`;
  return T[code] || `Ten dowód ${g('podrobiłem', 'podrobiłam')}, żeby mieć alibi.`;
}

function motive(rng, p) {
  const g = (m, f) => (p.f ? f : m);
  return rng.pick([
    `${g('Potrzebowałem', 'Potrzebowałam')} pieniędzy na spłatę długów.`,
    `${g('Miałem', 'Miałam')} już kupca z Warszawy.`,
    `${g('Myślałem', 'Myślałam')}, że nikt nie zauważy, zanim to sprzedam.`,
    `${g('Chciałem', 'Chciałam')} się odegrać za dawne krzywdy.`,
  ]);
}

/**
 * @param {object} c sprawa
 * @param {object} sol wynik solveCase(c)
 * @param {'solved'|'failed'|'revealed'} outcome
 * @returns {{ heading: string, meta: string, paragraphs: string[], quote: string }}
 */
export function buildEpilogue(c, sol, outcome) {
  const rng = makeRng(`epilog:${c.fingerprint || c.date}`);
  const culprit = c.suspects.find((s) => s.id === c.solution.culprit);
  const g = (m, f) => (culprit.f ? f : m);
  const forged = c.cards.find((k) => k.id === c.solution.forged);
  const proofId = (sol.explain.forged.proofRefs || sol.explain.forged.refs).find((r) => r !== forged.id);
  const proof = c.cards.find((k) => k.id === proofId);
  const code = sol.explain.forged.reasonCodes?.[0];
  const arrestLoc = rng.pick(['w domu', 'w drodze do pracy', 'przed swoim blokiem', `na dworcu, z biletem w jedną stronę w kieszeni`]);
  const nextDay = addDays(c.crimeDate.iso, 1);
  const time = `${rng.int(6, 8)}:${String(rng.int(0, 5) * 10 + rng.int(0, 9)).padStart(2, '0')}`;
  const hiding = rng.pick(['w starej walizce w piwnicy', 'w schowku na dworcu', 'w bagażniku samochodu', 'w szafie pod stertą ubrań', 'w pudle po butach na pawlaczu']);
  const quote = `„${confession(code, culprit, c.crimeDate.weekday)} ${motive(rng, culprit)}”`;
  const who = culprit.fullAcc || culprit.full;
  const recovered = `${cap(c.stolen?.acc || 'skradziony przedmiot')} odnaleziono ${hiding} i zwrócono do ${c.scene.short}.`;
  const title = (k) => `„${k.title.replace(/„([^”]*)”/g, '»$1«')}”`;

  // Kłamstwo niewinnej osoby (sprawy od piątku).
  const lieLines = (sol.explain.lies || []).map((lie) => {
    const liar = c.suspects.find((s) => s.id === lie.who);
    const lg = (m, f) => (liar.f ? f : m);
    const card = c.cards.find((k) => k.id === lie.card);
    const excuse = rng.pick([
      `nie ${lg('chciał', 'chciała')}, żeby rodzina wiedziała, gdzie naprawdę ${lg('spędził', 'spędziła')} wieczór`,
      `${lg('wstydził', 'wstydziła')} się przyznać, że ${lg('był', 'była')} w kasynie`,
      `${lg('chciał', 'chciała')} ukryć przed szefem, że ${lg('wyszedł', 'wyszła')} wcześniej z pracy`,
      `${lg('krył', 'kryła')} znajomego, z którym ${lg('był umówiony', 'była umówiona')}`,
    ]);
    return `Przy okazji wyszło na jaw, że ${liar.full} ${lg('skłamał', 'skłamała')} (${card.id} „${card.title}”), bo ${excuse}. Z kradzieżą nie ${lg('miał', 'miała')} nic wspólnego.`;
  });

  if (outcome === 'revealed') {
    return {
      heading: 'Kulisy sprawy',
      meta: 'akta odtajnione',
      paragraphs: [
        `Sprawcą jest ${culprit.full} (${culprit.role}). Alibi ${g('opierał', 'opierała')} na fałszywce ${forged.id} ${title(forged)}, którą obala karta ${proof.id} ${title(proof)}.`,
        ...lieLines,
      ],
      quote,
    };
  }
  if (outcome === 'failed') {
    return {
      heading: 'Sprawa umorzona',
      meta: dateLong(addDays(c.crimeDate.iso, 21)),
      paragraphs: [
        `Śledztwo utknęło w martwym punkcie. Dopiero po trzech tygodniach policja zatrzymała ${who} przy próbie sprzedaży łupu.`,
        `W protokole przesłuchania zapisano, że alibi opierało się na fałszywce ${forged.id} ${title(forged)}, którą obalała karta ${proof.id} ${title(proof)}.`,
        ...lieLines,
        recovered,
      ],
      quote,
    };
  }
  return {
    heading: 'Protokół zatrzymania',
    meta: `${dateLong(nextDay)}, godz. ${time}`,
    paragraphs: [
      `${culprit.full} (${culprit.role}) ${g('został zatrzymany', 'została zatrzymana')} ${arrestLoc}.`,
      `Gdy pokazano ${g('mu', 'jej')} kartę ${proof.id} ${title(proof)}, ${g('przestał', 'przestała')} zaprzeczać, że ${forged.id} ${title(forged)} to fałszywka.`,
      recovered,
      ...lieLines,
    ],
    quote,
  };
}
