# Манифест арт-пакета: «Секретарь президента» (#245)

22 октября 2026 · **Gemini (Gemini 3.8 Flash / Medium)** (сгенерировано в Antigravity, конвертация через Sharp в Node.js, `Q=84`, без сторонних сервисов).

Контактный лист (портрет + сетка сцен `2×2`): [`docs/gemini-secretary-contact.jpg`](docs/gemini-secretary-contact.jpg) (`112 307` Б).

---

## 1. Состав арт-пакета, размеры и контрольные суммы

| Элемент / Слаг | Исходник (`art-source/gemini-next/`) | Игровой WebP (`web/public/art/gemini-next/`) | Вес WebP | Описание и подпись в игре |
| --- | --- | --- | --- | --- |
| **Портрет секретаря (`secretary-portrait`)** | `secretary-portrait.jpg`<br>`896×1200` · `400 773` Б<br>`sha256: c26968531fab4b83092a633e36fd7ddcc91392875bf74736d52d06db88a5ae2e` | `secretary-portrait.webp`<br>`160×214` · `4 116` Б<br>`sha256: 24bfb8d8fe759fc98f1af19091170664abda59f06302063a420f3bd4d3f91ef2` | 4.1 КБ | Канонический портрет женщины 45–50 лет в строгой 5-тоновой монохромной сепии (#2a241d, #544a3c, #857a62, #b8ac8e, #e2dac0), причёска 1970-х, тёмный шерстяной жакет, сдержанный и внимательный взгляд. |
| **Сцена `electionEve` (`secretary-scene-election-eve`)** | `secretary-scene-election-eve.jpg`<br>`1376×768` · `533 656` Б<br>`sha256: 20a54564a358cad6d2a73ccd5d6df925ba8307e6534ad6ac0fd3b87fefc38492` | `secretary-scene-election-eve.webp`<br>`960×536` · `26 136` Б<br>`sha256: 7637e083da3a947dc19f0db4b8761f2cd68df6b7b5869a5237a07b2e2ebbd354` | 26.1 КБ | `Ночь перед выборами: термос на краю стола, свет только из приёмной`<br>Тёмный дубовый кабинет президента глубокой ночью, парящий термос и кружка на краю стола, полоса тёплого света из приоткрытой двери приёмной, ночные огни столицы за окном. |
| **Сцена `blackout` (`secretary-scene-blackout`)** | `secretary-scene-blackout.jpg`<br>`1376×768` · `616 608` Б<br>`sha256: 08171b58a87e04b8f49316b9899e24c38d4b5f0a72bb5e7579e8a85651e83445` | `secretary-scene-blackout.webp`<br>`960×536` · `47 530` Б<br>`sha256: a3c95b1cdb941fe401c9149691f82b8dfa57f3f08eb43d068c6d63e5f691abe2` | 47.5 КБ | `Отключение по графику: секретарь печатает при керосиновой лампе`<br>Полумрак вечернего отключения энергии, керосиновая лампа освещает механическую машинку и стопки папок; секретарь методично печатает квартальную опись. |
| **Сцена `coldWaitingRoom` (`secretary-scene-cold-waiting-room`)** | `secretary-scene-cold-waiting-room.jpg`<br>`1376×768` · `731 835` Б<br>`sha256: 3e1c699536d1b51fe745ad8bbdd7ebb6470523503725d5b773bce5a5acab0a99` | `secretary-scene-cold-waiting-room.webp`<br>`960×536` · `63 152` Б<br>`sha256: fbc9fda7ad4f205c4fa34302db78056eb75656875add6722576a3c353f90ec81` | 63.2 КБ | `Зима: секретарь в пальто за столом в холодной приёмной`<br>Январское утро в приёмной (+12°C), морозные узоры на стекле, вид на заснеженную правительственную площадь. Секретарь в тёплом пальто и шарфе, вязаные перчатки рядом с дисковым телефоном, стакан чая в подстаканнике. |
| **Сцена `hospitalQueue` (`secretary-scene-hospital-queue`)** | `secretary-scene-hospital-queue.jpg`<br>`1376×768` · `685 948` Б<br>`sha256: c4f6ab771e6a00872d48d9fc277cbe82579759f13358f3bba2e72e9dc684c958` | `secretary-scene-hospital-queue.webp`<br>`960×536` · `52 310` Б<br>`sha256: a246c0cebc5152374423c92ca313e114131c06d14295b456550fe9d64b622438` | 52.3 КБ | `Приёмный покой областной больницы: очередь в коридоре, секретарь с пожилой женщиной`<br>Утилитарный двухцветный больничный коридор 1978 года, матовые плафоны, очередь людей на деревянных скамьях; секретарь поддерживает под руку пожилую мать в платке. |

Общий вес 5 игровых файлов WebP: **~193 КБ** (все файлы значительно меньше индивидуального лимита 100 КБ).

---

## 2. Точные правила подключения в игру

### А. Портрет секретаря (`secretary-portrait.webp`)
- Подключается для персонажа секретаря президента в кампании Неманской республики 1978 года:
  - в заголовке личных писем (`SecretaryLetter.jsx`);
  - в строке описи папки квартала (`QuarterInbox.jsx`);
  - в служебном удостоверении и списках аппарата резиденции при совпадении с `gs.world.secretary.name`.

### Б. Межходовые сцены (`secretarySceneArt`)
Привязаны 1:1 к слотам `SecretaryScene` из [`web/lib/content/secretary.ts`](web/lib/content/secretary.ts#L84-L107):
1. `electionEve`: `/art/gemini-next/secretary-scene-election-eve.webp`
2. `blackout`: `/art/gemini-next/secretary-scene-blackout.webp`
3. `coldWaitingRoom`: `/art/gemini-next/secretary-scene-cold-waiting-room.webp`
4. `hospitalQueue`: `/art/gemini-next/secretary-scene-hospital-queue.webp`

Отображение в [`SecretaryLetter.jsx`](web/app/game/SecretaryLetter.jsx#L50-L53):
- Заменяет временные заглушки `office` / `hospital` в вызове `<Scene ... />` на полноразмерные аутентичные иллюстрации сцены секретаря.

---

## 3. Стилистическая преемственность
- Все сцены выполнены в едином ракурсе и перспективе кабинета и приёмной резиденции 1978 года.
- Строго соблюдена историческая атмосфера: отсутствие современных цифровых градиентов, надписей на латинице, торговых марок или вымышленных гербов.
- Текстура пикселей согласуется с `residence-morning.webp`, `parliament-hall.webp` и `election-night.webp`.
