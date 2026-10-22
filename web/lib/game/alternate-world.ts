import { historicalSceneText } from "../content/historical-scenes.ts";
import type { IdeologyId } from "./types.ts";
// A separate campaign, never an alias or migration of contemporary saves.
export const ALTERNATE_COUNTRY = "Беларусь · 1978";
export const REPUBLIC_NAME = "Неманская республика";
export function countryName(country: string): string {
    return country === ALTERNATE_COUNTRY ? REPUBLIC_NAME : country;
}
export const ALTERNATE_DAILY_FROM = "2026-10-13";
export const LEGACY_COUNTRIES = ["Беларусь", "Украина", "Грузия", "Молдова", "Армения", "Казахстан"];
export const ALTERNATE_CONTEXT = "Альтернативная история. На землях Беларуси после 1918 года сохранилась независимая Неманская республика. "
    + "В 1956 году парламент заключил промышленный договор с Россией: энергия и заказы в обмен на поставки машин. "
    + "Теперь, в 1978-м, цены на топливо растут, заводы задерживают зарплату, а областные руководители защищают свои договоры. "
    + "Вы выиграли выборы с обещанием перемен. Казна, парламент и старые контракты достались вам вместе с кабинетом.";
export const ALTERNATE_NAMES = {
    first: ["Алесь", "Павел", "Антон", "Виктор", "Михаил", "Роман", "Степан", "Леонид", "Нина", "Вера", "Ольга", "Лидия"],
    last: [
        "Ладин", "Рович", "Селицкий", "Борич", "Мельнич", "Кленов", "Вербич", "Долин", "Горский", "Немиров",
        "Луговой", "Радич", "Березич", "Острин", "Рудницкий", "Лесин", "Яровой", "Норич", "Бровин", "Вежин",
        // #242: людей с местными фамилиями за срок больше двадцати — пул шире, чтобы фамилии не повторялись.
        "Тарасевич", "Данилович", "Савич", "Ольшанский", "Заславский", "Шумский", "Ясенев", "Гордеев",
        "Климов", "Ракитин", "Липнич", "Дубровин", "Жук", "Зарецкий", "Миронович", "Белевич"
    ]
};
// Shared human stories remain available, but contemporary country-specific plots do not.
export const ALTERNATE_SHARED_CARDS = new Set([
    "strike", "currency", "budget_hole", "investor", "pensions", "privatization",
    "sec_ultimatum", "sec_leak", "general_ambition", "mass_protest", "students", "journalist",
    "opposition_leader", "election_debate", "election_fraud", "oligarch_demand", "minister_scandal",
    "regional_baron", "crisis_escalates", "crisis_blame", "assassination", "health", "kompromat", "ally_request",
]);
export const ALTERNATE_SHARED_LAWS = new Set([
    "progressive_tax", "amnesty", "anticorruption_bureau", "emergency_powers",
    "privatization", "pension_reform", "decentralization",
]);
// Era vocabulary for shared templates. Authorial historical events live in alternate-history.ts;
// this does not make a contemporary event eligible or change IDs, effects or saved countries.
const ERA_PHRASES: [string, string][] = [
    ["2011-го", "1961-го"],
    ["2011", "1961"],
    ["по видеосвязи", "по телефону"],
    ["блогер-миллионник", "популярный обозреватель"],
    ["публикует пост из двух слов", "передаёт редакциям записку из двух слов"],
    ["прямо на площади, с телефонов", "в заводском клубе"],
    ["с экраном телефона", "с листком бумаги"],
    ["без телефона и без памяти", "без документов и без памяти"],
    ["телефон выключен со вчерашнего вечера", "домашний телефон не отвечает со вчерашнего вечера"],
    [
        "Он кладёт на стол телефон с фотографией коллеги, разворачивает экран к вам и убирает руку.", "Он кладёт на стол фотографию коллеги и убирает руку."
    ],
    ["Телефоны оставляют в прихожей.", "Разговор ведут без стенографиста."],
    ["Казначей смотрит на имя звонящего", "Казначей узнаёт голос в трубке"],
    ["через зеркала, VPN, пересланные скриншоты", "в перепечатках, листовках и зарубежных газетах"],
    ["График посещаемости заблокированного сайта", "График тиража закрытой газеты"],
    ["полсотни сайтов", "полсотни газет"], ["просмотров", "читателей"],
    ["сайте иностранного издания", "полосе иностранного издания"],
    ["сайте администрации", "правительственном бюллетене"],
    ["выложили запись", "передали запись редакциям"],
    ["выложили фотографию", "напечатали фотографию"],
    ["выкладывает в соцсети новое фото", "передаёт редакции новую фотографию"],
    ["пересылает вам ролик", "передаёт вам плёнку"],
    ["СМС", "телеграмма"],
    ["миллионник", "популярный ведущий"], ["подписчиков", "слушателей"],
    ["электронной почте", "служебной почте"], ["электронное письмо", "письмо"],
    ["компьютере", "картотеке"], ["ноутбук", "папка"],
    ["флешку", "плёнку"], ["флешке", "плёнке"],
    ["Союзное государство", "Промышленный договор"],
    ["Европейский союз", "Торговый союз"], ["Совет Европы", "Совет торгового союза"],
    ["вступление в ЕС", "вступление в Торговый союз"], ["Вступление в ЕС", "Вступление в Торговый союз"],
    ["с ЕС", "с Торговым союзом"], ["из ЕС", "из Торгового союза"], ["у ЕС", "у Торгового союза"],
    ["партнёр в ЕС", "партнёр в Торговом союзе"], ["курс на ЕС", "курс на Торговый союз"],
    ["Посол ЕС", "Посол Торгового союза"],
    ["посол ЕС", "посол Торгового союза"], ["НАТО", "Атлантический пакт"],
    ["КГБ", "Управление безопасности"], ["ОМОНа", "резерва полиции"], ["ОМОН", "резерв полиции"],
    ["пишет в закрытом канале для своих", "пишет в письме соратникам"],
    ["Вторая инаугурация проходит тише первой", "Новая инаугурация проходит тише первой"],
    ["социальных сетях", "читательских письмах"], ["соцсетях", "читательских письмах"],
    ["соцсети", "редакции"], ["соцсетей", "редакций"], ["соцсетям", "редакциям"],
    ["блогеры", "обозреватели"], ["блогеров", "обозревателей"], ["блогер", "обозреватель"],
    ["блогера", "обозревателя"], ["блогеру", "обозревателю"], ["блогером", "обозревателем"], ["блогере", "обозревателе"],
    ["блогерам", "обозревателям"], ["блогерами", "обозревателями"], ["блогерах", "обозревателях"],
    ["по интернету", "по редакциям"], ["интернета", "радиовещания"],
    ["интернету", "радиовещанию"], ["интернетом", "радиовещанием"],
    ["Интернет помнит", "Газеты помнят"], ["в интернете", "в газетах"], ["интернет", "радио"], ["онлайн", "по телефону"],
    ["мессенджере", "служебной связи"], ["мессенджер", "служебная связь"],
    ["смартфон", "телефон"], ["вирусное видео", "скандальную киноплёнку"],
    ["видео", "киноплёнка"], ["Видео", "Киноплёнка"], ["дрон", "самолёт"], ["Дрон", "Самолёт"],
    ["мемами", "карикатурами"], ["мемы", "карикатуры"],
    ["в сети", "в прессе"], ["В сети", "В прессе"], ["по сети", "по редакциям"],
    ["попало в сеть", "попало в редакции"], ["в сеть", "в редакции"],
    ["поисковиках", "читательских письмах"], ["поисковиков", "редакций"],
    ["Курс на Европу", "Новые рынки"],
    // Declension belongs to the complete phrase, never a guessed case for an isolated acronym.
    ...["посол", "посла", "послу", "послом", "после", "послы", "послов", "послам", "послами",
        "деньги", "помощь", "посредничество", "посредничестве", "посредника", "гарантиях",
        "квоты", "флагом", "флаги", "флагами"].map(word => [`${word} ЕС`, `${word} Торгового союза`] as [string, string]),
    ...["выступает", "выделяет", "открыл", "недоволен", "стал", "предлагает", "наблюдает", "перечислил"]
        .map(verb => [`ЕС ${verb}`, `Торговый союз ${verb}`] as [string, string]),
];

