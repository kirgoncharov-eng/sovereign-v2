import type { GameState } from './types.ts';
import type { LivingWorld, WorldAction } from './living-world.ts';
export interface MinisterMandate {
    name: string;
    phase: 'offered' | 'accepted' | 'used' | 'refused' | 'expired' | 'withdrawn' | 'fulfilled' | 'departed';
    offered: number;
    due: number;
    changed: number;
    text: string;
    handover: boolean;
    usedAt?: number;
    publicPhase?: 'pending' | 'checking' | 'closed';
}
export const mandatePresent = (world: LivingWorld) => !!world.mandate && world.people.some(p => p.id === 'minister' && p.name === world.mandate!.name);
export const mandateEnergyHelp = (world: LivingWorld) => mandatePresent(world) && ['accepted', 'used'].includes(world.mandate!.phase) && world.project.executor === 'minister';
export const mandateHousing = (world: LivingWorld) => mandatePresent(world) && world.mandate!.phase === 'used' && world.government?.programs.some(p => p.id === 'housing' && p.status === 'running');
export function ministerActions(gs: GameState): Omit<WorldAction, 'blocked'>[] {
    const m = gs.world?.mandate;
    if (!m || !mandatePresent(gs.world!))
        return [];
    if (m.phase === 'offered')
        return [
            { id: 'minister:accept', title: 'Передать министру закупки будущей жилищной программы', cost: { politicalCapital: -1 }, detail: 'Его помощь энергосети: +4 пункта работы в квартал, пока он её исполнитель. Если вы запустите жильё, министр сам отдаст закупки связанным местным подрядчикам: +5 работы, экономика −1 каждый квартал. Одновременная проверка закупок потеряет 5 пунктов работы без прямого доступа к документам. Отношение министра +6. Условие сохраняется после завершения энергосети.' },
            { id: 'minister:refuse', title: 'Оставить закупки в обычном ведении кабинета', cost: {}, detail: 'Личное вмешательство квартала; без списания ресурсов. Отношение министра −3. Он продолжит порученную энергосеть без дополнительной помощи. Будущая жилищная программа сохранит обычные закупки.' },
        ];
    if (['accepted', 'used'].includes(m.phase))
        return [{ id: 'minister:withdraw', title: 'Отозвать закупочный мандат и вернуть независимую процедуру', cost: { politicalCapital: -3, personalResource: -1 }, detail: `Министр теряет именно право на эти закупки; отношение −15. ${m.phase === 'used' ? 'Оставшиеся заказы переторгуют; передача даст −5 пунктов работы жилью в следующем квартале. Уже оплаченные заказы не возвращают деньги.' : 'Будущая жилищная программа будет работать по обычной процедуре.'} Дополнительная помощь энергосети и местных подрядчиков прекратится; личный приоритет и оплаченный резерв сохранятся.` }];
    return [];
}
export function ministerDecision(world: LivingWorld, id: string, turn: number): string {
    const m = world.mandate!, person = world.people.find(p => p.id === 'minister' && p.name === m.name)!;
    if (id === 'minister:accept') {
        m.phase = 'accepted';
        person.relation = Math.min(100, person.relation + 6);
        m.text = `${m.name} получает вашу подпись под закупочным мандатом будущей жилищной программы. «Энергосеть доведу. Потом строительные закупки идут через меня», — говорит он. Помощь энергосети +4 за квартал, если министр остаётся её исполнителем. Жильё ещё не запущено; бюджет на него не выделен. Цена будущего выбора подрядчиков и конфликт с проверкой закупок записаны в договорённости. Отношение +6.`;
    }
    else if (id === 'minister:refuse') {
        m.phase = 'refused';
        person.relation = Math.max(-100, person.relation - 3);
        m.text = `Вы оставляете закупки в ведении кабинета. ${m.name} убирает неподписанное условие в папку: «Тогда выполняю первоначальное поручение». Энергосеть сохраняет руководителя и бюджет; дополнительного ускорения нет. Отношение −3. Отказ не создаёт ему права блокировать будущую стройку.`;
    }
    else {
        const used = m.phase === 'used';
        m.handover = used;
        m.phase = 'withdrawn';
        person.relation = Math.max(-100, person.relation - 15);
        m.text = `Вы отзываете закупочный мандат. ${m.name} остаётся министром, но больше не распоряжается закупками жилья. Отношение −15. ${used ? 'Оставшиеся заказы переторгуют по обычной процедуре: передача задержит следующий квартал на 5 пунктов работы. Уже понесённая цена не возвращается.' : 'Будущий проект не наследует его выбор подрядчиков.'} Дополнительная помощь энергосети прекращена; основное поручение сохраняется.`;
    }
    m.changed = turn;
    return m.text;
}
export function stepMinister(world: LivingWorld, turn: number): string | null {
    const actor = world.people.find(p => p.id === 'minister');
    if (!world.mandate) {
        const housing = world.government?.programs.find(p => p.id === 'housing');
        if (!actor || actor.trait !== 'careerist' || world.project.status !== 'running' || world.project.executor !== 'minister' || housing?.status !== 'proposed')
            return null;
        const text = `${actor.name} сам просит встречу. «Энергосеть можно ускорить через аппарат. В следующей жилищной программе дайте мне право выбирать подрядчиков». Он хочет расширить свою власть за пределами ведомства. Условие: +4 работы энергосети сейчас; позже местные подрядчики ускорят жильё на 5 пунктов, но каждый квартал будет стоить экономики −1. Проверке закупок потребуется прямой доступ к документам, иначе она потеряет 5 пунктов работы. Ответ до конца квартала ${turn + 2}; читать письмо бесплатно.`;
        world.mandate = { name: actor.name, phase: 'offered', offered: turn, due: turn + 2, changed: turn, text, handover: false };
        return text;
    }
    const m = world.mandate;
    if (['refused', 'expired', 'withdrawn', 'fulfilled', 'departed'].includes(m.phase))
        return null;
    let text: string | null = null;
    if (!mandatePresent(world)) {
        m.phase = 'departed';
        text = `${m.name} больше не занимает эту должность. Его личная договорённость не передаётся преемнику; помощь и контроль закупок прекращаются.`;
    }
    else if (m.phase === 'offered' && turn >= m.due) {
        m.phase = 'expired';
        text = `${m.name} не получил закупочный мандат. Предложение снято; министр выполняет исходное поручение без дополнительного ускорения. Будущие закупки остаются у кабинета.`;
    }
    else if (m.phase === 'accepted' && world.government?.programs.some(p => p.id === 'housing' && p.status === 'running')) {
        m.phase = 'used';
        m.usedAt = turn;
        m.publicPhase = 'pending';
        actor!.relation = Math.min(100, actor!.relation + 3);
        text = `${m.name} воспользовался полученным правом без новой просьбы: направил жилищные заказы местным подрядчикам своего круга. Они ускоряют работу на 5 пунктов, но каждый квартал стоит экономики −1. Координатор кабинета продолжает вести программу; закупки контролирует министр. Проверяющим нужны документы — без прямого доступа работа проверки замедлится на 5 пунктов. Можно отозвать мандат или защитить проверку. Отношение министра +3.`;
    }
    else if (m.phase === 'used' && !world.government?.programs.some(p => p.id === 'housing' && p.status === 'running')) {
        m.phase = 'fulfilled';
        text = `Жилищная программа завершилась. Закупочный мандат ${m.name} относился только к ней: новых заказов и квартальных списаний по нему нет. Прежние затраты и отношения сохраняются.`;
    }
    if (text) {
        m.text = text;
        m.changed = turn;
    }
    return text;
}
export function validMinister(value: unknown, turn: number): value is MinisterMandate {
    if (!value || typeof value !== 'object')
        return false;
    const m = value as MinisterMandate;
    if (m.usedAt !== undefined && (!Number.isSafeInteger(m.usedAt) || m.usedAt <= m.offered || !['used', 'withdrawn', 'fulfilled', 'departed'].includes(m.phase) || m.usedAt > turn || !['pending', 'checking', 'closed'].includes(m.publicPhase!))) return false;
    if (m.publicPhase !== undefined && m.usedAt === undefined) return false;
    return typeof m.handover === 'boolean' && typeof m.name === 'string' && !!m.name && typeof m.text === 'string' && !!m.text
        && ['offered', 'accepted', 'used', 'refused', 'expired', 'withdrawn', 'fulfilled', 'departed'].includes(m.phase)
        && Number.isSafeInteger(m.offered) && m.offered >= 0 && m.offered <= turn
        && Number.isSafeInteger(m.due) && m.due === m.offered + 2
        && Number.isSafeInteger(m.changed) && m.changed >= m.offered && m.changed <= turn
        && (m.phase !== 'offered' || m.due > turn);
}
