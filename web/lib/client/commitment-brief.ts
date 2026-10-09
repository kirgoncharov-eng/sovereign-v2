import type { GameState } from '../game/types.ts';
import { livingActions } from '../game/living-world.ts';
import { mandateEnergyHelp, mandateHousing, mandatePresent } from '../game/minister-mandate.ts';
import { sponsorPresent, sponsorPressure, sponsorSupport } from '../game/sponsor-world.ts';
import { governmentProject, PROJECTS } from '../game/government.ts';
export interface CommitmentBrief {
    id: string;
    title: string;
    active: boolean;
    received: string;
    promised: string;
    price: string;
    next: string;
    target: {
        kind: 'person';
        name: string;
        message: string;
    } | {
        kind: 'project';
        id: 'health';
    } | {
        kind: 'government';
        id: string;
    };
}
// A view of existing facts: opening this list never grants help or advances time.
export function commitmentBriefs(gs: GameState): CommitmentBrief[] {
    if (gs.daily || !gs.world)
        return [];
    const world = gs.world, result: CommitmentBrief[] = [];
    const m = world.mandate, s = world.sponsor;
    const actions = livingActions(gs);
    const nextAction = (id: string, fallback: string, title?: string) => {
        const action = actions.find(a => a.id === id);
        return action ? `${title ?? action.title}.${action.blocked ? ` Сейчас: ${world.lastActionTurn === gs.turn ? 'личное поручение квартала уже подписано' : action.blocked}.` : ' Доступно в этом квартале.'}` : fallback;
    };
    if (m && m.phase !== 'offered') {
        const housing = world.government?.programs.find(p => p.id === 'housing');
        const active = mandatePresent(world) && (m.phase === 'accepted' || m.phase === 'used' && housing?.status === 'running');
        const building = !!mandateHousing(world) && !!gs.advisors.find(a => a.id === housing?.coordinator && a.name === housing.name);
        const helping = active && world.project.status === 'running' && mandateEnergyHelp(world);
        result.push({
            id: 'minister', title: `${m.name} · закупки жилья`, active,
            received: building ? helping ? 'Энергосеть получает +4 работы, жильё — +5 за квартал.' : 'Жильё: +5 работы за квартал.' : helping ? 'Энергосеть получает +4 работы за квартал.' : 'Дополнительная помощь энергосети сейчас не действует.',
            promised: active ? 'Закупки одной жилищной программы — под контролем министра, даже после завершения энергосети.' : m.phase === 'withdrawn' ? 'Закупочное право отозвано.' : m.phase === 'fulfilled' ? 'Мандат одной жилищной программы исполнен.' : m.phase === 'departed' ? 'Личная договорённость прекратилась с уходом министра.' : 'Закупочное право не передано.',
            price: building ? `Экономика −1 за квартал исполнения.${world.government?.programs.some(p=>p.id==='procurement'&&p.status==='running'&&!p.supported)?' Проверка без прямого доступа к документам: −5 работы.':''}` : active && housing?.status === 'proposed' ? 'Сейчас квартальных списаний по мандату нет. При запуске жилья: +5 работы, экономика −1 за квартал; проверяющим нужны документы.' : m.phase === 'withdrawn' && m.handover && m.changed === gs.turn && housing?.status === 'running' ? 'Отзыв уже оплачен; следующий квартал жилья потеряет 5 работы на передачу закупок.' : 'Новых квартальных списаний по этому мандату сейчас нет.',
            next: active ? nextAction('minister:withdraw', 'Откройте договорённость для проверки полномочий.', 'Отзыв мандата') : 'Итог сохранён; новых поручений по этой договорённости нет.',
            target: { kind: 'person', name: m.name, message: 'minister-mandate' },
        });
    }
    if (s && s.phase !== 'offered') {
        const present = sponsorPresent(gs), running = world.project.status === 'running';
        const finishedEnergy = ['completed', 'partial', 'failed'].includes(world.project.status);
        const active = present && !['independent', 'released', 'departed'].includes(s.phase) && (!finishedEnergy || ['accepted', 'demanding'].includes(s.phase));
        const support = present && running && sponsorSupport(world), pressure = present && running && sponsorPressure(world);
        result.push({
            id: 'sponsor', title: `${s.name} · поставки энергосети`, active,
            received: support ? 'Адаптация оборудования снимает задержку и даёт +5 работы за квартал.' : pressure ? 'Помощь не действует; его компании задерживают поставки: −8 работы за квартал.' : running ? 'Дополнительная помощь сейчас не действует.' : 'Энергопрограмма закончена; ускорение или задержки поставок уже не меняют её итог.',
            promised: ['accepted', 'demanding', 'confirmed'].includes(s.phase) ? 'Сохранить заказы его компаниям в этой энергопрограмме.' : s.phase === 'independent' ? 'Поставки переведены на независимый договор.' : 'Действующего обещания сохранить заказы нет.',
            price: !active ? 'Новых списаний по поставкам сейчас нет; прежние затраты сохраняются.' : s.phase === 'accepted' ? `При подтверждении условия: политкапитал −2. Он потребует подтверждения в квартале ${s.due}.` : s.phase === 'demanding' ? `Подтверждение: политкапитал −2; ответ до конца квартала ${s.deadline}.` : s.phase === 'confirmed' ? 'Подтверждение уже оплачено; регулярного списания за помощь нет.' : pressure ? 'Цена продолжающейся зависимости — задержка работы, а не квартальное списание бюджета.' : 'Новых списаний по поставкам сейчас нет; прежние затраты сохраняются.',
            next: active ? `${s.phase === 'demanding' ? nextAction('sponsor:confirm', 'Откройте требование.', 'Подтверждение заказов') + ' ' : ''}${nextAction('sponsor:independent', 'Новых действий по поставкам сейчас нет.', 'Независимый поставщик')}` : 'Рычаг поставок закрыт. Политическая история кампании остаётся.',
            target: { kind: 'person', name: s.name, message: 'sponsor' },
        });
    }
    const story = world.health?.aftermath, bargain = story?.bargain;
    if (story && bargain?.phase === 'answered') {
        const active = story.phase === 'working' || bargain.reviewDue !== null;
        const minister = world.people.find(p => p.id === 'healthMinister')!;
        result.push({
            id: 'health', title: 'Больницы · полномочия и график', active,
            received: !active ? 'Исполнение соглашения завершено; итог остаётся в больничных докладах.' : bargain.choice === 'minister' ? 'Министерский контроль помогает согласовать график.' : bargain.choice === 'doctor' ? 'Независимый мандат защищает выездные дни врача.' : 'Назначения согласуются совместно; исполнение зависит от сотрудничества и бюджета.',
            promised: bargain.choice === 'minister' ? `Контроль назначений и координация переданы ведомству ${minister.name}.` : bargain.choice === 'doctor' ? 'Главный врач утверждает выездные дни; ведомство не может отменять их прежним способом.' : 'Согласовывать назначения совместно, сохраняя главного врача исполнителем.',
            price: bargain.reviewDue !== null ? `Политкапитал −2 при проверке назначений в квартале ${bargain.reviewDue}; это отложенная цена уже переданных полномочий.` : 'Подпись уже оплачена; нового регулярного списания по соглашению нет.',
            next: story.phase === 'working' ? `Итоговый доклад — квартал ${story.due}.${bargain.reviewDue !== null ? ` Проверка назначений — квартал ${bargain.reviewDue}.` : ''}` : bargain.reviewDue !== null ? `Следующий шаг ведомства — проверка назначений в квартале ${bargain.reviewDue}.` : 'Итог и прежние полномочия доступны в докладах больниц.',
            target: { kind: 'project', id: 'health' },
        });
    }
    const priority = world.government?.priority;
    if (priority) {
        const project = governmentProject(world, priority), title = PROJECTS.find(p => p.id === priority)!.title;
        result.push({
            id: 'priority', title: `Ваш личный приоритет · ${title}`, active: true,
            received: project.status !== 'running' || 'coordinator' in project && !gs.advisors.some(a => a.id === project.coordinator && a.name === project.name) ? 'Исполнение сейчас не получает дополнительного ускорения.' : gs.resources.personalResource > 4 ? 'Президентское внимание даёт +5 работы за квартал исполнения.' : 'Личный ресурс на пороге 4 или ниже: дополнительное ускорение не действует.',
            promised: 'Вы публично отвечаете за полный результат этой программы.',
            price: `${gs.resources.personalResource > 4 ? 'Личный ресурс −1 за квартал. ' : 'Квартальное списание личного ресурса приостановлено. '}Полный успех: легитимность +3; неполный итог: −4.`,
            next: `Итоговая проверка — квартал ${'deadline' in project ? project.deadline : project.due}. ${nextAction('government:release', 'Приоритет остаётся в поручении.', 'Снять личный приоритет')}`,
            target: { kind: 'government', id: priority },
        });
    }
    return result;
}
