# «Суверен»: первая сцена с рисованными советниками

11 октября 2026, GPT/Codex. Задача #95, первый вариант для сравнения.
Кирилл согласовал направление после просмотра интерфейса: заметные люди,
читаемый служебный текст, подробности по раскрытию. Это гипотеза опыта игрока;
рост завершения партий и возврата пока не измерен.

## Что можно посмотреть

`/art-review` — отдельный экран настоящего дела с двумя советниками.
Кнопка сравнения переключает крупные рисунки и маленькие процедурные лица.
Оба варианта используют одинаковые реплики и варианты из движка.
Выбор раскрывает объяснение цены; подпись показывает настоящий расчёт и газету.
Данные остаются в памяти экрана: сохранение и аналитика игры не затрагиваются.

В основной игровой поток этот экран ещё не встроен. PR #102 меняет главный
экран и остаётся открытым; его файлы не пересекаются с этой частью #95.
Следующий этап #95 — интеграция выбранного оформления после завершения #102.
Задачу #95 эта часть не закрывает.

## Поправка Кирилла: сохраняем стиль игры

11 октября первый иллюстративный вариант отклонён: слишком гладкие лица и свет
выбиваются из индивидуального вайба «Суверена». Активный вариант v2 — грубые
пиксельные фото, плоские бумажные/угольные тона, угловатые силуэты и асимметрия.
Образец — существующая графика игры. Прежние v1 оставлены только для истории.
Новые лица генерировались встроенным image_gen по прежним портретам и кадру
основной игры; финальные материалы — 40×50 px, lossless WebP, отображение pixelated.
Экран сравнения обновлён, но художественная приёмка v2 ещё за Кириллом.

| Активное лицо | Файл | Вес |
| --- | --- | --- |
| Оксана Гончар | `web/public/art/advisors/economist-v2.webp` | 2 630 байт |
| Юрий Бондаренко | `web/public/art/advisors/security-v2.webp` | 2 930 байт |

Новая пара — 5 560 байт. Вместе с архивной v1 — 103 484 байта.
Основной размер в эскизе 80×100 px; лицо не сглаживается и не подсвечивает
лояльность, правдивость или правильное решение.

Промпт v2 для Оксаны: STYLE TRANSFER. Image 1 is the female fictional economic
adviser to redraw; retain recognizable bob haircut, silver streak and glasses.
Image 2 is the ACTUAL GAME STYLE reference, especially its simple blocky pixel
scene and restrained parchment/charcoal palette. Replace the polished realistic
engraving completely with a deliberately handcrafted low-resolution pixel-art
bust portrait. Think native 40 by 50 pixel sprite enlarged with nearest-neighbor:
very big square pixels, stepped contours, large flat shapes, uneven human character.
Only five flat colors: #2a241d #544a3c #857a62 #b8ac8e #e2dac0. Flat pale paper
background. Slightly exaggerated angular nose and off-center glasses, middle-aged
serious woman, no glamour. Should look like a rough small ID photo printed in the
game's paper world, not modern AI concept art. Exactly one centered head and
shoulders, whole head visible, upright 4:5. No gradients, realistic lighting,
paper noise, soft edges, fine hair strands, crosshatching, 3D, polished painting,
border, text, logos, other characters. Small purposeful clusters of pixels;
not a photorealistic face with a pixel filter.

Промпт v2 для Юрия: STYLE TRANSFER. Image 1 is the fictional male security adviser
to redraw. Image 2 is the new pixel portrait STYLE reference: match its chunky
stepped contours and limited parchment/charcoal palette exactly. One centered
head and shoulders of this middle-aged man, broad angular face, receding grey
temples, heavy brows, slightly crooked nose, plain civilian jacket and open collar.
No likeness to real people. Native 40x50-pixel sprite aesthetic enlarged nearest-neighbor:
oversized square pixel clusters, flat fills, strong caricature silhouette,
asymmetry and human imperfection. ONLY five colors #2a241d #544a3c #857a62 #b8ac8e
#e2dac0. Flat pale paper background, upright4:5, full head visible. Serious attentive
expression, not villainous. No gradients, realistic light, noise, crosshatching,
detailed hair or skin, soft edges, photorealism, glossy AI illustration, border,
text, insignia, flags, other people. Make the pixel grid visibly simple, like an
imperfect ID photograph in this game's existing low-resolution paper world.

## Первоначальное арт-направление (v1, отклонено)

