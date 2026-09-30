// Заглушка модели для разработки без ключей: AI_MOCK=1 npm run dev
export type Task = "setup" | "event" | "consequence" | "council" | "ending";

let counter = 0;

export function mockResponse(task: Task): string {
  counter++;
  const n = counter;
  switch (task) {
    case "setup":
      return JSON.stringify({
        leader: { name: "Андрей Ковальчук", party: "Новый курс", bio: "Бывший дипломат. Пришёл к власти на волне протестов." },
        speech: "Мы начинаем трудный путь. Я не обещаю лёгких решений.",
        situation: "Казна пуста. Силовики выжидают. Улица требует перемен.",
        players: Array.from({ length: 8 }, (_, i) => ({ name: `Игрок ${i + 1}` })),
        advisors: [{ name: "Олег Ветров" }, { name: "Анна Лис" }, { name: "Павел Гром" }, { name: "Ирина Мост" }],
      });
    case "event":
      return JSON.stringify({
        title: `Тестовое событие №${n}`,
        source: "Кабинет",
        description: "Описание тестового события с именами и местами.",
        affectedFactions: ["siloviki", "west", "church"],
        choices: [
          { text: "Жёсткий вариант", hint: "силовики довольны, Запад нет", tags: ["repress"] },
          { text: "Мягкий вариант", hint: "дорого для бюджета", tags: ["dialogue", "social"] },
          { text: "Затянуть время", hint: "риск кризиса", tags: ["delay"] },
        ],
        randomEvent: { title: "Утечка переписки", description: "Скандал в прессе.", resourceEffect: { politicalCapital: -3 } },
      });
    case "consequence":
      return JSON.stringify({
        headline: `Решение №${n} расколол элиты`,
        narrative: "Кинематографичное описание последствий. «Мы не отступим», — сказал министр.",
        reactions: ["Игрок 1: «Это ошибка»", "Игрок 4: «Поддерживаем»"],
        historianNote: "Историки назовут это началом конца.",
        crisisTitle: "Тестовый кризис",
        crisisDescription: "Описание кризиса.",
        powerLoss: "Ночью к резиденции подъехали бронемашины.",
      });
    case "council":
      return JSON.stringify({ council: [
        { advisor: "strategist", text: "Провести телемарафон единства", hint: "рейтинг вверх, СМИ против", tags: ["propaganda"] },
        { advisor: "economist", text: "Заморозить тарифы на полгода", hint: "люди рады, бюджет страдает", tags: ["social"] },
        { advisor: "security", text: "Усилить охрану ключевых объектов", hint: "силовики довольны", tags: ["security"] },
        { advisor: "diplomat", text: "Запросить экстренный транш ЕС", hint: "Запад за, Кремль против", tags: ["pro_west"] },
      ] });
    case "ending":
      return JSON.stringify({
        verdict: "Правление запомнилось противоречиями.",
        title: "Реформатор поневоле",
        epitaph: "Он хотел как лучше.",
        rating: "Противоречивое наследие",
        fallNarrative: "Ночью к резиденции подъехали бронемашины.",
      });
  }
}
