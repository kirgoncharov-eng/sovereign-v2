// Статические данные мира: страны, фракции, фигуры, стартовые параметры.
import type { ActionTag, Bloc, DifficultyId, IdeologyId, Loyalty, ResourceDelta, ResourceKey, Resources } from "./types.ts";

export const APP_VERSION = "3.3";
export const SAVE_VERSION = 7; // 7: сквозные интриги
export const MAX_TURNS = 20;

export interface CountryInfo {
  flag: string;
  context: string;
  startYear: number;
  capital: string;
}

export const COUNTRIES: Record<string, CountryInfo> = {
  "Беларусь": { flag:"🇧🇾", context:"Постлукашенковская Беларусь. Санкции Запада, жёсткая зависимость от России, силовики привыкли к авторитаризму, оппозиция в эмиграции и подполье, общество разорвано.", startYear:2025, capital:"Минск" },
  "Украина":  { flag:"🇺🇦", context:"Украина в послевоенной реконструкции. Кандидат ЕС. Западные союзники устают, олигархи ослаблены, общество истощено и требует победы.", startYear:2025, capital:"Киев" },
  "Грузия":   { flag:"🇬🇪", context:"Малое государство. Абхазия и Ю.Осетия оккупированы Россией. Один олигарх контролирует правящую партию. Заявка на ЕС под угрозой. Улица против власти.", startYear:2025, capital:"Тбилиси" },
  "Молдова":  { flag:"🇲🇩", context:"Беднейшая страна Европы между ЕС и Россией. В Приднестровье стоят российские войска, Гагаузия бунтует, беглые олигархи скупают голоса. Энергозависимость, кандидатство в ЕС под давлением.", startYear:2025, capital:"Кишинёв" },
  "Армения":  { flag:"🇦🇲", context:"Страна после поражения в Карабахе. Граница с Азербайджаном не демаркирована, Россия теряет влияние, но держит базу в Гюмри. Церковь против власти, диаспора — главный инвестор, мир с соседями под вопросом.", startYear:2025, capital:"Ереван" },
  "Казахстан":{ flag:"🇰🇿", context:"Богатая ресурсами страна после кровавого января 2022-го. Старые кланы не сдались, спецслужбы сильнее парламента, на севере много русскоязычных, Москва и Пекин тянут в разные стороны, Запад покупает уран и нефть.", startYear:2025, capital:"Астана" }
};

export const DIFFICULTIES: Record<DifficultyId, { label: string; emoji: string; desc: string }> = {
  debut:     { label:"ДЕБЮТ",    emoji:"🟢", desc:"Убедительная победа. Мандат есть." },
  coalition: { label:"КОАЛИЦИЯ", emoji:"🟡", desc:"Хрупкое правительство, экономический спад." },
  crisis:    { label:"КРИЗИС",   emoji:"🔴", desc:"Протесты в столице. Рейтинг рушится." },
  ruins:     { label:"ОБЛОМКИ",  emoji:"⬛", desc:"Война / коллапс. Выживание — уже победа." }
};

export const IDEOLOGIES: { id: IdeologyId; emoji: string; label: string; desc: string }[] = [
  { id:"liberal",     emoji:"◈", label:"Либерал",     desc:"Реформы · ЕС · Права человека" },
  { id:"nationalist", emoji:"◆", label:"Националист", desc:"Суверенитет · Традиции · Государство" },
  { id:"pragmatist",  emoji:"◇", label:"Прагматик",   desc:"Результат и баланс — главное" },
  { id:"leftist",     emoji:"●", label:"Левый",        desc:"Справедливость · Антиолигархия" }
];

export const RES_CONFIG: { key: ResourceKey; label: string; prompt: string }[] = [
  { key:"politicalCapital",   label:"ПОЛИТКАПИТАЛ", prompt:"Политический капитал" },
  { key:"economy",            label:"ЭКОНОМИКА",    prompt:"Экономика" },
  { key:"military",           label:"СИЛОВИКИ",     prompt:"Силовики" },
  { key:"externalReputation", label:"РЕПУТАЦИЯ",    prompt:"Внешняя репутация" },
  { key:"internalLegitimacy", label:"ЛЕГИТИМНОСТЬ", prompt:"Внутренняя легитимность" },
  { key:"personalResource",   label:"ЛИЧНЫЙ РЕС.",  prompt:"Личный ресурс лидера" }
];

export const RESOURCE_KEYS: ResourceKey[] = RES_CONFIG.map(r => r.key);

