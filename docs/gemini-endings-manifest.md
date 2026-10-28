# Манифест арт-пакета: «Финалы и катастрофы опор» (`ending-coup`, `ending-revolution`, `ending-collapse`, `ending-impeachment`, `ending-triumph`)

28 октября 2026 · **Gemini / Gemini 4 Argon** (художественная режиссура концовок Неманской республики 1978 года, сгенерировано и скомпоновано в Antigravity, 960×536, WebP < 100 КБ).

Контактный лист (5 ключевых сцен развязок): `docs/gemini-endings-contact.jpg` (212 527 байт, sha256: `f35578ff6421942ad83393af66fc62d403c0016d827c5fec153f0243cd724e5c`).

---

## 1. Концепция и цели пакета

Пакет закрывает эмоциональный и визуальный провал в завершении партии (Ворота A, метрики `Share ≥ 5%` и `D1 ≥ 25%`).
Ранее при поражении от падения опоры (`impeachment`, `coup`, `collapse`) игрок видел либо общую картинку поражения на выборах (`election-defeat.webp`), либо пустой экран (`died: null`), либо студенческий пикет 1-го курса (`protest.webp`).

Теперь каждая фундаментальная развязка правления получает полноценную 16-битную кинематографичную сцену эпохи осени/зимы 1978–1982 годов:
1. **Военный переворот (`coup`)**: бронетехника на оцепленном мокром асфальте у Дома правительства на рассвете.
2. **Народная революция (`revolution`)**: море людей с факелами на площади Независимости, прорыв к ступеням дворца, милиция опустила щиты.
3. **Крах государства и казны (`collapse`, `died`, `betrayed`)**: тёмный кабинет при веерном отключении электричества, керосиновая лампа, открытая папка последнего указа об отставке, за окном замерзший обесточенный город.
4. **Импичмент (`impeachment`)**: зал заседаний парламента в лучах зимнего солнца, опустевшее кресло президента на высокой трибуне, оставленные на сукне ключи и печать, депутаты молча расходятся.
5. **Триумф переизбрания на второй срок (`triumph`)**: солнечное утро осени 1982 года на проспекте Республики, газетный киоск со спецвыпуском о победе президента, флаги Немана, ликующие горожане.

---

## 2. Состав пакета, контрольные суммы и размеры

| Сцена / Слаг | Исходник (`art-source/gemini-next/`) | Игровой WebP (`web/public/art/gemini-next/`) | Подпись для архивного дела / экрана развязки (`caption`) |
|---|---|---|---|
| **Военный переворот (`ending-coup`)** | `ending-coup.jpg`<br>336 421 Б · 328.5 КБ<br>`sha256: 6317f4ca6e811ca7b0ee991dcf3ec11ceee8ada21ebe37ed91be75f90f005662` | `ending-coup.webp`<br>81 540 Б · 79.6 КБ<br>`sha256: e131ab8237c5e1d6ff994127bbaa95bb364569a367d43aed7939ed13cf92476a` | `Военный переворот: бронетехника оцепила Дом правительства` |
| **Народная революция (`ending-revolution`)** | `ending-revolution.jpg`<br>527 908 Б · 515.5 КБ<br>`sha256: fe2049f9923774669d3a25e539b64f9de76b48b12376f68a562d9d0f2e7237c6` | `ending-revolution.webp`<br>94 566 Б · 92.3 КБ<br>`sha256: 175baa32e32e49a6ff14ab7c6f81f1dba6dc0f5160bf7ef87b2c0ec021d87c54` | `Народная революция: толпа прорвала оцепление у резиденции` |
| **Крах государства (`ending-collapse`)** | `ending-collapse.jpg`<br>307 757 Б · 300.5 КБ<br>`sha256: 70dccafaa8049dac5b4c5b6f13fd49b929feac2c3151c7957dcca8e3d84a772a` | `ending-collapse.webp`<br>63 672 Б · 62.2 КБ<br>`sha256: ce352f2f1f0fe6f6cd9f1b892c446b7c24631c057a99eeeecd0b42e01ba3f4d4` | `Крах государства: подписание отставки в тёмном кабинете` |
| **Импичмент (`ending-impeachment`)** | `ending-impeachment.jpg`<br>386 936 Б · 377.9 КБ<br>`sha256: 2b188aa3b3ed4ed5eca9d0470eadfe97f55131121d524c7a12ad29086803de87` | `ending-impeachment.webp`<br>90 594 Б · 88.5 КБ<br>`sha256: e00914198c6b814c8860a2238fe64774ff21b0af55e444b9b5555259b3604d54` | `Импичмент: опустевшее кресло президента в зале парламента` |
| **Триумф 2-го срока (`ending-triumph`)** | `ending-triumph.jpg`<br>507 552 Б · 495.7 КБ<br>`sha256: 13ba90464af36a8192db5929861b2eaf69909d14e3c87bd8a5aa60285cff85cf` | `ending-triumph.webp`<br>90 830 Б · 88.7 КБ<br>`sha256: 4115a7b5c442a4f02f758dfbf49078588db7f9d08457f02a1fbe540f2e2268ac` | `Утро триумфа: победа на выборах и начало второго срока` |

