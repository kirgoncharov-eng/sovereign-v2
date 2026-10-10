import type { GameState } from '../game/types.ts';
import { healthNeedsAttention } from '../game/health-aftermath.ts';
import { personProfiles } from './people-text.ts';
import { livingActions, type WorldAction } from '../game/living-world.ts';
export interface PresidentialMessage {
  key: string;
  token: string;
  person: string;
  title: string;
  text: string;
  action: 'sponsor' | 'government' | 'energy' | 'health' | 'minister' | 'evidence';
  needsReply: boolean;
  deadline?: number;
}
export function presidentialMessages(gs: GameState): PresidentialMessage[] {
  if (gs.daily || !gs.world) return [];
  const world = gs.world, profiles = personProfiles(gs);
  const personId = (name: string) => profiles.find(p => p.name === name)?.id;
  const messages: PresidentialMessage[] = [];
  const source = world.evidence;
  if (source) {
    const person = personId(source.name);
    if (person) messages.push({ key: 'private-evidence', token: `${source.name}:${source.phase}:${source.authority}:${source.changed}`, person, title: source.usedAt !== undefined ? 'Документы стали делом' : source.phase === 'verified' ? 'Подтверждение переводов кампании' : source.phase === 'checking' ? 'Проверка финансового следа' : 'Архивная копия: кому принадлежали деньги', text: source.text, action: 'evidence', needsReply: false });
  }
  const mandate = world.mandate;
  if (mandate) {
    const person = personId(mandate.name);
    if (person) messages.push({ key: 'minister-mandate', token: `${mandate.name}:${mandate.phase}:${mandate.changed}`, person, title: ['accepted','used'].includes(mandate.phase) ? 'Закупочный мандат: помощь и обязательство' : mandate.phase === 'offered' ? 'Помощь в обмен на будущие полномочия' : 'Что осталось от договорённости', text: mandate.text, action: 'minister', needsReply: mandate.phase === 'offered', ...(mandate.phase === 'offered' ? { deadline: mandate.due } : {}) });
  }
  const sponsor = world.sponsor;
  if (sponsor && sponsor.phase !== 'departed') {
    const person = personId(sponsor.name);
    if (person) messages.push({ key: 'sponsor', token: `${sponsor.name}:${sponsor.phase}:${sponsor.lastMoveTurn}`, person, title: sponsor.phase === 'offered' ? 'Предложение помощи энергосети' : sponsor.phase === 'demanding' ? 'Условие по нашим договорённостям' : sponsor.phase === 'pressuring' ? 'Поставки отправлены на согласование' : 'Договорённость о поставках', text: sponsor.lastMove, action: 'sponsor', needsReply: ['offered', 'demanding', 'pressuring'].includes(sponsor.phase), ...(sponsor.deadline ? { deadline: sponsor.deadline } : {}) });
  }
  for (const project of ['energy', 'health'] as const) {
    const latest = [...world.dispatches].reverse().find(d => d.project === project && ['letter', 'report', 'news'].includes(d.kind) && (project !== 'energy' || /Энергосеть|Промышленный регион/.test(d.title)));
    const p = project === 'energy' ? world.project : world.health;
    const executor = p?.executor;
    const actor = world.people.find(p => p.id === (executor ?? (project === 'energy' ? 'minister' : 'doctor')));
    const name = actor?.figure ? gs.keyFigures.find(f => f.id === actor.figure)?.name : actor?.name;
    const person = name && personId(name);
    const deadline = p?.status === 'unassigned' ? p.deadline
      : project === 'health' && world.health?.aftermath?.bargain?.phase === 'open' ? world.health.aftermath.due
      : project === 'health' && world.health?.aftermath?.phase === 'open' ? world.health.aftermath.deadline : undefined;
    if (latest && person) messages.push({ key: project, token: latest.id, person, title: latest.title,
      text: latest.text, action: project,
      needsReply: p?.status === 'unassigned' || project === 'health' && healthNeedsAttention(world.health),
      ...(deadline !== undefined ? { deadline } : {}) });
  }
  if (world.government) {
    const advisor = gs.advisors.find(a => a.id === 'economist') ?? gs.advisors[0];
    const person = advisor && personId(advisor.name);
    const count = world.government.programs.filter(p => p.status === 'proposed').length + [world.project, world.health].filter(p => p?.status === 'unassigned').length;
    if (count && person) messages.push({ key: 'government-proposals', token: 'proposal:v1', person, title: 'Предложения правительства', text: `Кабинет подготовил пять направлений работы. ${count} ещё не запущено. У каждого есть бюджет, ожидаемый результат и причины риска. Можно делегировать работу кабинету, а одну действующую программу сделать личным приоритетом. Предложения не требуют обязательного обхода каждый квартал.`, action: 'government', needsReply: false });
    const next = world.government.housingNext;
    const nextPerson = next && personId(next.name ?? next.previousName);
    const nextLetter = next && [...world.dispatches].reverse().find(d => d.id.includes(':housing-next:'));
    if (next && nextPerson && nextLetter) messages.push({ key: 'housing-next', token: nextLetter.id, person: nextPerson, title: nextLetter.title, text: nextLetter.text, action: 'government', needsReply: false });
    for (const p of world.government.programs) {
      const latest = [...world.dispatches].reverse().find(d => d.project === p.id && !d.id.includes(':housing-next:') && ['report','news'].includes(d.kind));
      const person = p.name && personId(p.name);
      if (latest && person) messages.push({ key: `program:${p.id}`, token: latest.id, person, title: latest.title, text: latest.text, action: 'government', needsReply: false });
    }
  }
  return messages;
}
// Только ответы на конкретное обращение: поддержка, смена поставщика и другие инициативы остаются в досье.
export function presidentialReplyActions(gs: GameState, message: PresidentialMessage): WorldAction[] {
  if (!message.needsReply || gs.daily || gs.ended || !gs.world) return [];
  let prefix: string;
  if (message.action === 'energy' && gs.world.project.status === 'unassigned') prefix = 'appoint:';
  else if (message.action === 'health' && gs.world.health?.status === 'unassigned') prefix = 'health:appoint:';
  else if (message.action === 'health' && gs.world.health?.aftermath?.bargain?.phase === 'open') prefix = 'health:bargain:';
  else if (message.action === 'health' && gs.world.health?.aftermath?.phase === 'open') prefix = 'health:response:';
  else return [];
  return livingActions(gs).filter(action => action.id.startsWith(prefix));
}
export const messageUnread = (gs: GameState, message: PresidentialMessage) => gs.world?.inboxRead?.[message.key] !== message.token;
export function readPresidentialMessages(gs: GameState, person: string): GameState {
  const messages = presidentialMessages(gs).filter(m => m.person === person && messageUnread(gs, m));
  if (!messages.length || !gs.world) return gs;
  return { ...gs, world: { ...gs.world, inboxRead: { ...gs.world.inboxRead, ...Object.fromEntries(messages.map(m => [m.key, m.token])) } } };
}