export const START_RES: Record<DifficultyId, Resources> = {
  debut:     { politicalCapital:72, economy:65, military:62, externalReputation:58, internalLegitimacy:70, personalResource:82 },
  coalition: { politicalCapital:50, economy:44, military:56, externalReputation:50, internalLegitimacy:46, personalResource:65 },
  crisis:    { politicalCapital:33, economy:36, military:50, externalReputation:38, internalLegitimacy:28, personalResource:55 },
  ruins:     { politicalCapital:18, economy:20, military:32, externalReputation:22, internalLegitimacy:15, personalResource:40 }
};

export interface FactionInfo {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  baseApproval: number;
  bloc: Bloc;
}

export const FACTIONS_DATA: Record<string, FactionInfo[]> = {
  "Беларусь": [
    { id:"siloviki",   name:"Силовые структуры", desc:"КГБ, МВД, ОМОН",             emoji:"🛡️", baseApproval:32, bloc:"security" },
    { id:"gossektor",  name:"Гос. предприятия",   desc:"Директорат заводов",          emoji:"🏭", baseApproval:38, bloc:"business" },
    { id:"church",     name:"Православная церковь",desc:"Патриархат и приходы",      emoji:"⛪", baseApproval:52, bloc:"church" },
    { id:"opposition", name:"Демоппозиция",       desc:"Подполье и эмиграция",       emoji:"✊", baseApproval:58, bloc:"liberal" },
    { id:"youth",      name:"Молодёжь",           desc:"Активисты и студенты",       emoji:"🔥", baseApproval:65, bloc:"liberal" },
    { id:"west",       name:"Запад",               desc:"ЕС, США, НАТО",             emoji:"🌍", baseApproval:50, bloc:"west" },
    { id:"russia",     name:"Кремль",              desc:"Москва и пророссийские",     emoji:"🦅", baseApproval:22, bloc:"russia" },
    { id:"media",      name:"Независимые СМИ",    desc:"Журналисты и блогеры",       emoji:"📰", baseApproval:60, bloc:"liberal" },
  ],
  "Украина": [
    { id:"military",     name:"ЗСУ",               desc:"Вооружённые силы",           emoji:"⚔️", baseApproval:75, bloc:"security" },
    { id:"oligarchs",    name:"Олигархат",          desc:"Крупный капитал",            emoji:"💼", baseApproval:18, bloc:"business" },
    { id:"nationalists", name:"Националисты",      desc:"Радикальные движения",       emoji:"🔱", baseApproval:55, bloc:"nationalist" },
    { id:"west",         name:"Западные союзники", desc:"США, ЕС, НАТО",              emoji:"🌍", baseApproval:68, bloc:"west" },
    { id:"civil",        name:"Гражданское общество",desc:"Волонтёры и НКО",         emoji:"🤝", baseApproval:70, bloc:"liberal" },
    { id:"regions",      name:"Местные элиты",     desc:"Мэры и губернаторы",         emoji:"🏛️", baseApproval:40, bloc:"regional" },
    { id:"church",       name:"Церковь (ПЦУ)",     desc:"Православная церковь Украины",emoji:"⛪", baseApproval:60, bloc:"church" },
    { id:"media",        name:"Медиа",             desc:"Телеканалы и пресса",         emoji:"📰", baseApproval:55, bloc:"liberal" },
  ],
  "Грузия": [
    { id:"gdream",     name:"Грузинская мечта",    desc:"Партия Иванишвили",          emoji:"👑", baseApproval:35, bloc:"ruling" },
    { id:"opposition", name:"Проевропейская оппозиция",desc:"Нацдвижение и др.",     emoji:"🌍", baseApproval:48, bloc:"liberal" },
    { id:"church",     name:"Православная церковь",desc:"Патриарх и духовенство",    emoji:"⛪", baseApproval:72, bloc:"church" },
    { id:"business",   name:"Бизнес-элиты",       desc:"Предприниматели и банки",    emoji:"💼", baseApproval:44, bloc:"business" },
    { id:"civil",      name:"Гражданское общество",desc:"НКО и активисты",           emoji:"✊", baseApproval:62, bloc:"liberal" },
    { id:"russia",     name:"Кремль",              desc:"Москва и пророссийские",     emoji:"🦅", baseApproval:20, bloc:"russia" },
    { id:"west",       name:"Западные партнёры",  desc:"ЕС, США, НАТО",              emoji:"🌍", baseApproval:58, bloc:"west" },
    { id:"diaspora",   name:"Диаспора",            desc:"Эмигранты и зарубежная Грузия",emoji:"✈️", baseApproval:55, bloc:"liberal" },
  ],
  "Молдова": [
    { id:"west",      name:"ЕС и Румыния",          desc:"Брюссель и Бухарест",          emoji:"🌍", baseApproval:55, bloc:"west" },
    { id:"russia",    name:"Кремль",                desc:"Москва и Тирасполь",           emoji:"🦅", baseApproval:30, bloc:"russia" },
    { id:"oligarchs", name:"Беглые олигархи",       desc:"Теневые кланы и их партии",    emoji:"💼", baseApproval:20, bloc:"business" },
    { id:"regions",   name:"Гагаузия и север",      desc:"Пророссийские регионы",        emoji:"🏛️", baseApproval:40, bloc:"regional" },
    { id:"church",    name:"Митрополия",            desc:"Молдавская православная церковь",emoji:"⛪", baseApproval:65, bloc:"church" },
    { id:"civil",     name:"Гражданское общество",  desc:"Проевропейские НКО и СМИ",     emoji:"🤝", baseApproval:55, bloc:"liberal" },
    { id:"siloviki",  name:"Прокуратура и полиция", desc:"Силовой блок",                 emoji:"🛡️", baseApproval:35, bloc:"security" },
    { id:"diaspora",  name:"Диаспора",              desc:"Молдаване в ЕС",               emoji:"✈️", baseApproval:60, bloc:"liberal" },
  ],
  "Армения": [
    { id:"military",    name:"Армия и ветераны",     desc:"Генштаб и ветераны Карабаха", emoji:"⚔️", baseApproval:60, bloc:"security" },
    { id:"church",      name:"Апостольская церковь", desc:"Эчмиадзин",                    emoji:"⛪", baseApproval:70, bloc:"church" },
    { id:"oligarchs",   name:"Старые элиты",         desc:"Олигархи прежней власти",      emoji:"💼", baseApproval:25, bloc:"business" },
    { id:"revanchists", name:"Реваншисты",           desc:"Карабахский клан и радикалы",  emoji:"🔱", baseApproval:40, bloc:"nationalist" },
    { id:"civil",       name:"Гражданское общество", desc:"НКО, журналисты, студенты",    emoji:"🤝", baseApproval:55, bloc:"liberal" },
    { id:"diaspora",    name:"Диаспора",             desc:"США, Франция, Россия",         emoji:"✈️", baseApproval:65, bloc:"liberal" },
    { id:"west",        name:"ЕС и США",             desc:"Новые партнёры",               emoji:"🌍", baseApproval:55, bloc:"west" },
    { id:"russia",      name:"Кремль и ОДКБ",        desc:"Бывший союзник",               emoji:"🦅", baseApproval:30, bloc:"russia" },
  ],
  "Казахстан": [
    { id:"siloviki",     name:"КНБ и полиция",       desc:"Спецслужбы",                   emoji:"🛡️", baseApproval:35, bloc:"security" },
    { id:"oligarchs",    name:"Семейные кланы",      desc:"Старая элита и её активы",     emoji:"💼", baseApproval:15, bloc:"business" },
    { id:"regions",      name:"Акимы регионов",      desc:"Региональная вертикаль",       emoji:"🏛️", baseApproval:40, bloc:"regional" },
    { id:"youth",        name:"Городская молодёжь",  desc:"Алматы, Астана, соцсети",      emoji:"🔥", baseApproval:60, bloc:"liberal" },
    { id:"nationalists", name:"Национал-патриоты",   desc:"Казахоязычные активисты",      emoji:"🔱", baseApproval:45, bloc:"nationalist" },
    { id:"church",       name:"Духовенство",         desc:"Духовное управление мусульман",emoji:"🕌", baseApproval:50, bloc:"church" },
    { id:"russia",       name:"Кремль",              desc:"Москва и ЕАЭС",                emoji:"🦅", baseApproval:35, bloc:"russia" },
    { id:"west",         name:"Западные инвесторы",  desc:"Нефть, уран, США и ЕС",        emoji:"🌍", baseApproval:45, bloc:"west" },
  ],
};

