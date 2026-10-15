import { ALTERNATE_EVENTS } from '../content/alternate-history.ts';
import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import { traitOf } from './people.ts';
import type { Choice, GameEvent, GameState, ResourceDelta } from './types.ts';

export const JOURNALIST_CALL_TITLE = 'Корреспондент не вернулся в редакцию';

export function journalistContext(state: GameState) {
  const radio = ALTERNATE_EVENTS.find(card => card.id === 'alt_radio')!;
  const signature = state.history.find(entry => entry.title === radio.title);
  const controlled = signature?.success === true && signature.choice === radio.choices[2].text;
  const verified = signature?.success === true && signature.choice === radio.choices[1].text;
  const memory = controlled
    ? 'Ведомство ссылается на ваше требование согласовывать радиопередачи и не выдаёт редакции документы.'
    : verified
      ? 'После вашей проверки заводского магазина редакция сохранила копии накладных. Корреспондент сверял их с поставками.'
      : 'Редакция собирает письма о поставках в заводские магазины. Корреспондент сверял письма с накладными.';
  return { controlled, memory };
}

export function journalistReply(state: GameState, choiceId: string): string {
  const { controlled } = journalistContext(state);
  switch (choiceId) {
    case 'a': return '«Я передам семье. Но приказ должен дойти до дежурного — позвоните ему при мне. '
      + 'Иначе утром мне снова скажут: бумаги ещё не пришли».';
    case 'b': return controlled
      ? '«Вы сами велели согласовывать ответы. Разрешите эфир о результатах проверки без министерской визы '
        + 'и допустите нашего представителя. Тогда я дам копии и подпишусь под протоколом».'
      : '«Пусть наш представитель увидит журнал задержаний и подпишет протокол. '
        + 'Копии накладных я передам проверяющему лично. Без этого ведомство проверит само себя».';
    case 'c': return controlled
      ? '«Тому же ведомству? Оно уже отвечает, что без визы министерства ничего не выдаст. '
        + 'Вы обещаете мне ответ — запомните это».'
      : '«Копии у меня есть. Передам их под расписку. Но если пришлют отписку, '
        + 'я напечатаю её рядом с вашим обещанием».';
    default: return '«Тогда я напечатаю, что вы отказались вмешаться. Не приписывайте мне согласия».';
  }
}

