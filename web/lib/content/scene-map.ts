// Какая картинка у события: авторская карточка → сцена, иначе по особому делу, интриге или источнику.
// Та же сцена потом стоит в газете как «фото редакции» — с подписью.
import type { Choice, GameEvent } from "../game/types.ts";

export type SceneKey =
  | "square" | "protest" | "army" | "factory" | "money" | "construction" | "energy" | "field" | "border"
  | "explosion" | "hospital" | "tv" | "summit" | "signing" | "press" | "phone" | "stamp" | "ballot" | "meeting" | "bridge"
  | "office" | "cabinet" | "archive" | "dinner";

const BY_CARD: Record<string, SceneKey> = {
  // позднее правление
  late_son: "money", late_health: "hospital", late_portraits: "stamp", late_old_friend: "stamp", late_generation: "protest",
  late_court: "stamp", late_monument: "construction", late_succession: "army", late_foreign_cover: "press", late_predecessor: "meeting",
  late_last_minister: "meeting",
  // дела-последствия законов
  law_foreign_agents: "tv", law_state_language: "meeting", law_progressive_tax: "money", law_amnesty: "explosion",
  law_death_penalty: "protest", law_anticorruption_bureau: "meeting", law_emergency_powers: "factory", law_media_licensing: "tv",
  law_privatization: "factory", law_pension_reform: "protest", law_church_status: "protest", law_decentralization: "meeting",
  law_eu_course: "border", law_union_treaty: "army", law_constitution: "protest", law_lustration: "tv",
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
  press: "press", call: "phone", budget: "cabinet", inspect: "stamp", terms: "stamp",
  overture: "meeting", insider: "meeting", mole: "meeting", pact: "signing",
};

// Эпизоды интриг — каждый со своей картинкой, чтобы линия не выглядела одной и той же ночной встречей.
const BY_BEAT: Record<string, SceneKey> = {
  "Первая ночь в резиденции": "office", "Новый совет": "cabinet", "Утечка с закрытого совета": "cabinet", "Перехваченная шифровка": "archive", "Утечка о здоровье": "hospital",
  "Кто-то знал заранее": "meeting", "Разоблачение": "press", "Крот наносит удар": "tv",
  "Присяга": "square", "Странные учения": "army", "Ужин на даче": "meeting", "Анонимное письмо": "stamp", "Ночь длинных звонков": "phone",
  "Путч провалился": "protest", "Танки у телецентра": "army",
  "Поздравительная открытка": "office", "Звонок из прошлого": "phone", "Свидетель": "meeting", "Публикация назначена": "tv",
  "Правда выходит наружу": "press", "Пятница": "tv",
  "Непрошеная помощь": "office", "Благодарность спонсора": "office", "Бухгалтер": "archive", "Второе требование": "summit",
  "Сеть раскрыта": "press", "Счёт выставлен": "tv",
  "Неудобный вопрос": "press", "Последнее сообщение": "office", "Номер на ладони": "office", "Месяц тишины": "archive",
  "Объект номер четыре": "army", "Показания журналиста": "press", "Дело закрыто": "tv",
};
const BY_ARC: Record<string, SceneKey> = { generals: "army", mole: "meeting", kompromat: "tv", money: "money", reporter: "meeting" };

const BY_SOURCE: Record<string, SceneKey> = {
  "Парламент": "stamp",
  "Улица": "protest", "Армия": "army", "Пресса": "tv", "МИД": "summit", "Брюссель": "summit", "Кремль": "phone",
  "Разведка": "meeting", "Оппозиция": "protest", "Олигарх": "money",
};

export function sceneOf(ev: Pick<GameEvent, "card" | "special" | "beat" | "source"> & { title?: string }): SceneKey {
  return (ev.card && BY_CARD[ev.card]) || (ev.special && BY_SPECIAL[ev.special.kind])
    || (ev.beat && ((ev.title && BY_BEAT[ev.title]) || BY_ARC[ev.beat.arcId]))
    || BY_SOURCE[ev.source] || "square";
}

// Фото в газете показывает сделанное, а не повторяет картинку входящего дела.
export function sceneAfter(ev: GameEvent, choice: Choice, success: boolean): SceneKey {
  if (choice.advisor) return "cabinet";
  if (ev.beat?.arcId === "money" && choice.arc?.flag === "o_thank") return "dinner";
  if (success && ev.beat?.arcId === "mole" && choice.arc?.flag === "o_file") return "archive";
  if (success && ev.beat?.arcId === "mole" && choice.arc?.flag === "o_open") return "cabinet";
  if (success && ev.beat?.arcId === "reporter" && choice.arc?.flag === "commission") return "archive";
  return sceneOf(ev);
}

export const SCENE_CAPTION: Record<SceneKey, string> = {
  square: "Площадь перед резиденцией", protest: "Площадь перед резиденцией, вечер", army: "Бронетехника на улицах столицы",
  factory: "У проходной завода", money: "Министерство финансов, ночное совещание", construction: "Стройплощадка на окраине столицы",
  energy: "Линия электропередачи у подстанции", field: "Поле в одной из южных областей", border: "Пограничный переход",
  explosion: "Место происшествия", hospital: "У приёмного покоя областной больницы", tv: "Кадр из вечернего эфира",
  summit: "Переговоры за закрытыми дверями", signing: "Подписание договора в резиденции", press: "Пресс-центр резиденции", phone: "Кабинет президента, полночь",
  stamp: "Документ на столе президента", ballot: "Избирательный участок", meeting: "Встреча без свидетелей", bridge: "На месте обрушения",
  office: "Личный кабинет президента", cabinet: "Заседание кабинета министров", archive: "Закрытый архив, просмотр документов", dinner: "Ужин за закрытыми дверями",
};
