import type { AdvisorArtScene } from "./advisor-art-review.ts";
import type { AdvisorTake } from "../game/forecasts.ts";

export interface ReviewConversationLine {
  id: string;
  speaker: AdvisorTake;
  text: string;
  reply: boolean;
}

// Authored conversation for one review scene, not a generic wrapper around forecasts.
// Guards keep this dialogue off other cases and incompatible advisor positions.
export function reviewConversation(scene: AdvisorArtScene): ReviewConversationLine[] | null {
  if (scene.state.turn !== 0) return null;
  const event = scene.state.currentEvent;
  if (event?.beat?.arcId !== "kompromat" || event.beat.episode !== 1) return null;
  const trace = event.choices.find(choice => choice.arc?.flag === "o_trace");
  const hide = event.choices.find(choice => choice.arc?.flag === "o_hide");
  const security = scene.takes.find(take => take.id === "security");
  const economist = scene.takes.find(take => take.id === "economist");
  if (!trace || !hide || !security || !economist) return null;
  if (security.favors !== trace.id || economist.favors !== hide.id) return null;
  return [
    {
      id: "opening", speaker: security, reply: false,
      text: "Кто-то очень хотел, чтобы эта открытка попала лично к вам. Поручите охране найти отправителя.",
    },
    {
      id: "objection", speaker: economist, reply: true,
      text: "И сколько людей вы подключите к поискам? Пока открытка лежит на этом столе. "
        + "Не хватало ещё слухов, что президент кого-то разыскивает в первый же день.",
    },
    {
      id: "response", speaker: security, reply: true,
      text: "Тогда начнём с тех, кто принял почту. Или будем ждать, пока отправитель сам решит объявиться?",
    },
  ];
}
