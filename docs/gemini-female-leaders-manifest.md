# Манифест пакета: 5 женских портретов президента (Неманская республика, 1978)

Дата: 13 ноября 2026  
Автор / генерация: Gemini (`Gemini 4 Hydrogen / High`)  
Класс: C (графические ассеты и манифест; код и сохранения не изменяются — подключение за GPT/Codex)  
Контактный лист (`5×2` в сравнении с мужским каноном): [`docs/gemini-female-leaders-contact.jpg`](gemini-female-leaders-contact.jpg) (`1286×846`, SHA-256: `01b4af2ae39cd4f800d07f6ac80ace12171d582a37be1861de5e1bb73c18e8c6`)

---

## 1. Зачем этот пакет

В `web/lib/game/data.ts` (`BIOGRAPHIES`) для всех пяти биографий президента есть `textFemale`, однако в `web/lib/client/historical-art.ts` (`HISTORICAL_LEADER_ART`) были нарисованы только мужские портреты (`0/5` женских): при выборе женского имени `historicalPortraitArt` возвращала `null`.

Пакет закрывает все `5/5` женских вариантов президента в **строгом анфасе 0°** и 5-тоновой монохромной сепии (`#2a241d`, `#544a3c`, `#857a62`, `#b8ac8e` на архивном фоне `#e2dac0`), полностью согласованной по плотности пиксельной сетки с [`docs/archive/gemini-leaders-manifest.md`](archive/gemini-leaders-manifest.md) и `web/public/art/figures/*.webp`.

---

## 2. Таблица ассетов (исходники `896×1200` JPG + игровые `160×214` WebP, `Q=84`)

| Биография (`bio`) | Исходник (`art-source/gemini-next/`) | Игровой WebP (`web/public/art/gemini-next/`) | Вес WebP | Привязка к `textFemale` и визуальные приметы |
| --- | --- | --- | ---: | --- |
| `officer` («Офицер») | `leader-officer-female.jpg` (`101 464 B`, SHA-256 `99a4602994ff9217e43ddcdb98cccd3cd0a3614904eba57b70936a5fe1bd7a3e`) | `leader-officer-female.webp` (SHA-256 `f62f98d44fcb414f0723e6f9f7839f3090222e3b03e8e4ced4ec0ef204a4d992`) | `3 636 B` | «Бывший офицер службы связи» — строгий гладкий пробор с проседью на висках, прямой волевой взгляд, закрытый тёмный китель со стоячим воротником на пуговицах. |
| `economist` («Экономист») | `leader-economist-female.jpg` (`105 890 B`, SHA-256 `ab449562d1ca075972f472fdb6a8259d3c28047e893fbbb1caaced9661dd4840`) | `leader-economist-female.webp` (SHA-256 `0c8a08e737767f7773246070159df1aafa2628e79a7e938cf5c8dfe49a696901`) | `4 698 B` | «Экономист Госплана» — высокий лоб, туго убранные волосы, угловатая роговая оправа 1970-х, тёмный пиджак поверх жилета, рубашки и галстука. |
| `lawyer` («Правозащитник») | `leader-lawyer-female.jpg` (`164 501 B`, SHA-256 `136b68f40b4e7baec72696e9a5b333e9b36053e1e13a19a6c2558504aab6663b`) | `leader-lawyer-female.webp` (SHA-256 `95c39cf2a67716896e748933e7a34feca6905242d821d0da1076a9e51496b7ed`) | `6 754 B` | «Юрист по правам человека» — волнистые волосы до плеч на боковой пробор, тонкие круглые очки, ребристая водолазка под вельветовым пиджаком. |
| `diplomat` («Дипломат») | `leader-diplomat-female.jpg` (`130 921 B`, SHA-256 `20770e7c685130c5c1dbf2154abe4324e02666d499e7af1ace2124e4ad3cea83`) | `leader-diplomat-female.webp` (SHA-256 `8ac0e39f333db7eb4d4b4a36c12740f6e87a22545082418095417ca95b7c2511`) | `5 500 B` | «Бывший дипломат торгпредства» — уложенная седая волна, сдержанная улыбка, двубортный тёмный пиджак со светлым шёлковым шейным платком. |
| `mayor` («Мэр») | `leader-mayor-female.jpg` (`149 666 B`, SHA-256 `797c04d7f23f776b4704e012fba3d64417b6d58fbb3e3e47e99a327b4b892957`) | `leader-mayor-female.webp` (SHA-256 `25b80d1b15301b9bc616c72213775dff74f036a90945fc904cbb6476f514ad95`) | `7 472 B` | «Председатель горисполкома промышленного центра» — венок косы вокруг головы, волевые густые брови, плотный твидовый пиджак поверх рабочей рубашки без галстука. |

Суммарный вес 5 игровых WebP: **28 060 байт** (~27.4 КБ), все портреты строго `160×214 px`, от 3.6 до 7.3 КБ за файл.

---

## 3. Подключение (для GPT/Codex отдельным кодовым PR)

В `web/lib/client/historical-art.ts` заменить одиночные записи в `HISTORICAL_LEADER_ART` (сейчас `{ asset, female: false }`) на выбор по полу имени (`isFemaleName(name)`), подключая:
- `/art/gemini-next/leader-officer-female.webp`
- `/art/gemini-next/leader-economist-female.webp`
- `/art/gemini-next/leader-lawyer-female.webp`
- `/art/gemini-next/leader-diplomat-female.webp`
- `/art/gemini-next/leader-mayor-female.webp`
