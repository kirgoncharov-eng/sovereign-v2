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
export type GameMode = "classic" | "ai"; // classic — сценарии без ИИ, ai — живой рассказчик
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
  advisor?: { id: string; name: string; role: string; skill: 1 | 2 | 3 } | null; // автор предложения
  arc?: ArcChoice | null; // сюжетный вариант эпизода интриги
}

export interface ArcChoice {
  flag: string;
  ok: string;
  fail?: string;
  effect?: ResourceDelta;
  epilogue?: string;
}

export interface ArcState {
  id: string;
  target: string;      // имя антагониста линии
  targetRole: string;
  flags: string[];
  done: number[];      // ходы уже сыгранных эпизодов
  epilogue: string | null;
}

export interface Advisor {
  id: string;
  role: string;
  emoji: string;
  name: string;
  skill: 1 | 2 | 3;
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
  council?: Choice[] | null; // предложения советников, если совет собирали
  beat?: { arcId: string; arcTitle: string; turn: number; episode: number; total: number } | null; // эпизод интриги
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
  success: boolean;     // решение исполнено или провалено
  chance: number;       // шанс успеха, который видел игрок
  matured: Pending[];   // сработавшие в этом ходу отложенные последствия
  scheduled: Pending[]; // отложенные последствия этого решения
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

export interface Pending {
  id: string;
  due: number;          // ход, в конце которого сработает
  label: string;
  res: ResourceDelta;
  source: string;       // решение, которое его вызвало
}

export interface HistoryEntry {
  year: number;
  title: string;
  choice: string;
  headline: string;
  historianNote: string;
  tags?: ActionTag[];
  success?: boolean;
}

export interface GameStats {
  crisesResolved: number;
  councils: number;
  failures: number;
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
  advisors?: string[]; // имена советников в порядке ADVISOR_ROLES
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
  mode: GameMode;
  seed: number;
  usedEvents: string[]; // карточки сценариев, уже показанные в этой партии
  stats: GameStats;
  advisors: Advisor[];
  councilCharges: number;
  pending: Pending[];
  arc: ArcState | null;
  currentEvent: GameEvent | null;
  lastTurn: TurnReport | null;
  ended: boolean;
  endType: EndType | null;
  powerLoss: string | null;
  verdict: Verdict | null;
}