export const IDEOLOGY_REL: Record<IdeologyId, Record<string, number>> = {
  liberal:     { revanchists:-35, siloviki:-45,gossektor:-25,church:-15,opposition:+55,youth:+45,west:+65,russia:-70,media:+40, military:+10,oligarchs:-15,nationalists:-35,civil:+55,regions:+10, gdream:-55,business:+20,diaspora:+60 },
  nationalist: { revanchists:+40, siloviki:+20,gossektor:-5, church:+50,opposition:-40,youth:+15,west:-50,russia:-20,media:+10, military:+60,oligarchs:-25,nationalists:+65,civil:-20,regions:+20, gdream:-20,business:-10,diaspora:+30 },
  pragmatist:  { revanchists:-10, siloviki:+5, gossektor:+10,church:+10,opposition:-20,youth:+5, west:+15,russia:-15,media:+0,  military:+20,oligarchs:+30,nationalists:-15,civil:+10,regions:+20, gdream:+5, business:+30,diaspora:+10 },
  leftist:     { revanchists:-15, siloviki:-30,gossektor:+50,church:-35,opposition:+20,youth:+35,west:+10,russia:-20,media:+30, military:-10,oligarchs:-60,nationalists:-30,civil:+65,regions:+15, gdream:-45,business:-45,diaspora:+20 },
};

