// Заглушка модели для разработки без ключей: AI_MOCK=1 npm run dev
export type Task = "setup" | "event" | "consequence" | "ending";

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
          { id: "a", text: "Жёсткий вариант", hint: "силовики довольны, Запад нет" },
          { id: "b", text: "Мягкий вариант", hint: "дорого для бюджета" },
          { id: "c", text: "Затянуть время", hint: "риск кризиса" },
        ],
        randomEvent: { title: "Утечка переписки", description: "Скандал в прессе.", resourceEffect: { politicalCapital: -3 } },
      });
    case "consequence":
      return JSON.stringify({
        headline: `Решение №${n} расколол элиты`,
        narrative: "Кинематографичное описание последствий. «Мы не отступим», — сказал министр.",
        resourceChanges: { economy: -6, politicalCapital: 4, military: -40 },
        factionRelChanges: { siloviki: 12, west: -8 },
        factionApprChanges: { church: 3 },
        figureRelChanges: { interior: -10 },
        reactions: ["Игрок 1: «Это ошибка»", "Игрок 4: «Поддерживаем»"],
        historianNote: "Историки назовут это началом конца.",
        newCrisis: n % 3 === 0 ? { title: `Кризис ${n}`, description: "Кризис из-за решения.", severity: "medium", resourceDrain: { economy: -2 } } : null,
        crisisResolved: null,
        powerLoss: null,
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
