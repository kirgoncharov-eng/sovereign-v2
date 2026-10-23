import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRegionalTrust,
  isEntryAffectingRegion,
  isRepublicMapVisible,
  REGION_IDS,
  REGIONS,
  TRUST_WORD_INFO,
  trustWord,
} from './republic-map.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { Faction, GameState, HistoryEntry } from './types.ts';

function createMockFaction(id: string, name: string, relation: number): Faction {
  return {
    id,
    name,
    desc: '',
    emoji: '',
    baseApproval: 50,
    bloc: 'business',
    approval: 50,
    relation,
  };
}

test('trustWord and TRUST_WORD_INFO map scores strictly with clear political explanations', () => {
  assert.equal(trustWord(70), 'верят');
  assert.equal(TRUST_WORD_INFO.верят.label, 'Верят');
  assert.ok(TRUST_WORD_INFO.верят.explanation.includes('поддерживают'));

  assert.equal(trustWord(55), 'верят');
  assert.equal(trustWord(54), 'ждут');
  assert.equal(TRUST_WORD_INFO.ждут.label, 'Выжидают');
  assert.ok(TRUST_WORD_INFO.ждут.explanation.includes('выжидает'));

  assert.equal(trustWord(45), 'ждут');
  assert.equal(trustWord(36), 'ждут');
  assert.equal(trustWord(35), 'против');
  assert.equal(TRUST_WORD_INFO.против.label, 'Против');
  assert.ok(TRUST_WORD_INFO.против.explanation.includes('недовольство'));

  assert.equal(trustWord(20), 'против');
});

test('computeRegionalTrust calculates all 4 regions deterministically without save schema changes', () => {
  const factions: Faction[] = [
    createMockFaction('gossektor', 'Промышленная палата', 40),
    createMockFaction('opposition', 'Гражданское движение', 20),
    createMockFaction('media', 'Независимые редакции', 30),
    createMockFaction('west', 'Торговый союз', -40),
    createMockFaction('russia', 'Российская делегация', 50),
    createMockFaction('siloviki', 'Служба порядка', 30),
    createMockFaction('regions', 'Областные советы', -50),
    createMockFaction('church', 'Совет приходов', -30),
  ];

  const state = {
    country: ALTERNATE_COUNTRY,
    factions,
    history: [] as HistoryEntry[],
  };

  const trust = computeRegionalTrust(state);

  for (const id of REGION_IDS) {
    assert.ok(trust[id], `Регион ${id} должен быть рассчитан`);
    assert.equal(trust[id].id, id);
    assert.equal(trust[id].name, REGIONS[id].name);
    assert.ok(trust[id].score >= 0 && trust[id].score <= 100);
    assert.ok(['верят', 'ждут', 'против'].includes(trust[id].word));
  }

  // Минск: позитивные отношения (gossektor 40, opposition 20, media 30) -> ожидание/доверие
  assert.ok(trust.minsk.score >= 50);

  // Гродно: west = -40 -> против
  assert.equal(trust.grodno.word, 'против');

  // Брест: russia = 50, siloviki = 30 -> верят
  assert.equal(trust.brest.word, 'верят');

  // Полесье: regions = -50, church = -30 -> против
  assert.equal(trust.polesie.word, 'против');
});

test('unified isEntryAffectingRegion and lastAffected test: воспроизведение замечания ревью', () => {
  // Тест точного кейса из ревью GPT/Codex:
  // Дело: «Подрядчик подал в суд» / «Район чинит больницу сам», success=true, hurt=['gossektor']
  const factions: Faction[] = [
    createMockFaction('gossektor', 'Промышленная палата', 0),
    createMockFaction('opposition', 'Гражданское движение', 0),
    createMockFaction('media', 'Независимые редакции', 0),
    createMockFaction('west', 'Торговый союз', 0),
    createMockFaction('russia', 'Российская делегация', 0),
    createMockFaction('siloviki', 'Служба порядка', 0),
    createMockFaction('regions', 'Областные советы', 0),
    createMockFaction('church', 'Совет приходов', 0),
  ];

  const reviewCaseEntry: HistoryEntry = {
    year: 1978,
    title: 'Подрядчик подал в суд',
    choice: 'Разрешить району действовать самостоятельно',
    headline: 'Район чинит больницу сам',
    historianNote: 'Больничный корпус открыт досрочно',
    success: true,
    hurt: ['gossektor'],
  };

  assert.equal(
    isEntryAffectingRegion(reviewCaseEntry, REGIONS.polesie),
    true,
    'Классификатор должен распознать дело Полесья по заголовку газеты «больниц»',
  );

  const state = {
    country: ALTERNATE_COUNTRY,
    factions,
    history: [reviewCaseEntry],
  };

  const trust = computeRegionalTrust(state);

  // Доверие Полесья выросло 50 -> 56 за счёт успеха районной больницы
  assert.equal(trust.polesie.score, 56);
  // И отметка lastAffected обязана быть true!
  assert.equal(trust.polesie.lastAffected, true, 'Полесье должно быть отмечено как lastAffected');
  // Минск задет, так как gossektor в hurt
  assert.equal(trust.minsk.lastAffected, true, 'Минск задет, так как его палата в hurt');
});

