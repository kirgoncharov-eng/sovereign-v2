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
export type EndType = "reelected" | "mandate" | "revolution" | "collapse" | "coup" | "impeachment";
export type Bloc = "security" | "business" | "church" | "liberal" | "west" | "russia" | "nationalist" | "regional" | "ruling";
export type ActionTag =
  | "repress" | "security" | "reform" | "pro_west" | "pro_russia" | "social" | "austerity"
  | "investment" | "anticorruption" | "elite_deal" | "dialogue" | "patriotism" | "propaganda" | "delay";

export interface Faction {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  baseApproval: number;
  bloc: Bloc;
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
  tags: ActionTag[];
  resolvesCrisis: string | null; // id кризиса, который закрывает это решение
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
  custom?: Choice | null; // решение игрока своими словами, оценённое советником
  randomEvent: RandomEvent | null;
}

export interface NewCrisis {
  title: string;
  description: string;
  severity: Severity;
  resourceDrain: ResourceDelta;
}

// Текст, который модель пишет по уже посчитанному движком итогу хода.
export interface Narration {
  headline: string;
  narrative: string;
  reactions: string[];
  historianNote: string;
  crisisTitle: string | null; // название нового кризиса, если движок его создал
  crisisDescription: string | null;
  powerLoss: string | null;
}

// То, что показывается игроку после хода: текст модели + то, что посчитал движок.
export interface TurnReport extends Narration {
  choiceText: string;
  tags: ActionTag[];
  resourceChanges: ResourceDelta;
  factionRelChanges: Record<string, number>;
  resolvedCrisis: string | null; // название
  expiredCrises: string[]; // названия
  newCrisis: NewCrisis | null;
  election: Election | null;
}

// Оценка решения игрока, введённого своими словами.
export interface Assessment {
  feasible: boolean;
  reason: string;       // почему невозможно (если feasible = false)
  choice: Choice | null;
  advisor: string;      // реплика советника о рисках
}

export interface PartyShare { id: string; name: string; share: number }
export interface Polls { leader: number; parties: PartyShare[]; undecided: number }

export interface Election {
  turn: number;
  kind: "parliament" | "president";
  leader: number;          // % партии лидера
  top: PartyShare;         // сильнейший конкурент
  outcome: "won" | "lost" | "impeached";
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
  elections: Election[];
  currentEvent: GameEvent | null;
  lastTurn: TurnReport | null;
  ended: boolean;
  endType: EndType | null;
  powerLoss: string | null;
  verdict: Verdict | null;
}
