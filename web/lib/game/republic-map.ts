// Карта республики (#215): доверие людей по четырём местам Неманской республики 1978 года.
// Доверие каждого места считается детерминированно из отношений лагерей и подписанных дел.
// Новых полей в сохранении нет (0 миграций); старые сохранения работают побайтно.

import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { Faction, GameState } from './types.ts';

export type RegionId = 'minsk' | 'grodno' | 'brest' | 'polesie';
export type RegionalTrustWord = 'верят' | 'ждут' | 'против';

export interface RegionConfig {
  id: RegionId;
  name: string;
  tagline: string;
  summary: string;
  keySymbols: string[];
  factions: { id: string; weight: number }[];
  caseKeywords: string[];
}

export const REGIONS: Record<RegionId, RegionConfig> = {
  minsk: {
    id: 'minsk',
    name: 'Минск',
    tagline: 'Столичный узел и тяжёлое машиностроение',
    summary: 'Тракторный гигант, ведомственные министерства, конструкторские бюро и профсоюзные собрания.',
    keySymbols: ['Заводские корпуса и трубы МТЗ', 'Министерства проспекта', 'Редакции газет и радио', 'Конвейер'],
    factions: [
      { id: 'gossektor', weight: 0.45 },   // Промышленная палата
      { id: 'opposition', weight: 0.35 },  // Гражданское движение
      { id: 'media', weight: 0.20 },       // Независимые редакции / эфир
    ],
    caseKeywords: ['завод', 'эфир', 'бюджет', 'письмо, которое прочитали'],
  },
  grodno: {
    id: 'grodno',
    name: 'Гродно',
    tagline: 'Западная граница и торговые связи',
    summary: 'Таможенные склады, причалы Немана, европейские контракты и ассоциация кооператоров.',
    keySymbols: ['Таможенная арка', 'Речной порт Немана', 'Торговый союз', 'Станки и импорт'],
    factions: [
      { id: 'west', weight: 1.0 },         // Торговый союз
    ],
    caseKeywords: ['чужой рынок', 'станк', 'европейск', 'неман'],
  },
  brest: {
    id: 'brest',
    name: 'Брест',
    tagline: 'Юго-западный бастион и транзитная магистраль',
    summary: 'Сортировочные пути европейской колеи, наливная эстакада нефтебазы, комендатура и таможня.',
    keySymbols: ['Пятиугольный бастион', 'Транзитная магистраль', 'Нефтебаза и мазут', 'Пограничный дозор'],
    factions: [
      { id: 'russia', weight: 0.55 },      // Российская делегация / топливный транзит
      { id: 'siloviki', weight: 0.45 },    // Служба порядка / граница
    ],
    caseKeywords: ['мазут', 'состав', 'станци', 'станцию перекрыли', 'нефтебаз', 'последний состав'],
  },
  polesie: {
    id: 'polesie',
    name: 'Полесье',
    tagline: 'Южные плавни, мелиорация и аграрные советы',
    summary: 'Осушенные торфяники, зерновые элеваторы, районные больницы и приходские сходы вдоль Припяти.',
    keySymbols: ['Зерновые элеваторы', 'Шлюзы мелиорации', 'Районная больница', 'Приходы над Припятью'],
    factions: [
      { id: 'regions', weight: 0.60 },     // Областные советы / губернаторы
      { id: 'church', weight: 0.40 },      // Совет приходов
    ],
    caseKeywords: ['закупочн', 'больниц', 'указ дошёл', 'област', 'приход'],
  },
};

export const REGION_IDS: RegionId[] = ['minsk', 'grodno', 'brest', 'polesie'];

export interface RegionalTrust {
  id: RegionId;
  name: string;
  tagline: string;
  summary: string;
  score: number; // 0..100
  word: RegionalTrustWord;
  keySymbols: string[];
  factions: { id: string; name: string; relation: number }[];
  lastAffected?: boolean;
}