// Only the first historical calendar call changes. Legacy, Daily and saved generic calls keep their rules.
export function journalistCall(state: GameState, slot: number, called: Set<string>): (GameEvent & { cardId: string }) | null {
  if (state.country !== ALTERNATE_COUNTRY || state.daily || slot !== 11 || state.turn !== 10) return null;
  const caller = state.keyFigures.find(figure => figure.id === 'journalist'
    && figure.name !== state.arc?.target && !called.has(figure.id));
  if (!caller) return null;
  const faction = state.factions.find(group => group.id === caller.faction);
  if (!faction) return null;
  const { controlled, memory } = journalistContext(state);
  const security = state.factions.filter(group => group.bloc === 'security');
  const relations = (editor: number, police: number) => ({
    [faction.id]: editor, ...Object.fromEntries(security.map(group => [group.id, police])),
  });
  const choice = (
    id: string, text: string, hint: string, res: ResourceDelta, editor: number, police: number,
    scene: string, label: string, report: string, laterRes: ResourceDelta,
  ): Choice => ({
    id, text, hint, tags: ['dialogue'], politicalTags: id === 'd' ? ['security'] : ['dialogue'],
    resolvesCrisis: null, scene, sceneFail: scene, headline: text, headlineFail: text,
    deal: {
      pure: true, figure: caller.id, figureRel: editor, factionRel: relations(editor, police), res,
      later: { turns: 1, label, res: laterRes, story: report },
    },
  });
  const choices = [
    choice('a', 'Потребовать немедленного освобождения',
      'Политкапитал −4, личный ресурс −2. Вы сами звоните дежурному. Редакция сблизится с вами; '
        + 'силовики воспримут приказ как вмешательство. Подтверждение освобождения — в следующем квартальном докладе.',
      { politicalCapital: -4, personalResource: -2 }, 8, -8,
      'Вы просите соединить с дежурным и не кладёте трубку, пока тот не находит запись о задержании. '
        + 'Приказываете освободить корреспондента. Редактор слышит весь разговор. '
        + 'Теперь на стол должен прийти документ об исполнении, а не ещё одно устное заверение.',
      'Приказ об освобождении: исполнение подтверждено',
      'В докладе по вашему ночному звонку — расписка: корреспондент вышел из управления в ту же ночь. '
        + 'Семья подтвердила время. Редакция напечатала его рассказ; ведомство приложило возражение против '
        + 'прямого вмешательства президента. Накладные всё ещё предстоит проверить.',
      { internalLegitimacy: 3, politicalCapital: -1 }),
    choice('b', 'Назначить проверку с участием редакции',
      `Экономика −3 на выезд проверяющих, политкапитал −${controlled ? 4 : 2}, личный ресурс −2. `
        + (controlled ? 'Отдельно разрешаете эфир о результатах этого дела без министерской визы. ' : '')
        + 'Прокурор и представитель редакции сверят журнал и накладные. Вы обещаете семье проверку оснований '
        + 'и открытый протокол; доклад придёт в следующем квартале.',
      { economy: -3, politicalCapital: controlled ? -4 : -2, personalResource: -2 }, 5, -3,
      `${caller.name} просит допустить представителя редакции. Вы включаете это условие в поручение прокурору. `
        + (controlled ? 'Эфир о результатах именно этого дела разрешаете без визы министерства. ' : '')
        + 'Редактор передаёт копии под расписку. Вы обещаете обнародовать основания задержания и результат проверки.',
      'Обещание редакции: открытый протокол получен',
      'Прокурор прислал протокол по вашему поручению. Проверка завершилась через трое суток после звонка: '
        + 'накладные настоящие, основания удерживать корреспондента не подтвердились. Его освободили. '
        + 'Представитель редакции подписал протокол; копию получила семья. Расхождения в поставках выделены в отдельное дело.',
      { internalLegitimacy: 4 }),
    choice('c', 'Запросить доклад у самого ведомства',
      'Личный ресурс −1. Обещаете редакции ответ по основаниям задержания. '
        + (controlled
          ? 'Ведомство уже прикрывает ответ вашим требованием согласовывать эфир. '
            + 'Без независимого участника вы рискуете остаться с непроверяемой отпиской.'
          : 'Редакция передаст копии под расписку. Проверка останется у ведомства; '
            + 'публичного протокола и независимой подписи не будет.')
        + ' Результат — в следующем квартальном докладе.',
      { personalResource: -1 }, -2, 2,
      `${caller.name} спрашивает, кто проверит проверяющих. Вы оставляете дело в ведомстве, `
        + 'но обещаете передать редакции ответ об основаниях задержания. Секретарь записывает обещание рядом с номером поручения.',
      controlled ? 'Обещание редакции не выполнено: ответ закрыт' : 'Ответ ведомства: корреспондент освобождён',
      controlled
        ? 'На ваше поручение о корреспонденте пришла справка: «Основания проверены». Приложения не выдают: '
          + 'министерство ссылается на ваше распоряжение о согласовании эфира, хотя речь о документах. '
          + 'Редакции нечего предъявить семье. В докладе нет подтверждения освобождения. '
          + `${caller.name} печатает ваше обещание и полученную справку рядом: ответ по существу вы не дали.`
        : 'Ведомство сообщило: копии редакции сверили с журналом, корреспондента освободили на следующий день после звонка. '
          + 'Он подтвердил редактору, что вернулся домой. Вы передали семье ответ, как обещали. '
          + 'Проверку поставок ведомство оставило за собой; независимого протокола редакция не получила.',
      controlled ? { internalLegitimacy: -4, politicalCapital: -2 } : { internalLegitimacy: 1 }),
    choice('d', 'Не вмешиваться в задержание',
      'Без прямых расходов. Ничего не обещаете и сохраняете поддержку ведомства. '
        + 'Редакция опубликует ваш отказ. В следующем квартале станет известно, чем закончилась проверка.',
      {}, -10, 5,
      'Вы отказываетесь давать указания по отдельному задержанию. Редактор просит разрешения процитировать ответ. '
        + '«Да», — говорите вы. На этот раз секретарь не записывает никакого обещания.',
      'Задержание без вмешательства президента',
      'Редакция сообщает: корреспондента отпустили через три недели после вашего отказа. '
        + 'Обвинения ему не предъявили, накладные остались в ведомстве. '
        + 'Рядом напечатан ваш ответ по защищённой линии. Семья благодарит тех, кто добивался освобождения; вашей фамилии в списке нет.',
      { internalLegitimacy: -3 }),
  ];
  return {
    cardId: `call:${slot}:${caller.id}`, title: JOURNALIST_CALL_TITLE, source: 'Защищённая линия',
    description: `${caller.name}, ${caller.role.toLowerCase()}, звонит из редакции. Корреспондента задержали `
      + 'у заводского склада, когда он сверял накладные. В журнале управления есть его имя, но основания семье не называют. '
      + 'Секретарь кладёт перед вами номер записи. Редактор просит не общих гарантий: «Мне нужно, чтобы он вышел, '
      + 'а семья узнала, почему его держат».',
    isCritical: false, affectedFactions: [faction.id, ...security.map(group => group.id)],
    choices, council: null, randomEvent: null,
    special: { kind: 'call', figure: caller.id, faction: faction.id },
    call: { figure: caller.id, trait: traitOf(state.seed, caller, faction.bloc),
      demand: '«Проверьте, где наш корреспондент и на каком основании его держат. Что именно вы готовы поручить?»',
      negotiation: 'journalist', context: memory },
  };
}
