import type { Choice, GameEvent, GameState, ResourceDelta } from './types.ts';
import type { LivingWorld, WorldAction } from './living-world.ts';

export interface HousingNext {
    mode: 'settle' | 'expand' | null;
    status: 'proposed' | 'running' | 'completed' | 'partial' | 'failed';
    originProgress: number;
    previousName: string;
    progress: number;
    started: number | null;
    due: number | null;
    coordinator: string | null;
    name: string | null;
    reviewed: boolean;
    factors: string[];
}
export const housingNextTitle = (p: HousingNext) => p.mode === 'expand' ? 'Строительство следующего района' : p.originProgress === 100 ? 'Заселение и сети построенного района' : 'Достройка, сети и заселение';
export function housingNextActions(gs: GameState): Omit<WorldAction, 'blocked'>[] {
    const p = gs.world?.government?.housingNext;
    if (!p || p.status !== 'proposed') return [];
    const common = 'Бюджет на четыре квартала, одно личное поручение на запуск. Координатор даёт 18–26 работы в квартал по квалификации; слабая экономика −6, конфликт с регионами −5, параллельная программа того же координатора −5. Прежний координатор получает +3 работы, если остаётся в кабинете; иначе его заменит текущий советник. Работающая энергосеть даёт +3, полная проверка закупок — +3. Прежнее закупочное право министра сюда не переносится.';
    return [{ id: 'government:start:settle', title: p.originProgress === 100 ? 'Подключить район к сетям и начать заселение' : 'Достроить район и подготовить заселение', cost: { economy: -4, politicalCapital: -2 }, detail: `${common} ${p.originProgress < 100 ? 'Недостроенные дома: −4 работы в квартал. ' : ''}Полное исполнение: легитимность +5, экономика +2. Частичное: легитимность +1; провал: −2. Деньги уже построенного жилья не списываются повторно.` },
        ...(p.originProgress === 100 ? [{ id: 'government:start:expand', title: 'Направить строительную команду в следующий район', cost: { economy: -6, politicalCapital: -3 }, detail: `${common} Новая площадка требует согласований: −4 работы в квартал. Полное исполнение: экономика +7, легитимность +2. Частичное: легитимность +1; провал: −2. Это новые дома: сети и заселение первого района этим поручением не финансируются.` }] : [])];
}
export function startHousingNext(gs: GameState, world: LivingWorld, mode: 'settle' | 'expand') {
    const p = world.government!.housingNext!;
    const advisor = gs.advisors.find(a => a.name === p.previousName) ?? gs.advisors.find(a => a.id === 'economist') ?? gs.advisors[0];
    Object.assign(p, { mode, status: 'running', started: gs.turn, due: gs.turn + 4, coordinator: advisor.id, name: advisor.name });
    p.factors = ['Новое поручение подписано; первый квартальный доклад после главного решения'];
    return `${advisor.name} принимает «${housingNextTitle(p)}». Первая программа сохранила ${p.originProgress}% работы. ${mode === 'expand' ? 'Строители переходят на новую площадку; подключение первого района ещё не профинансировано.' : 'Теперь результат измеряется готовностью района к жизни: дома, сети и заселение, а не только строительным объёмом.'} ${advisor.name === p.previousName ? 'Он знает прежнюю стройку: преемственность +3 работы.' : `Прежний координатор ${p.previousName} не в кабинете; его личный опыт не присвоен преемнику.`} Закупки ведёт кабинет по обычной процедуре: прежний мандат министра действует только на первую программу.`;
}
export function stepHousingNext(gs: GameState, world: LivingWorld, turn: number, review?: Choice['projectReview']) {
    const proposal = offerHousingNext(world, turn);
    if (proposal) return { story: proposal, effects: [] as { label: string; res: ResourceDelta }[] };
    const g = world.government!;
    const p = g.housingNext;
    if (!p) return { story: null, effects: [] };
    if (review?.id === 'housing-next' && ['completed', 'partial', 'failed'].includes(p.status)) p.reviewed = true;
    if (p.status !== 'running') return { story: null, effects: [] };
    const advisor = gs.advisors.find(a => a.id === p.coordinator && a.name === p.name);
    let gain = advisor ? 14 + advisor.skill * 4 : 0;
    const factors = [advisor ? `${advisor.name}: качество работы ${advisor.skill}/3` : 'Координатор ушёл; работа остановилась'];
    if (advisor) {
        if (advisor.name === p.previousName) { gain += 3; factors.push('Знание прежней стройки: +3'); }
        if (world.project.status === 'completed') { gain += 3; factors.push('Восстановленная энергосеть: +3'); }
        if (g.programs.some(p => p.id === 'procurement' && p.status === 'completed')) { gain += 3; factors.push('Проверенные закупочные процедуры: +3'); }
        if (p.mode === 'expand') { gain -= 4; factors.push('Новая площадка и согласования: −4'); }
        if (p.mode === 'settle' && p.originProgress < 100) { gain -= 4; factors.push('Остались строительные работы: −4'); }
        if (gs.resources.economy < 25) { gain -= 6; factors.push('Слабая экономика: −6'); }
        if (g.programs.some(p => p.status === 'running' && p.coordinator === advisor.id)) { gain -= 5; factors.push('Координатор ведёт другую программу: −5'); }
        if (gs.factions.some(f => f.bloc === 'regional' && f.relation < 0)) { gain -= 5; factors.push('Региональные власти задерживают согласования: −5'); }
    }
    p.progress = Math.min(100, p.progress + Math.max(0, gain));
    p.factors = factors;
    const terminal = p.progress === 100 || turn >= p.due!;
    if (terminal) {
        p.status = p.progress === 100 ? 'completed' : p.progress >= 60 ? 'partial' : 'failed';
        p.reviewed = true; // Итог опубликован вместе с исполнением, без отдельного квартала.
    }
    const res: ResourceDelta = !terminal ? {} : p.status === 'completed' ? p.mode === 'settle' ? { internalLegitimacy: 5, economy: 2 } : { economy: 7, internalLegitimacy: 2 } : { internalLegitimacy: p.status === 'partial' ? 1 : -2 };
    const text = `${p.name}: «${housingNextTitle(p)}» — ${p.progress}%. ${factors.join('. ')}. ${terminal ? p.status === 'completed' ? p.mode === 'settle' ? 'Район подключён к сетям; дома подготовлены к заселению. Это новый результат поверх прежней стройки.' : 'Новый район построен.' : 'Полного результата нет; готовность всего района не объявлена.' : 'Поручение продолжает исполняться.'}${terminal && p.mode === 'expand' ? ' Подключение и заселение первого района этим бюджетом не оплачены.' : ''}`;
    world.dispatches = [...world.dispatches, { project: 'housing' as const, id: `${turn}:housing-next:report`, turn, kind: terminal ? 'news' as const : 'report' as const, title: housingNextTitle(p), text }].slice(-24);
    return { story: text, effects: terminal ? [{ label: housingNextTitle(p), res }] : [] };
}