test('signed affairs shift regional trust up or down', () => {
  const factions: Faction[] = [
    createMockFaction('gossektor', 'Промышленная палата', 0),
    createMockFaction('opposition', 'Гражданское движение', 0),
    createMockFaction('media', 'Независимые редакции', 0),
    createMockFaction('west', 'Торговый союз', 0),
    createMockFaction('russia', 'Российская делегация', 0),
    createMockFaction('siloviki', 'Служба порядка', 0),
    createMockFaction('regions', 'Областные советы', 0),
    createMockFaction('church', 'Совет приходов', 0),
  ];

  const baseTrust = computeRegionalTrust({
    country: ALTERNATE_COUNTRY,
    factions,
    history: [],
  });

  // Базовый уровень при нулевых отношениях — 50 («ждут»)
  assert.equal(baseTrust.minsk.score, 50);
  assert.equal(baseTrust.minsk.word, 'ждут');

  // Успешное дело завода в Минске повышает доверие
  const withSuccess = computeRegionalTrust({
    country: ALTERNATE_COUNTRY,
    factions,
    history: [
      {
        year: 1978,
        title: 'Завод ждёт зарплату',
        choice: 'Выплатить зарплату',
        headline: 'Заводские цеха продолжают работу',
        historianNote: '',
        success: true,
      },
    ],
  });
  assert.ok(withSuccess.minsk.score > baseTrust.minsk.score);

  // Провал дела или удар по фракциям региона снижает доверие
  const withHurt = computeRegionalTrust({
    country: ALTERNATE_COUNTRY,
    factions,
    history: [
      {
        year: 1978,
        title: 'Завод ждёт зарплату',
        choice: 'Отказ',
        headline: 'Забастовка на заводе',
        historianNote: '',
        success: false,
        hurt: ['gossektor', 'opposition'],
      },
    ],
  });
  assert.ok(withHurt.minsk.score < baseTrust.minsk.score);
});

test('isRepublicMapVisible enforces timing: hidden on turn <= 1 and daily games', () => {
  assert.equal(isRepublicMapVisible({ country: ALTERNATE_COUNTRY, turn: 0 }), false);
  assert.equal(isRepublicMapVisible({ country: ALTERNATE_COUNTRY, turn: 1 }), false);
  assert.equal(isRepublicMapVisible({ country: ALTERNATE_COUNTRY, turn: 2 }), true);
  assert.equal(isRepublicMapVisible({ country: ALTERNATE_COUNTRY, turn: 5 }), true);
  // На архивных странах и в деле дня не отображается
  assert.equal(isRepublicMapVisible({ country: 'Беларусь', turn: 5 }), false);
  assert.equal(isRepublicMapVisible({ country: ALTERNATE_COUNTRY, turn: 5, daily: '2026-10-21' }), false);
});

test('regional combination events (#215) are valid, reachability is verified in cardAvailable', async () => {
  const { ALTERNATE_EVENTS } = await import('../content/alternate-history.ts');
  const { cardAvailable } = await import('./classic.ts');
  const { createInitialState } = await import('./engine.ts');
  const { classicApi } = await import('./classic.ts');

  const regionalCardIds = [
    'alt_region_walkers',
    'alt_region_factory_strike',
    'alt_region_customs',
    'alt_region_governors',
    'alt_region_border_rift',
  ];

  for (const id of regionalCardIds) {
    const card = ALTERNATE_EVENTS.find(c => c.id === id);
    assert.ok(card, `Карточка ${id} должна существовать в ALTERNATE_EVENTS`);
    assert.ok(card.when?.regions, `Карточка ${id} должна иметь условие when.regions`);
    assert.ok(card.choices.length >= 2, `Карточка ${id} должна иметь выбор`);
    for (const ch of card.choices) {
      assert.ok(ch.text, `Выбор ${ch.text} должен иметь текст`);
      assert.ok(ch.hint, `Выбор ${ch.text} должен иметь подсказку`);
      assert.ok(ch.scene, `Выбор ${ch.text} должен иметь сцену`);
      assert.ok(ch.fail, `Выбор ${ch.text} должен иметь сцену неуспеха`);
      assert.ok(ch.head && ch.head.length === 2, `Выбор ${ch.text} должен иметь заголовки газеты`);
    }
  }

  // Проверяем карточку «Ходоки из Полесья» (Минск верят, Полесье против)
  const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 42);
  const state = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, () => 0.5);
  state.turn = 5;

  const walkersCard = ALTERNATE_EVENTS.find(c => c.id === 'alt_region_walkers')!;
  
  // При нейтральном состоянии Минск:ждут, Полесье:ждут -> карточка недоступна
  assert.equal(cardAvailable(walkersCard, state), false);

  // Поднимаем Минск в «верят» (+50 gossektor/opposition) и роняем Полесье в «против» (-60 regions/church)
  state.factions = state.factions.map(f => {
    if (f.id === 'gossektor' || f.id === 'opposition') return { ...f, relation: 60 };
    if (f.id === 'regions' || f.id === 'church') return { ...f, relation: -60 };
    return f;
  });

  const trusts = computeRegionalTrust(state);
  assert.equal(trusts.minsk.word, 'верят');
  assert.equal(trusts.polesie.word, 'против');

  // Теперь карточка «Ходоки из Полесья» доступна!
  assert.equal(cardAvailable(walkersCard, state), true);

  // На другой стране карточка недоступна
  const foreignState = { ...state, country: 'Беларусь' };
  assert.equal(cardAvailable(walkersCard, foreignState), false);
});

