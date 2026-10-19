# Манифест арт-пакета: Портреты 4 советников кабинета (`adv-strategist`, `adv-economist`, `adv-security`, `adv-diplomat`)

19 октября 2026 · **Gemini / Gemini 4 Argon** (сгенерировано и упаковано в Antigravity через `sips` + `libvips`, `Q=84`, без изменения игрового кода).

Контактный лист линейки совета (4 портрета): `docs/gemini-advisors-contact.jpg` (`23 710` байт).

---

## 1. Состав пакета, контрольные суммы и размеры

| Персонаж / Роль | Исходник (`art-source/gemini-next/`) | Игровой WebP (`web/public/art/gemini-next/`) | Описание и характер |
| --- | --- | --- | --- |
| **Политтехнолог (`adv-strategist`)** | `adv-strategist.jpg`<br>`896×1200` · `359 483` Б<br>`sha256: 8daa5d7a4797462066d8c87ff32d02da3e68fd5fb385122952ed55c19e66a77d` | `adv-strategist.webp`<br>`160×214` · `4 540` Б<br>`sha256: 14f8ff494c90a43c1e510e81b9efaa37403e0c31da6bd5f4704748bccde1ce4b` | Женщина 42–45 лет (Вера Борич / Нина Вежин). Прагматичный политтехнолог, стрижка конца 70-х, строгий шерстяной жакет. Наблюдательный, расчетливый взгляд. |
| **Экономический советник (`adv-economist`)** | `adv-economist.jpg`<br>`896×1200` · `311 962` Б<br>`sha256: 2ed2e83f5edb843435fad1d6982b846b5836ec37d5badde91cb17f136df5ff9d` | `adv-economist.webp`<br>`160×214` · `3 680` Б<br>`sha256: 9fc4afc203c0ae776c03f435ffe214b5c914a7d42ee4b446c1e250f4f97203b6` | Женщина ~51 год (Лидия Вербич). Сухой, педантичный казначей, тонкие роговые очки, волосы в пучке с проседью, строгий глухой жакет. Взгляд человека, считающего копейки казны. |
| **Советник по безопасности (`adv-security`)** | `adv-security.jpg`<br>`896×1200` · `329 294` Б<br>`sha256: 2eada2f04539c38701fe0a42405e8f6fa1949dd5ca84708e167277b4c1072f8f` | `adv-security.webp`<br>`160×214` · `3 440` Б<br>`sha256: 74c95c52c1052ebe129c311c282a15bc2427e2ec8f118a5bcb7f6e219ce9b3f7` | Мужчина ~56 лет (Степан Острин / Леонид Мельнич). Ветеран службы порядка, короткая стрижка с седыми висками, квадратный подбородок, серо-стальной костюм с узким галстуком. Тяжелый взгляд кадрового силовика. |
| **Советник по внешней политике (`adv-diplomat`)** | `adv-diplomat.jpg`<br>`896×1200` · `333 587` Б<br>`sha256: 3b0b1eff993211bf47ec7003cdf9c9bf0f1b72734fef6f192fe0f8195e5929b4` | `adv-diplomat.webp`<br>`160×214` · `4 238` Б<br>`sha256: e0761c45dc5e90eab62dfa8659e1dac25071e2a5a5bd8eb5801d17c83cbc5ddb` | Женщина ~42 года (Нина Кленова). Сдержанный дипломат с опытом переговоров с Торговым союзом, элегантная строгая укладка, темно-синий пиджак с лаконичной брошью. Спокойное, дипломатичное выражение лица. |

---

## 2. Правила интеграции в игру (для `GPT/Codex`)

В `web/lib/client/historical-art.ts`:
Сейчас функция `historicalPortraitArt` проверяет только `state.keyFigures` (10 внешних деятелей) и возвращает `null` для `state.advisors`:
```ts
assert.equal(historicalPortraitArt(state, state.advisors[0].name), null);
```
Из-за этого советники за президентским столом падают на процедурные цветные пиксели.

**Предлагаемая простая интеграция:**
1. Добавить константу портретов советников:
```ts
export const HISTORICAL_ADVISOR_ART: Record<string, string> = {
  strategist: '/art/gemini-next/adv-strategist.webp',
  economist:  '/art/gemini-next/adv-economist.webp',
  security:   '/art/gemini-next/adv-security.webp',
  diplomat:   '/art/gemini-next/adv-diplomat.webp',
};
```
2. В `historicalPortraitArt(state, name, roster)`:
   - Если персонаж найден среди `state.advisors.find(a => a.name === name)`:
     вернуть `HISTORICAL_ADVISOR_ART[advisor.id] ?? null`.

В результате в карточках закрытого совета, прогнозах и ведомостях у всех 4 советников появятся цельные выразительные лица в едином стиле с министрами и послами (`160×214 px`, идентичный размер с `web/public/art/figures/`).