// Вызывается и при исполнении, и при открытии старого сохранения; наград не начисляет.
export function offerHousingNext(world: LivingWorld, turn: number): string | null {
    const g = world.government!;
    const origin = g.programs.find(p => p.id === 'housing')!;
    if (!g.housingNext && origin.reviewed && ['completed', 'partial'].includes(origin.status)) {
        g.housingNext = { mode: null, status: 'proposed', originProgress: origin.progress, previousName: origin.name!, progress: 0, started: null, due: null, coordinator: null, name: null, reviewed: false, factors: [] };
        const text = `${origin.name} приносит карту района. Строительная программа дала ${origin.progress}%, но процент стройки ещё не означает готовность всех домов к жизни. Следующее поручение может оплатить ${origin.progress === 100 ? 'сети и заселение либо перенести команду на новую площадку' : 'оставшиеся работы, сети и заселение'}. В «Правительство → Жилищная программа» есть бюджет, срок и условия; читать бесплатно, решение необязательно.`;
        world.dispatches = [...world.dispatches, { project: 'housing' as const, id: `${turn}:housing-next:proposal`, turn, kind: 'letter' as const, title: 'После стройки: что получат жители?', text }].slice(-24);
        return text;
    }
    return null;
}
export function housingNextReview(gs: GameState): (GameEvent & { cardId: string }) | null {
    const p = gs.world?.government?.housingNext;
    if (!p || gs.daily || gs.ended || gs.activeCrises.length || p.status === 'running' || p.status === 'proposed' || p.reviewed) return null;
    return { cardId: 'housing-next:review', title: `Район после ваших решений: ${housingNextTitle(p)}`, source: 'Совет министров', isCritical: false, affectedFactions: [], randomEvent: null,
        description: `${p.name} кладёт два доклада рядом. Первая стройка: ${p.originProgress}%. Новое поручение: ${p.progress}%. ${p.factors.join('. ')}.\n\n${p.status === 'completed' && p.mode === 'settle' ? 'Теперь дома и сети подготовлены к заселению; строительная программа стала местом для жизни.' : p.mode === 'expand' ? 'Вы направили деньги в следующий район. Подключение и заселение первого района не входили в эту подпись — их нельзя объявить выполненными.' : 'Не все работы закончены: пресс-служба не может назвать весь район готовым к заселению.'}\n\nРасходы и результат уже отражены в ресурсах. Обсуждение доклада не выплачивает их повторно.`,
        choices: [{ id: 'a', text: 'Лично представить фактический результат', hint: 'Политкапитал −1; взять объяснение результата на себя', tags: ['dialogue'], resolvesCrisis: null, deal: { pure: true, res: { politicalCapital: -1 } }, projectReview: { id: 'housing-next' }, scene: 'Вы называете выполненные работы и то, что осталось за пределами поручения. Прежнее обещание не подменено новым отчётом.' }, { id: 'b', text: 'Поручить координатору опубликовать оба доклада', hint: 'Без дополнительных списаний; оба результата сохраняются', tags: ['delay'], resolvesCrisis: null, deal: { pure: true }, projectReview: { id: 'housing-next' }, scene: `${p.name} публикует строительный и новый доклад рядом. Кабинет отвечает за точность, а прежняя подпись остаётся в истории.` }] };
}
export function validHousingNext(p: HousingNext, turn: number) {
    if (!p || !['proposed', 'running', 'completed', 'partial', 'failed'].includes(p.status) || !Number.isInteger(p.originProgress) || p.originProgress < 60 || p.originProgress > 100 || typeof p.previousName !== 'string' || !p.previousName || !Number.isInteger(p.progress) || p.progress < 0 || p.progress > 100 || typeof p.reviewed !== 'boolean' || !Array.isArray(p.factors) || !p.factors.every(f => typeof f === 'string')) return false;
    if (p.status === 'proposed') return p.mode === null && p.started === null && p.due === null && p.name === null && p.coordinator === null && p.progress === 0 && !p.reviewed;
    if (!['settle', 'expand'].includes(p.mode!) || p.mode === 'expand' && p.originProgress !== 100 || !Number.isInteger(p.started) || p.started! < 0 || p.started! > turn || p.due !== p.started! + 4 || typeof p.name !== 'string' || !p.name || typeof p.coordinator !== 'string' || !p.coordinator) return false;
    return p.status === 'running' ? p.due! > turn && p.progress < 100 && !p.reviewed : p.status === 'completed' ? p.progress === 100 : p.due! <= turn && (p.status === 'partial' ? p.progress >= 60 && p.progress < 100 : p.progress < 60);
}