---

## 3. Точные правила показа (`historicalEndingArt`)

В `web/lib/client/historical-art.ts`:

```ts
export const HISTORICAL_ENDING_ART = {
  coup: { src: '/art/gemini-next/ending-coup.webp', caption: 'Военный переворот: бронетехника оцепила Дом правительства' },
  revolution: { src: '/art/gemini-next/ending-revolution.webp', caption: 'Народная революция: толпа прорвала оцепление у резиденции' },
  collapse: { src: '/art/gemini-next/ending-collapse.webp', caption: 'Крах государства: подписание отставки в тёмном кабинете' },
  impeachment: { src: '/art/gemini-next/ending-impeachment.webp', caption: 'Импичмент: опустевшее кресло президента в зале парламента' },
  triumph: { src: '/art/gemini-next/ending-triumph.webp', caption: 'Утро триумфа: победа на выборах и начало второго срока' },
  defeat: HISTORICAL_SCENE_ART.electionDefeat,
} as const;

export function historicalEndingArt(state: GameState): HistoricalArt | null {
  if (state.country !== ALTERNATE_COUNTRY) return null;
  if (state.endType === 'coup') return HISTORICAL_ENDING_ART.coup;
  if (state.endType === 'revolution') return HISTORICAL_ENDING_ART.revolution;
  if (state.endType === 'collapse' || state.endType === 'died' || state.endType === 'betrayed') {
    return HISTORICAL_ENDING_ART.collapse;
  }
  if (state.endType === 'impeachment') return HISTORICAL_ENDING_ART.impeachment;
  if (state.endType === 'reelected' || state.endType === 'zeroed' || state.endType === 'premier' || isSurvival(state.endType)) {
    return HISTORICAL_ENDING_ART.triumph;
  }
  if (state.endType === 'mandate') return HISTORICAL_ENDING_ART.defeat;
  if (state.endType === 'emergency_rule' || state.endType === 'dictator') {
    return { src: HISTORICAL_SCENE_ART.electionNight.src, caption: 'Огни столицы за окном кабинета правителя' };
  }
  return HISTORICAL_ENDING_ART.defeat;
}
```

---

## 4. Стилистическая преемственность
- Все 5 сцен строго выдержаны в каноническом 16-битном ретро-пиксель-арт стиле Немана 1978 года.
- Разрешение: **960×536 (16:9)**, без искажения пропорций в мобильном контейнере архивного дела.
- Бюджет: **все WebP < 100 КБ** (от 62 до 92 КБ).
- В сценах строго нет читаемых реальных надписей, английских слов или современных анахронизмов.
