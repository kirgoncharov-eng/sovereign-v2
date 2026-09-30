// Общие тексты бота: подписка и сообщение «Дела дня».
import { dailyCase } from "../game/daily.ts";
import { COUNTRIES, DIFFICULTIES, IDEOLOGIES } from "../game/data.ts";

export const SUBS = "tg:subs";

export function dailyText(now = new Date()) {
  const d = dailyCase(now);
  const [, mm, dd] = d.date.split("-");
  const ideo = IDEOLOGIES.find(i => i.id === d.ideo)?.label.toLowerCase();
  return `Дело дня · ${dd}.${mm}\n${COUNTRIES[d.country].flag} ${d.country} · ${DIFFICULTIES[d.diff].label.toLowerCase()} · ${ideo}\n\nОдна партия на всех. Продержитесь дольше друзей?`;
}

