# Манифест арт-пакета портретов президента (Неманская республика, 1978)

Пакет из **5 канонических пиксель-арт портретов президента** строго анфас в 5-тоновой монохромной сепии (`#2a241d`, `#544a3c`, `#857a62`, `#b8ac8e` на архивном фоне `#e2dac0`), полностью согласованных по размеру пиксельной сетки и палитре с портретами фигур `web/public/art/figures/*.webp`.

Каждый портрет напрямую привязан к выбранному прошлому ремеслу (`bio` в `BIOGRAPHIES`):

| Прошлое ремесло (`bio`) | ID портрета | Исходник (`896×1200`) | Игровой WebP (`160×214`, `Q=84`) | Вес WebP | Архетип и визуальные приметы |
| --- | --- | --- | --- | --- | --- |
| `military` («Офицер») | `officer` | `art-source/gemini-next/leader-officer.jpg` | `web/public/art/gemini-next/leader-officer.webp` | 3.7 КБ | **Армия · Офицер в отставке** — короткий военный ёжик, тяжёлая челюсть, закрытый тёмный китель со стоячим воротником на пуговицах. |
| `economist` («Экономист») | `economist` | `art-source/gemini-next/leader-economist.jpg` | `web/public/art/gemini-next/leader-economist.webp` | 4.9 КБ | **Госплан · Экономист** — высокий лоб с зачёсанными волосами, массивные прямоугольные роговые очки 1970-х, костюм-тройка с жилетом и полосатым галстуком. |
| `lawyer` («Правозащитник») | `lawyer` | `art-source/gemini-next/leader-lawyer.jpg` | `web/public/art/gemini-next/leader-lawyer.webp` | 6.2 КБ | **Юстиция · Правозащитник** — волнистые волосы на боковой пробор, круглые очки в тонкой оправе, аккуратная борода, тёмная водолазка под вельветовым пиджаком. |
| `diplomat` («Дипломат») | `diplomat` | `art-source/gemini-next/leader-diplomat.jpg` | `web/public/art/gemini-next/leader-diplomat.webp` | 5.3 КБ | **МИД · Дипломат** — седые волосы на прямой пробор, сдержанный взгляд, двубортный пиджак с широкими лацканами и светлым шейным платком. |
| `mayor` («Мэр») | `mayor` | `art-source/gemini-next/leader-mayor.jpg` | `web/public/art/gemini-next/leader-mayor.webp` | 7.4 КБ | **Обком · Бывший мэр** — залысина, густые тёмные брови и пышные усы («крепкий хозяйственник»), плотный твидовый пиджак поверх рабочей рубашки без галстука. |

- **Контактный лист (`5×1`)**: `docs/gemini-leaders-contact.jpg`
- **Логика подключения**:
  - `BIO_TO_PORTRAIT` в `web/lib/client/historical-art.ts` и `customizeLeader` в `web/lib/game/classic.ts` автоматически ставят портрет по выбранной биографии (`military → officer`, `economist → economist`, `lawyer → lawyer`, `diplomat → diplomat`, `mayor → mayor`).
