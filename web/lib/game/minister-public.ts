import type { Choice, GameEvent, GameState, ResourceDelta } from './types.ts';
import { mandatePresent, ministerDecision } from './minister-mandate.ts';

export function mandatePublicEvent(gs: GameState): (GameEvent & { cardId: string }) | null {
    const m = gs.world?.mandate;
    if (gs.daily || gs.ended || gs.activeCrises.length || !m?.usedAt || !m.publicPhase || m.publicPhase === 'closed') return null;
    const checking = m.publicPhase === 'checking';
    const current = mandatePresent(gs.world!) && ['accepted', 'used'].includes(m.phase);
    const answer = (id: string, text: string, hint: string, response: NonNullable<Choice['mandateResponse']>, res: ResourceDelta, scene: string): Choice => ({
        id, text, hint, tags: ['dialogue'], resolvesCrisis: null,
        mandateResponse: response, deal: { pure: true, res }, scene,
    });
    const choices: Choice[] = [answer('a', checking ? 'Опубликовать документы и признать цену ускорения' : 'Запросить документы для открытой проверки',
        checking ? 'Легитимность +4; отношение министра −10. Закупочный порядок сохраняется.' : 'Политкапитал −1, личный ресурс −2; отношение министра −8. Документы придут к ближайшему свободному главному делу; стройка продолжается.',
        checking ? 'publish' : 'check', checking ? { internalLegitimacy: 4 } : { politicalCapital: -1, personalResource: -2 },
        checking ? 'Вы выкладываете договоры и называете цену ускорения. Журналисты могут проверить вашу версию по документам. Это не возвращает потраченные деньги и не меняет поставщиков.' : 'Вы подписываете требование передать договоры напрямую пресс-службе и проверяющим. Министр лишается возможности отвечать вместо документов. Стройка продолжится по действующему порядку.')];
    choices.push(answer('b', 'Защитить своё решение: скорость строительства важнее', 'Легитимность −3; отношение министра +4. Действующий порядок закупок сохраняется.', 'defend', { internalLegitimacy: -3 }, 'Вы подтверждаете, что выбрали ускорение сознательно. Аппарат получает защиту, но общество слышит политическое оправдание вместо независимой проверки. Прежние расходы сохраняются.'));
    if (current) choices.push(answer('c', 'Отозвать закупочный мандат и объяснить уступку', 'Легитимность +2, политкапитал −3, личный ресурс −1; отношение министра −15. Если заказы ещё исполняются: передача −5 работы на один квартал, ускорение и доплата прекращаются.', 'withdraw', { internalLegitimacy: 2, politicalCapital: -3, personalResource: -1 }, 'Вы признаёте свою подпись и возвращаете оставшиеся закупки независимой процедуре. Уже оплаченные заказы не отменяются задним числом.'));
    return {
        cardId: checking ? 'minister-public:documents' : 'minister-public:signature',
        title: checking ? 'Договоры на столе' : 'Ваша подпись под чужими заказами', source: 'Пресс-служба',
        isCritical: false, affectedFactions: [], randomEvent: null, choices,
        description: `На утреннем брифинге пресс-секретарь кладёт перед вами жилищные договоры. «Редакция спрашивает, почему подрядчиков выбирал ${m.name}. У них есть распоряжение с вашей подписью».\n\nВ квартале ${m.usedAt} министр действительно воспользовался переданным правом и направил заказы подрядчикам своего круга. Их помощь даёт жилью +5 работы за квартал исполнения, цена — экономика −1. ${current ? 'Мандат ещё действует; дополнительная цена взимается только пока кабинет исполняет программу.' : 'Теперь мандат не действует, но прежняя подпись и оплаченные заказы остались.'}\n\n${checking ? 'Получены распоряжение и договоры: они подтверждают выбор связанных подрядчиков и цену ускорения. Доказательств личного присвоения денег в этих документах нет. Проверка закупок кабинетом, если вы её запускали, остаётся отдельной программой; этот запрос её не завершает.' : 'Связь подрядчиков с министром известна. Хищение не установлено. Вы можете потребовать документы, защитить политический выбор или прекратить оставшееся полномочие.'}\n\nЭто главное дело квартала. Ответ продвинет время; личное поручение кабинету остаётся отдельным действием.`,
    };
}

export function respondToMandate(gs: GameState, response: NonNullable<Choice['mandateResponse']>) {
    const event = mandatePublicEvent(gs);
    if (!event?.choices.some(c => c.mandateResponse === response)) return null;
    const world = { ...gs.world!, mandate: { ...gs.world!.mandate! }, people: gs.world!.people.map(p => ({ ...p })) };
    const m = world.mandate;
    const person = world.people.find(p => p.id === 'minister' && p.name === m.name);
    if (response === 'withdraw') ministerDecision(world, 'minister:withdraw', gs.turn);
    else if (person) person.relation = Math.max(-100, Math.min(100, person.relation + (response === 'check' ? -8 : response === 'publish' ? -10 : 4)));
    m.publicPhase = response === 'check' ? 'checking' : 'closed';
    const text = response === 'withdraw' ? m.text : response === 'check' ? `Вы потребовали документы напрямую. ${m.name} теряет контроль над объяснением закупок; отношение −8, если он остаётся министром. Документы будут на столе к ближайшему свободному главному делу; обязательные события могут прийти раньше. Исполнение программы и цена действующего мандата сохраняются.` : response === 'publish' ? 'Распоряжение и договоры опубликованы. Общество получило проверяемый ответ; доказательств присвоения денег нет. Закупочный порядок сам по себе не изменился.' : 'Вы публично защитили подписанную уступку. Вопрос закрыт политическим ответом; условия исполнения и прежняя цена сохраняются.';
    m.text = text;
    m.changed = gs.turn;
    return { world, text };
}