export const DIFF_REL_MOD: Record<DifficultyId, number> = { debut:+15, coalition:0, crisis:-20, ruins:-35 };

export interface FigureRole {
  id: string;
  role: string;
  faction: string;
  baseMood: Loyalty;
}

export const FIGURE_ROLES: Record<string, FigureRole[]> = {
  "Беларусь": [
    { id:"interior",   role:"Министр внутренних дел", faction:"siloviki",   baseMood:"враг"    },
    { id:"kgb",        role:"Директор КГБ",            faction:"siloviki",   baseMood:"враг"    },
    { id:"amb_russia", role:"Посол России",            faction:"russia",     baseMood:"нейтрал" },
    { id:"amb_eu",     role:"Посол ЕС",                faction:"west",       baseMood:"союзник" },
    { id:"opp_leader", role:"Лидер оппозиции",         faction:"opposition", baseMood:"союзник" },
    { id:"oligarch",   role:"Главный директор заводов",faction:"gossektor",  baseMood:"нейтрал" },
    { id:"patriarch",  role:"Митрополит",              faction:"church",     baseMood:"нейтрал" },
    { id:"journalist", role:"Главный редактор",        faction:"media",      baseMood:"союзник" },
  ],
  "Украина": [
    { id:"general",    role:"Командующий ЗСУ",         faction:"military",     baseMood:"нейтрал" },
    { id:"oligarch",   role:"Главный олигарх",          faction:"oligarchs",    baseMood:"нейтрал" },
    { id:"nat_leader", role:"Лидер националистов",     faction:"nationalists", baseMood:"нейтрал" },
    { id:"amb_usa",    role:"Посол США",                faction:"west",         baseMood:"союзник" },
    { id:"amb_eu",     role:"Посол ЕС",                 faction:"west",         baseMood:"союзник" },
    { id:"speaker",    role:"Спикер парламента",        faction:"regions",      baseMood:"нейтрал" },
    { id:"sbu",        role:"Глава СБУ",               faction:"military",     baseMood:"нейтрал" },
    { id:"mayor",      role:"Мэр Киева",                faction:"civil",        baseMood:"союзник" },
  ],
  "Грузия": [
    { id:"shadow",     role:"Иванишвили (тень власти)", faction:"gdream",     baseMood:"враг"    },
    { id:"opp_leader", role:"Лидер оппозиции",          faction:"opposition", baseMood:"нейтрал" },
    { id:"patriarch",  role:"Католикос-Патриарх",       faction:"church",     baseMood:"нейтрал" },
    { id:"amb_usa",    role:"Посол США",                 faction:"west",       baseMood:"союзник" },
    { id:"amb_russia", role:"Посол России",              faction:"russia",     baseMood:"нейтрал" },
    { id:"oligarch",   role:"Главный бизнесмен",        faction:"business",   baseMood:"нейтрал" },
    { id:"parliament", role:"Председатель парламента",  faction:"gdream",     baseMood:"враг"    },
    { id:"security",   role:"Глава спецслужб",          faction:"gdream",     baseMood:"враг"    },
  ],
  "Молдова": [
    { id:"bashkan",    role:"Башкан Гагаузии",          faction:"regions",    baseMood:"враг"    },
    { id:"oligarch",   role:"Беглый олигарх",           faction:"oligarchs",  baseMood:"враг"    },
    { id:"amb_eu",     role:"Посол ЕС",                 faction:"west",       baseMood:"союзник" },
    { id:"amb_russia", role:"Посол России",             faction:"russia",     baseMood:"нейтрал" },
    { id:"patriarch",  role:"Митрополит",               faction:"church",     baseMood:"нейтрал" },
    { id:"prosecutor", role:"Генеральный прокурор",     faction:"siloviki",   baseMood:"нейтрал" },
    { id:"activist",   role:"Лидер гражданских активистов", faction:"civil",  baseMood:"союзник" },
    { id:"diaspora",   role:"Лидер диаспоры",           faction:"diaspora",   baseMood:"союзник" },
  ],
  "Армения": [
    { id:"general",    role:"Начальник Генштаба",       faction:"military",   baseMood:"нейтрал" },
    { id:"catholicos", role:"Католикос",                faction:"church",     baseMood:"враг"    },
    { id:"oligarch",   role:"Олигарх старой элиты",     faction:"oligarchs",  baseMood:"враг"    },
    { id:"revanchist", role:"Лидер реваншистов",        faction:"revanchists",baseMood:"враг"    },
    { id:"activist",   role:"Лидер гражданского общества", faction:"civil",   baseMood:"союзник" },
    { id:"diaspora",   role:"Лидер диаспоры",           faction:"diaspora",   baseMood:"союзник" },
    { id:"amb_usa",    role:"Посол США",                faction:"west",       baseMood:"союзник" },
    { id:"amb_russia", role:"Посол России",             faction:"russia",     baseMood:"нейтрал" },
  ],
  "Казахстан": [
    { id:"knb",        role:"Председатель КНБ",         faction:"siloviki",   baseMood:"враг"    },
    { id:"clan",       role:"Глава влиятельного клана", faction:"oligarchs",  baseMood:"враг"    },
    { id:"akim",       role:"Аким Алматы",              faction:"regions",    baseMood:"нейтрал" },
    { id:"activist",   role:"Лидер молодёжного движения", faction:"youth",    baseMood:"союзник" },
    { id:"nat_leader", role:"Лидер национал-патриотов", faction:"nationalists",baseMood:"нейтрал" },
    { id:"mufti",      role:"Верховный муфтий",         faction:"church",     baseMood:"нейтрал" },
    { id:"amb_russia", role:"Посол России",             faction:"russia",     baseMood:"нейтрал" },
    { id:"investor",   role:"Представитель западных инвесторов", faction:"west", baseMood:"союзник" },
  ],
};

