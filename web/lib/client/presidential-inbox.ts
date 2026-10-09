import type { GameState } from '../game/types.ts';
import { healthNeedsAttention } from '../game/health-aftermath.ts';
import { personProfiles } from './people-text.ts';
export interface PresidentialMessage {
  key: string;
  token: string;
  person: string;
  title: string;
  text: string;
  action: 'sponsor' | 'government' | 'energy' | 'health';
  needsReply: boolean;
  deadline?: number;
}
export function presidentialMessages(gs: GameState): PresidentialMessage[] {
  if (gs.daily || !gs.world) return [];
  const world = gs.world, profiles = personProfiles(gs);
  const personId = (name: string) => profiles.find(p => p.name === name)?.id;
  const messages: PresidentialMessage[] = [];
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
    if (latest && person) messages.push({ key: project, token: latest.id, person, title: latest.title, text: latest.text, action: project, needsReply: p?.status === 'unassigned' || project === 'health' && healthNeedsAttention(world.health), ...(p?.status === 'unassigned' ? { deadline: p.deadline } : {}) });
  }
  if (world.government) {
    const advisor = gs.advisors.find(a => a.id === 'economist') ?? gs.advisors[0];
    const person = advisor && personId(advisor.name);
    const count = world.government.programs.filter(p => p.status === 'proposed').length + [world.project, world.health].filter(p => p?.status === 'unassigned').length;
    if (count && person) messages.push({ key: 'government-proposals', token: 'proposal:v1', person, title: 'Предложения правительства', text: `Кабинет подготовил пять направлений работы. ${count} ещё не запущено. У каждого есть бюджет, ожидаемый результат и причины риска. Можно делегировать работу кабинету, а одну действующую программу сделать личным приоритетом. Предложения не требуют обязательного обхода каждый квартал.`, action: 'government', needsReply: false });
    for (const p of world.government.programs) {
      const latest = [...world.dispatches].reverse().find(d => d.project === p.id && ['report','news'].includes(d.kind));
      const person = p.name && personId(p.name);
      if (latest && person) messages.push({ key: `program:${p.id}`, token: latest.id, person, title: latest.title, text: latest.text, action: 'government', needsReply: p.status !== 'running' && !p.reviewed });
    }
  }
  return messages;
}
export const messageUnread = (gs: GameState, message: PresidentialMessage) => gs.world?.inboxRead?.[message.key] !== message.token;
export function readPresidentialMessages(gs: GameState, person: string): GameState {
  const messages = presidentialMessages(gs).filter(m => m.person === person && messageUnread(gs, m));
  if (!messages.length || !gs.world) return gs;
  return { ...gs, world: { ...gs.world, inboxRead: { ...gs.world.inboxRead, ...Object.fromEntries(messages.map(m => [m.key, m.token])) } } };
}
