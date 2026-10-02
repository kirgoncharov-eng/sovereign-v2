// Предвыборные обещания: что лидер пообещал стране, кому именно и как это проверить.
// Обещание тянет в свою сторону и почти всегда мешает просто выжить — в этом его смысл.
import type { ActionTag, Bloc, IdeologyId, ResourceKey } from "../game/types.ts";

export type PromiseGoal =
  | { kind: "tags"; tags: ActionTag[]; count: number }   // столько исполненных решений такого рода
  | { kind: "never"; tags: ActionTag[] }                 // ни одного такого решения до срока
  | { kind: "resource"; key: ResourceKey; rise: number }; // к сроку опора выше стартовой на rise

export interface PromiseDef {
  id: string;
  title: string;
  pitch: string;     // как это звучало на митинге
  bloc: Bloc;        // кому обещано: они обрадуются исполнению и не простят обмана
  goal: PromiseGoal;
  due: 10 | 20;      // к парламентским или к президентским выборам
  ideo: IdeologyId[]; // каким курсам обещание подходит
}

export const PROMISES: PromiseDef[] = [
  { id: "europe", title: "Курс на Европу", pitch: "Через пять лет мы будем ездить в Европу без виз.",
    bloc: "liberal", goal: { kind: "tags", tags: ["pro_west", "reform"], count: 3 }, due: 20, ideo: ["liberal"] },
  { id: "neighbour", title: "Не дразнить соседа", pitch: "С Москвой надо договариваться, а не бегать за чужими обещаниями.",
    bloc: "russia", goal: { kind: "never", tags: ["pro_west"] }, due: 20, ideo: ["pragmatist", "leftist"] },
  { id: "no_batons", title: "Никаких дубинок", pitch: "При мне ни один человек не будет избит за то, что вышел на площадь.",
    bloc: "liberal", goal: { kind: "never", tags: ["repress"] }, due: 20, ideo: ["liberal", "leftist"] },
  { id: "order", title: "Порядок на улицах", pitch: "Бандиты и провокаторы будут бояться нас, а не мы их.",
    bloc: "security", goal: { kind: "tags", tags: ["security", "repress"], count: 3 }, due: 20, ideo: ["nationalist"] },
  { id: "thieves", title: "Посадить воров", pitch: "Те, кто разворовал страну, ответят. Поимённо.",
    bloc: "liberal", goal: { kind: "tags", tags: ["anticorruption"], count: 3 }, due: 20, ideo: ["liberal", "leftist"] },
  { id: "pensions", title: "Пенсии и зарплаты", pitch: "Каждая семья почувствует перемены в кошельке.",
    bloc: "regional", goal: { kind: "tags", tags: ["social"], count: 2 }, due: 20, ideo: ["leftist"] },
  { id: "no_deals", title: "Никаких сделок с олигархами", pitch: "Страну больше не будут делить в кабинетах.",
    bloc: "regional", goal: { kind: "never", tags: ["elite_deal"] }, due: 20, ideo: ["leftist", "nationalist", "liberal"] },
  { id: "growth", title: "Экономика на ноги", pitch: "К концу срока вы сами увидите рост.",
    bloc: "business", goal: { kind: "resource", key: "economy", rise: 3 }, due: 20, ideo: ["pragmatist"] },
  { id: "investors", title: "Открыть страну деньгам", pitch: "Заводы строят деньги, а деньги приходят туда, где с ними договариваются.",
    bloc: "business", goal: { kind: "tags", tags: ["investment", "elite_deal"], count: 3 }, due: 20, ideo: ["pragmatist"] },
  { id: "dialogue", title: "Говорить с каждым", pitch: "Я буду разговаривать даже с теми, кто за меня не голосовал.",
    bloc: "liberal", goal: { kind: "tags", tags: ["dialogue"], count: 3 }, due: 20, ideo: ["liberal", "leftist", "pragmatist"] },
  { id: "sovereign", title: "Ни под чью дудку", pitch: "Ни Брюссель, ни Москва не будут решать за нас.",
    bloc: "nationalist", goal: { kind: "never", tags: ["pro_west", "pro_russia"] }, due: 20, ideo: ["nationalist"] },
  { id: "faith", title: "Вернуть стране гордость", pitch: "Мы вспомним, кто мы такие, — и нас вспомнят другие.",
    bloc: "church", goal: { kind: "tags", tags: ["patriotism"], count: 2 }, due: 20, ideo: ["nationalist"] },
  { id: "fair_vote", title: "Власть, которой верят", pitch: "Власть, которой верят, не нужно охранять.",
    bloc: "liberal", goal: { kind: "resource", key: "internalLegitimacy", rise: 5 }, due: 10, ideo: ["liberal", "pragmatist"] },
  { id: "free_press", title: "Свободная пресса", pitch: "Ни одного звонка в редакции из моего кабинета.",
    bloc: "liberal", goal: { kind: "never", tags: ["propaganda"] }, due: 20, ideo: ["liberal"] },
  { id: "army", title: "Сильная армия", pitch: "Армию, которую не кормят свои, кормят чужие.",
    bloc: "security", goal: { kind: "resource", key: "military", rise: 4 }, due: 20, ideo: ["nationalist", "pragmatist"] },
  { id: "budget", title: "Жить по средствам", pitch: "Мы перестанем раздавать деньги, которых у нас нет.",
    bloc: "business", goal: { kind: "never", tags: ["social"] }, due: 20, ideo: ["pragmatist"] },
];

export const PROMISE_PICK = 3;   // сколько обещаний берёт лидер
export const PROMISE_OFFER = 5;  // из скольких выбирает
// Исполненное обещание: доверие и благодарность тех, кому обещали. Нарушенное — стоит дороже.
export const PROMISE_KEPT = { res: { internalLegitimacy: 5, politicalCapital: 4 }, rel: 15 };
export const PROMISE_BROKEN = { res: { internalLegitimacy: -6, personalResource: -4 }, rel: -20 };
