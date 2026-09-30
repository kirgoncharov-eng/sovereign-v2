// Общие типы игрового состояния. Используются и клиентом, и сервером.

export type ResourceKey =
  | "politicalCapital"
  | "economy"
  | "military"
  | "externalReputation"
  | "internalLegitimacy"
  | "personalResource";

export type Resources = Record<ResourceKey, number>;
export type ResourceDelta = Partial<Record<ResourceKey, number>>;

export type DifficultyId = "debut" | "coalition" | "crisis" | "ruins";
export type IdeologyId = "liberal" | "nationalist" | "pragmatist" | "leftist";
export type Loyalty = "союзник" | "нейтрал" | "враг";
export type Severity = "low" | "medium" | "high" | "critical";
export type EndType = "mandate" | "revolution" | "collapse";

export interface Faction {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  baseApproval: number;
  approval: number; // одобрение фракции в обществе, 0..100
  relation: number; // отношение фракции к лидеру, -100..100
}

export interface Figure {
  id: string;
  role: string;
  faction: string;
  name: string;
  loyalty: Loyalty;
  relation: number; // -100..100
}

export interface Crisis {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  resourceDrain: ResourceDelta;
  turnsActive: number;
}

export interface Choice {
  id: string;
  text: string;
  hint: string;
}

export interface RandomEvent {
  title: string;
  description: string;
  resourceEffect: ResourceDelta;
}

export interface GameEvent {
  title: string;
  source: string;
  description: string;
  isCritical: boolean;
  affectedFactions: string[];
  choices: Choice[];
  randomEvent: RandomEvent | null;
}

export interface NewCrisis {
  title: string;
  description: string;
  severity: Severity;
  resourceDrain: ResourceDelta;
}

export interface Consequence {
  headline: string;
  narrative: string;
  resourceChanges: ResourceDelta;
  factionRelChanges: Record<string, number>;
  factionApprChanges: Record<string, number>;
  figureRelChanges: Record<string, number>;
  reactions: string[];
  historianNote: string;
  newCrisis: NewCrisis | null;
  crisisResolved: string | null; // id кризиса
  powerLoss: string | null;
}

// То, что показывается игроку после хода: ответ модели + то, что посчитал движок.
export interface TurnReport extends Consequence {
  choiceText: string;
  resolvedCrisis: string | null; // название
  expiredCrises: string[]; // названия
  addedCrisis: boolean;
}

export interface HistoryEntry {
  year: number;
  title: string;
  choice: string;
  headline: string;
  historianNote: string;
}

export interface Leader {
  name: string;
  party: string;
  bio: string;
}

export interface Intro {
  leader: Leader;
  speech: string;
  situation: string;
  players: string[]; // имена ключевых игроков в порядке FIGURE_ROLES
}

export interface Verdict {
  verdict: string;
  title: string;
  epitaph: string;
  rating: string;
  fallNarrative: string | null;
}

export interface GameState {
  version: number;
  country: string;
  diff: DifficultyId;
  ideo: IdeologyId;
  leader: Leader;
  speech: string;
  situation: string;
  resources: Resources;
  prevResources: Resources | null;
  factions: Faction[];
  prevFactions: Faction[] | null;
  keyFigures: Figure[];
  prevFigures: Figure[] | null;
  activeCrises: Crisis[];
  year: number;
  turn: number;
  history: HistoryEntry[];
  currentEvent: GameEvent | null;
  lastTurn: TurnReport | null;
  ended: boolean;
  endType: EndType | null;
  powerLoss: string | null;
  verdict: Verdict | null;
}
