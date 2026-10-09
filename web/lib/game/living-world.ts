import { respondToMandate } from './minister-public.ts';
import { ministerActions, ministerDecision, stepMinister, mandateEnergyHelp, validMinister, type MinisterMandate } from './minister-mandate.ts';
import { cloneGovernment, ensureGovernment, governmentActions, governmentDecision, governmentLoad, priorityWork, publishSavedGovernmentReports, stepGovernment, validGovernment, type GovernmentState } from './government.ts';
import { ensureSponsor, sponsorActions, sponsorDecision, sponsorPressure, sponsorSupport, stepSponsor, validSponsor, type SponsorState } from './sponsor-world.ts';
import { healthNeedsAttention } from './health-aftermath.ts';
// Первый живой регион: поручение развивается вместе с кварталами основной партии.
// Модель не знает React и не бросает скрытый кубик: причины исполнения сохраняются в докладах.
import { cloneHealthProject, healthActions, healthDecision, newHealthProject, projectFinished, stepHealthProject, validHealthProject, type HealthProject } from './living-health.ts';
import { NAMES } from '../content/narration.ts';
import { traitOf } from './people.ts';
import type { TraitId } from './people.ts';
import type { GameState, ResourceDelta, Choice } from './types.ts';
export type WorldPersonId = 'minister' | 'governor' | 'engineer' | 'healthMinister' | 'doctor';
export interface WorldPerson {
    id: WorldPersonId;
    name: string;
    role: string;
    competence: 1 | 2 | 3;
    relation: number;
    trait: TraitId;
    goal: string;
    figure?: string;
}
export interface WorldDispatch {
    project?: 'energy' | 'health' | 'procurement' | 'exports' | 'housing';
    id: string;
    turn: number;
    kind: 'letter' | 'decision' | 'report' | 'inspection' | 'news';
    title: string;
    text: string;
}
export interface EnergyProject {
    priority?: 'balanced' | 'industry' | 'households';
    status: 'unassigned' | 'running' | 'completed' | 'partial' | 'failed';
    executor: WorldPersonId | null;
    deadline: number;
    progress: number;
    reported: number;
    funds: number;
    secured: boolean;
    inspected: boolean;
    procurementFixed: boolean;
    deal: boolean;
    cover: boolean;
    verified: {
        turn: number;
        progress: number;
    } | null;
    lastFactors: string[];
}
export interface LivingWorld {
    version: 1;
    mandate?: MinisterMandate;
    government?: GovernmentState;
    inboxRead?: Record<string, string>;
    sponsor?: SponsorState;
    openedTurn: number;
    lastTick: number;
    lastActionTurn: number | null;
    people: WorldPerson[];
    project: EnergyProject;
    health?: HealthProject;
    dispatches: WorldDispatch[];
}
const hash = (...parts: (string | number)[]) => {
    let h = 2166136261;
    for (const c of parts.join('|')) {
        h ^= c.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};
const done = projectFinished;
const bounded = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
const append = (world: LivingWorld, d: Omit<WorldDispatch, 'id'>): LivingWorld => ({
    ...world, dispatches: [...world.dispatches, {
            project: 'energy' as const, ...d, id: `${d.turn}:${d.kind}:${world.dispatches.length}`
        }].slice(-24)
});
export function openLivingWorld(gs: GameState): GameState {
    if (gs.daily || gs.ended) return gs;
    if (gs.world?.health) return publishSavedGovernmentReports(ensureGovernment(ensureSponsor(gs)));
    const previous = gs.world;
    const used = new Set([...(previous?.people.map(person => person.name) ?? []), gs.leader.name, ...gs.keyFigures.map(f => f.name), ...gs.advisors.map(entry => entry.name), ...(gs.former ?? [])]);
    const pool = NAMES[gs.country] ?? NAMES['Беларусь'];
    const name = (slot: string) => {
        for (let i = 0; i < 200; i++) {
            const h = hash(gs.seed, 'world-name', slot, i);
            const n = `${pool.first[h % 8]} ${pool.last[(h >>> 5) % pool.last.length]}`;
            if (!used.has(n)) {
                used.add(n);
                return n;
            }
        }
        return `${pool.first[0]} ${pool.last[0]}`;
    };
    const regional = gs.keyFigures.find(f => gs.factions.find(g => g.id === f.faction)?.bloc === 'regional');
    const people: WorldPerson[] = previous ? [...previous.people] : [
        {
            id: 'minister', name: name('minister'), role: 'Министр энергетики', competence: 2, relation: 45, trait: 'careerist', goal: 'Сдать проект вовремя и сохранить положение в кабинете'
        },
        {
            id: 'governor', name: regional?.name ?? name('governor'), role: regional?.role ?? 'Глава промышленного региона', competence: 2, relation: regional?.relation ?? 15, trait: regional ? traitOf(gs.seed, regional, 'regional') : 'apparatchik', goal: 'Сохранить влияние местных подрядчиков', ...(regional ? {
                figure: regional.id
            } : {})
        },
        {
            id: 'engineer', name: name('engineer'), role: 'Главный инженер энергосети', competence: 3, relation: 8, trait: 'idealist', goal: 'Восстановить надёжную сеть, не жертвуя качеством ради срока'
        },
    ];
    people.push({
        id: 'healthMinister', name: name('healthMinister'), role: 'Министр здравоохранения', competence: 2, relation: 45, trait: 'careerist', goal: 'Открыть районные отделения в срок и сохранить самостоятельность ведомства'
    }, {
        id: 'doctor', name: name('doctor'), role: 'Главный врач районной больницы', competence: 3, relation: 12, trait: 'idealist', goal: 'Закрепить специалистов на постоянных ставках и не оголить соседние больницы'
    });
    let world: LivingWorld = previous ? {
        ...previous, people, health: newHealthProject(gs.turn)
    } : {
        version: 1, openedTurn: gs.turn, lastTick: gs.turn, lastActionTurn: null, people, health: newHealthProject(gs.turn), project: {
            priority: 'balanced', status: 'unassigned', executor: null, deadline: gs.turn + 4, progress: 0, reported: 0, funds: 0, secured: false, inspected: false, procurementFixed: false, deal: false, cover: false, verified: null, lastFactors: []
        }, dispatches: []
    };
    if (!previous)
        world = append(world, {
            turn: gs.turn, kind: 'letter', title: 'Промышленный регион · письмо из диспетчерской', text: `Директор энергосети просит заменить изношенные узлы в течение года. Сейчас электричество отключают по графику; заводы заканчивают смены раньше. За соседним столом ${people[0].name} предлагает взять работу под личный контроль. ${people[2].name} предупреждает: нынешний поставщик требует переделки оборудования. Новый договор обойдётся дороже, а местные подрядчики готовы адаптировать поставку, если сохранят заказы. Заводы требуют подключить их первыми; районная больница просит не отодвигать жилые кварталы.`
        });
    world = append(world, {
        project: 'health', turn: gs.turn, kind: 'letter', title: 'Районные больницы · письмо главного врача', text: `${people.find(person => person.id === 'doctor')!.name} просит укомплектовать районные отделения в течение года. Кабинеты и койки есть, но специалистов не хватает. ${people.find(person => person.id === 'healthMinister')!.name} предлагает постоянный набор; местные власти могут согласовать назначения, но уже участвуют в восстановлении энергосети. Временный перевод врачей даст быстрый результат за счёт областных больниц.`
    });
    return publishSavedGovernmentReports(ensureGovernment(ensureSponsor({ ...gs, world })));
}
export function worldPerson(gs: GameState, id: WorldPersonId): WorldPerson | undefined {
    const person = gs.world?.people.find(project => project.id === id);
    if (!person)
        return;
    const figure = person.figure && gs.keyFigures.find(f => f.id === person.figure);
    return {
        ...person, ...(figure ? {
            name: figure.name, relation: figure.relation
        } : {})
    };
}
export interface WorldAction {
    id: string;
    title: string;
    detail: string;
    cost: ResourceDelta;
    blocked: string | null;
}
export function livingActions(gs: GameState): WorldAction[] {
    const world = gs.world;
    if (!world)
        return [];
    const project = world.project;
    const list: Omit<WorldAction, 'blocked'>[] = [];
    if (project.status === 'unassigned')
        for (const actor of world.people.filter(person => ['minister', 'governor', 'engineer'].includes(person.id))) {
            const person = worldPerson(gs, actor.id)!;
            list.push({
                id: `appoint:${actor.id}`, title: `Поручить проект: ${person.name}`, detail: `${person.role}. Компетенция ${person.competence}/3, отношение к вам ${person.relation > 0 ? '+' : ''}${person.relation}. ${person.goal}. Срок — конец квартала ${project.deadline}; осталось ${Math.max(0, project.deadline - gs.turn)} кв. Он отсчитывается от начала правления, назначение его не продлевает. Без исполнителя работа не начнётся.${world.health?.status === 'running' && world.health.executor === person.id ? ' Уже руководит больницами: оба проекта будут идти медленнее.' : ''}`, cost: {
                    economy: -4, politicalCapital: -2
                }
            });
        }
    if (project.status === 'running') {
        list.push({
            id: 'visit', title: 'Поехать в промышленный регион', detail: 'Увидеть состояние сети, согласовать работу с инженерами и местной администрацией. Даст политическую защиту исполнителю.', cost: {
                personalResource: -2, politicalCapital: -1
            }
        });
        if (!project.procurementFixed && !project.deal && !sponsorSupport(world))
            list.push({
                id: 'retender', title: 'Расторгнуть договор и сменить поставщика', detail: 'Совместимое оборудование уберёт задержки. Новый договор стоит дороже, местные подрядчики потеряют заказы.', cost: {
                    economy: -3, politicalCapital: -2
                }
            });
        if (!project.secured)
            list.push({
                id: 'fund', title: 'Обеспечить резерв финансирования', detail: 'Дополнительные бригады ускорят работу. Спор о поставщике останется отдельным вопросом.', cost: {
                    economy: -4
                }
            });
        if (!project.deal && !project.procurementFixed && !sponsorSupport(world))
            list.push({
                id: 'negotiate', title: 'Договориться с местными влиятельными людьми', detail: 'Поставки получат политическую поддержку, в обмен на сохранение части местных заказов.', cost: {
                    politicalCapital: -2, externalReputation: -1
                }
            });
        for (const [priority, title, detail] of [['industry', 'Сначала подключить заводы', 'Крупные линии проще восстановить: работа ускорится, экономика получит больший эффект. Жилые районы будут ждать дольше.'], ['households', 'Сначала подключить жилые районы', 'Распределённая сеть требует больше времени. Надёжный свет в домах укрепит легитимность, эффект для экономики будет меньше.'], ['balanced', 'Сохранить равномерное восстановление', 'Распределить бригады между заводами и жилыми районами. Умеренный темп и сбалансированный результат.']])
            if (priority !== (project.priority ?? 'balanced'))
                list.push({
                    id: `priority:${priority}`, title, detail, cost: {
                        politicalCapital: -1
                    }
                });
        for (const actor of world.people.filter(person => ['minister', 'governor', 'engineer'].includes(person.id)))
            if (actor.id !== project.executor)
                list.push({
                    id: `replace:${actor.id}`, title: `Сменить руководителя: ${worldPerson(gs, actor.id)!.name}`, detail: `Работа сохранится, но передача дел задержит следующий квартал.${world.health?.status === 'running' && world.health.executor === actor.id ? ' Уже руководит больницами: оба проекта будут идти медленнее.' : ''}`, cost: {
                        politicalCapital: -3
                    }
                });
    }
    list.push(...sponsorActions(gs));
    list.push(...governmentActions(gs));
    list.push(...ministerActions(gs));
    list.push(...healthActions(world, world.people.map(person => worldPerson(gs, person.id)!)));
    return list.map(entry => ({
        ...entry, blocked: gs.daily ? 'В деле дня личные поручения недоступны' : gs.ended ? 'Правление завершено' : world.lastActionTurn === gs.turn ? 'Личное вмешательство в этом квартале уже использовано' : (entry.id.startsWith('government:start:') || entry.id.startsWith('appoint:') || entry.id.startsWith('health:appoint:')) && world.government && governmentLoad(world) >= 2 ? 'Кабинет уже ведёт две программы; дождитесь результата одной из них' : Object.entries(entry.cost).some(([k, value]) => gs.resources[k as keyof typeof gs.resources] + (value ?? 0) <= 4) ? 'Недостаточно запаса ресурса для этого поручения' : null
    }));
}
export function interveneWorld(gs: GameState, id: string): GameState {
    const action = livingActions(gs).find(entry => entry.id === id);
    if (!action || action.blocked)
        throw Error(action?.blocked ?? 'Поручение недоступно');
    let world: LivingWorld = {
        ...gs.world!, ...(gs.world!.mandate ? { mandate: { ...gs.world!.mandate } } : {}), ...(gs.world!.government ? { government: cloneGovernment(gs.world!.government) } : {}), ...(gs.world!.sponsor ? { sponsor: { ...gs.world!.sponsor } } : {}), lastActionTurn: gs.turn, project: {
            ...gs.world!.project
        }, ...(gs.world!.health ? {
            health: cloneHealthProject(gs.world!.health)
        } : {}), people: gs.world!.people.map(project => ({
            ...project
        }))
    };
    const project = world.project;
    let sponsorRelation = 0;
    let text = '';
    const kind: WorldDispatch['kind'] = 'decision';
    let factionRel: Record<string, number> = {};
    if (id.startsWith('minister:')) text = ministerDecision(world, id, gs.turn);
    if (id.startsWith('government:')) {
        const decision = governmentDecision(gs, world, id);
        text = decision.text; factionRel = decision.factions;
    }
    if (id.startsWith('sponsor:')) {
        const decision = sponsorDecision(gs, world, id);
        text = decision.text; sponsorRelation = decision.relation;
        if (id === 'sponsor:independent') factionRel = Object.fromEntries(gs.factions.filter(f => f.bloc === 'business' || f.bloc === 'regional').map(f => [f.id, -5]));
    }
    if (id.startsWith('health:'))
        text = healthDecision(world, id, personId => worldPerson({
            ...gs, world: world
        }, personId)!, gs.turn);
    if (id.startsWith('appoint:')) {
        project.executor = id.slice(8) as WorldPersonId;
        project.status = 'running';
        project.funds = 4;
        const actor = worldPerson(gs, project.executor)!;
        text = `${actor.name} получает подписанное поручение и финансирование. «Первый доклад — после следующего заседания», — говорит секретарь. Срок остаётся прежним: конец квартала ${project.deadline} от начала правления; назначение его не продлевает.`;
    }
    if (id === 'visit') {
        project.cover = true;
        const engineer = world.people.find(entry => entry.id === 'engineer')!;
        engineer.relation = bounded(engineer.relation + 10, -100, 100);
        text = `В диспетчерской ${worldPerson(gs, 'engineer')!.name} раскладывает графики ремонта. При вас руководитель проекта и местная администрация согласуют доступ бригад к объектам. Исполнитель получает право обращаться прямо в резиденцию. Инженеры предупреждают: политическая поддержка снимает сопротивление аппарата, но не решает вопрос с оборудованием.`;
    }
    if (id.startsWith('priority:')) {
        project.priority = id.slice(9) as EnergyProject['priority'];
        text = project.priority === 'industry' ? 'Выводите крупные промышленные линии в первую очередь. Директора заводов обещают вернуть смены; жилые кварталы останутся в графике отключений дольше.' : project.priority === 'households' ? 'Бригады переходят к жилым районам. Работа на распределённой сети займёт больше времени, зато первыми получат надёжное электричество дома и районные учреждения.' : 'Бригады делят между промышленными линиями и жилыми районами. Никто не получает всю мощность первым; руководителю придётся координировать два фронта работ.';
    }
    if (id === 'retender') {
        project.procurementFixed = true;
        factionRel = Object.fromEntries(gs.factions.filter(f => f.bloc === 'business' || f.bloc === 'regional').map(f => [f.id, -5]));
        text = 'Старый поставщик лишается договора. Инженеры подтверждают совместимость нового оборудования. Местные посредники теряют заказ и требуют объяснений у своих политических покровителей.';
    }
    if (id === 'fund') {
        project.secured = true;
        project.funds = Math.min(8, project.funds + 4);
        text = 'К проекту направляют дополнительные бригады и резерв денег. Руководитель получает возможность вести несколько участков одновременно. Расходы на ремонт вырастут; резерв не отменяет необходимость согласовать поставки.';
    }
    if (id === 'negotiate') {
        project.deal = true;
        project.cover = true;
        factionRel = Object.fromEntries(gs.factions.filter(f => f.bloc === 'business' || f.bloc === 'regional').map(f => [f.id, 5]));
        text = 'Местные влиятельные люди обещают убрать препятствия для поставок. Часть заказов остаётся их предприятиям. Главный инженер получает возможность согласовать адаптацию оборудования, но вам напоминают, кто обеспечил эту договорённость.';
    }
    if (id.startsWith('replace:')) {
        project.executor = id.slice(8) as WorldPersonId;
        project.lastFactors = ['Передача дел'];
        text = `${worldPerson(gs, project.executor)!.name} принимает папки и незавершённые работы. Проект не начинается заново, но ближайший квартал часть времени уйдёт на передачу дел.`;
    }
    const resources = {
        ...gs.resources
    };
    for (const [k, value] of Object.entries(action.cost))
        resources[k as keyof typeof resources] = bounded(resources[k as keyof typeof resources] + (value ?? 0));
    const labels: Partial<Record<keyof ResourceDelta, string>> = {
        economy: 'экономика', politicalCapital: 'политкапитал', personalResource: 'личный ресурс', externalReputation: 'репутация', internalLegitimacy: 'легитимность'
    };
    const price = Object.entries(action.cost).map(([k, value]) => `${labels[k as keyof ResourceDelta] ?? k} ${value}`).join(', ');
    world = append(world, {
        project: id.startsWith('government:start:') ? (['settle', 'expand'].includes(id.split(':')[2]) ? 'housing' : id.split(':')[2]) as WorldDispatch['project'] : id.startsWith('health:') ? 'health' : 'energy', turn: gs.turn, kind, title: action.title, text: `${text.trim()} Цена поручения: ${price || "без списания ресурсов; использовано личное вмешательство"}.`
    });
    const factions = gs.factions.map(f => ({
        ...f, relation: bounded(f.relation + (factionRel[f.id] ?? 0), -100, 100)
    }));
    const lastTurn = gs.lastTurn ? {
        ...gs.lastTurn, resourceChanges: {
            ...gs.lastTurn.resourceChanges
        }, factionRelChanges: {
            ...gs.lastTurn.factionRelChanges
        }, sources: {
            ...gs.lastTurn.sources
        }
    } : null;
    if (lastTurn)
        for (const [k] of Object.entries(action.cost)) {
            const key = k as keyof ResourceDelta;
            const actual = resources[key] - gs.resources[key];
            lastTurn.resourceChanges[key] = (lastTurn.resourceChanges[key] ?? 0) + actual;
            lastTurn.sources[key] = [...(lastTurn.sources[key] ?? []), [`поручение нового квартала: ${action.title}`, actual]];
        }
    if (lastTurn)
        for (const f of factions) {
            const delta = f.relation - gs.factions.find(old => old.id === f.id)!.relation;
            if (delta)
                lastTurn.factionRelChanges[f.id] = (lastTurn.factionRelChanges[f.id] ?? 0) + delta;
        }
    return {
        ...gs, lastTurn, world: world, resources, factions,
        keyFigures: sponsorRelation ? gs.keyFigures.map(f => f.id === world.sponsor!.figure && f.name === world.sponsor!.name ? { ...f, relation: bounded(f.relation + sponsorRelation, -100, 100) } : f) : gs.keyFigures
    };
}
function stepEnergyProject(gs: GameState, nextTurn: number): {
    world?: LivingWorld;
    res: ResourceDelta;
    story: string | null;
} {
    if (!gs.world || gs.daily || nextTurn <= gs.world.lastTick)
        return {
            world: gs.world, res: {}, story: null
        };
    let world: LivingWorld = {
        ...gs.world, ...(gs.world.mandate ? { mandate: { ...gs.world.mandate } } : {}), ...(gs.world.sponsor ? { sponsor: { ...gs.world.sponsor } } : {}), lastTick: nextTurn, project: {
            ...gs.world.project
        }, people: gs.world.people.map(project => ({
            ...project
        }))
    };
    const project = world.project;
    const ministerStory = stepMinister(world, nextTurn);
    if (ministerStory) world = append(world, { turn: nextTurn, kind: "letter", title: "Министр · закупочный мандат", text: ministerStory });
    const politicalStory = stepSponsor(gs, world, nextTurn);
    if (politicalStory) world = append(world, { turn: nextTurn, kind: 'decision', title: 'Политический участник · собственный ход', text: politicalStory });
    if (done(project))
        return {
            world: world, res: {}, story: [politicalStory, ministerStory].filter(Boolean).join('\n\n') || null
        };
    let story = '';
    const factors: string[] = [];
    let gain = 0;
    const business = gs.factions.filter(f => f.bloc === 'business');
    const regional = gs.factions.filter(f => f.bloc === 'regional');
    if (project.status === 'running' && project.executor) {
        const actor = worldPerson(gs, project.executor)!;
        gain = 10 + actor.competence * 8;
        if (mandateEnergyHelp(world)) { gain += 4; factors.push('Министр ускоряет работу в обмен на будущий закупочный мандат: +4'); }
        const presidential = priorityWork(gs, world, 'energy');
        if (presidential) { gain += presidential; factors.push('Личный приоритет президента ускоряет работу: +5'); }
        factors.push(`Компетенция ${actor.name}: ${actor.competence}/3`);
        if (actor.relation >= 30) {
            gain += 4;
            factors.push('Руководитель лично поддерживает ваш приоритет');
        }
        else if (actor.relation <= -20) {
            gain -= 8;
            factors.push('Руководитель не спешит исполнять ваше поручение');
        }
        if (project.funds > 0)
            project.funds--;
        else {
            gain -= 14;
            factors.push('Стартовое финансирование исчерпано');
        }
        if (project.secured) {
            gain += 6;
            factors.push('Дополнительные бригады и резерв финансирования');
        }
        if (gs.resources.economy < 25) {
            gain -= 6;
            factors.push('Слабая экономика затрудняет закупки');
        }
        if (!project.procurementFixed && !project.deal && !sponsorSupport(world) && nextTurn >= world.openedTurn + 2) {
            gain -= 10;
            factors.push('Адаптация оборудования задерживает подключение');
        }
        if (sponsorSupport(world)) { gain += 5; factors.push('Спонсор кампании согласовал адаптацию: помощь за сохранение заказов'); }
        if (sponsorPressure(world)) { gain -= 8; factors.push('Спонсор отправил нынешние поставки на дополнительные согласования'); }
        if (business.some(f => f.relation < -20) && !project.deal) {
            gain -= 7;
            factors.push('Враждебный бизнес задерживает поставки');
        }
        if (project.executor === 'engineer' && !project.cover) {
            gain -= 6;
            factors.push('Инженеру не хватает политических полномочий');
        }
        if (regional.some(f => f.relation < 0) && project.executor !== 'governor' && !project.cover) {
            gain -= 5;
            factors.push('Местный аппарат сопротивляется руководителю');
        }
        if (gs.world.health?.status === 'running' && gs.world.health.executor === project.executor) {
            gain -= 10;
            factors.push('Руководитель делит время с районными больницами');
        }
        if (project.lastFactors.includes('Передача дел')) {
            gain -= 8;
            factors.push('Передача дел новому руководителю');
        }
        const priority = project.priority ?? 'balanced';
        if (actor.trait === 'careerist' && project.secured) {
            gain += 2;
            factors.push('Карьерист использует дополнительные ресурсы ради заметного результата');
        }
        if (actor.trait === 'idealist' && project.procurementFixed) {
            gain += 4;
            factors.push('Инженер усиливает работу при совместимом оборудовании');
        }
        if (actor.trait === 'apparatchik' && project.deal) {
            gain += 4;
            factors.push('Аппаратчик использует местные связи для исполнения договорённости');
        }
        if (actor.trait === 'populist' && priority === 'households') {
            gain += 3;
            factors.push('Популист добивается быстрого результата в жилых районах');
        }
        if (actor.trait === 'pragmatist' && (project.deal || project.procurementFixed)) {
            gain += 2;
            factors.push('Прагматик ускоряет работу после согласования поставок');
        }
        if (actor.trait === 'hawk' && project.cover) {
            gain += 2;
            factors.push('Политические полномочия позволяют требовательному руководителю ускорить исполнение');
        }
        if (priority === 'industry') {
            gain += 4;
            factors.push('Приоритет крупных промышленных линий: быстрее, жилые районы ждут');
        }
        if (priority === 'households') {
            gain -= 2;
            factors.push('Приоритет жилых районов: больше распределённых участков');
        }
        // Отчёт отражает выполненную работу. Конфликт — в распределении мощности и ресурсов.
        project.progress = bounded(gs.world.project.progress + Math.max(0, gain));
        project.reported = project.progress;
        const focus = priority === 'industry' ? 'Бригады сосредоточены на заводских линиях; жилые районы ждут своей очереди.' : priority === 'households' ? 'Первыми подключают жилые районы; директора заводов требуют вернуть бригады на промышленные линии.' : 'Бригады работают и на заводских линиях, и в жилых кварталах.';
        const equipment = project.procurementFixed ? 'Новый поставщик доставляет совместимое оборудование.' : sponsorSupport(world) ? 'Компании спонсора согласовали адаптацию оборудования в обмен на сохранение заказов.' : project.deal ? 'Местные подрядчики согласовали адаптацию поставки.' : 'Адаптация нынешнего оборудования задерживает подключение. Можно сменить поставщика или сохранить местные заказы в обмен на согласованную переделку.';
        story = `${actor.name} присылает доклад: восстановлено ${project.progress}% сети. ${focus} ${equipment} ${factors.filter(f => !f.startsWith('Компетенция')).join('. ')}.`;
    }
    else {
        factors.push('Руководитель и финансирование не назначены');
        story = nextTurn - world.openedTurn < 2 ? 'Письмо из диспетчерской остаётся без поручения. Из региона спрашивают, кто будет отвечать за подготовку сети.' : 'Из региона пишут снова: без решения резиденции местные власти ограничились временным ремонтом. Предприятия продолжают работать по сокращённому графику.';
    }
    project.lastFactors = factors;
    let res: ResourceDelta = {};
    if (project.progress >= 100 || nextTurn >= project.deadline) {
        project.status = project.progress >= 100 ? 'completed' : project.progress >= 60 ? 'partial' : 'failed';
        project.reported = project.progress;
        project.verified = {
            turn: nextTurn, progress: project.progress
        };
        const priority = project.priority ?? 'balanced';
        res = project.status === 'completed' ? (priority === 'industry' ? {
            economy: 6, internalLegitimacy: 1
        } : priority === 'households' ? {
            economy: 2, internalLegitimacy: 5
        } : {
            economy: 4, internalLegitimacy: 3
        }) : project.status === 'partial' ? (priority === 'industry' ? {
            economy: 3, internalLegitimacy: -2
        } : priority === 'households' ? {
            economy: 0, internalLegitimacy: 1
        } : {
            economy: 1, internalLegitimacy: -1
        }) : {
            economy: -4, internalLegitimacy: -4
        };
        const ending = project.status === 'completed' ? 'Сеть прошла нагрузочные испытания. График отключений отменён; заводы возвращают вечерние смены.' : project.status === 'partial' ? (priority === 'households' ? 'Часть сети восстановлена. Жилые районы получают электричество надёжнее; заводские линии ещё работают с ограничениями.' : 'Часть сети восстановлена. Заводы получают электричество, но жилые кварталы по-прежнему отключают. На совещании приходится объяснять, почему обещанный результат получился лишь частично.') : 'Комиссия не принимает сеть. График отключений продлевают; владельцы предприятий сокращают смены, жители требуют назвать ответственного.';
        story = `${ending} Восстановлено ${project.progress}% сети. ${factors.join('. ')}. Результат для страны: экономика ${res.economy! > 0 ? '+' : ''}${res.economy}, легитимность ${res.internalLegitimacy! > 0 ? '+' : ''}${res.internalLegitimacy}.`;
        if (project.executor) {
            const actor = world.people.find(entry => entry.id === project.executor)!;
            if (!actor.figure)
                actor.relation = bounded(actor.relation + (project.status === 'completed' ? 8 : -10), -100, 100);
        }
    }
    if (done(project) && world.sponsor?.phase === 'pressuring') {
        world.sponsor.phase = 'released';
        world.sponsor.lastMove = 'Годовая программа завершена: прежнее давление на поставки больше не меняет её итог.';
        world.sponsor.lastMoveTurn = nextTurn;
    }
    world = append(world, {
        turn: nextTurn, kind: done(project) ? 'news' : 'report', title: done(project) ? 'Энергосеть · итоговая проверка' : 'Энергосеть · квартальный доклад', text: story
    });
    return {
        world: world, res, story: [politicalStory, ministerStory, story].filter(Boolean).join('\n\n')
    };
}
export function stepLivingWorld(gs: GameState, nextTurn: number, review?: Choice['projectReview'], response?: Choice['mandateResponse']): {
    world?: LivingWorld;
    res: ResourceDelta;
    story: string | null;
    effects: {
        label: string;
        res: ResourceDelta;
    }[];
} {
    if (!gs.world || gs.daily || nextTurn <= gs.world.lastTick)
        return {
            world: gs.world, res: {}, story: null, effects: []
        };
    const publicStory = response ? respondToMandate(gs, response) : null;
    if (publicStory) gs = { ...gs, world: publicStory.world };
    const energy = stepEnergyProject(gs, nextTurn);
    let world = {
        ...energy.world!, ...(gs.world!.health ? {
            health: cloneHealthProject(gs.world!.health)
        } : {})
    };
    const healthExecutor = world.health?.executor ? worldPerson(gs, world.health.executor) : undefined;
    const health = stepHealthProject(gs, world, nextTurn, healthExecutor);
    if (health.story)
        world = append(world, {
            project: 'health', turn: nextTurn, kind: projectFinished(world.health!) ? 'news' : 'report', title: healthNeedsAttention(world.health) ? 'Больницы · требуется решение' : world.health!.aftermath?.phase === 'working' ? 'Больницы · исполнение поручения' : projectFinished(world.health!) ? 'Больницы · результат и обязательства' : 'Больницы · квартальный доклад', text: health.story
        });
    const government = stepGovernment(gs, world, nextTurn, review);
    const res = {
        ...energy.res
    };
    for (const effect of government.effects)
        for (const [key, delta] of Object.entries(effect.res))
            res[key as keyof ResourceDelta] = (res[key as keyof ResourceDelta] ?? 0) + (delta ?? 0);
    for (const [key, delta] of Object.entries(health.res))
        res[key as keyof ResourceDelta] = (res[key as keyof ResourceDelta] ?? 0) + (delta ?? 0);
    return {
        world, res, story: [publicStory?.text, energy.story ? `Из промышленного региона. ${energy.story}` : null, health.story ? `Районные больницы. ${health.story}` : null, government.story].filter(Boolean).join('\n\n') || null,
        effects: [{
                label: 'энергосеть промышленного региона', res: energy.res
            }, {
                label: 'районные больницы', res: health.res
            }, ...government.effects]
    };
}
export function validLivingWorld(value: unknown): value is LivingWorld {
    if (!value
        || typeof value !== 'object')
        return false;
    const world = value as LivingWorld;
    const n = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x)
        && Number(x) >= min
        && Number(x) <= max;
    if (world.version !== 1
        || !n(world.openedTurn)
        || !n(world.lastTick)
        || world.lastTick < world.openedTurn
        || world.lastActionTurn !== null
        && !n(world.lastActionTurn))
        return false;
    if (!Array.isArray(world.people)
        || ![3, 5].includes(world.people.length)
        || world.people.some(entry => !entry
        || typeof entry !== 'object')
        || new Set(world.people.map(entry => entry.id)).size !== world.people.length
        || !world.people.every(entry => entry
        && ['minister', 'governor', 'engineer', 'healthMinister', 'doctor'].includes(entry.id)
        && typeof entry.name === 'string'
        && typeof entry.role === 'string'
        && typeof entry.goal === 'string'
        && n(entry.competence, 1, 3)
        && n(entry.relation, -100, 100)
        && ['careerist', 'idealist', 'hawk', 'pragmatist', 'populist', 'apparatchik'].includes(entry.trait)
        && (!entry.figure
        || typeof entry.figure === 'string')))
        return false;
    if (!['minister', 'governor', 'engineer'].every(id => world.people.some(person => person.id === id)))
        return false;
    if (world.health !== undefined
        && (!['healthMinister', 'doctor'].every(id => world.people.some(person => person.id === id))
        || !validHealthProject(world.health, world.lastTick)))
        return false;
    if (world.people.length !== (world.health === undefined ? 3 : 5))
        return false;
    if (world.sponsor !== undefined && !validSponsor(world.sponsor, world.lastTick)) return false;
    if (world.mandate !== undefined && !validMinister(world.mandate, world.lastTick)) return false;
    if (world.government !== undefined && !validGovernment(world.government, world.lastTick)) return false;
    if (world.inboxRead !== undefined && (!world.inboxRead || typeof world.inboxRead !== 'object' || Array.isArray(world.inboxRead) || Object.keys(world.inboxRead).length > 64 || !Object.values(world.inboxRead).every(v => typeof v === 'string' && v.length <= 200))) return false;
    const project = world.project;
    if (!project
        || !['unassigned', 'running', 'completed', 'partial', 'failed'].includes(project.status)
        || project.executor !== null
        && !['minister', 'governor', 'engineer'].includes(project.executor)
        || !n(project.deadline)
        || project.deadline <= world.openedTurn
        || !n(project.progress, 0, 100)
        || !n(project.reported, 0, 100)
        || !n(project.funds, 0, 8)
        || !['secured', 'inspected', 'procurementFixed', 'deal', 'cover'].every(k => typeof project[k as keyof EnergyProject] === 'boolean')
        || !Array.isArray(project.lastFactors)
        || !project.lastFactors.every(t => typeof t === 'string'))
        return false;
    if (project.priority !== undefined
        && !['balanced', 'industry', 'households'].includes(project.priority))
        return false;
    if (project.status === 'running'
        && !project.executor
        || project.status === 'unassigned'
        && project.executor
        || world.lastActionTurn !== null
        && (world.lastActionTurn < world.openedTurn
        || world.lastActionTurn > world.lastTick))
        return false;
    if (project.verified !== null
        && (!project.verified
        || !n(project.verified.turn)
        || !n(project.verified.progress, 0, 100)))
        return false;
    return Array.isArray(world.dispatches)
        && world.dispatches.length <= 24
        && world.dispatches.every(d => d
        && typeof d.id === 'string'
        && (d.project === undefined
        || ['energy', 'health', 'procurement', 'exports', 'housing'].includes(d.project))
        && n(d.turn)
        && ['letter', 'decision', 'report', 'inspection', 'news'].includes(d.kind)
        && typeof d.title === 'string'
        && typeof d.text === 'string');
}