// Cyrillic is not a JavaScript \b word. Protect letters, digits, underscores and hyphenated compounds.
const ERA_RULES = ERA_PHRASES.map(([source, replacement]) => ({
    source,
    replacement,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}_-])${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_-])`, 'giu'),
}));

export function eraText(text: string): string {
    return ERA_RULES.reduce((result, { source, pattern, replacement }) => result.replace(pattern, match => {
        // Preserve sentence-initial capitals, without capitalising replacements for acronyms such as СМС.
        return /^\p{Ll}/u.test(source) && /^\p{Lu}/u.test(match)
            ? replacement[0].toUpperCase() + replacement.slice(1)
            : /^\p{Lu}/u.test(source) && /^\p{Ll}/u.test(match)
                ? replacement[0].toLowerCase() + replacement.slice(1) : replacement;
    }), historicalSceneText(text));
}
export function campaignText(text: string, country: string): string {
    return country === ALTERNATE_COUNTRY ? eraText(text) : text;
}
export function campaignCopy<T>(value: T, country: string): T {
    if (country !== ALTERNATE_COUNTRY)
        return value;
    if (typeof value === "string")
        return eraText(value) as T;
    if (Array.isArray(value))
        return value.map(item => campaignCopy(item, country)) as T;
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "heard" ? item : campaignCopy(item, country)])) as T;
    }
    return value;
}
export function campaignLabel(country: string): string {
    return country === ALTERNATE_COUNTRY ? `${REPUBLIC_NAME} · альтернативная история` : country;
}
export function dailyBoardKey(date: string, version: string): string {
    return date >= ALTERNATE_DAILY_FROM ? `daily:${date}:v${version}` : `daily:${date}`;
}
export const ALTERNATE_PARTIES: Record<IdeologyId, string> = {
    liberal: "Республика перемен",
    nationalist: "Самостоятельная республика",
    pragmatist: "Договор и дело",
    leftist: "Трудовой кабинет"
};
export const ALTERNATE_SPEECHES: Record<IdeologyId, string> = {
    liberal: ("Заводы и правительство будут отвечать на вопросы. Договоры перестанут быть секретом для тех, кто их оплачивает. Перемены " +
        "начинаются с права узнать правду."),
    nationalist: ("Мы будем торговать с соседями, но решения о нашей стране принимать здесь. Собственное производство и самостоятельность стоят " +
        "денег. Я не стану обещать, что за них заплатит кто-то другой."),
    pragmatist: ("Мне достались кабинет, долги и обещания прежнего правительства. Я не обещаю исправить всё одной подписью. Сначала люди должны " +
        "получить зарплату, а страна — понятный план."),
    leftist: ("Те, кто работает на заводах и в хозяйствах, не должны первыми оплачивать чужие ошибки. Казна будет помогать людям, а не " +
        "прятать долги владельцев. За каждую такую помощь придётся отвечать.")
};
