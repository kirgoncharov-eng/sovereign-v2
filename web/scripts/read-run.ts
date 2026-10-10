// Партия целиком в виде текста — чтобы прочитать её глазами, как игрок, и найти нелогичности.
// Игрок выбирает разумно (бережёт самую слабую опору), звонки ведёт подходящим подходом.
//
//   node scripts/read-run.ts [страна] [зерно] [сложность]
//   node scripts/read-run.ts Казахстан 21 coalition > run.txt
import { approachWorks, budgetChoice, callChoice, classicApi, pressChoice } from "../lib/game/classic.ts";
import { createInitialState, planTurn, resolveTurn, seededRandom, startEvent } from "../lib/game/engine.ts";
import type { Choice, DifficultyId, GameState } from "../lib/game/types.ts";

const [country = "Казахстан", seedArg = "21", diffArg = "coalition"] = process.argv.slice(2);
const seed = Number(seedArg), diff = diffArg as DifficultyId;
const rand = seededRandom(seed);
const out: string[] = [];
const say = (line: string) => out.push(line);

const withChoice = (s: GameState, choice: Choice): GameState =>
  ({ ...s, currentEvent: { ...s.currentEvent!, choices: [choice, s.currentEvent!.choices[1]] } });

let s = createInitialState(country, diff, "pragmatist", await classicApi.setup(country, diff, "pragmatist", seed), rand, "classic", "economist");
while (!s.ended) {
  const ev = await classicApi.event(s);
  s = startEvent(s, ev);
  const tags = [ev.source, ev.special?.kind, ev.beat ? `интрига, эпизод ${ev.beat.episode}` : "", ev.isCritical ? "СРОЧНО" : ""].filter(Boolean).join(" · ");
  say(`\n######## ХОД ${s.turn + 1} — ${ev.title}  [${tags}]`);
  say(ev.description.split("\n\n").join("\n"));
  let id: string;
  if (ev.press) {
    ev.press.questions.forEach(q => say(`  ? ${q.who}: ${q.text}`));
    s = withChoice(s, pressChoice(s, [0, 1, 0])); id = "p";
  } else if (ev.call && !ev.call.negotiation) {
    say(`  ☎ ${ev.call.demand} (характер: ${ev.call.trait})`);
    const approach = (["offer", "principle", "pressure", "numbers"] as const).find(a => approachWorks(ev.call!.trait, a)) ?? "numbers";
    s = withChoice(s, callChoice(s, approach, "deal")); id = "p";
  } else if (ev.budget) {
    s = withChoice(s, budgetChoice(s, { army: 2, social: 3, economy: 3, apparatus: 1, culture: 1 }, false)); id = "p";
  } else {
    ev.choices.forEach(c => say(`  · ${c.text} — ${c.hint}`));
    const score = (c: Choice) => { const plan = planTurn(s, c.id, { assumeSuccess: true }); return Math.min(...Object.values(plan.resources)) + plan.chance * 10 + rand() * 3; };
    id = [...ev.choices].sort((a, b) => score(b) - score(a))[0].id;
  }
  s = resolveTurn(s, id, await classicApi.consequence(s, id));
  const t = s.lastTurn!;
  say(`>>> РЕЗОЛЮЦИЯ: ${t.choiceText}${t.chance < 1 ? ` [${t.success ? "исполнено" : "ПРОВАЛ"}, шанс ${Math.round(t.chance * 100)}%]` : ""}`);
  say(`=== ГАЗЕТА: ${t.headline}`);
  say(t.narrative);
  t.reactions.forEach(r => say(`  » ${r}`));
  t.letters?.forEach(l => say(`  ✉ ${l.from}${l.role ? `, ${l.role}` : ""}: ${l.text}`));
  if (t.election) say(`  ВЫБОРЫ: ${t.election.leader}% против ${t.election.top.share}% — ${t.election.outcome}`);
  say(`  опоры: ${Object.entries(s.resources).map(([k, v]) => `${k.slice(0, 5)}=${v}`).join(" ")}`);
}
const verdict = await classicApi.ending(s);
say(`\n######## ФИНАЛ: ${s.endType} — ${verdict.title}\n${verdict.verdict}\n${verdict.epitaph}`);
console.log(out.join("\n"));