export const REGIONAL_THRESHOLDS = {
  opposed: 35, // <= 35: «против»
  trust: 55,   // >= 55: «верят»
  // 36..54: «ждут»
} as const;

export function trustWord(score: number): RegionalTrustWord {
  if (score >= REGIONAL_THRESHOLDS.trust) return 'верят';
  if (score <= REGIONAL_THRESHOLDS.opposed) return 'против';
  return 'ждут';
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

export function computeRegionalTrust(state: Pick<GameState, 'country' | 'factions' | 'history'>): Record<RegionId, RegionalTrust> {
  const factionsMap = new Map<string, Faction>();
  for (const f of state.factions ?? []) {
    factionsMap.set(f.id, f);
  }

  const lastEntry = state.history?.at(-1);

  const result = {} as Record<RegionId, RegionalTrust>;

  for (const id of REGION_IDS) {
    const config = REGIONS[id];

    // 1. Взвешенное отношение фракций региона (-100..100) -> переводим в базу (0..100)
    let weightedRel = 0;
    let totalWeight = 0;
    const factionsInfo: { id: string; name: string; relation: number }[] = [];

    for (const { id: facId, weight } of config.factions) {
      const faction = factionsMap.get(facId);
      const rel = faction ? faction.relation : 0;
      weightedRel += rel * weight;
      totalWeight += weight;
      if (faction) {
        factionsInfo.push({ id: faction.id, name: faction.name, relation: faction.relation });
      }
    }

    const avgRel = totalWeight > 0 ? weightedRel / totalWeight : 0;
    // Отношение (-100..100) мапится в базовый рейтинг (10..90): центр 50
    const baseScore = 50 + (avgRel * 0.4);

    // 2. Влияние подписанных дел региона из истории
    let affairsDelta = 0;
    const regionalFacIds = new Set(config.factions.map(f => f.id));

    for (const entry of state.history ?? []) {
      const titleMatch = entry.title ? matchesKeywords(entry.title, config.caseKeywords) : false;
      const headlineMatch = entry.headline ? matchesKeywords(entry.headline, config.caseKeywords) : false;
      const isRegionalCase = titleMatch || headlineMatch;

      if (isRegionalCase) {
        const hurtAny = Array.isArray(entry.hurt) && entry.hurt.some(hid => regionalFacIds.has(hid));
        if (hurtAny) {
          affairsDelta -= 8;
        } else if (entry.success === false) {
          affairsDelta -= 4;
        } else if (entry.success === true) {
          affairsDelta += 6;
        } else {
          affairsDelta += 2;
        }
      }
    }

    // Ограничиваем влияние дел диапазоном [-20, +20]
    const clampedAffairsDelta = Math.max(-20, Math.min(20, affairsDelta));
    const finalScore = Math.max(0, Math.min(100, Math.round(baseScore + clampedAffairsDelta)));

    // Проверяем, задел ли этот регион последний ход
    let lastAffected = false;
    if (lastEntry) {
      const matchRecentCase = lastEntry.title ? matchesKeywords(lastEntry.title, config.caseKeywords) : false;
      const hurtRecent = Array.isArray(lastEntry.hurt) && lastEntry.hurt.some(hid => regionalFacIds.has(hid));
      lastAffected = matchRecentCase || hurtRecent;
    }

    result[id] = {
      id,
      name: config.name,
      tagline: config.tagline,
      summary: config.summary,
      score: finalScore,
      word: trustWord(finalScore),
      keySymbols: config.keySymbols,
      factions: factionsInfo,
      lastAffected,
    };
  }

  return result;
}

// Отображается только для Неманской республики 1978 года со 2-го хода (на ходу 1 нового блока нет)
export function isRepublicMapVisible(gs: Pick<GameState, 'country' | 'turn' | 'daily'>): boolean {
  if (gs.daily) return false;
  return gs.country === ALTERNATE_COUNTRY && (gs.turn ?? 0) >= 2;
}
