import type { AdvisorArtScene } from "./advisor-art-review.ts";
import type { AdvisorTake } from "../game/forecasts.ts";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";

export interface ReviewConversationLine {
  id: string;
  speaker: AdvisorTake;
  text: string;
  reply: boolean;
}

// Authored conversation for one review scene, not a generic wrapper around forecasts.
// Guards keep this dialogue off other cases and incompatible advisor positions.
export function reviewConversation(scene: AdvisorArtScene): ReviewConversationLine[] | null {
  const event = scene.state.currentEvent;
  if (scene.state.country !== ALTERNATE_COUNTRY || !event) return null;
  const guarantee = event.choices.find(choice => choice.law?.id === "alt_export_guarantee");
  const reject = event.choices.find(choice => choice.tags.includes("austerity"));
  const security = scene.takes.find(take => take.id === "security");
  const economist = scene.takes.find(take => take.id === "economist");
  if (!guarantee || !reject || !security || !economist) return null;
  if (security.favors !== guarantee.id || economist.favors !== reject.id) return null;
  return [
    {
      id: "opening", speaker: security, reply: false,
      text: [
        "Проведите гарантии.",
        "Без оборотных денег директора начнут сокращать смены раньше,"
          + " чем парламент назначит проверяющего.",
      ].join(" "),
    },
    {
      id: "objection", speaker: economist, reply: true,
      text: "Гарантия — это не заказ, а обещание казны оплатить чужой срыв. "
        + "Пока никто не назвал того, кто проверит договоры.",
    },
    {
      id: "response", speaker: security, reply: true,
      text: [
        "Без гарантий банки придержат ссуды уже сегодня.",
        "Комитет будет искать проверяющего, а заводы — кого сократить.",
      ].join(" "),
    },
  ];
}
