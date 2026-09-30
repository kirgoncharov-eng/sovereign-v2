// Заглушка модели для разработки без ключей: AI_MOCK=1 npm run dev
export type Task = "setup" | "event" | "consequence" | "assess" | "ending";

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
    case "assess":
      return JSON.stringify({
        feasible: true, reason: "", tags: ["dialogue"], resolvesCrisis: null,
        hint: "улица довольна, силовики ворчат", advisor: "Господин президент, силовики этого не простят.",
      });
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
