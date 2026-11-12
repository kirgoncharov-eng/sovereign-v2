import test from "node:test";
import assert from "node:assert/strict";
import { ALTERNATE_ARC, ALTERNATE_EVENTS } from "./alternate-history.ts";
import { CASE_CHOICE_MEMORIES } from "./memoirs-1978.ts";
import { approachWorks, budgetChoice, callChoice, classicApi, customizeLeader, freshLeaderName, pressChoice } from "../game/classic.ts";
import { ALTERNATE_COUNTRY } from "../game/alternate-world.ts";
import { createInitialState, planTurn, resolveTurn, seededRandom, startEvent } from "../game/engine.ts";
import type { Choice, DifficultyId, GameState, HistoryEntry } from "../game/types.ts";

async function playTerm(seed: number, diff: DifficultyId, pickIndex: number): Promise<GameState> {
  const rand = seededRandom(seed);
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, diff, "pragmatist", seed);
  let s = createInitialState(ALTERNATE_COUNTRY, diff, "pragmatist", intro, rand, "classic", "economist");
  while (!s.ended && s.turn < 20) {
    const ev = await classicApi.event(s);
    s = startEvent(s, ev);
    let id: string;
    if (ev.press) {
      s = { ...s, currentEvent: { ...s.currentEvent!, choices: [pressChoice(s, [0, 1, 0]), s.currentEvent!.choices[1]] } };
      id = "p";
    } else if (ev.call && !ev.call.negotiation) {
      const a = (["offer", "principle", "pressure", "numbers"] as const).find(x => approachWorks(ev.call!.trait, x)) ?? "numbers";
      s = { ...s, currentEvent: { ...s.currentEvent!, choices: [callChoice(s, a, "deal"), s.currentEvent!.choices[1]] } };
      id = "p";
    } else if (ev.budget) {
      s = { ...s, currentEvent: { ...s.currentEvent!, choices: [budgetChoice(s, { army: 2, social: 3, economy: 3, apparatus: 1, culture: 1 }, false), s.currentEvent!.choices[1]] } };
      id = "p";
    } else if (pickIndex === -1) {
      const score = (c: Choice) => {
        const plan = planTurn(s, c.id, { assumeSuccess: true });
        return Math.min(...Object.values(plan.resources)) + plan.chance * 10;
      };
      id = [...ev.choices].sort((a, b) => score(b) - score(a))[0].id;
    } else {
      id = ev.choices[pickIndex % ev.choices.length].id;
    }
    s = resolveTurn(s, id, await classicApi.consequence(s, id));
  }
  return s.ended ? s : { ...s, ended: true, endType: "reelected" };
}

test("вердикт мемуаров 1978 года называет решения партии, главного союзника и противника, интригу и выносит счётчики в справку (#417)", async () => {
  const state = await playTerm(3, "coalition", -1);
  const verdict = await classicApi.ending(state);
  const [narrative, reference] = verdict.verdict.split("\n\nСправка архива: ");

  assert.ok(narrative, "есть основной текст мемуаров");
  assert.ok(reference, "счётчики вынесены отдельной строкой справки");

  // Счётчики — в справке, а не в основном абзаце.
  assert.doesNotMatch(narrative, /Главный инструмент правления/);
  assert.match(reference, /Главный инструмент правления/);
  assert.match(reference, /К концу правления партия власти имела \d+% поддержки\./);

  // Названы 2–3 авторских решения этой партии.
  const quotedTitles = [...narrative.matchAll(/«([^»]+)»/g)].map(m => m[1]);
  const historyTitles = new Set(state.history.map(h => h.title));
  const matchedDecisions = quotedTitles.filter(title => historyTitles.has(title));
  assert.ok(matchedDecisions.length >= 2, `ожидались 2–3 названия решений партии, найдено: ${matchedDecisions.join(", ")}`);

  // Названы главный союзник и главный противник к концу срока.
  const sortedFigures = [...state.keyFigures].sort((a, b) => b.relation - a.relation);
  const ally = sortedFigures[0];
  const foe = sortedFigures.at(-1)!;
  assert.ok(narrative.includes(ally.name), `в мемуарах назван главный союзник: ${ally.name}`);
  assert.ok(narrative.includes(foe.name), `в мемуарах назван главный противник: ${foe.name}`);

  // Интрига «Четвёртый экземпляр» упомянута, если она сыграна.
  if (state.arc?.id === "alt_contracts" && (state.arc.done.length > 0 || state.arc.epilogue)) {
    assert.match(narrative, /«Четвёртый экземпляр»/);
    assert.ok(narrative.includes(state.arc.target), `упомянут директор концерна ${state.arc.target}`);
  }
});

