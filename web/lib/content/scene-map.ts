// Какая картинка у события: авторская карточка → сцена, иначе по особому делу, интриге или источнику.
// Та же сцена потом стоит в газете как «фото редакции» — с подписью.
import type { GameEvent } from "../game/types.ts";

export type SceneKey =
  | "square" | "protest" | "army" | "factory" | "money" | "construction" | "energy" | "field" | "border"
  | "explosion" | "hospital" | "tv" | "summit" | "signing" | "press" | "phone" | "stamp" | "ballot" | "meeting" | "bridge";

const BY_CARD: Record<string, SceneKey> = {
  strike: "factory", privatization: "factory", by_potash: "factory",
  currency: "money", budget_hole: "money", oligarch_demand: "money", crypto_farms: "energy",
  investor: "construction", ua_reconstruction: "construction", championship: "construction",
  energy: "energy", md_transnistria: "energy", nuclear: "energy",
  harvest: "field",
  border: "border", refugees: "border", by_exiles: "border", am_border: "border",
  terror: "explosion", gas_blast: "explosion", assassination: "explosion",
  health: "hospital", outbreak: "hospital", doctors_strike: "hospital",
  journalist: "tv", general_ambition: "tv", media_war: "tv", kompromat: "tv", blogger: "tv", prison_video: "tv",
  minister_scandal: "tv", crisis_blame: "tv", sec_leak: "tv", army_kickbacks: "tv",
  election_debate: "press", election_fraud: "ballot", cyber_election: "ballot",
  eu_conditions: "summit", sanctions: "summit", summit: "summit", kremlin_call: "phone", ally_request: "phone",
  spy_diplomat: "meeting",
  sec_ultimatum: "army", ua_veterans: "army",
  mass_protest: "protest", pensions: "protest", students: "protest", opposition_leader: "protest", regional_baron: "protest",
  church_pressure: "protest", ge_foreign_agents: "protest", kz_january: "protest", kz_hijab: "protest", crisis_escalates: "protest",
  bridge: "bridge",
};

const BY_SPECIAL: Record<string, SceneKey> = {
  press: "press", call: "phone", budget: "money", inspect: "stamp",
  overture: "meeting", insider: "meeting", mole: "meeting", pact: "signing",
};

// Эпизоды интриг — каждый со своей картинкой, чтобы линия не выглядела одной и той же ночной встречей.
const BY_BEAT: Record<string, SceneKey> = {
  "Первая ночь в резиденции": "square", "Утечка с закрытого совета": "tv", "Перехваченная шифровка": "phone", "Утечка о здоровье": "hospital",
  "Кто-то знал заранее": "meeting", "Разоблачение": "press", "Крот наносит удар": "tv",
  "Присяга": "square", "Странные учения": "army", "Ужин на даче": "meeting", "Анонимное письмо": "stamp", "Ночь длинных звонков": "phone",
  "Путч провалился": "protest", "Танки у телецентра": "army",
  "Поздравительная открытка": "stamp", "Звонок из прошлого": "phone", "Свидетель": "meeting", "Публикация назначена": "tv",
  "Правда выходит наружу": "press", "Пятница": "tv",
  "Непрошеная помощь": "money", "Благодарность спонсора": "meeting", "Бухгалтер": "border", "Второе требование": "summit",
  "Сеть раскрыта": "press", "Счёт выставлен": "tv",
  "Неудобный вопрос": "press", "Последнее сообщение": "phone", "Номер на ладони": "meeting", "Месяц тишины": "tv",
  "Объект номер четыре": "army", "Показания журналиста": "press", "Дело закрыто": "tv",
};
const BY_ARC: Record<string, SceneKey> = { generals: "army", mole: "meeting", kompromat: "tv", money: "money", reporter: "meeting" };

const BY_SOURCE: Record<string, SceneKey> = {
  "Улица": "protest", "Армия": "army", "Пресса": "tv", "МИД": "summit", "Брюссель": "summit", "Кремль": "phone",
  "Разведка": "meeting", "Оппозиция": "protest", "Олигарх": "money",
};

export function sceneOf(ev: Pick<GameEvent, "card" | "special" | "beat" | "source"> & { title?: string }): SceneKey {
  return (ev.card && BY_CARD[ev.card]) || (ev.special && BY_SPECIAL[ev.special.kind])
    || (ev.beat && ((ev.title && BY_BEAT[ev.title]) || BY_ARC[ev.beat.arcId]))
    || BY_SOURCE[ev.source] || "square";
}

export const SCENE_CAPTION: Record<SceneKey, string> = {
  square: "Площадь перед резиденцией", protest: "Площадь перед резиденцией, вечер", army: "Бронетехника на улицах столицы",
  factory: "У проходной завода", money: "Министерство финансов, ночное совещание", construction: "Стройплощадка на окраине столицы",
  energy: "Линия электропередачи у подстанции", field: "Поле в одной из южных областей", border: "Пограничный переход",
  explosion: "Место происшествия", hospital: "У приёмного покоя областной больницы", tv: "Кадр из вечернего эфира",
  summit: "Переговоры за закрытыми дверями", signing: "Подписание договора в резиденции", press: "Пресс-центр резиденции", phone: "Кабинет президента, полночь",
  stamp: "Документ на столе президента", ballot: "Избирательный участок", meeting: "Встреча без свидетелей", bridge: "На месте обрушения",
};
