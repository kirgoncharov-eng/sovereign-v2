// Статические данные мира: страны, фракции, фигуры, стартовые параметры.
import type { ActionTag, Bloc, DifficultyId, IdeologyId, Loyalty, ResourceDelta, ResourceKey, Resources, TermRule } from "./types.ts";

export const APP_VERSION = "7.1";
export const SAVE_VERSION = 7; // 7: сквозные интриги
// Срок — двадцать ходов (пять лет). Правление не ограничено сроком: партия идёт, пока лидер у власти.
export const TERM = 20;
export const MAX_TURNS = TERM; // длина срока; старое имя
export const localTurn = (turn: number) => ((Math.max(1, turn) - 1) % TERM) + 1; // ход внутри срока, 1..20
export const termIndex = (turn: number) => Math.floor((Math.max(1, turn) - 1) / TERM); // срок, к которому относится ход
export const TERM_ORDINAL = ["первый", "второй", "третий", "четвёртый", "пятый", "шестой", "седьмой", "восьмой", "девятый", "десятый"];
export const termOrdinal = (n: number) => TERM_ORDINAL[n] ?? `${n + 1}-й`;
const TERM_ORDINAL_GEN = ["первого", "второго", "третьего", "четвёртого", "пятого", "шестого", "седьмого", "восьмого", "девятого", "десятого"];
export const termOrdinalGen = (n: number) => TERM_ORDINAL_GEN[n] ?? `${n + 1}-го`;
// «7 л. 3 м.» — для крупных цифр на карточке итога.
export function reignShort(turns: number): string {
  const y = Math.floor(turns / 4), m = (turns % 4) * 3;
  const yy = y % 10 >= 1 && y % 10 <= 4 && (y % 100 < 11 || y % 100 > 14) ? "г." : "л.";
  return [y ? `${y} ${yy}` : "", m ? `${m} м.` : ""].filter(Boolean).join(" ") || "0";
}
// «7 лет 3 месяца» — ход равен кварталу.
export function reignLength(turns: number): string {
  const y = Math.floor(turns / 4), m = (turns % 4) * 3;
  const yy = y % 10 === 1 && y % 100 !== 11 ? "год" : [2, 3, 4].includes(y % 10) && ![12, 13, 14].includes(y % 100) ? "года" : "лет";
  const parts = [y ? `${y} ${yy}` : "", m ? `${m} ${m === 3 ? "месяца" : "месяцев"}` : ""].filter(Boolean);
  return parts.join(" ") || "меньше квартала";
}

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