export const EVENT_SOURCES = ["МИД","Разведка","Кабинет","Улица","Кремль","Брюссель","Пресса","Олигарх","Армия","Оппозиция"];

export const RATINGS = ["Провал","Слабое правление","Противоречивое наследие","Стабильность","Успех","Историческое достижение"];

export const END_TYPES = {
  reelected:   "Переизбран на второй срок",
  mandate:     "Мандат завершён, выборы проиграны",
  revolution:  "Народная революция",
  collapse:    "Коллапс государства",
  coup:        "Военный переворот",
  impeachment: "Импичмент после провала на выборах",
} as const;

// ── Партии и выборы ──────────────────────────────────────────────────────────
// Партии-конкуренты лидера: забирают голоса групп из своих блоков, недовольных лидером.
export interface PartyInfo { id: string; name: string; blocs: Bloc[] }

export const PARTIES: Record<string, PartyInfo[]> = {
  "Беларусь": [
    { id:"order",  name:"Партия порядка",          blocs:["security","business"] },
    { id:"union",  name:"Союзное государство",     blocs:["church","nationalist"] },
    { id:"demo",   name:"Демократический альянс",  blocs:["liberal","regional"] },
  ],
  "Украина": [
    { id:"front",  name:"Национальный фронт",      blocs:["nationalist","security"] },
    { id:"region", name:"Блок регионов",           blocs:["regional","business"] },
    { id:"europe", name:"Европейский выбор",       blocs:["liberal","church"] },
  ],
  "Молдова": [
    { id:"socialists", name:"Партия социалистов",     blocs:["regional","church"] },
    { id:"revival",    name:"Блок «Возрождение»",      blocs:["business","security"] },
    { id:"europe",     name:"Проевропейский союз",     blocs:["liberal"] },
  ],
  "Армения": [
    { id:"homeland",   name:"Движение «Родина»",       blocs:["nationalist","church","security"] },
    { id:"prosper",    name:"Партия процветания",      blocs:["business"] },
    { id:"civic",      name:"Гражданский союз",        blocs:["liberal"] },
  ],
  "Казахстан": [
    { id:"stability",  name:"Партия стабильности",     blocs:["business","security","regional"] },
    { id:"revival",    name:"Национальное возрождение", blocs:["nationalist","church"] },
    { id:"newkz",      name:"Новый Казахстан",         blocs:["liberal"] },
  ],
  "Грузия": [
    { id:"dream",  name:"Грузинская мечта",        blocs:["ruling","church"] },
    { id:"unity",  name:"Проевропейская коалиция", blocs:["liberal"] },
    { id:"growth", name:"Партия роста",            blocs:["business","regional","nationalist"] },
  ],
};

