import { lawDef } from './laws.ts';
import { traitOf } from './people.ts';
import type { Choice, GameEvent, GameState, Bloc } from './types.ts';

// An existing calendar call negotiates a law that is actually in force.
export function pensionCall(state: GameState, slot: number, called: Set<string>): (GameEvent & { cardId: string }) | null {
    const law = state.laws?.find(l => l.id === 'pension_reform');
    if (state.daily || !law || law.transition) return null;
    const candidates = state.keyFigures.filter(f => f.name !== state.arc?.target && !called.has(f.id)
        && state.factions.some(group => group.id === f.faction && ['regional', 'liberal'].includes(group.bloc)));
    const caller = [...candidates].sort((a, b) => a.relation - b.relation)[0];
    if (!caller) return null;
    const faction = state.factions.find(f => f.id === caller.faction)!;
    const trait = traitOf(state.seed, caller, faction.bloc);
    const accepts = caller.relation >= 20 || trait === 'apparatchik' && caller.relation >= 0;
    const def = lawDef(law.id)!;
    const stance = (author: number, allies: number, foes: number) => {
        const out: Partial<Record<Bloc, number>> = {};
        for (const b of def.allies) out[b] = allies;
        for (const b of def.foes) out[b] = foes;
        out[def.bloc] = author;
        return out;
    };
    const choice = (id: string, text: string, hint: string, scene: string, details: Partial<Choice>): Choice => ({
        id, text, hint, scene, sceneFail: scene, tags: ['dialogue'], resolvesCrisis: null,
        headline: text, headlineFail: text, ...details,
    });
    const choices = [
        choice('a', 'Отменить повышение пенсионного возраста',
            'Политкапитал −4, личный ресурс −2. Закон отменяется; экономика +2 и легитимность −1 за квартал прекращаются. Кредиторы и бизнес теряют обещанную реформу.',
            `${caller.name} замолкает, когда слышит согласие. «Я передам людям. Только не присылайте вместо закона ещё одно письмо». Отмену проводят через парламент. Прежний пенсионный возраст восстановлен; бюджет больше не получает экономию от повышения. Кредиторы требуют объяснить смену курса.`,
            { tags: ['social'], politicalTags: ['social'], law: { id: law.id, act: 'repeal' }, stance: stance(-8, -4, 6), deal: { pure: true, figure: caller.id, figureRel: 12, res: { politicalCapital: -4, personalResource: -2 } } }),
        choice('b', 'Сохранить реформу и ввести льготный выход для переходной группы',
            `Экономика −3, политкапитал −2 сейчас. Люди, которым при принятии закона до пенсии оставалось не более года, сохранят прежний возраст. Дальше экономика +1 за квартал, потери легитимности от закона нет. ${accepts ? 'Собеседник готов поддержать эту уступку.' : 'Собеседник продолжит требовать полной отмены; льгота всё равно будет действовать.'}`,
            accepts
                ? `${caller.name} уточняет дату отсечения, потом берёт паузу. «Для тех, кто уже держал документы в руках? Это можно объяснить». Поправку проводят: переходная группа сохраняет прежний пенсионный возраст. Остальное повышение действует. Фонд оплачивает льготные выплаты, поэтому экономия меньше; человек на другом конце линии обещает защищать согласованный компромисс.`
                : `${caller.name} отвечает: «Для остальных это всё равно лишние пять лет». Вы проводите ограниченную поправку, сохраняя повышение для остальных. Переходная группа получает прежний возраст; экономия фонда уменьшается. Собеседник не присоединяется к вам: его лагерь продолжает добиваться полной отмены.`,
            { tags: ['social'], politicalTags: ['social'], pensionTransition: { figure: caller.id, name: caller.name }, stance: stance(-3, -2, accepts ? 4 : -2), deal: { pure: true, figure: caller.id, figureRel: accepts ? 6 : -6, res: { economy: -3, politicalCapital: -2 } } }),
        choice('c', 'Оставить закон без уступок',
            'Личный ресурс −1. Экономика +2 и легитимность −1 за квартал сохраняются. Собеседник и его лагерь отдаляются; кредиторы получают подтверждение курса.',
            `${caller.name} не повышает голос. «Тогда объяснять людям будете вы. Я больше не стану говорить, что всё ещё можно изменить». Закон остаётся прежним. Кредиторы видят подтверждение курса; собеседник публично отказывается защищать повышение пенсионного возраста.`,
            { tags: ['austerity'], politicalTags: ['austerity'], stance: stance(3, 2, -7), deal: { pure: true, figure: caller.id, figureRel: -12, res: { personalResource: -1 } } }),
    ];
    return {
        cardId: `call:${slot}:${caller.id}`, title: 'Звонок о цене пенсионной реформы', source: 'Защищённая линия',
        description: `${caller.name}, ${caller.role.toLowerCase()}, звонит после встречи с людьми, которые готовились выйти на пенсию. Вы уже подняли возраст на пять лет. «Они рассчитывали месяцы, а получили ещё пять лет. Мне нужна отмена закона, а не правильные слова». Помощник оставляет на столе расчёт фонда: повышение экономит деньги каждый квартал, но поддержка людей уходит.`,
        isCritical: false, affectedFactions: state.factions.filter(f => [def.bloc, ...def.allies, ...def.foes].includes(f.bloc)).map(f => f.id),
        choices, council: null, randomEvent: null, special: { kind: 'call', figure: caller.id, faction: faction.id },
        call: { figure: caller.id, trait, demand: '«Отмените повышение. Если не готовы — скажите, что именно вы готовы изменить для этих людей».', negotiation: 'pension', lawSince: law.since },
    };
}