// Падежи столиц для слотов {capital:gen} и т.п. в авторских текстах.
export const CAPITAL_CASES: Record<string, Record<"gen" | "dat" | "acc" | "ins" | "prep", string>> = {
  "Минск":   { gen:"Минска",   dat:"Минску",   acc:"Минск",   ins:"Минском",   prep:"Минске" },
  "Киев":    { gen:"Киева",    dat:"Киеву",    acc:"Киев",    ins:"Киевом",    prep:"Киеве" },
  "Тбилиси": { gen:"Тбилиси",  dat:"Тбилиси",  acc:"Тбилиси", ins:"Тбилиси",   prep:"Тбилиси" },
  "Кишинёв": { gen:"Кишинёва", dat:"Кишинёву", acc:"Кишинёв", ins:"Кишинёвом", prep:"Кишинёве" },
  "Ереван":  { gen:"Еревана",  dat:"Еревану",  acc:"Ереван",  ins:"Ереваном",  prep:"Ереване" },
  "Астана":  { gen:"Астаны",   dat:"Астане",   acc:"Астану",  ins:"Астаной",   prep:"Астане" },
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

// Биография лидера: свои решения исполняются надёжнее, и одна опора на старте крепче.
export interface Biography { id: string; label: string; text: string; tags: ActionTag[]; res: ResourceKey; note: string }
export const BIOGRAPHIES: Biography[] = [
  { id:"officer",   label:"Офицер",         text:"Бывший офицер, ставший депутатом на волне протестов.", tags:["security", "repress", "patriotism"], res:"military",
    note:"силовые и патриотические решения исполняются на 8% надёжнее · силовики +8 на старте" },
  { id:"economist", label:"Экономист",      text:"Экономист, прославившийся резкими выступлениями против коррупции.", tags:["investment", "austerity", "anticorruption"], res:"economy",
    note:"экономика и антикоррупция исполняются на 8% надёжнее · экономика +8 на старте" },
  { id:"lawyer",    label:"Правозащитник",  text:"Юрист по правам человека, неожиданно для всех выигравший праймериз.", tags:["dialogue", "reform", "social"], res:"internalLegitimacy",
    note:"диалог, реформы и соцполитика исполняются на 8% надёжнее · легитимность +8 на старте" },
  { id:"diplomat",  label:"Дипломат",       text:"Бывший дипломат, вернувшийся в политику после десяти лет за границей.", tags:["pro_west", "pro_russia", "dialogue"], res:"externalReputation",
    note:"внешняя политика и диалог исполняются на 8% надёжнее · репутация +8 на старте" },
  { id:"mayor",     label:"Мэр",            text:"Мэр промышленного города, которого называют «человеком из народа».", tags:["social", "elite_deal", "propaganda"], res:"politicalCapital",
    note:"сделки, соцполитика и агитация исполняются на 8% надёжнее · политкапитал +8 на старте" },
];
export const BIO_CHANCE = 0.08, BIO_RES = 8;

export const START_RES: Record<DifficultyId, Resources> = {
  debut:     { politicalCapital:60, economy:53, military:50, externalReputation:46, internalLegitimacy:58, personalResource:70 },
  coalition: { politicalCapital:38, economy:32, military:44, externalReputation:38, internalLegitimacy:34, personalResource:53 },
  crisis:    { politicalCapital:31, economy:34, military:48, externalReputation:36, internalLegitimacy:26, personalResource:53 },
  ruins:     { politicalCapital:29, economy:30, military:40, externalReputation:30, internalLegitimacy:25, personalResource:50 }
};

export interface FactionInfo {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  baseApproval: number;
  bloc: Bloc;
  plural?: boolean; // название во множественном числе: «Силовые структуры требуют», а не «требует»
}

export const FACTIONS_DATA: Record<string, FactionInfo[]> = {
  "Беларусь": [
    { id:"siloviki",   name:"Силовые структуры", desc:"КГБ, МВД, ОМОН",             emoji:"🛡️", baseApproval:32, bloc:"security", plural:true },
    { id:"gossektor",  name:"Гос. предприятия",   desc:"Директорат заводов",          emoji:"🏭", baseApproval:38, bloc:"business", plural:true },
    { id:"church",     name:"Православная церковь",desc:"Патриархат и приходы",      emoji:"⛪", baseApproval:52, bloc:"church" },
    { id:"opposition", name:"Демоппозиция",       desc:"Подполье и эмиграция",       emoji:"✊", baseApproval:58, bloc:"liberal" },
    { id:"youth",      name:"Молодёжь",           desc:"Активисты и студенты",       emoji:"🔥", baseApproval:65, bloc:"liberal" },
    { id:"west",       name:"Запад",               desc:"ЕС, США, НАТО",             emoji:"🌍", baseApproval:50, bloc:"west" },
    { id:"russia",     name:"Кремль",              desc:"Москва и пророссийские",     emoji:"🦅", baseApproval:22, bloc:"russia" },
    { id:"media",      name:"Независимые СМИ",    desc:"Журналисты и блогеры",       emoji:"📰", baseApproval:60, bloc:"liberal", plural:true },
  ],
  "Украина": [
    { id:"military",     name:"ЗСУ",               desc:"Вооружённые силы",           emoji:"⚔️", baseApproval:75, bloc:"security", plural:true },
    { id:"oligarchs",    name:"Олигархат",          desc:"Крупный капитал",            emoji:"💼", baseApproval:18, bloc:"business" },
    { id:"nationalists", name:"Националисты",      desc:"Радикальные движения",       emoji:"🔱", baseApproval:55, bloc:"nationalist", plural:true },
    { id:"west",         name:"Западные союзники", desc:"США, ЕС, НАТО",              emoji:"🌍", baseApproval:68, bloc:"west", plural:true },
    { id:"civil",        name:"Гражданское общество",desc:"Волонтёры и НКО",         emoji:"🤝", baseApproval:70, bloc:"liberal" },
    { id:"regions",      name:"Местные элиты",     desc:"Мэры и губернаторы",         emoji:"🏛️", baseApproval:40, bloc:"regional", plural:true },
    { id:"church",       name:"Церковь (ПЦУ)",     desc:"Православная церковь Украины",emoji:"⛪", baseApproval:60, bloc:"church" },
    { id:"media",        name:"Медиа",             desc:"Телеканалы и пресса",         emoji:"📰", baseApproval:55, bloc:"liberal", plural:true },
  ],
  "Грузия": [
    { id:"gdream",     name:"Грузинская мечта",    desc:"Партия Иванишвили",          emoji:"👑", baseApproval:35, bloc:"ruling" },
    { id:"opposition", name:"Проевропейская оппозиция",desc:"Нацдвижение и др.",     emoji:"🌍", baseApproval:48, bloc:"liberal" },
    { id:"church",     name:"Православная церковь",desc:"Патриарх и духовенство",    emoji:"⛪", baseApproval:72, bloc:"church" },
    { id:"business",   name:"Бизнес-элиты",       desc:"Предприниматели и банки",    emoji:"💼", baseApproval:44, bloc:"business", plural:true },
    { id:"civil",      name:"Гражданское общество",desc:"НКО и активисты",           emoji:"✊", baseApproval:62, bloc:"liberal" },
    { id:"russia",     name:"Кремль",              desc:"Москва и пророссийские",     emoji:"🦅", baseApproval:20, bloc:"russia" },
    { id:"west",       name:"Западные партнёры",  desc:"ЕС, США, НАТО",              emoji:"🌍", baseApproval:58, bloc:"west", plural:true },
    { id:"diaspora",   name:"Диаспора",            desc:"Эмигранты и зарубежная Грузия",emoji:"✈️", baseApproval:55, bloc:"liberal" },
  ],
  "Молдова": [
    { id:"west",      name:"ЕС и Румыния",          desc:"Брюссель и Бухарест",          emoji:"🌍", baseApproval:55, bloc:"west", plural:true },
    { id:"russia",    name:"Кремль",                desc:"Москва и Тирасполь",           emoji:"🦅", baseApproval:30, bloc:"russia" },
    { id:"oligarchs", name:"Беглые олигархи",       desc:"Теневые кланы и их партии",    emoji:"💼", baseApproval:20, bloc:"business", plural:true },
    { id:"regions",   name:"Гагаузия и север",      desc:"Пророссийские регионы",        emoji:"🏛️", baseApproval:40, bloc:"regional", plural:true },
    { id:"church",    name:"Митрополия",            desc:"Молдавская православная церковь",emoji:"⛪", baseApproval:65, bloc:"church" },
    { id:"civil",     name:"Гражданское общество",  desc:"Проевропейские НКО и СМИ",     emoji:"🤝", baseApproval:55, bloc:"liberal" },
    { id:"siloviki",  name:"Прокуратура и полиция", desc:"Силовой блок",                 emoji:"🛡️", baseApproval:35, bloc:"security", plural:true },
    { id:"diaspora",  name:"Диаспора",              desc:"Молдаване в ЕС",               emoji:"✈️", baseApproval:60, bloc:"liberal" },
  ],
  "Армения": [
    { id:"military",    name:"Армия и ветераны",     desc:"Генштаб и ветераны Карабаха", emoji:"⚔️", baseApproval:60, bloc:"security", plural:true },
    { id:"church",      name:"Апостольская церковь", desc:"Эчмиадзин",                    emoji:"⛪", baseApproval:70, bloc:"church" },
    { id:"oligarchs",   name:"Старые элиты",         desc:"Олигархи прежней власти",      emoji:"💼", baseApproval:25, bloc:"business", plural:true },
    { id:"revanchists", name:"Реваншисты",           desc:"Карабахский клан и радикалы",  emoji:"🔱", baseApproval:40, bloc:"nationalist", plural:true },
    { id:"civil",       name:"Гражданское общество", desc:"НКО, журналисты, студенты",    emoji:"🤝", baseApproval:55, bloc:"liberal" },
    { id:"diaspora",    name:"Диаспора",             desc:"США, Франция, Россия",         emoji:"✈️", baseApproval:65, bloc:"liberal" },
    { id:"west",        name:"ЕС и США",             desc:"Новые партнёры",               emoji:"🌍", baseApproval:55, bloc:"west", plural:true },
    { id:"russia",      name:"Кремль и ОДКБ",        desc:"Бывший союзник",               emoji:"🦅", baseApproval:30, bloc:"russia", plural:true },
  ],
  "Казахстан": [
    { id:"siloviki",     name:"КНБ и полиция",       desc:"Спецслужбы",                   emoji:"🛡️", baseApproval:35, bloc:"security", plural:true },
    { id:"oligarchs",    name:"Семейные кланы",      desc:"Старая элита и её активы",     emoji:"💼", baseApproval:15, bloc:"business", plural:true },
    { id:"regions",      name:"Акимы регионов",      desc:"Региональная вертикаль",       emoji:"🏛️", baseApproval:40, bloc:"regional", plural:true },
    { id:"youth",        name:"Городская молодёжь",  desc:"Алматы, Астана, соцсети",      emoji:"🔥", baseApproval:60, bloc:"liberal" },
    { id:"nationalists", name:"Национал-патриоты",   desc:"Казахоязычные активисты",      emoji:"🔱", baseApproval:45, bloc:"nationalist", plural:true },
    { id:"church",       name:"Духовенство",         desc:"Духовное управление мусульман",emoji:"🕌", baseApproval:50, bloc:"church" },
    { id:"russia",       name:"Кремль",              desc:"Москва и ЕАЭС",                emoji:"🦅", baseApproval:35, bloc:"russia" },
    { id:"west",         name:"Западные инвесторы",  desc:"Нефть, уран, США и ЕС",        emoji:"🌍", baseApproval:45, bloc:"west", plural:true },
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
    { id:"oligarch",   role:"Глава госконцерна",faction:"gossektor",  baseMood:"нейтрал" },
    { id:"patriarch",  role:"Митрополит",              faction:"church",     baseMood:"нейтрал" },
    { id:"journalist", role:"Главный редактор",        faction:"media",      baseMood:"союзник" },
  ],
  "Украина": [
    { id:"general",    role:"Командующий ЗСУ",         faction:"military",     baseMood:"нейтрал" },
    { id:"oligarch",   role:"Крупнейший олигарх",        faction:"oligarchs",    baseMood:"нейтрал" },
    { id:"nat_leader", role:"Лидер националистов",     faction:"nationalists", baseMood:"нейтрал" },
    { id:"amb_usa",    role:"Посол США",                faction:"west",         baseMood:"союзник" },
    { id:"amb_eu",     role:"Посол ЕС",                 faction:"west",         baseMood:"союзник" },
    { id:"speaker",    role:"Спикер парламента",        faction:"regions",      baseMood:"нейтрал" },
    { id:"sbu",        role:"Глава СБУ",               faction:"military",     baseMood:"нейтрал" },
    { id:"mayor",      role:"Мэр Киева",                faction:"civil",        baseMood:"союзник" },
  ],
  "Грузия": [
    { id:"shadow",     role:"Теневой хозяин «Мечты»", faction:"gdream",     baseMood:"враг"    },
    { id:"opp_leader", role:"Лидер оппозиции",          faction:"opposition", baseMood:"нейтрал" },
    { id:"patriarch",  role:"Католикос-патриарх",       faction:"church",     baseMood:"нейтрал" },
    { id:"amb_usa",    role:"Посол США",                 faction:"west",       baseMood:"союзник" },
    { id:"amb_russia", role:"Посол России",              faction:"russia",     baseMood:"нейтрал" },
    { id:"oligarch",   role:"Крупнейший бизнесмен",      faction:"business",   baseMood:"нейтрал" },
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
  reelected:   "Переизбран на новый срок",
  mandate:     "Мандат завершён, выборы проиграны",
  revolution:  "Народная революция",
  collapse:    "Коллапс государства",
  coup:        "Военный переворот",
  impeachment: "Импичмент после провала на выборах",
  retired:          "Ушёл сам после одного срока",
  zeroed:           "Сроки обнулены, переизбран",
  premier:          "Рокировка: пересел в кресло премьера",
  leader_of_nation: "Власть передана преемнику",
  betrayed:         "Преемник отстранил покровителя",
  emergency_rule:   "Выборы отложены, правит в режиме ЧП",
  dictator:         "Установил личную диктатуру",
  died:             "Умер на посту",
} as const;

// Дожил до конца срока — неважно, остался у власти, передал её или ушёл сам.
export const SURVIVAL_ENDS: readonly string[] = ["mandate", "reelected", "retired", "zeroed", "premier", "leader_of_nation", "emergency_rule", "dictator", "died"];
// Новый срок: доверие и аппарат устают от одного и того же лица.
export const TERM_FATIGUE: ResourceDelta = { internalLegitimacy: -5, politicalCapital: -4 };
export const DEATH_FROM = 48;      // после двенадцати лет у власти
export const DEATH_STEP = 0.008;   // шанс не дожить до следующего квартала растёт с каждым кварталом
// Итоги срока, после которых правление продолжается: начинается следующий срок.
export const CONTINUE_ENDS: readonly string[] = ["reelected", "zeroed", "premier", "emergency_rule", "dictator"];

// ── Конституции ──────────────────────────────────────────────────────────────
// Модели сроков, по которым живут страны игры. Это модели, а не пересказ действующих
// конституций: от модели зависит, какие пути остаться у власти открыты лидеру.
export const CONSTITUTION: Record<string, TermRule> = {
  "Беларусь": "no_limits", "Украина": "two_terms", "Казахстан": "single_term",
  "Грузия": "parliamentary", "Молдова": "parliamentary", "Армения": "parliamentary",
};
export const TERM_RULES: Record<TermRule, { title: string; text: string }> = {
  no_limits:     { title: "Без ограничения сроков", text: "Президент может избираться сколько угодно раз. Каждые пять лет — выборы, и только они." },
  two_terms:     { title: "Два срока подряд",       text: "Президент может избираться дважды подряд. Второй срок — ваш, если его дадут избиратели." },
  single_term:   { title: "Один срок",              text: "Президент избирается один раз, без права переизбрания. Остаться можно, только переписав Конституцию." },
  parliamentary: { title: "Парламентская республика", text: "У президента один срок, а настоящая власть — у премьера, которого назначает парламентское большинство." },
};

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
  why: Partial<Record<ResourceKey, string>>; // почему решение двигает каждый ресурс — игроку под вариантом
}

export const ACTIONS: Record<ActionTag, ActionInfo> = {
  repress:       { label:"Силовой ответ",     desc:"разгон, аресты, запреты, чрезвычайное положение",
                   res:{ military:5, politicalCapital:3, internalLegitimacy:-6, externalReputation:-6 },
                   rel:{ security:12, russia:6, nationalist:4, liberal:-15, west:-10 }, appr:{ liberal:4, security:-3 },
                   why:{ military:"силовики почувствовали силу", politicalCapital:"противники притихли", internalLegitimacy:"улица это запомнит", externalReputation:"кадры разгона увидит весь мир" } },
  security:      { label:"Опора на силовиков", desc:"поручить дело силовикам: им деньги и полномочия",
                   res:{ military:7, economy:-4, externalReputation:-2 },
                   rel:{ security:10, nationalist:4, liberal:-4 },
                   why:{ military:"у силовиков больше полномочий", economy:"их операции и премии оплачивает казна", externalReputation:"партнёры настороже" } },
  reform:        { label:"Реформы",            desc:"судебная, институциональная, политическая либерализация",
                   res:{ externalReputation:6, economy:2, politicalCapital:-5, personalResource:-2 },
                   rel:{ west:12, liberal:10, business:-6, security:-6, ruling:-8 }, appr:{ liberal:3 },
                   why:{ externalReputation:"партнёры видят перемены", economy:"правила стали понятнее бизнесу", politicalCapital:"аппарат сопротивляется переменам", personalResource:"реформы выматывают" } },
  pro_west:      { label:"Курс на Запад",      desc:"сближение с ЕС/США/НАТО, выполнение их условий",
                   res:{ externalReputation:8, economy:2, politicalCapital:-3, internalLegitimacy:-2 },
                   rel:{ west:15, liberal:6, russia:-15, nationalist:-6 },
                   why:{ externalReputation:"Запад доволен", economy:"кредиты и инвесторы", politicalCapital:"часть элит против", internalLegitimacy:"курс по душе не всем" } },
  pro_russia:    { label:"Уступка Москве",     desc:"договорённости с Кремлём, скидки, кредиты, лояльность",
                   res:{ economy:5, military:3, externalReputation:-8, internalLegitimacy:-3 },
                   rel:{ russia:15, west:-12, liberal:-10, nationalist:-8 },
                   why:{ economy:"дешёвый газ и кредит", military:"военное сотрудничество", externalReputation:"Запад отворачивается", internalLegitimacy:"многие видят в этом зависимость" } },
  social:        { label:"Социальные траты",   desc:"выплаты, субсидии, повышение зарплат и пенсий",
                   res:{ economy:-7, internalLegitimacy:6, politicalCapital:2 },
                   rel:{ regional:6, liberal:3, church:3, business:-5 }, appr:{ regional:2 },
                   why:{ economy:"выплаты идут из бюджета", internalLegitimacy:"людям стало легче", politicalCapital:"регионы благодарны" } },
  austerity:     { label:"Жёсткая экономия",   desc:"сокращение расходов, повышение налогов и тарифов",
                   res:{ economy:7, internalLegitimacy:-5, politicalCapital:-3 },
                   rel:{ business:8, west:4, regional:-8, liberal:-4 },
                   why:{ economy:"бюджет экономит", internalLegitimacy:"людям стало тяжелее", politicalCapital:"за непопулярное голосуют неохотно" } },
  investment:    { label:"Инвесторы",          desc:"приватизация, иностранный капитал, льготы бизнесу",
                   res:{ economy:6, externalReputation:3, internalLegitimacy:-4, personalResource:-2 },
                   rel:{ business:8, west:6, regional:-4, liberal:-2 },
                   why:{ economy:"в страну приходят деньги", externalReputation:"страна открыта для бизнеса", internalLegitimacy:"говорят, что вы распродаёте страну", personalResource:"торг с инвесторами выматывает" } },
  anticorruption:{ label:"Антикоррупция",      desc:"расследования, аресты чиновников и олигархов",
                   res:{ internalLegitimacy:6, politicalCapital:2, personalResource:-4, economy:-2 },
                   rel:{ liberal:10, west:4, business:-12, ruling:-12, security:-4 },
                   why:{ internalLegitimacy:"люди видят посадки", politicalCapital:"аппарат боится", personalResource:"вы наживаете влиятельных врагов", economy:"бизнес затаился и выводит деньги" } },
  elite_deal:    { label:"Сделка с элитами",   desc:"кулуарные договорённости, раздача постов и активов",
                   res:{ politicalCapital:6, personalResource:3, internalLegitimacy:-5, externalReputation:-2 },
                   rel:{ business:12, ruling:10, regional:6, liberal:-10 },
                   why:{ politicalCapital:"элиты теперь вам должны", personalResource:"свои люди прикроют", internalLegitimacy:"о сделках рано или поздно узнают", externalReputation:"за границей видят кумовство" } },
  dialogue:      { label:"Диалог",             desc:"переговоры с оппозицией, улицей, гражданским обществом",
                   res:{ internalLegitimacy:5, politicalCapital:-3, military:-2 },
                   rel:{ liberal:12, security:-6, nationalist:-5 },
                   why:{ internalLegitimacy:"люди чувствуют, что их услышали", politicalCapital:"уступки принимают за слабость", military:"силовики считают это мягкостью" } },
  patriotism:    { label:"Патриотизм",         desc:"мобилизация вокруг флага, традиций, церкви",
                   res:{ internalLegitimacy:4, military:3, externalReputation:-4, economy:-2 },
                   rel:{ nationalist:12, church:8, security:4, liberal:-6, west:-3 },
                   why:{ internalLegitimacy:"страна сплачивается вокруг флага", military:"армия в почёте", externalReputation:"соседи настороже", economy:"парады и торжества стоят денег" } },
  propaganda:    { label:"Пропаганда",         desc:"медийная кампания, контроль повестки, давление на СМИ",
                   res:{ politicalCapital:4, internalLegitimacy:2, personalResource:-3, externalReputation:-2 },
                   rel:{ ruling:4, liberal:-6 },
                   why:{ politicalCapital:"повестку задаёте вы", internalLegitimacy:"часть зрителей верит", personalResource:"приходится говорить то, во что не веришь", externalReputation:"за границей видят цензуру" } },
  delay:         { label:"Выжидание",          desc:"затянуть время, создать комиссию, ничего не решать",
                   res:{ politicalCapital:-3, personalResource:-2 },
                   rel:{},
                   why:{ politicalCapital:"аппарат видит нерешительность", personalResource:"нерешённое давит" } },
};

export const ACTION_TAGS = Object.keys(ACTIONS) as ActionTag[];

// Решения в духе своей идеологии укрепляют лидера, против неё — подтачивают.
export const IDEOLOGY_ACTIONS: Record<IdeologyId, { aligned: ActionTag[]; opposed: ActionTag[] }> = {
  liberal:     { aligned:["reform","pro_west","dialogue","anticorruption"], opposed:["repress","pro_russia","propaganda"] },
  nationalist: { aligned:["patriotism","security","repress"],               opposed:["pro_russia","pro_west"] },
  pragmatist:  { aligned:["elite_deal","investment","austerity"],           opposed:[] },
  leftist:     { aligned:["social","anticorruption","dialogue"],            opposed:["austerity","investment","elite_deal"] },
};

// Цена решений: потери ресурсов весят больше выгод — бесплатных решений почти не бывает.
export const COSTS = { weight: 1.3 };
export const IDEOLOGY_BONUS: ResourceDelta = { personalResource:2, internalLegitimacy:1 };
export const IDEOLOGY_PENALTY: ResourceDelta = { personalResource:-4, politicalCapital:-2 };

// ── Пояснения для анкеты: что на самом деле меняет выбор ────────────────────
export function difficultyEffects(id: DifficultyId): string {
  const res = Object.values(START_RES[id]), avg = Math.round(res.reduce((a, b) => a + b, 0) / res.length);
  const mood = DIFF_REL_MOD[id] > 0 ? "группы настроены теплее" : DIFF_REL_MOD[id] < 0 ? "группы настроены враждебнее" : "группы настроены ровно";
  const drain = `страна сама теряет ${DIFF_PRESSURE[id]} ед. ресурсов за ход, с каждой главой больше`;
  return `ресурсы на старте ≈${avg} из 100 · ${mood} · ${drain}`;
}
export function ideologyEffects(id: IdeologyId, country: string | null): string {
  const lab = (tags: ActionTag[]) => tags.map(t => ACTIONS[t].label.toLowerCase()).join(", ");
  const a = IDEOLOGY_ACTIONS[id];
  const parts = [`укрепляют вас: ${lab(a.aligned)}`, a.opposed.length ? `подтачивают: ${lab(a.opposed)}` : "ни одно решение не идёт против курса"];
  if (country) {
    const rel = IDEOLOGY_REL[id], fac = FACTIONS_DATA[country] ?? [];
    const sorted = [...fac].sort((x, y) => (rel[y.id] ?? 0) - (rel[x.id] ?? 0));
    parts.push(`за вас: ${sorted.slice(0, 2).map(f => f.name).join(", ")}`, `против: ${sorted.slice(-2).reverse().map(f => f.name).join(", ")}`);
  }
  return parts.join(" · ");
}

// ── Отложенные последствия ───────────────────────────────────────────────────
// Эхо решения через несколько ходов. Видно игроку заранее — это часть цены решения.
// story — как это звучит в тексте хода, когда эхо решения срабатывает.
export interface DelayedInfo { turns: number; label: string; res: ResourceDelta; story: string }

export const DELAYED: Partial<Record<ActionTag, DelayedInfo>> = {
  social:         { turns:3, label:"Раздача денег разогнала цены", res:{ economy:-4 },
    story:"Цены в магазинах поползли вверх: деньги, розданные недавно, разогнали инфляцию. Минфин просит больше не обещать выплат." },
  austerity:      { turns:3, label:"Экономия оздоровила бюджет", res:{ economy:3, externalReputation:2 },
    story:"Минфин докладывает: экономия начала работать — дефицит сократился впервые за год, и кредиторы стали сговорчивее." },
  investment:     { turns:4, label:"Инвестиции заработали", res:{ economy:5 },
    story:"Деньги инвестора наконец дошли до дела: открылись первые рабочие места, и регион впервые за годы хвалит столицу." },
  reform:         { turns:4, label:"Реформа дала плоды", res:{ internalLegitimacy:3, externalReputation:2, economy:2 },
    story:"Перемены, о которых все спорили, начали работать: жалоб меньше, а в западной прессе появилось слово «прорыв»." },
  anticorruption: { turns:3, label:"Суд вернул выведенные деньги", res:{ economy:4 },
    story:"Суд вернул в бюджет первые деньги, изъятые у чиновников. Сумма скромная, но об этом говорят все." },
  pro_west:       { turns:3, label:"Пришёл транш западных партнёров", res:{ economy:4 },
    story:"Пришёл транш от западных партнёров — ровно в срок, как и обещали. К нему прилагается список новых условий." },
  pro_russia:     { turns:3, label:"Москва выставила счёт", res:{ personalResource:-3, externalReputation:-2 },
    story:"Москва напомнила о договорённостях: в посольстве ждут ответных шагов, и тон уже не дружеский." },
  repress:        { turns:2, label:"Эхо жёсткости: радикализация", res:{ internalLegitimacy:-3, externalReputation:-2 },
    story:"Жёсткость не прошла бесследно: в сети множатся радикальные каналы, а западные посольства задают неудобные вопросы." },
  elite_deal:     { turns:3, label:"Элиты пришли за своей долей", res:{ politicalCapital:-3, economy:-2 },
    story:"Люди, с которыми вы договаривались, пришли за своей долей. Отказать им теперь дороже, чем было согласиться." },
  propaganda:     { turns:2, label:"Пропаганду раскусили", res:{ internalLegitimacy:-3 },
    story:"Журналисты разобрали недавнюю кампанию по кадрам. Больше всего смеются над тем, что задумывалось самым убедительным." },
  dialogue:       { turns:2, label:"Открытость окупилась", res:{ internalLegitimacy:2, politicalCapital:1 },
    story:"Те, кого вы недавно выслушали, этого не забыли: в парламенте за вас голосуют люди, которые раньше воздерживались." },
  delay:          { turns:2, label:"Отложенная проблема вернулась", res:{ politicalCapital:-2, internalLegitimacy:-2 },
    story:"Вопрос, который вы отложили, вернулся — и стал острее. Отложить его второй раз уже не получится." },
};

export const WEAK_ADVISOR_DELAYED: DelayedInfo = { turns:2, label:"Советник недоглядел", res:{ politicalCapital:-2, personalResource:-1 },
  story:"План советника, который вы приняли, дал течь: исправлять приходится за счёт вашего авторитета." };
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
// С каждой главой мандата (ход 7, 14) давление растёт: страна устаёт от власти.
export const DIFF_PRESSURE: Record<DifficultyId, number> = { debut:1, coalition:2, crisis:3, ruins:2 };
export const PRESSURE_GROWTH = { every: 7, by: 1 };
export const pressureAt = (diff: DifficultyId, turn: number) =>
  (DIFF_PRESSURE[diff] ?? 0) + Math.floor(turn / PRESSURE_GROWTH.every) * PRESSURE_GROWTH.by;

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