test("две партии на одном зерне с разным курсом дают заметно разные вердикты мемуаров (#417)", async () => {
  const courseA = await playTerm(7, "debut", 0);
  const courseB = await playTerm(7, "debut", 1);
  const verdictA = (await classicApi.ending(courseA)).verdict.split("\n\nСправка архива: ")[0];
  const verdictB = (await classicApi.ending(courseB)).verdict.split("\n\nСправка архива: ")[0];

  assert.notEqual(verdictA, verdictB, "разный курс на одном зерне даёт разный рассказ мемуаров");
});

test("женское имя президента согласует род глаголов в мемуарах 1978 года (#417)", async () => {
  const base = await playTerm(11, "debut", 0);
  const femName = freshLeaderName(base, true, 1);
  const femState = customizeLeader(base, { bio: "lawyer", ideo: "leftist", name: femName });
  const verdict = await classicApi.ending({
    ...femState,
    arc: femState.arc ? { ...femState.arc, epilogue: "Вы нашли четвёртый экземпляр и отделили старый долг страны от личных заказов директора." } : null,
  });
  const [narrative] = verdict.verdict.split("\n\nСправка архива: ");
  assert.match(narrative, /правила страной/);
  assert.match(narrative, /приняла/);
  assert.match(narrative, /она нашла четвёртый экземпляр и отделила/);
});

test("архивные страны сохраняют прежний формат вердикта без строки справки 1978 года (#417)", async () => {
  const rand = seededRandom(5);
  const intro = await classicApi.setup("Казахстан", "coalition", "pragmatist", 5);
  const s = createInitialState("Казахстан", "coalition", "pragmatist", intro, rand);
  const verdict = await classicApi.ending({ ...s, ended: true, endType: "mandate", turn: 20, year: 2029 });
  assert.doesNotMatch(verdict.verdict, /Справка архива:/);
});

test("женский род применяется ко всем 22 авторским делам и реальным партиям 1978 года без несклонённых глаголов (#417)", async () => {
  const rand = seededRandom(5);
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, "debut", "pragmatist", 5);
  const base = createInitialState(ALTERNATE_COUNTRY, "debut", "pragmatist", intro, rand, "classic", "economist");
  const maleState = customizeLeader(base, { bio: "lawyer", ideo: "leftist", name: "Антон Березич" });
  const femState = customizeLeader(base, { bio: "lawyer", ideo: "leftist", name: freshLeaderName(base, true, 1) });

  for (const ev of ALTERNATE_EVENTS) {
    for (const choice of ev.choices) {
      assert.ok(CASE_CHOICE_MEMORIES[ev.title]?.[choice.text], `есть память для «${ev.title}» / «${choice.text}»`);
      for (const success of [true, false]) {
        const entry: HistoryEntry = {
          year: 1978,
          title: ev.title,
          choice: choice.text,
          headline: "",
          historianNote: "",
          success,
        };
        const maleNarrative = (await classicApi.ending({ ...maleState, ended: true, endType: "mandate", history: [entry] })).verdict.split("\n\nСправка архива: ")[0];
        const femNarrative = (await classicApi.ending({ ...femState, ended: true, endType: "mandate", history: [entry] })).verdict.split("\n\nСправка архива: ")[0];
        assert.doesNotMatch(maleNarrative, /[{}|]/, `нет нераскрытых шаблонов рода (м.р.): ${ev.title}`);
        assert.doesNotMatch(femNarrative, /[{}|]/, `нет нераскрытых шаблонов рода (ж.р.): ${ev.title}`);
        assert.notEqual(maleNarrative, femNarrative, `женское имя меняет род глаголов: ${ev.title} / ${choice.text} (success=${success})`);
      }
    }
  }

  // Прямая проверка проблемных прогонов из ревью на женском лидере.
  for (const [seed, diff, pick] of [[19, "ruins", 2], [3, "crisis", 0], [7, "crisis", 1]] as const) {
    const played = await playTerm(seed, diff, pick);
    const femPlayed = { ...played, leader: { ...played.leader, name: freshLeaderName(played, true, 1) } };
    const [narrative] = (await classicApi.ending(femPlayed)).verdict.split("\n\nСправка архива: ");
    const firstName = femPlayed.leader.name.split(" ")[0];
    assert.ok(narrative.includes(`${firstName} правил`) === false, `${seed}/${diff}: «${firstName} правил» недопустимо`);
    assert.doesNotMatch(narrative, new RegExp(`${firstName} в первом[^.]*?(?<![\\p{L}])(?:выдал|пустил|решился|погасил|направил|подписал|разделил|отдал)(?![\\p{L}])`, "u"));
  }
});

