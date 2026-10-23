# Манифест арт-пакета: «Секретарь президента» (#245)

23 октября 2026 · **Gemini (Gemini 3.8 Flash / Medium)** (сгенерировано в Antigravity, конвертация через Sharp в Node.js, `Q=80`, без сторонних сервисов).

Контактный лист (портрет слева + сетка 4 сцен `2×2` справа): [`docs/gemini-secretary-contact.jpg`](docs/gemini-secretary-contact.jpg) (`99 753` Б).

---

## 1. Состав арт-пакета, размеры и контрольные суммы

| Элемент / Слаг | Исходник (`art-source/gemini-next/`) | Игровой WebP (`web/public/art/gemini-next/`) | Вес WebP | Описание и подпись в игре |
| --- | --- | --- | --- | --- |
| **Портрет секретаря (`secretary-portrait`)** | `secretary-portrait.jpg`<br>`896×1200` · `400 773` Б<br>`sha256: c26968531fab4b83092a633e36fd7ddcc91392875bf74736d52d06db88a5ae2e` | `secretary-portrait.webp`<br>`160×214` · `4 116` Б<br>`sha256: 24bfb8d8fe759fc98f1af19091170664abda59f06302063a420f3bd4d3f91ef2` | 4.1 КБ | Канонический портрет женщины 45–50 лет в строгой 5-тоновой монохромной сепии (#2a241d, #544a3c, #857a62, #b8ac8e, #e2dac0), пышная укладка 1970-х с мягкой волной, тёмный шерстяной жакет, сдержанный и внимательный взгляд. Служит эталоном персонажа для всех межходовых сцен. |
| **Сцена `electionEve` (`secretary-scene-election-eve`)** | `secretary-scene-election-eve.jpg`<br>`1376×768` · `541 838` Б<br>`sha256: eb673c348143d524abcd932d0b81ce4b1daa42ebbf66a5db1c12614753bdc3f6` | `secretary-scene-election-eve.webp`<br>`960×536` · `32 692` Б<br>`sha256: 19c735761d2d7776d4dc58ded1b84618c1d90d1b24797cdc14189099aa48476d` | 32.7 КБ | `Ночь перед выборами: термос на краю стола, свет только из приёмной`<br>Тёмный дубовый кабинет президента глубокой ночью, парящий термос и стакан в подстаканнике на краю стола, полоса тёплого света из приоткрытой двери приёмной, ночные огни столицы и арочное окно со снегом. Чистый пиксель-арт без людей. |
| **Сцена `blackout` (`secretary-scene-blackout`)** | `secretary-scene-blackout.jpg`<br>`1376×768` · `515 743` Б<br>`sha256: dfdde225d3e8c9418dc7a5c388df5d29df528bfe7a02147408527b5f867ff352` | `secretary-scene-blackout.webp`<br>`960×536` · `30 474` Б<br>`sha256: 9bf51c4707587561467cd5b24d52e425d0e508abae5afadf28d0bb8b29067f6a` | 30.5 КБ | `Отключение по графику: секретарь печатает при керосиновой лампе`<br>Полумрак вечернего отключения энергии, керосиновая лампа освещает механическую машинку и стопки папок; та же самая женщина-секретарь 45–50 лет (точный образ с портрета) методично печатает опись. |
| **Сцена `coldWaitingRoom` (`secretary-scene-cold-waiting-room`)** | `secretary-scene-cold-waiting-room.jpg`<br>`1376×768` · `618 790` Б<br>`sha256: 11b5d5b89efb9f9bf26ff14e23b9889c6aa24247b2db405c77017c74f46eb95e` | `secretary-scene-cold-waiting-room.webp`<br>`960×536` · `49 412` Б<br>`sha256: 984584ce1bd7fb21f5d1b29cf8c267217677e8a6528a9b0d4701871040e17f5e` | 49.4 КБ | `Зима: секретарь в пальто за столом в холодной приёмной`<br>Январское утро в приёмной (+12°C), морозные узоры на стекле, вид на заснеженную правительственную площадь. Та же женщина-секретарь 45–50 лет в тёплом тёмном пальто и шарфе, вязаные перчатки рядом с дисковым телефоном, стакан чая в подстаканнике. |
| **Сцена `hospitalQueue` (`secretary-scene-hospital-queue`)** | `secretary-scene-hospital-queue.jpg`<br>`1376×768` · `527 937` Б<br>`sha256: e3f3b6a85eb7f8fb10bdba96ddbea7d255316d64ca74f5bcef179f034fc2b2c6` | `secretary-scene-hospital-queue.webp`<br>`960×536` · `37 262` Б<br>`sha256: da0b1423f4b3367d465803339971fd14d5530004a221bcf1d5cde97266a92773` | 37.3 КБ | `Приёмный покой областной больницы: очередь в коридоре, секретарь с пожилой женщиной`<br>Утилитарный двухцветный больничный коридор 1978 года, матовые плафоны, очередь людей на деревянных скамьях; та же женщина-секретарь в пальто поддерживает под руку пожилую мать в платке. |

Общий вес 5 игровых файлов WebP: **~154 КБ** (все файлы строго укладываются в лимит 100 КБ).

---

## 2. Точные правила подключения в игру

### А. Портрет секретаря (`secretary-portrait.webp`)
- В служебном удостоверении и личных письмах секретаря при совпадении с `gs.world.secretary.name`.

### Б. Межходовые сцены (`SECRETARY_SCENE_ART`)
Привязаны 1:1 к слотам `SecretaryScene` из `web/lib/content/secretary.ts`:
1. `electionEve`: `/art/gemini-next/secretary-scene-election-eve.webp`
2. `blackout`: `/art/gemini-next/secretary-scene-blackout.webp`
3. `coldWaitingRoom`: `/art/gemini-next/secretary-scene-cold-waiting-room.webp`
4. `hospitalQueue`: `/art/gemini-next/secretary-scene-hospital-queue.webp`

Отображение в `SecretaryLetter.jsx`:
- Передаётся в проп `art` компонента `<Scene>` для Неманской республики 1978 года.