- Портреты: графит и тушь на бумаге, угольные и охристые тона. Различимые
  силуэты, лицо и характер важнее микродеталей. Без сходства с реальными политиками.
- В деле лицо занимает 68×85 px (60×75 на узком телефоне); исходник WebP
  шириной 448 px пригоден и для крупной карточки человека.
- Рисунок закреплён за конкретным именем фиксированной сцены, а не за ролью.
  Случайные люди и остальные страны сохраняют процедурные портреты.
- Эмоция не выдаёт скрытую лояльность и не обозначает правильный вариант.
- История и реплики: существующий литературный шрифт. Цена, роль, статус,
  срок и действия: читаемый обычный шрифт. Пиксельный — для печатей и акцентов.
- Раскрываются полное дело и биография. Суть ситуации, реплики, варианты,
  предупреждения о кризисе и действие всегда доступны.
- Точные скрытые эффекты появляются после подписи; объяснение затрат — до неё.
- Анимация в этой части: короткая печать после решения. При reduced motion
  движение отключено. Полную анимацию лиц пока не вводим.

## Первая партия изображений

| Человек в сцене | Материал | Вес |
| --- | --- | --- |
| Оксана Гончар, экономический советник | `web/public/art/advisors/economist-v1.webp` | 44 258 байт |
| Юрий Бондаренко, советник по безопасности | `web/public/art/advisors/security-v1.webp` | 53 666 байт |

Всего 97 924 байта. Сборка основного одностраничного демо рисунки пока не
загружает; увеличение относится к отдельному экрану. При интеграции повторно
проверить бюджет демо около 1 МБ, постоянную идентичность лиц и первую сессию.

Рисунки созданы встроенным image_gen. После отбора выполнены только уменьшение
и кодирование WebP. Исходники сохранены в стандартной папке generated_images
этого чата; материалы проекта находятся по путям выше.

## Промпты генерации

### Оксана Гончар

Use case: stylized-concept. Asset type: individual illustrated character portrait for the mobile political game Sovereign.
One wholly fictional female economic adviser, age about 47, short dark bob haircut with a distinctive silver streak at one temple,
narrow rectangular spectacles, strong thoughtful face and slightly tired eyes, plain charcoal jacket and oatmeal blouse.
No resemblance to any real politician or celebrity. Her expression is attentive and quietly skeptical, not friendly caricature and not villainous.
Style: hand-drawn ink and graphite engraving, bold clear shapes, limited four-tone warm charcoal/ochre/parchment palette,
rough printed-document grain. Readable at 64px wide: strong silhouette, large facial features, minimal micro-detail.
Compose a SINGLE centered bust portrait, full head and shoulders completely within frame, upright 4:5 portrait composition,
warm pale parchment flat background to the edges. Side lighting, dry serious wit, grounded human character.
No writing, symbols, flags, insignia, borders, badges, weapons, extra people, collage, photorealism, anime or glossy 3D.
Keep ample narrow margins around hair and shoulders. Output one image.

### Юрий Бондаренко

Use case: stylized-concept. Asset type: individual character portrait for mobile political game Sovereign.
A SINGLE wholly fictional male security adviser, age about 56, broad square face, receding cropped hair with grey temples,
prominent heavy brows and a slightly crooked nose, clean shaven, plain dark civilian jacket with a light shirt, no tie.
No resemblance to real politicians or celebrities. Composed, vigilant, understated expression; not villainous, angry or militaristic.
Style: handcrafted ink and graphite engraving on parchment, large bold readable forms,
limited four-tone warm charcoal/ochre/parchment palette with rough printed-document grain.
Match a serious illustrated-document aesthetic; not glossy realistic photography.
Centered upright single head-and-shoulders portrait in a 4:5 frame, full head visible,
some breathing room around hair, shoulders in frame. Flat pale warm parchment background extends to all edges.
Side lighting. Readable at 64px wide, distinctive silhouette, minimal microscopic detail.
No text, badges, logos, flags, uniforms, medals, weapons, border, extra people, collage, anime or 3D. Output one image.

## Проверка

Сцена проходит во всех шести странах, страницы 320/390/760 без горизонтального
переполнения. Проверены сравнение, выбор, подпись, повтор, неизменность localStorage.
Ошибок браузера нет. check 270/270, production build. Обычная партия дошла до
финала на 20-м ходу: problems=[], первое решение 4623 мс, стол на первом ходу
скрыт. Скриншоты ходов 1–3 просмотрены. Понятность и интерес
нужно подтвердить партией Кирилла, автоматический прогон этого не доказывает.
