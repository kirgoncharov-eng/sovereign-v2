import { worldPerson } from '../game/living-world.ts';
import { ACTIONS, ADVISOR_SKILL } from '../game/data.ts';
import { loyaltyLabel } from '../game/engine.ts';
import { BOND_LABEL, bondOf, TRAITS, traitOf } from '../game/people.ts';
import type { GameState } from '../game/types.ts';

export interface PersonProfile { id: string; name: string; role: string; relation: number | null; loyalty: string; rows: {label: string; value: string}[] }

export function personProfiles(gs: GameState): PersonProfile[] {
  const profiles: PersonProfile[] = gs.keyFigures.map(fig => {
    const faction = gs.factions.find(f => f.id === fig.faction);
    const trait = TRAITS[traitOf(gs.seed, fig, faction?.bloc)];
    const bond = bondOf(fig, faction);
    return { id:`figure:${fig.id}`, name:fig.name, role:fig.role, relation:fig.relation, loyalty:loyaltyLabel(fig.relation),
      rows: [
        ...(faction ? [{ label:`Лагерь «${faction.name}»`, value:`${faction.relation > 0 ? '+' : ''}${faction.relation}` }, { label:'Поддержка лагеря в обществе', value:`${faction.approval}%` }] : []),
        { label:'Характер', value:trait.label },
        { label:'Ценит', value:trait.like.map(t=>ACTIONS[t].label.toLowerCase()).join(', ') },
        { label:'Не принимает', value:trait.dislike.map(t=>ACTIONS[t].label.toLowerCase()).join(', ') },
        ...(bond ? [{ label:'Связь с вами', value:BOND_LABEL[bond] }] : []),
        ...(gs.pacts?.some(p => p.figure === fig.id) ? [{ label:'Договор', value:'действующий союз' }] : []),
      ],
    };
  });
  for (const a of gs.advisors) if (!profiles.some(p=>p.name===a.name)) profiles.push({ id:`advisor:${a.id}`, name:a.name, role:a.role, relation:null, loyalty:'нейтрал', rows:[{ label:'Качество советов', value:ADVISOR_SKILL[a.skill].label }, { label:'Отношение к вам', value:'отдельно не учитывается' }] });
  if (!profiles.some(p=>p.name===gs.leader.name)) profiles.push({ id:'leader', name:gs.leader.name, role:'Вы — глава страны', relation:null, loyalty:'нейтрал', rows:[{ label:'Партия', value:gs.leader.party }] });
  if (gs.arc?.target && !profiles.some(p=>p.name===gs.arc!.target)) profiles.push({ id:'arc-target', name:gs.arc.target, role:gs.arc.targetRole, relation:null, loyalty:'нейтрал', rows:[{ label:'Отношение к вам', value:'нет достоверных данных' }] });
  for (const name of gs.former ?? []) if (!profiles.some(p=>p.name===name)) profiles.push({ id:`former:${name}`, name, role:'Бывший участник политической сцены', relation:null, loyalty:'нейтрал', rows:[{ label:'Статус', value:'покинул должность; текущие показатели не отслеживаются' }] });
  for (const raw of gs.world?.people ?? []) {
    const person = worldPerson(gs, raw.id)!;
    const rows = [{ label:'Должность в повестке', value:person.role }, { label:'Компетенция в проекте', value:`${person.competence}/3` }, { label:'Собственная цель', value:person.goal }];
    const existing = profiles.find(p=>p.name===person.name);
    if (existing) existing.rows.push(...rows);
    else profiles.push({ id:`world:${person.id}`, name:person.name, role:person.role, relation:person.relation, loyalty:loyaltyLabel(person.relation), rows:[{ label:'Характер', value:TRAITS[person.trait].label },...rows] });
  }
  return profiles;
}
export type NamePart = { text: string; person?: PersonProfile };

// Полное имя надёжнее фамилии. Одинаковые фамилии не угадываем; не берём части чужих слов.
export function nameParts(text: string, profiles: PersonProfile[]): NamePart[] {
  const aliases = new Map<string, PersonProfile>();
  for (const p of profiles) aliases.set(p.name, p);
  for (const p of profiles) {
    const surname = p.name.trim().split(/\s+/).at(-1)!;
    if (surname.length >= 3 && profiles.filter(q=>q.name.trim().split(/\s+/).at(-1) === surname).length === 1) aliases.set(surname, p);
  }
  const escaped = [...aliases.keys()].sort((a,b)=>b.length-a.length).map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if (!escaped.length) return [{text}];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  let from=0;const parts:NamePart[]=[];
  for (const m of text.matchAll(re)) { if(m.index!>from)parts.push({text:text.slice(from,m.index)});parts.push({text:m[0],person:aliases.get(m[0])});from=m.index!+m[0].length; }
  if(from<text.length)parts.push({text:text.slice(from)});
  return parts;
}