// Внешние силы влияют на лидера, но не голосуют.
export const NON_VOTING_BLOCS: Bloc[] = ["west", "russia"];

export const ELECTIONS: Record<number, "parliament" | "president"> = { 10: "parliament", 20: "president" };
export const ELECTION_LABEL = { parliament: "Парламентские выборы", president: "Президентские выборы" } as const;
export const ELECTION_WIN_BONUS: ResourceDelta = { politicalCapital: 8, internalLegitimacy: 4 };
export const ELECTION_LOSS_PENALTY: ResourceDelta = { politicalCapital: -8, personalResource: -4 };
export const IMPEACH_RATING = 15;   // ниже на парламентских выборах — импичмент
export const COUP_RELATION = -70;   // средн. отношение силовиков, при котором возможен переворот
export const COUP_MILITARY = 40;    // …если у силовиков есть ресурс
export const COUP_FROM_TURN = 3;

// ── Балансные ограничения ─────────────────────────────────────────────────────
// Модель предлагает изменения, но движок не даёт им выйти за эти рамки.
export const LIMITS = {
  resourceDelta: 15,      // за одно решение, на один ресурс
  randomEffect: 8,        // случайное событие, на один ресурс
  factionRelDelta: 25,
  factionApprDelta: 15,
  figureRelDelta: 30,
  crisisDrain: 5,         // максимальный отток в ход, на один ресурс
  crisisDrainKeys: 3,
  maxActiveCrises: 3,
  endResource: 4,         // ресурс ≤ этого → коллапс
  endRating: 8,           // рейтинг партии лидера ≤ этого → революция
} as const;

// ── Действия ──────────────────────────────────────────────────────────────────
// Модель помечает каждый вариант решения 1–2 тегами, а цену решения считает движок
// по этой таблице. Так последствия предсказуемы и одинаковы для одинаковых решений.
export interface ActionInfo {
  label: string;
  desc: string; // подсказка модели, когда уместен тег
  res: ResourceDelta;
  rel: Partial<Record<Bloc, number>>; // отношение фракций блока к лидеру
  appr?: Partial<Record<Bloc, number>>; // одобрение фракций блока в обществе
}

