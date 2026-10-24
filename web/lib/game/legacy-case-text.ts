import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { GameState } from './types.ts';

// #260: дела первого срока 1978 года переписаны на президентский уровень решений. Начатая партия хранит прежние тексты
// вариантов в истории, в отложенных последствиях и в текущем деле, а по тексту варианта привязаны эхо, память срока,
// подписи последствий и арт исхода. При загрузке прежний текст заменяется новым; названия дел не менялись.
export const LEGACY_CHOICE_TEXT: Readonly<Record<string, string>> = {
  'Сверить акты на месте и остановить лишние платежи': 'Направить республиканскую ревизию по всей области',
  'Дать губернатору срок и оставить договоры': 'Оставить исполнение губернатору и назначить срок',
  'Передать деньги районному совету': 'Передать деньги на ремонт районным советам',
  'Нанять другого подрядчика, пока идёт следствие': 'Оплатить ремонт больниц из резерва, не дожидаясь приговора',
  'Передать ремонт районному совету в обход подрядчика': 'Передать ремонт больниц районным советам в обход подрядчика',
  'Пропустить зерно, сдвинуть остальные составы': 'Отдать линию зерну для районов',
  'Оплатить испытательную линию': 'Начать переход на европейский стандарт с опытной линии',
  'Сохранить старую линию и российские заказы': 'Оставить заводы на российских заказах',
  'Позволить двум заводам конкурировать за контракт': 'Отдать контракт конкурсу заводов без гарантии казны',
  'Выделить целевую субсидию на каналы и фельдшерские пункты': 'Перенести часть столичной программы на мелиорацию Полесья',
  'Направить выездную комиссию палаты и земств': 'Дать земствам Полесья право самим составить смету',
};

const current = (text: string) => LEGACY_CHOICE_TEXT[text] ?? text;

/** Переводит прежние тексты вариантов кампании 1978 года в нынешние. Архивные страны не трогает. */
export function migrateLegacyCaseText(state: GameState): GameState {
  if (state.country !== ALTERNATE_COUNTRY) return state;
  const legacy = (text: string | undefined) => !!text && text in LEGACY_CHOICE_TEXT;
  const touched = state.history.some(entry => legacy(entry.choice))
    || state.pending.some(item => legacy(item.source))
    || !!state.currentEvent?.choices.some(choice => legacy(choice.text));
  if (!touched) return state;
  return {
    ...state,
    history: state.history.map(entry => (legacy(entry.choice) ? { ...entry, choice: current(entry.choice) } : entry)),
    pending: state.pending.map(item => (legacy(item.source) ? { ...item, source: current(item.source) } : item)),
    currentEvent: state.currentEvent && {
      ...state.currentEvent,
      choices: state.currentEvent.choices.map(choice => (legacy(choice.text) ? { ...choice, text: current(choice.text) } : choice)),
    },
  };
}
