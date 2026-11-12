import test from "node:test";
import assert from "node:assert/strict";
import { ALTERNATE_ARC, ALTERNATE_EVENTS } from "./alternate-history.ts";
import { CASE_CHOICE_MEMORIES, memoirParagraphs } from "./memoirs-1978.ts";
import { TERM_FINALE } from "./secretary.ts";
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

// ── #439: экран и вычитка ────────────────────────────────────────────────────────────────────────────────────────

async function freshTerm(): Promise<GameState> {
  const rand = seededRandom(5);
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, "debut", "pragmatist", 5);
  const base = createInitialState(ALTERNATE_COUNTRY, "debut", "pragmatist", intro, rand, "classic", "economist");
  return customizeLeader({ ...base, ended: true, endType: "mandate" }, { bio: "lawyer", ideo: "leftist", name: "Антон Березич" });
}

const entryOf = (title: string, choice: string, success = true): HistoryEntry =>
  ({ year: 1978, title, choice, headline: "", historianNote: "", success });

test("вердикт 1978 года делится на абзацы: рассказ, решения, люди и справка последним абзацем (#439)", async () => {
  const state = await playTerm(33, "debut", 1);
  const parts = memoirParagraphs((await classicApi.ending(state)).verdict);

  assert.ok(parts.length >= 3, `ожидалось не меньше трёх абзацев, получено ${parts.length}`);
  assert.deepEqual(parts.map(part => part.reference), [...parts.slice(0, -1).map(() => false), true], "справка одна и стоит последней");
  assert.match(parts.at(-1)!.text, /^Справка архива: /);
  assert.ok(parts[0].text.startsWith(state.leader.name), "первый абзац открывает имя президента");
  for (const part of parts) assert.ok(part.text.length < 900, `абзац умещается в экран телефона: ${part.text.length} знаков`);
});

test("архивный вердикт остаётся одним абзацем рассказа (#439)", async () => {
  const rand = seededRandom(5);
  const intro = await classicApi.setup("Казахстан", "coalition", "pragmatist", 5);
  const state = createInitialState("Казахстан", "coalition", "pragmatist", intro, rand);
  const verdict = (await classicApi.ending({ ...state, ended: true, endType: "mandate", turn: 20, year: 2029 })).verdict;
  assert.deepEqual(memoirParagraphs(verdict), [{ text: verdict, reference: false }]);
});

test("секретарь в мемуарах — третьим лицом и не словами своей последней записки (#439)", async () => {
  const base = await freshTerm();
  const name = "Нина Залесская";
  // Вердикт читает из мира только секретаря: остального состояния приёмной тест не строит.
  const withSecretary = (secretary: object): GameState => ({ ...base, world: { ...base.world, secretary: { name, ...secretary } } } as GameState);
  const cases = [
    { present: false, trust: 0, finale: TERM_FINALE.left },
    { present: true, trust: 0, finale: TERM_FINALE[0] },
    { present: true, trust: 1, finale: TERM_FINALE[1] },
    { present: true, trust: 2, finale: TERM_FINALE[2] },
  ];
  const told = new Set<string>();
  for (const change of cases) {
    const [narrative] = (await classicApi.ending(withSecretary(change))).verdict.split("\n\nСправка архива: ");
    const line = narrative.split(/(?<=\.)\s+/).find(sentence => sentence.startsWith("Секретарь приёмной"));
    assert.ok(line, `секретарь названа: доверие ${change.trust}, на месте ${change.present}`);
    assert.ok(line.includes(name), "секретарь названа по имени");
    assert.ok(!narrative.includes(change.finale), "записка из ленты не повторена дословно");
    assert.doesNotMatch(line, /(?<![\p{L}])(?:вы|вас|вам|вами|ваш\p{L}*)(?![\p{L}])/iu, `нет обращения на «вы»: ${line}`);
    told.add(line);
  }
  assert.equal(told.size, cases.length, "у каждого исхода своя фраза");

  const early = withSecretary({ present: true, trust: 2, finale: null });
  assert.doesNotMatch((await classicApi.ending(early)).verdict, /Секретарь приёмной/, "до конца срока итог секретаря не подводится");
});