test('end-to-end reachability: all 5 regional events are served by classicApi.event and signed into history', async () => {
  const { classicApi } = await import('./classic.ts');
  const { createInitialState, resolveTurn, startEvent } = await import('./engine.ts');
  const { ALTERNATE_EVENTS } = await import('../content/alternate-history.ts');

  const configs = [
    {
      id: 'alt_region_walkers',
      setupState: (s: GameState) => {
        // minsk: верят, polesie: против, grodno/brest: верят
        s.factions = s.factions.map((f: Faction) => {
          if (f.id === 'gossektor' || f.id === 'opposition') return { ...f, relation: 60 };
          if (f.id === 'regions' || f.id === 'church') return { ...f, relation: -40 };
          if (f.id === 'west' || f.id === 'russia' || f.id === 'siloviki') return { ...f, relation: 60 };
          return f;
        });
      },
    },
    {
      id: 'alt_region_factory_strike',
      setupState: (s: GameState) => {
        // minsk: против, остальные: верят
        s.factions = s.factions.map((f: Faction) => {
          if (f.id === 'gossektor' || f.id === 'opposition') return { ...f, relation: -60 };
          if (f.id === 'regions' || f.id === 'church') return { ...f, relation: 60 };
          if (f.id === 'west' || f.id === 'russia' || f.id === 'siloviki') return { ...f, relation: 60 };
          return f;
        });
      },
    },
    {
      id: 'alt_region_customs',
      setupState: (s: GameState) => {
        // minsk/polesie: верят, grodno: против, brest: ждут
        s.factions = s.factions.map((f: Faction) => {
          if (f.id === 'gossektor' || f.id === 'opposition') return { ...f, relation: 60 };
          if (f.id === 'regions' || f.id === 'church') return { ...f, relation: 60 };
          if (f.id === 'west') return { ...f, relation: -40 };
          if (f.id === 'russia' || f.id === 'siloviki') return { ...f, relation: 0 };
          return f;
        });
      },
    },
    {
      id: 'alt_region_governors',
      setupState: (s: GameState) => {
        // все регионы против, customs уже в истории -> срабатывают губернаторы
        s.usedEvents = ['alt_region_customs'];
        s.factions = s.factions.map((f: Faction) => {
          if (f.id === 'gossektor' || f.id === 'opposition') return { ...f, relation: -50 };
          if (f.id === 'regions' || f.id === 'church') return { ...f, relation: -50 };
          if (f.id === 'west') return { ...f, relation: -50 };
          if (f.id === 'russia' || f.id === 'siloviki') return { ...f, relation: -50 };
          return f;
        });
      },
    },
    {
      id: 'alt_region_border_rift',
      setupState: (s: GameState) => {
        // minsk/polesie: верят, grodno: верят, brest: против
        s.factions = s.factions.map((f: Faction) => {
          if (f.id === 'gossektor' || f.id === 'opposition') return { ...f, relation: 60 };
          if (f.id === 'regions' || f.id === 'church') return { ...f, relation: 60 };
          if (f.id === 'west') return { ...f, relation: 60 };
          if (f.id === 'russia' || f.id === 'siloviki') return { ...f, relation: -60 };
          return f;
        });
      },
    },
  ];

  for (const { id, setupState } of configs) {
    const expectedCard = ALTERNATE_EVENTS.find(c => c.id === id)!;
    const intro = await classicApi.setup(ALTERNATE_COUNTRY, 'debut', 'pragmatist', 101);
    let state = createInitialState(ALTERNATE_COUNTRY, 'debut', 'pragmatist', intro, () => 0.42);
    state.turn = 9; // Ход 10 — региональный ход
    setupState(state);

    const event = await classicApi.event(state);
    assert.ok(event, `Событие должно быть построено для ${id}`);
    assert.equal(event.title, expectedCard.title, `classicApi.event должен вернуть событие ${expectedCard.title}`);

    state = startEvent(state, event);
    const choice = event.choices[0];
    const consequence = await classicApi.consequence(state, choice.id);
    state = resolveTurn(state, choice.id, consequence);

    const signed = state.history.some(e => e.title === expectedCard.title);
    assert.ok(signed, `Дело ${expectedCard.title} должно быть успешно записано в историю`);
  }
});


