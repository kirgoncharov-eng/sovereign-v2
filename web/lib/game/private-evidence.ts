import type { Choice, GameEvent, GameState, ResourceDelta } from './types.ts';
import type { LivingWorld, WorldAction } from './living-world.ts';

// The underlying fact belongs to the already selected money arc, not to a later roll.
export interface PrivateEvidence {
    figure: string;
    name: string;
    target: string;
    opened: number;
    changed: number;
    biography: string;
    phase: 'offered' | 'checking' | 'verified';
    route: 'trusted' | 'service' | 'independent' | null;
    due: number | null;
    authority: 'none' | 'active' | 'withdrawn' | 'departed';
    usedAt?: number;
    referredAt?: number;
    networkVerifiedAt?: number;
    authoritySince?: number;
    text: string;
}
export function evidenceSource(gs: GameState) {
    const source = gs.world?.evidence;
    return source && gs.keyFigures.find(f => f.id === source.figure && f.name === source.name);
}
export function ensureEvidence(gs: GameState): GameState {
    if (!gs.world || gs.world.evidence || gs.daily || gs.ended || gs.arc?.id !== 'money'
        || gs.arc.epilogue || gs.turn >= 12) return gs;
    // A chief of staff is not silently turned into a financial-intelligence officer.
    const figure = gs.keyFigures.find(f => ['kgb', 'sbu', 'security', 'knb', 'prosecutor'].includes(f.id));
    if (!figure) return gs;
    const biographies = [
        'Начинал с финансовых расследований. Однажды передал дело наверх и увидел, как папку вернули без двух страниц. С тех пор делает вторую копию и предпочитает личные договорённости общим обещаниям.',
        'В прежнем кабинете расследовал вывод денег через подставные фирмы. Руководство сменилось раньше, чем дело дошло до суда. Теперь добивается собственного доступа к банковским данным: зависеть от чужой подписи ему надоело.',
    ];
    const index = [...figure.name].reduce((sum, c) => sum + c.codePointAt(0)!, gs.seed) % biographies.length;
    const evidence: PrivateEvidence = {
        figure: figure.id, name: figure.name, target: gs.arc.target, opened: gs.turn, changed: gs.turn,
        biography: biographies[index], phase: 'offered', route: null, due: null, authority: 'none',
        text: 'В архиве нашлась копия платёжного поручения одной из шести фирм кампании. В реквизитах — иностранный банк. «Одинаковый адрес ещё не преступление. У нас и половина министерств по одному адресу», — замечает собеседник. Копия указывает направление поиска, но не доказывает, кто стоял за переводом. Проверку можно начать по вашей инициативе.',
    };
    return { ...gs, world: { ...gs.world, evidence } };
}
export function evidenceActions(gs: GameState): Omit<WorldAction, 'blocked'>[] {
    const source = gs.world?.evidence;
    if (!source || gs.daily || gs.ended) return [];
    const person = evidenceSource(gs);
    const actions: Omit<WorldAction, 'blocked'>[] = [];
    if (source.phase === 'offered' && gs.arc?.id === 'money' && !gs.arc.epilogue && gs.turn < 11) {
        if (person && person.relation >= 20) actions.push({
            id: 'evidence:trusted', title: 'Попросить лично подготовить материалы', cost: { politicalCapital: -1 },
            detail: 'Отношение не ниже +20: он откроет имеющийся архив без новых полномочий. В следующем квартале юристы сверят копии с оригиналами. Политкапитал −1; одно личное поручение. Доверие даёт доступ, достоверность установит проверка.',
        });
        if (person) actions.push({
            id: 'evidence:service', title: 'Дать службе прямой доступ к банковским сведениям', cost: { politicalCapital: -1 },
            detail: 'Первый пакет подтверждений — в следующем квартале; иностранную цепочку служба установит через четыре квартала постоянного доступа. Служба получит право запрашивать банковские сведения без независимой санкции, включая сведения о ваших сторонниках. Пока право действует, легитимность −1 каждый квартал. Политкапитал −1 сейчас; отзыв стоит −1 и отношение источника −15. Это постоянное полномочие, а не разрешение на одно дело.',
        });
        if (gs.turn < 10) actions.push({
            id: 'evidence:independent', title: 'Проверить через независимых юристов', cost: { politicalCapital: -1, personalResource: -2 },
            detail: 'Юристы получат подтверждение переводов законным запросом. Срок — два квартала; политкапитал −1, личный ресурс −2. Расширенных полномочий служба не получит. Отношение источника не требуется.',
        });
    }
    if (source.authority === 'active' && person) actions.push({
        id: 'evidence:withdraw', title: 'Вернуть независимую санкцию на банковские запросы', cost: { politicalCapital: -1 },
        detail: 'Квартальная потеря легитимности прекращается сразу. Политкапитал −1; отношение источника −15. Полученные подтверждённые документы остаются у юристов. Уже начатая проверка заканчивается по прежнему графику: необходимые запросы отправлены при подписи.',
    });
    return actions;
}
export function evidenceDecision(gs: GameState, world: LivingWorld, id: string): { text: string; relation: number } {
    const source = world.evidence!;
    let relation = 0;
    if (id === 'evidence:withdraw') {
        source.authority = 'withdrawn'; relation = -15;
        source.text = 'Вы возвращаете независимую санкцию на запросы. «То есть папка вам нужна, а инструмент уже лишний?» — спрашивает собеседник. Вы не спорите: полученные документы остаются, новые запросы снова требуют внешнего разрешения. Квартальная цена полномочия прекращена.';
    } else {
        source.route = id.slice(9) as Exclude<PrivateEvidence['route'], null>;
        source.phase = 'checking'; source.due = gs.turn + (source.route === 'independent' ? 2 : 1);
        if (source.route === 'service') { source.authority = 'active'; source.authoritySince = gs.turn; relation = 8; }
        source.text = source.route === 'service'
            ? `Вы подписываете постоянный прямой доступ к банковским сведениям. «По одному делу такими ключами не открывают», — говорит ${source.name}. Первый пакет проверят к концу квартала ${source.due}; полную цепочку владельцев счёта служба сможет восстановить за четыре квартала действия доступа. С этого квартала легитимность −1 за каждый квартал действия права; после получения папки право само не исчезнет.`
            : source.route === 'trusted'
                ? `«Сделаю копию для ваших юристов. Но в суде нужны печати, а не наша с вами дружба». Личный доступ к архиву согласован; сверка с оригиналами закончится в квартале ${source.due}. Новых полномочий вы не передавали.`
                : `Независимые юристы приняли архивную копию и отправили запросы банкам и реестру владельцев. Ответ — в квартале ${source.due}. Служба не получает новых прав; личная дружба с её руководителем не заменит банковского подтверждения.`;
    }
    source.changed = gs.turn;
    return { text: source.text, relation };
}
export function stepEvidence(gs: GameState, world: LivingWorld, turn: number, response?: Choice['evidenceResponse']): { story: string | null; res: ResourceDelta } {
    if (!world.evidence) return { story: null, res: {} };
    const source = world.evidence = { ...world.evidence };
    const news: string[] = [];
    if (source.authority === 'active' && !evidenceSource(gs)) {
        source.authority = 'departed'; source.changed = turn;
        news.push('Руководитель покинул должность. Его личный допуск закрыт; преемник не наследует расширенное право на банковские запросы. Архивные копии остаются у юристов.');
    }
    if (source.phase === 'checking' && turn >= source.due!) {
        source.phase = 'verified'; source.due = null; source.changed = turn;
        news.push(`Банк подтвердил переводы через шесть фирм, реестр установил: фирмы контролирует ${source.target}. Юристы сопоставили оригиналы с архивной копией: деньги пришли с иностранного счёта. Кто наполнял этот счёт, пока не установлено. Это доказательство маршрута денег; вашей личной осведомлённости и взяток оно не доказывает. В ответ на требование назначить человека посредника можно передать материалы прокуратуре. Открытое дело позволит установить иностранную цепочку за восемь кварталов, включая ответственность вашей кампании; решение суда она не гарантирует.`);
    }
    if (source.phase === 'verified' && source.networkVerifiedAt === undefined
        && (source.authority === 'active' && turn >= source.authoritySince! + 4
            || source.referredAt !== undefined && turn >= source.referredAt + 8)) {
        source.networkVerifiedAt = turn; source.changed = turn;
        news.push(source.authority === 'active'
            ? 'Прямые запросы службы восстановили иностранную цепочку: счёт наполнял фонд государства-донора. Подтверждения остались в закрытом архиве. Вы знаете, чьи интересы представляет посредник; теперь документы можно использовать против требования о стратегическом активе. Само право запросов продолжает действовать.'
            : 'Прокуратура получила ответы по иностранной цепочке: счёт наполнял фонд государства-донора. Материалы приобщены к открытому делу, проверяют и получателя — вашу кампанию. Установленный маршрут денег даёт документальный ответ на требование отдать стратегический актив.');
    }
    if (response === 'refer' && source.phase === 'verified' && source.referredAt === undefined) {
        source.referredAt = turn; source.changed = turn;
        news.push('Подтверждённые переводы зарегистрированы в прокуратуре. В назначении на таможню отказано. Начато дело о финансировании кампании; документы уже нельзя убрать одним телефонным звонком. Полномочие источника автоматически не прекращается.');
    }
    if (response === 'port' && source.phase === 'verified' && source.usedAt === undefined && source.networkVerifiedAt !== undefined) {
        source.usedAt = turn; source.changed = turn;
        news.push('Подтверждённые переводы зарегистрированы в прокуратуре. Требование о портовой концессии отклонено официально; документы остаются доказательствами, а не личным секретом президента. Полномочие источника нужно отозвать отдельно, если вы его предоставляли.');
    }
    if (news.length) source.text = news.join('\n\n');
    return { story: news.join('\n\n') || null, res: source.authority === 'active' ? { internalLegitimacy: -1 } : {} };
}
export function withEvidenceChoice(gs: GameState, event: GameEvent): GameEvent {
    const source = gs.world?.evidence;
    if (!gs.daily && source?.networkVerifiedAt !== undefined && source.target === gs.arc?.target && event.beat?.arcId === 'money' && event.beat.turn === 16) return {
        ...event, description: `На столе подтверждённая цепочка: иностранный фонд, счёт, шесть фирм и переводы в вашу кампанию. Посредник — ${source.target}. Юристы сверили оригиналы. Записей передачи наличных у вас нет; личную ответственность ещё предстоит установить. Вы можете начать открытый процесс, потребовать дипломатического ответа или сохранить документы как рычаг. Ваша кампания остаётся получателем денег и не получает иммунитета.`,
    };
    if (!gs.daily && source?.phase === 'verified' && source.target === gs.arc?.target && event.beat?.arcId === 'money' && event.beat.turn === 7) return { ...event, description: `${event.description}\n\nУ вас уже есть подтверждённые переводы. Но документы не заменяют живого свидетеля: бухгалтер может объяснить, кто отдавал распоряжения и что знало руководство кампании. Его исчезновение остаётся угрозой человеку и расследованию, а не только вашей папке.` };
    if (gs.daily || source?.phase !== 'verified' || source.usedAt !== undefined || source.target !== gs.arc?.target
        || event.beat?.arcId !== 'money' || ![3, 12].includes(event.beat.turn)) return event;
    if (event.beat.turn === 3) return { ...event, description: `${event.description}\n\nБанк подтвердил переводы, юристы установили цепочку владельцев. Вы можете отказать в назначении и передать документы в прокуратуру; ответственность вашей кампании тоже станет предметом дела.`, choices: [...event.choices, {
        id: 'd', text: 'Отказать в назначении и передать проверенные переводы прокуратуре',
        hint: 'политкапитал −2, личный ресурс −1; проверят и вашу кампанию',
        tags: ['anticorruption'], resolvesCrisis: null, evidenceResponse: 'refer',
        deal: { pure: true, figure: gs.keyFigures.find(f => f.name === source.target)?.id, figureRel: -20, res: { politicalCapital: -2, personalResource: -1 } },
        arc: { flag: 'refuse', effect: {}, ok: 'На листке с фамилией вы пишете отказ. Оригиналы переводов получают номер дела. «Вместе с источником денег придётся проверить и получателя», — предупреждает юрист. Вы киваете: кампания не получит иммунитета. Спонсор не получил человека на таможне; расследование только начинается.' },
    }] };
    if (source.networkVerifiedAt === undefined) return event;
    return { ...event, description: `${event.description}\n\nУ вас есть независимое подтверждение переводов. Юристы предлагают передать его прокуратуре вместо тайной оперативной игры. Документы становятся материалами расследования; разбирательство продолжится после отказа от концессии.`, choices: [...event.choices, {
        id: 'd', text: 'Передать подтверждённые переводы прокуратуре и отказать в концессии',
        hint: 'документы проверены; политкапитал −2, личный ресурс −1; это начало дела, не приговор',
        tags: ['anticorruption'], resolvesCrisis: null, evidenceResponse: 'port',
        deal: { pure: true, figure: gs.keyFigures.find(f => f.name === source.target)?.id, figureRel: -20, res: { politicalCapital: -2, personalResource: -1 } },
        arc: { flag: 'sting', effect: {}, ok: 'Вы отклоняете концессию и передаёте оригиналы в прокуратуру. Посредник ещё на свободе, но теперь его требование теперь приобщено к материалам зарегистрированного дела. Секретный договор о порте не подписан. Проверка финансовой сети продолжается; суду ещё предстоит установить персональную ответственность.' },
    }] };
}
export function validEvidence(value: unknown, turn: number): value is PrivateEvidence {
    if (!value || typeof value !== 'object') return false;
    const s = value as PrivateEvidence;
    const at = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= turn;
    return ['figure', 'name', 'target', 'biography', 'text'].every(k => typeof s[k as keyof PrivateEvidence] === 'string' && !!s[k as keyof PrivateEvidence])
        && at(s.opened) && at(s.changed) && s.changed >= s.opened
        && ['offered', 'checking', 'verified'].includes(s.phase)
        && ['none', 'active', 'withdrawn', 'departed'].includes(s.authority)
        && (s.phase === 'offered' ? s.route === null : ['trusted', 'service', 'independent'].includes(String(s.route)))
        && (s.phase === 'checking' ? Number.isSafeInteger(s.due) && s.due! > turn : s.due === null)
        && (s.phase !== 'offered' || s.authority === 'none')
        && (s.phase !== 'checking' || s.due! > s.changed && s.due! <= s.changed + 2)
        && (s.authority === 'none' || s.route === 'service')
        && (s.authority === 'none' ? s.authoritySince === undefined : at(s.authoritySince!) && s.authoritySince! >= s.opened)
        && (s.networkVerifiedAt === undefined || s.phase === 'verified' && at(s.networkVerifiedAt) && s.networkVerifiedAt <= s.changed
            && (s.authoritySince !== undefined && s.networkVerifiedAt >= s.authoritySince + 4 || s.referredAt !== undefined && s.networkVerifiedAt >= s.referredAt + 8))
        && (s.referredAt === undefined || s.phase === 'verified' && at(s.referredAt) && s.referredAt >= s.opened && s.referredAt <= s.changed)
        && (s.usedAt === undefined || s.phase === 'verified' && at(s.usedAt) && s.networkVerifiedAt !== undefined && s.usedAt >= s.networkVerifiedAt && s.usedAt <= s.changed);
}