export const ACTIONS: Record<ActionTag, ActionInfo> = {
  repress:       { label:"Силовой ответ",     desc:"разгон, аресты, запреты, чрезвычайное положение",
                   res:{ military:5, politicalCapital:3, internalLegitimacy:-6, externalReputation:-6 },
                   rel:{ security:12, russia:6, nationalist:4, liberal:-15, west:-10 }, appr:{ liberal:4, security:-3 } },
  security:      { label:"Усиление силовиков", desc:"деньги и полномочия армии, спецслужб, полиции",
                   res:{ military:7, economy:-5, externalReputation:-2 },
                   rel:{ security:10, nationalist:4, liberal:-4 } },
  reform:        { label:"Реформы",            desc:"судебная, институциональная, политическая либерализация",
                   res:{ externalReputation:6, economy:2, politicalCapital:-5, personalResource:-2 },
                   rel:{ west:12, liberal:10, business:-6, security:-6, ruling:-8 }, appr:{ liberal:3 } },
  pro_west:      { label:"Курс на Запад",      desc:"сближение с ЕС/США/НАТО, выполнение их условий",
                   res:{ externalReputation:8, economy:2, politicalCapital:-3, internalLegitimacy:-2 },
                   rel:{ west:15, liberal:6, russia:-15, nationalist:-6 } },
  pro_russia:    { label:"Уступка Москве",     desc:"договорённости с Кремлём, скидки, кредиты, лояльность",
                   res:{ economy:5, military:3, externalReputation:-8, internalLegitimacy:-3 },
                   rel:{ russia:15, west:-12, liberal:-10, nationalist:-8 } },
  social:        { label:"Социальные траты",   desc:"выплаты, субсидии, повышение зарплат и пенсий",
                   res:{ economy:-7, internalLegitimacy:6, politicalCapital:2 },
                   rel:{ regional:6, liberal:3, church:3, business:-5 }, appr:{ regional:2 } },
  austerity:     { label:"Жёсткая экономия",   desc:"сокращение расходов, повышение налогов и тарифов",
                   res:{ economy:7, internalLegitimacy:-5, politicalCapital:-3 },
                   rel:{ business:8, west:4, regional:-8, liberal:-4 } },
  investment:    { label:"Инвесторы",          desc:"приватизация, иностранный капитал, льготы бизнесу",
                   res:{ economy:6, externalReputation:3, internalLegitimacy:-4, personalResource:-2 },
                   rel:{ business:8, west:6, regional:-4, liberal:-2 } },
  anticorruption:{ label:"Антикоррупция",      desc:"расследования, аресты чиновников и олигархов",
                   res:{ internalLegitimacy:6, politicalCapital:2, personalResource:-4, economy:-2 },
                   rel:{ liberal:10, west:4, business:-12, ruling:-12, security:-4 } },
  elite_deal:    { label:"Сделка с элитами",   desc:"кулуарные договорённости, раздача постов и активов",
                   res:{ politicalCapital:6, personalResource:3, internalLegitimacy:-5, externalReputation:-2 },
                   rel:{ business:12, ruling:10, regional:6, liberal:-10 } },
  dialogue:      { label:"Диалог",             desc:"переговоры с оппозицией, улицей, гражданским обществом",
                   res:{ internalLegitimacy:5, politicalCapital:-3, military:-2 },
                   rel:{ liberal:12, security:-6, nationalist:-5 } },
  patriotism:    { label:"Патриотизм",         desc:"мобилизация вокруг флага, традиций, церкви",
                   res:{ internalLegitimacy:4, military:3, externalReputation:-4, economy:-2 },
                   rel:{ nationalist:12, church:8, security:4, liberal:-6, west:-3 } },
  propaganda:    { label:"Пропаганда",         desc:"медийная кампания, контроль повестки, давление на СМИ",
                   res:{ politicalCapital:4, internalLegitimacy:2, personalResource:-3, externalReputation:-2 },
                   rel:{ ruling:4, liberal:-6 } },
  delay:         { label:"Выжидание",          desc:"затянуть время, создать комиссию, ничего не решать",
                   res:{ politicalCapital:-3, personalResource:-2 },
                   rel:{} },
};

export const ACTION_TAGS = Object.keys(ACTIONS) as ActionTag[];

// Решения в духе своей идеологии укрепляют лидера, против неё — подтачивают.
export const IDEOLOGY_ACTIONS: Record<IdeologyId, { aligned: ActionTag[]; opposed: ActionTag[] }> = {
  liberal:     { aligned:["reform","pro_west","dialogue","anticorruption"], opposed:["repress","pro_russia","propaganda"] },
  nationalist: { aligned:["patriotism","security","repress"],               opposed:["pro_russia","pro_west"] },
  pragmatist:  { aligned:["elite_deal","investment","austerity"],           opposed:[] },
  leftist:     { aligned:["social","anticorruption","dialogue"],            opposed:["austerity","investment","elite_deal"] },
};

export const IDEOLOGY_BONUS: ResourceDelta = { personalResource:2, internalLegitimacy:1 };
export const IDEOLOGY_PENALTY: ResourceDelta = { personalResource:-4, politicalCapital:-2 };

// ── Отложенные последствия ───────────────────────────────────────────────────
// Эхо решения через несколько ходов. Видно игроку заранее — это часть цены решения.
export interface DelayedInfo { turns: number; label: string; res: ResourceDelta }

