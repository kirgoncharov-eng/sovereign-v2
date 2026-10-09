// One political actor in the ordinary world: no separate quest clock or resource model.
import type { GameState } from './types.ts';
import type { LivingWorld, WorldAction } from './living-world.ts';

export type SponsorPhase = 'offered' | 'accepted' | 'demanding' | 'confirmed' | 'refused' | 'pressuring' | 'independent' | 'released' | 'departed';
export interface SponsorState {
  figure: string;
  name: string;
  openedTurn: number;
  due: number;
  deadline: number | null;
  phase: SponsorPhase;
  lastMove: string;
  lastMoveTurn: number;
}
const finished = (world: LivingWorld) => ['completed', 'partial', 'failed'].includes(world.project.status);
export function ensureSponsor(gs: GameState): GameState {
  if (gs.daily || gs.ended || !gs.world || gs.world.sponsor || gs.arc?.id !== 'money'
    || finished(gs.world) || gs.turn >= gs.world.project.deadline) return gs;
  const figure = gs.keyFigures.find(f => f.name === gs.arc!.target);
  if (!figure) return gs;
  const sponsor: SponsorState = {
    figure: figure.id, name: figure.name, openedTurn: gs.turn, due: gs.turn + 2,
    deadline: null, phase: 'offered', lastMoveTurn: gs.turn,
    lastMove: `${figure.name} оставил номер через казначея кампании. Его компании работают с нынешним поставщиком энергосети. Он готов ускорить адаптацию оборудования, если заказы останутся у них. Вы можете сами назначить встречу; принятие помощи будет политической сделкой.`,
  };
  return { ...gs, world: { ...gs.world, sponsor } };
}
export function sponsorPresent(gs: GameState): boolean {
  const s = gs.world?.sponsor;
  return !!s && gs.keyFigures.some(f => f.id === s.figure && f.name === s.name);
}
export function sponsorActions(gs: GameState): Omit<WorldAction, 'blocked'>[] {
  const s = gs.world?.sponsor;
  if (!s || !sponsorPresent(gs) || ['independent', 'released', 'departed'].includes(s.phase)) return [];
  const independent = gs.world!.project.procurementFixed || gs.world!.project.deal;
  if (independent) return [];
  const route = {
    id: 'sponsor:independent', title: 'Сменить поставщика без помощи спонсора',
    detail: 'Инженеры проверят альтернативное оборудование; новый договор уберёт зависимость поставок от этого человека. Экономика −3, политкапитал −2. Это поручение: другие личные вмешательства в этом квартале придётся отложить.',
    cost: { economy: -3, politicalCapital: -2 },
  };
  if (['accepted', 'demanding', 'confirmed'].includes(s.phase)) return [
    ...(s.phase === 'demanding' ? [{
      id: 'sponsor:confirm', title: 'Подтвердить сохранение заказов его компаниям',
      detail: 'Вы проводите обещанное условие через аппарат. Политкапитал −2. Помощь поставкам остаётся, обычная смена поставщика закрыта; отказаться от зависимости можно отдельным поручением с новой ценой.',
      cost: { politicalCapital: -2 },
    }] : []),
    { ...route, title: 'Расторгнуть соглашение и перейти к независимому поставщику',
      detail: `${route.detail} Спонсор лишится обещанных заказов; его отношение к вам −12.` },
  ];
  if (finished(gs.world!)) return [];
  return [
    {
      id: 'sponsor:accept', title: 'Принять помощь в обмен на сохранение заказов',
      detail: `Согласованная адаптация уберёт задержку оборудования и добавит 5 пунктов работы за квартал. Сейчас политкапитал −1. Через два квартала ${s.name} потребует провести условие через аппарат: ещё политкапитал −2. Смена поставщика потребует расторгнуть соглашение. Руководителя проекта и его бюджет вы назначаете отдельно.`,
      cost: { politicalCapital: -1 },
    }, route,
    ...(s.phase === 'offered' ? [{
      id: 'sponsor:refuse', title: 'Отказаться от его условий',
      detail: 'Бюджет не расходуется; этот ответ использует личное вмешательство квартала. Отношение спонсора −8. Его влияние на нынешние поставки останется: он сможет потребовать согласования от своих компаний. Другие дела продолжатся.',
      cost: {},
    }] : []),
  ];
}
export function sponsorDecision(gs: GameState, world: LivingWorld, id: string): { text: string; relation: number } {
  const s = world.sponsor!;
  let relation = 0, text: string;
  if (id === 'sponsor:accept') {
    s.phase = 'accepted'; s.due = gs.turn + 2; s.deadline = null; relation = 8;
    text = `Вы назначаете встречу. ${s.name} приходит с перечнем компаний. «Оборудование адаптируют мои люди. Заказы остаются у наших компаний», — говорит он. Вы принимаете конкретное условие. Снабжение получает помощь; ни один узел не считается восстановленным до квартального доклада. Через два квартала он вернётся за подтверждением. Сейчас политкапитал −1; последующее подтверждение — ещё −2. Отношение к вам +8.`;
  } else if (id === 'sponsor:independent') {
    relation = ['accepted', 'demanding', 'confirmed'].includes(s.phase) ? -12 : -5;
    world.project.procurementFixed = true;
    s.phase = 'independent'; s.deadline = null;
    text = `Вы поручаете инженерам согласовать совместимое оборудование и заключаете договор с другим поставщиком. ${s.name} теряет возможность задерживать этот проект через прежние компании. Его отношение ${relation}. Цена независимого договора: экономика −3, политкапитал −2. Эти деньги не направлены на новые больничные ставки. Документы о финансировании кампании никуда не исчезли: политическая интрига продолжается, но этот рычаг утрачен.`;
  } else if (id === 'sponsor:confirm') {
    s.phase = 'confirmed'; s.deadline = null; relation = 5;
    text = `Вы проводите через аппарат обещанное сохранение заказов. Политкапитал −2. ${s.name} получил действующую договорённость, а не комплимент по телефону. Отношение +5. Поставки сохраняют помощь. Если позднее решите сменить поставщика, придётся открыто расторгнуть соглашение и оплатить независимый договор.`;
  } else {
    s.phase = 'refused'; s.due = Math.max(gs.turn + 1, s.due); relation = -8;
    text = `«Государственные заказы не являются расчётом за кампанию», — отвечаете вы. ${s.name} не получил соглашения, но его компании по-прежнему участвуют в поставках. Отношение −8. У вас остаётся путь сменить поставщика либо направить следующий квартал на другое дело; отказ сам по себе не заменяет оборудование.`;
  }
  s.lastMove = text; s.lastMoveTurn = gs.turn;
  return { text, relation };
}
export function sponsorSupport(world: LivingWorld): boolean {
  return !!world.sponsor && ['accepted', 'demanding', 'confirmed'].includes(world.sponsor.phase)
    && !world.project.procurementFixed && !world.project.deal;
}
export function sponsorPressure(world: LivingWorld): boolean {
  return world.sponsor?.phase === 'pressuring' && !world.project.procurementFixed && !world.project.deal;
}
export function stepSponsor(gs: GameState, world: LivingWorld, turn: number): string | null {
  const s = world.sponsor;
  if (!s || ['independent', 'released', 'departed'].includes(s.phase)) return null;
  let text: string | null = null;
  if (!sponsorPresent(gs)) {
    s.phase = 'departed'; s.deadline = null;
    text = `${s.name} больше не занимает прежнюю позицию. У этого человека нет прежнего доступа к решениям; помощь и давление через него прекращены. Новый человек на том же посту не наследует его личную сделку.`;
  } else if (world.project.procurementFixed || world.project.deal) {
    s.phase = 'independent'; s.deadline = null;
    text = `${s.name} потерял рычаг снабжения: ${world.project.procurementFixed ? 'вы сменили поставщика' : 'вы договорились об адаптации с местными участниками отдельно'}. Он не может тормозить проект прежним способом. История финансирования кампании остаётся отдельным вопросом.`;
  } else if (s.phase === 'accepted' && turn >= s.due) {
    s.phase = 'demanding'; s.deadline = turn + 2;
    text = `${s.name} сам присылает условия для аппарата: «Я обеспечил вам поставки. Теперь проведите сохранение наших заказов». Согласование стоит политкапитала −2; можно подтвердить договор или оплатить независимого поставщика. Ответ нужен до конца квартала ${s.deadline}. Пока срок не истёк, помощь продолжается.`;
  } else if (s.phase === 'demanding' && turn >= s.deadline!) {
    s.phase = finished(world) ? 'released' : 'pressuring'; s.deadline = null;
    text = `${s.name} не получил обещанного подтверждения и отзывает помощь. ${finished(world) ? 'Годовая программа уже закончена: прежние поставки не позволяют изменить её результат.' : 'Его компании отправляют поставки на дополнительные согласования. Работа замедляется на 8 пунктов за квартал, пока зависимость сохраняется. Вы можете сменить поставщика.'}`;
  } else if (['offered', 'refused'].includes(s.phase) && turn >= s.due) {
    s.phase = finished(world) ? 'released' : 'pressuring';
    text = `${s.name} сам выходит на своих поставщиков: без договорённости с резиденцией отправляет оборудование на дополнительные согласования. ${finished(world) ? 'Программа уже завершена; этот рычаг не меняет её результат.' : 'Квартальная работа теряет 8 пунктов. Смена поставщика или самостоятельная договорённость с местными участниками уберёт именно эту задержку. Предложение помощи остаётся, но принимать его вы не обязаны.'}`;
  } else if (s.phase === 'pressuring' && finished(world)) {
    s.phase = 'released';
    text = 'Годовая программа закончена. Давление на её поставки больше не меняет итог, новые требования по этому проекту не возникают.';
  }
  if (text) { s.lastMove = text; s.lastMoveTurn = turn; }
  return text;
}
export function validSponsor(value: unknown, turn: number): value is SponsorState {
  if (!value || typeof value !== 'object') return false;
  const s = value as SponsorState;
  const int = (n: number) => Number.isSafeInteger(n) && n >= 0;
  return typeof s.figure === 'string' && !!s.figure && typeof s.name === 'string' && !!s.name
    && ['offered', 'accepted', 'demanding', 'confirmed', 'refused', 'pressuring', 'independent', 'released', 'departed'].includes(s.phase)
    && int(s.openedTurn) && s.openedTurn <= turn && int(s.due) && s.due >= s.openedTurn
    && int(s.lastMoveTurn) && s.lastMoveTurn >= s.openedTurn && s.lastMoveTurn <= turn
    && typeof s.lastMove === 'string' && !!s.lastMove
    && (s.phase === 'demanding' ? int(s.deadline!) && s.deadline! > turn : s.deadline === null);
}