test("все действующие эпилоги «Четвёртого экземпляра» переводятся в третье лицо целиком и сохраняют причинность провала первых дел (#417)", async () => {
  const rand = seededRandom(5);
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, "debut", "pragmatist", 5);
  const base = createInitialState(ALTERNATE_COUNTRY, "debut", "pragmatist", intro, rand, "classic", "economist");
  const maleState = customizeLeader({ ...base, ended: true, endType: "mandate" }, { bio: "lawyer", ideo: "leftist", name: "Антон Березич" });
  const femState = customizeLeader({ ...base, ended: true, endType: "mandate" }, { bio: "lawyer", ideo: "leftist", name: freshLeaderName(base, true, 1) });

  const epilogues = ALTERNATE_ARC.beats
    .flatMap(b => b.variants)
    .flatMap(v => v.choices)
    .flatMap(c => [c.epilogue, c.epilogueFail])
    .filter((s): s is string => !!s);

  assert.ok(epilogues.length >= 10);
  for (const epilogue of epilogues) {
    for (const [label, st] of [["м.р.", maleState], ["ж.р.", femState]] as const) {
      const state = {
        ...st,
        arc: { id: "alt_contracts", target: "Степан Миронович", targetRole: "Директор", flags: [], done: [2, 4, 6], epilogue },
      };
      const [narrative] = (await classicApi.ending(state)).verdict.split("\n\nСправка архива: ");
      assert.doesNotMatch(narrative, /(?:^|[\s,])Вы\s/u, `${label}: не осталось обращения на «Вы» в «${epilogue}»`);
      assert.doesNotMatch(narrative, /(?<![\p{L}])(?:сменили|договорились|нашли|заставили|сохранили|закрыли|выбрали|попытались|отделили|признали)(?![\p{L}])/u,
        `${label}: не осталось глаголов 2-го лица в «${narrative}»`);
    }
  }

  // Проверка конкретных пар причинности из ревью (19/ruins, 3/ruins).
  const bankFail = (await classicApi.ending({
    ...femState,
    history: [{ year: 1978, title: "Завод ждёт зарплату", choice: "Оплатить зарплату в обмен на проверку договоров", headline: "", historianNote: "", success: false }],
  })).verdict;
  assert.match(bankFail, /банк списал/);

  const customsFail = (await classicApi.ending({
    ...femState,
    history: [{ year: 1978, title: "Завод ждёт зарплату", choice: "Перестроить производство и защитить увольняемых", headline: "", historianNote: "", success: false }],
  })).verdict;
  assert.match(customsFail, /таможне/);
  assert.doesNotMatch(customsFail, /саботаже дирекции/);
});