export const DELAYED: Partial<Record<ActionTag, DelayedInfo>> = {
  social:         { turns:3, label:"Инфляция от раздачи денег",   res:{ economy:-4 } },
  austerity:      { turns:3, label:"Бюджет оздоровлён",           res:{ economy:3, externalReputation:2 } },
  investment:     { turns:4, label:"Инвестиции заработали",       res:{ economy:5 } },
  reform:         { turns:4, label:"Реформы дали плоды",          res:{ internalLegitimacy:3, externalReputation:2, economy:2 } },
  anticorruption: { turns:3, label:"Возврат украденных активов",  res:{ economy:4 } },
  pro_west:       { turns:3, label:"Транш западных партнёров",    res:{ economy:4 } },
  pro_russia:     { turns:3, label:"Москва требует ответных шагов", res:{ personalResource:-3, externalReputation:-2 } },
  repress:        { turns:2, label:"Эхо репрессий: радикализация", res:{ internalLegitimacy:-3, externalReputation:-2 } },
  elite_deal:     { turns:3, label:"Элиты требуют свою долю",     res:{ politicalCapital:-3, economy:-2 } },
  propaganda:     { turns:2, label:"Разоблачение пропаганды",     res:{ internalLegitimacy:-3 } },
  dialogue:       { turns:2, label:"Доверие оппозиции",           res:{ internalLegitimacy:2, politicalCapital:1 } },
  delay:          { turns:2, label:"Проблема вернулась",          res:{ politicalCapital:-2, internalLegitimacy:-2 } },
};

export const WEAK_ADVISOR_DELAYED: DelayedInfo = { turns:2, label:"Недоработка советника", res:{ politicalCapital:-2, personalResource:-1 } };
export const MAX_PENDING = 8;

// ── Совет ────────────────────────────────────────────────────────────────────
// Советники предлагают решения только из своей области. Качество (1–3★) меняет цену:
// сильный советник смягчает потери и усиливает выгоду, слабый — наоборот.
export interface AdvisorRole { id: string; role: string; emoji: string; domain: ActionTag[] }

export const ADVISOR_ROLES: AdvisorRole[] = [
  { id:"strategist", role:"Политтехнолог",          emoji:"🎭", domain:["propaganda","elite_deal","dialogue","patriotism","delay"] },
  { id:"economist",  role:"Экономический советник", emoji:"📈", domain:["social","austerity","investment","anticorruption"] },
  { id:"security",   role:"Советник по безопасности", emoji:"🛡️", domain:["repress","security","patriotism"] },
  { id:"diplomat",   role:"Советник по внешней политике", emoji:"🌐", domain:["pro_west","pro_russia","reform","dialogue"] },
];

export const ADVISOR_SKILL = {
  1: { cost: 1.2, gain: 0.8, label: "слабый" },
  2: { cost: 1.0, gain: 1.0, label: "толковый" },
  3: { cost: 0.7, gain: 1.15, label: "блестящий" },
} as const;

// Сколько раз за мандат можно собрать совет; победа на парламентских выборах даёт ещё раз.
export const COUNCIL_CHARGES: Record<DifficultyId, number> = { debut:5, coalition:4, crisis:3, ruins:3 };
export const COUNCIL_ELECTION_BONUS = 1;

// Порог, ниже которого проседание ресурса порождает кризис, и пассивное восстановление.
export const CRISIS_THRESHOLD = 20;
export const CRISIS_DRAIN = 2;
export const RECOVERY_BELOW = 30;
export const RECOVERY_RATE = 1;

// Давление обстоятельств: сколько очков ресурсов страна теряет каждый ход сама по себе.
export const DIFF_PRESSURE: Record<DifficultyId, number> = { debut:0, coalition:1, crisis:2, ruins:2 };

// Враждебные фракции (отношение ниже порога) вредят каждый ход.
export const HOSTILE_RELATION = -60;
export const HOSTILE_DRAIN: Partial<Record<Bloc, ResourceDelta>> = {
  security:    { military:-2, internalLegitimacy:-1 },
  business:    { economy:-2 },
  west:        { externalReputation:-2, economy:-1 },
  russia:      { economy:-1, military:-1 },
  liberal:     { internalLegitimacy:-2 },
  nationalist: { internalLegitimacy:-1, military:-1 },
  church:      { internalLegitimacy:-1 },
  regional:    { politicalCapital:-2 },
  ruling:      { politicalCapital:-2, personalResource:-1 },
};

// Через сколько ходов кризис затухает сам, если его не разрешили.
export const CRISIS_LIFETIME: Record<string, number> = { low:3, medium:4, high:5, critical:6 };

// Ограничения длины строк — защищают промпт от раздувания и инъекций.
export const TEXT = {
  name: 80,
  short: 160,
  title: 200,
  hint: 200,
  choice: 300,
  medium: 600,
  long: 1500,
  narrative: 2500,
} as const;
