// «Страна» и «Люди» вместо досье: короткие строки-итоги для свёрнутых разделов и тревоги на кнопках.
// Игрок видит, куда смотреть, не открывая всё подряд: «Люди · 2 ⚠» значит, что кто-то из окружения или лагерей опасен.
import { CRISIS_THRESHOLD, HOSTILE_RELATION, RESOURCE_KEYS } from "../game/data.ts";
import { plural } from "../game/engine.ts";
import { isDisloyal } from "../game/advisors.ts";
import { candidatePool, staffingOpen } from "../game/staffing.ts";
import { governmentLoad } from "../game/government.ts";
import { personProfiles } from "./people-text.ts";
import { messageUnread, presidentialMessages } from "./presidential-inbox.ts";
import type { GameState } from "../game/types.ts";

export type SheetId = "country" | "people";

// Сколько тревог за кнопкой: опоры ниже порога кризиса; нелояльные советники и враждебные лагеря.
export function sheetAlerts(gs: GameState): Record<SheetId, number> {
  const country = RESOURCE_KEYS.filter(key => gs.resources[key] < CRISIS_THRESHOLD).length;
  const advisors = (gs.advisors ?? []).filter(advisor => isDisloyal(advisor)).length;
  const factions = gs.factions.filter(faction => faction.relation <= HOSTILE_RELATION).length;
  return { country, people: advisors + factions };
}

// Итог свёрнутого раздела «Страны» — одной строкой рядом с заголовком.
export function countryNotes(gs: GameState) {
  const promises = gs.promises ?? [];
  const kept = promises.filter(promise => promise.status === "kept").length;
  const broken = promises.filter(promise => promise.status === "broken").length;
  const laws = gs.laws?.length ?? 0;
  const decisions = gs.history.length;
  const pending = gs.pending?.length ?? 0;
  return {
    promises: promises.length
      ? [`исполнено ${kept} из ${promises.length}`, ...(broken ? [`нарушено ${broken}`] : [])].join(" · ")
      : null,
    laws: laws ? plural(laws, "закон", "закона", "законов") : "пока нет",
    chronicle: decisions ? plural(decisions, "решение", "решения", "решений") : "пусто",
    pending: pending ? `${plural(pending, "последствие", "последствия", "последствий")} впереди` : null,
  };
}

// Кадровый резерв в «Людях»: сколько кандидатов ждут, или почему сейчас не до них.
export function staffNote(gs: GameState): string | null {
  if (!staffingOpen(gs)) return null;
  if (gs.staffing?.lastTurn === gs.turn) return "решение квартала принято";
  const pool = candidatePool(gs).length;
  return pool ? plural(pool, "кандидат", "кандидата", "кандидатов") : "резерв на год исчерпан";
}

// ── Стол в «Людях» и «Стране» ───────────────────────────────────────────────
// Обращения — третья группа «Людей»: кто пишет, кто ждёт ответа. Ответ даётся в том же окне стола, что и раньше.
export interface InboxRow {
  id: string;            // id профиля — по нему стол открывает переписку
  name: string;
  role: string;
  waiting: boolean;      // хотя бы одно обращение ждёт ответа
  unread: number;
  note: string;          // что видно под именем: заголовок ждущего обращения, новое или договорённость
}

export function inboxRows(gs: GameState): InboxRow[] {
  const messages = presidentialMessages(gs);
  if (!messages.length) return [];
  // Те же люди, что на столе: без самого президента, бывших советников и антагониста интриги.
  return personProfiles(gs)
    .filter(profile => !["leader", "arc-target"].includes(profile.id) && !profile.id.startsWith("former:"))
    .filter(profile => messages.some(message => message.person === profile.id))
    .map(profile => {
      const own = messages.filter(message => message.person === profile.id);
      const request = own.find(message => message.needsReply);
      const unread = own.filter(message => messageUnread(gs, message)).length;
      const note = request ? `ждёт ответа: ${request.title}` : unread ? plural(unread, "новое", "новых", "новых") : own[0].title;
      return { id: profile.id, name: profile.name, role: profile.role, waiting: !!request, unread, note };
    })
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.unread - a.unread);
}

// Правительство в «Стране»: сколько программ в работе и свободно ли личное поручение квартала.
export function governmentNote(gs: GameState): { programs: string; quota: string } | null {
  if (gs.daily || !gs.world) return null;
  return {
    programs: `${governmentLoad(gs.world)} из 2 в работе`,
    quota: gs.world.lastActionTurn === gs.turn ? "личное поручение квартала подписано" : "одно личное поручение на квартал свободно",
  };
}
