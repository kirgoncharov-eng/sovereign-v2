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
export type GameMode = "classic"; // игра полностью офлайн: авторские сценарии без модели
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
  scene?: string;         // авторская сцена-последствие (режим без ИИ)
  sceneFail?: string;     // авторская сцена на случай провала исполнения
  headline?: string;      // заголовок газеты, если решение исполнят
  headlineFail?: string;  // заголовок газеты при провале
  deal?: Deal;            // личная сделка или пакт (особые дела)
}

// Особое дело о людях и союзах: что изменится, если решение исполнят.
export interface Deal {
  figure?: string;        // id ключевого игрока, о котором дело
  figureRel?: number;     // личное отношение этого человека
  othersRel?: number;     // остальные, кто к вам расположен, смотрят, как вы обходитесь со своими
  factionRel?: Record<string, number>;
  factionAppr?: Record<string, number>;
  replace?: string;       // имя преемника: человек уходит с поста
  res?: ResourceDelta;    // цена или выгода самой сделки
  pure?: boolean;         // эффект задаёт только сделка: теги лишь подписывают решение, исполнение гарантировано
  later?: { turns: number; label: string; res: ResourceDelta; story?: string }; // аукнется позже, если исполнят
  pact?: { faction: string; turns: number; ban: ActionTag[]; against?: string | null };
}

export interface PressAnswer { text: string; tone: "honest" | "hard" | "evasive"; res: ResourceDelta; rel: Partial<Record<Bloc, number>> }
export interface PressQuestion { id: string; who: string; topic: string; text: string; answers: PressAnswer[] }

export interface Pact {
  faction: string;
  figure: string | null;  // кто вёл переговоры
  since: number;          // ход подписания
  until: number;          // ход, в конце которого пакт истекает
  ban: ActionTag[];       // обязательство: чего не делать
  against: string | null; // фракция, против которой союз
}

export interface PactNews { signed: string[]; kept: string[]; broken: string[] }

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
  card?: string;        // авторская карточка, из которой собрано событие
  special?: { kind: "overture" | "insider" | "mole" | "pact" | "inspect" | "press" | "call" | "budget"; figure: string | null; faction: string } | null; // особое дело
  doc?: { facts: string[]; lines: string[]; author: string; key: number | null } | null;  // проверка документа: справка и строки доклада
  press?: { outlet: string; questions: PressQuestion[] } | null;       // пресс-конференция
  call?: { figure: string; trait: string; demand: string } | null;    // звонок по защищённой линии
  budget?: { total: number } | null;                                  // предвыборный бюджет
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
  document?: TurnDocument | null; // газеты или перехват — документ хода
}

export interface TurnDocument {
  kind: "press" | "intercept";
  title: string;
  lines: string[];
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
  pacts?: PactNews;     // подписанные, выполненные и нарушенные союзы (названия фракций)
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
  event?: string;       // дело, по которому принималось решение
  story?: string;       // авторская сцена, когда последствие сработает
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
  daily?: string | null; // дата «дела дня», если партия общая для всех
  bio?: string;         // биография лидера (BIOGRAPHIES)
  usedEvents: string[]; // карточки сценариев, уже показанные в этой партии
  stats: GameStats;
  advisors: Advisor[];
  councilCharges: number;
  pending: Pending[];
  arc: ArcState | null;
  pacts?: Pact[];        // действующие союзы
  betrayals?: number;    // сколько союзов вы нарушили
  echoes?: Record<string, number>; // сколько раз уже звучало эхо каждого отложенного последствия
  former?: string[];      // люди, ушедшие с постов: их имена не достаются преемникам
  currentEvent: GameEvent | null;
  lastTurn: TurnReport | null;
  ended: boolean;
  endType: EndType | null;
  powerLoss: string | null;
  verdict: Verdict | null;
}