test("род союзника и противника верен для иностранных женских имён (#439)", async () => {
  const base = await freshTerm();
  const [first, second, ...rest] = base.keyFigures;
  const figures = [
    { ...first, name: "Кэтрин Харпер", relation: 90 },
    { ...second, name: "Изабель Андерссон", relation: -90 },
    ...rest.map(figure => ({ ...figure, relation: 0 })),
  ];
  const { verdict } = await classicApi.ending({ ...base, keyFigures: figures });
  assert.match(verdict, /оставалась Кэтрин Харпер/);
  assert.match(verdict, /стала Изабель Андерссон/);
});

test("связка времени перед «когда» отделена запятой, три решения — три фразы (#439)", async () => {
  const base = await freshTerm();
  const station = entryOf("Станцию перекрыли", "Купить зерно для сёл и отправить состав");
  const factory = entryOf("Завод ждёт зарплату", "Получить аванс под трёхлетний российский заказ");
  const price = entryOf("Закупочная цена", "Оставить цену и дать сезонную ссуду");

  const three = (await classicApi.ending({ ...base, history: [factory, station, station] })).verdict;
  assert.match(three, /Антон в первом деле «Завод ждёт зарплату»[^.]+\. В середине срока, когда «Станцию перекрыли», [^.]+\. Под конец, когда «Станцию перекрыли», /);
  const two = (await classicApi.ending({ ...base, history: [factory, station] })).verdict;
  assert.match(two, /, а затем, когда «Станцию перекрыли», выкупил/);
  const lead = (await classicApi.ending({ ...base, history: [station, price] })).verdict;
  assert.match(lead, /Антон, когда «Станцию перекрыли», выкупил[^.]+, а затем в деле «Закупочная цена» /);
  for (const verdict of [three, two, lead]) assert.doesNotMatch(verdict, /(?:затем|срока|конец|Антон) когда/);
});

test("фраза о пути власти стоит в рассказе, а не среди счётчиков; «ушёл сам» — только ушедшему (#439)", async () => {
  const base = await freshTerm();
  const exit = { id: "exit" as const, turn: 18 };
  const left = await classicApi.ending({ ...base, endType: "retired", path: exit });
  const [story, reference] = left.verdict.split("\n\nСправка архива: ");
  assert.match(memoirParagraphs(story)[0].text, /Он ушёл сам, когда мог бы цепляться, — и этим запомнился\.$/);
  assert.doesNotMatch(reference, /ушёл сам/);

  const fell = await classicApi.ending({ ...base, endType: "collapse", path: exit });
  assert.doesNotMatch(fell.verdict, /ушёл сам/, "срок оборвался раньше ухода");
});

test("фраза о пути власти согласована с женским именем президента в 1978 году; архив держит прежнюю строку (#439)", async () => {
  const base = await freshTerm();
  const woman = customizeLeader(base, { bio: "lawyer", ideo: "leftist", name: freshLeaderName(base, true, 1) });
  const ends = [
    ["run", "mandate"], ["exit", "retired"], ["zeroing", "zeroed"], ["zeroing", "mandate"], ["rokirovka", "premier"],
    ["successor", "leader_of_nation"], ["successor", "betrayed"], ["postpone", "emergency_rule"], ["postpone", "revolution"],
    ["dictatorship", "dictator"], ["dictatorship", "coup"], ["dictatorship", "revolution"],
  ] as const;
  for (const [id, endType] of ends) {
    for (const path of [{ id, turn: 18 }, { id: "exit" as const, turn: 18, from: id }]) {
      const first = memoirParagraphs((await classicApi.ending({ ...woman, endType, path })).verdict)[0].text;
      assert.doesNotMatch(first, /[{}|]/, `нет нераскрытой разметки: ${id}/${endType}`);
      assert.doesNotMatch(first, /(?<![\p{L}])(?:он|его самого|сам|ушёл|мог|ответил|пошёл|переписал|сменил|потерял|выбрал|отложил|отменил|решил|стал|нужен|попытался|запомнился)(?![\p{L}])/iu,
        `мужской род о женщине-президенте: ${first}`);
    }
  }

  const rand = seededRandom(5);
  const intro = await classicApi.setup("Казахстан", "coalition", "pragmatist", 5);
  const archive = createInitialState("Казахстан", "coalition", "pragmatist", intro, rand);
  const archiveWoman = { ...archive, leader: { ...archive.leader, name: "Айгерим Абдрахманова" }, ended: true, endType: "retired" as const,
    turn: 20, year: 2029, path: { id: "exit" as const, turn: 18 } };
  assert.match((await classicApi.ending(archiveWoman)).verdict, /Он ушёл сам, когда мог бы цепляться, — и этим запомнился\./);
});
