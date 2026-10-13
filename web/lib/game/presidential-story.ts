import { ALTERNATE_COUNTRY } from './alternate-world.ts';
import type { Choice, GameState } from './types.ts';
import { ADVISOR_ROLES } from './data.ts';

export function hasPresidentialCouncil(state: GameState): boolean {
    return state.country === ALTERNATE_COUNTRY && !!state.currentEvent?.council?.length
        && state.currentEvent.council.every(proposal => state.currentEvent!.choices.some(choice => choice.id === proposal.id));
}

/** The council discusses the signed document. It must not silently replace its policy. */
export function presidentialCouncil(state: GameState): Choice[] | null {
    if (state.country !== ALTERNATE_COUNTRY) return null;
    const event = state.currentEvent;
    if (!event || event.beat || event.special || event.call || event.press || event.budget
        || event.choices.some(choice => choice.mandateResponse || choice.projectReview)) return [];
    return event.choices.map(choice => ({ ...choice }));
}

const FACTORY_DEBATE = [
    [
        ['economist', 'Зарплату можно выплатить из казны. Но деньги надо довести до рабочих: на общем счёте их заберёт банк.'],
        ['strategist', 'И директор останется на месте? Через месяц принесёт такую же ведомость.'],
        ['economist', 'Поэтому вместе с выплатой — проверка договоров. Спасаем людей, а не подпись директора.'],
    ],
    [
        ['diplomat', 'Покупатель может дать аванс под трёхлетний заказ. Завод вернётся к работе, казну сейчас не трогаем.'],
        ['economist', 'Сейчас. А цену поставки мы закрепим на три года. Если детали подорожают, кто покроет разницу?'],
        ['diplomat', 'Это наша уступка за деньги сегодня. Подпишем — потом уже нельзя будет сделать вид, что о цене не знали.'],
    ],
    [
        ['economist', 'Нужно менять производство и защитить тех, кому не останется места. Это дороже, чем просто переждать.'],
        ['strategist', 'У проходной ждут зарплату. Вы предлагаете людям ещё и увольнения. Они услышат именно это.'],
        ['economist', 'Тогда придётся объяснять переход лично. И платить за него. Одним обещанием новых рабочих мест не обойдёмся.'],
    ],
] as const;

export function presidentialConversation(state: GameState, index: number) {
    const choice = state.currentEvent?.choices[index];
    if (!choice) return [];
    const authored = state.currentEvent?.card === 'alt_wages' ? FACTORY_DEBATE[index] : undefined;
    const expert = ADVISOR_ROLES.find(role => role.domain.some(tag => choice.tags.includes(tag)))?.id ?? 'strategist';
    const lines: ReadonlyArray<readonly [string, string]> = authored ?? [
        [expert, `Перед нами конкретная резолюция: «${choice.text}». ${choice.hint || 'Сначала разберём её цену.'}`],
        ['strategist', 'Расчёт — ещё не исполнение. Решайте, готовы ли вы отвечать за этот шаг, если всё пойдёт хуже плана.'],
    ];
    return lines.flatMap(([role, text]) => {
        const person = state.advisors.find(advisor => advisor.id === role);
        return person ? [{ name: person.name, role: person.role, text }] : [];
    });
}

export const REPUBLIC_PLACES = [
    { id: 'minsk', name: 'Минск', x: 170, y: 105, title: 'Кабинет и заводские проходные',
        text: 'Столица собирает налоги и раздаёт обещания. Здесь решают, кому дадут кредит, чью проверку остановят и какое письмо попадёт на ваш стол.' },
    { id: 'grodno', name: 'Гродно', x: 65, y: 92, title: 'Западные дороги',
        text: 'Пограничные склады и новые рынки. Торговый союз предлагает выход на запад, но покупатели хотят гарантий, а местные посредники — свою долю.' },
    { id: 'brest', name: 'Брест', x: 65, y: 173, title: 'Узел транзита',
        text: 'Здесь сходятся товарные составы и интересы таможни. Прибыль от открытой границы и контроль над ней редко нужны одним и тем же людям.' },
    { id: 'polesie', name: 'Полесье', x: 211, y: 192, title: 'Дальше от столицы',
        text: 'Посёлки, хозяйства и районные больницы. Указ доходит сюда быстрее, чем деньги. Между подписью президента и её исполнением стоит областная власть.' },
] as const;
