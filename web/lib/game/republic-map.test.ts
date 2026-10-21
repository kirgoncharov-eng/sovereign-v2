import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRegionalTrust,
  isRepublicMapVisible,
  REGION_IDS,
  REGIONS,
  trustWord,
} from './republic-map.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { Faction, HistoryEntry } from './types.ts';

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

test('trustWord maps scores strictly to three states: верят / ждут / против', () => {
  assert.equal(trustWord(70), 'верят');
  assert.equal(trustWord(55), 'верят');
  assert.equal(trustWord(54), 'ждут');
  assert.equal(trustWord(45), 'ждут');
  assert.equal(trustWord(36), 'ждут');
  assert.equal(trustWord(35), 'против');
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

test('lastAffected identifies region touched by most recent decision', () => {
  const factions: Faction[] = [
    createMockFaction('russia', 'Российская делегация', 0),
    createMockFaction('siloviki', 'Служба порядка', 0),
    createMockFaction('west', 'Торговый союз', 0),
  ];

  const state = {
    country: ALTERNATE_COUNTRY,
    factions,
    history: [
      {
        year: 1978,
        title: 'Завод ждёт зарплату',
        choice: 'План А',
        headline: '',
        historianNote: '',
      },
      {
        year: 1978,
        title: 'Мазут с запада',
        choice: 'Заблокировать эстакаду',
        headline: 'Мазутные цистерны задержаны в Бресте',
        historianNote: '',
        hurt: ['russia'],
      },
    ],
  };

  const trust = computeRegionalTrust(state);
  assert.equal(trust.brest.lastAffected, true);
  assert.equal(trust.grodno.lastAffected, false);
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
