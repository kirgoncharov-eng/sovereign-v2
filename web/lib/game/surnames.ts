// #242: одна грамматика фамилий для всех генераторов имён — женская форма и общая основа для проверки повторов.
import type { GameState } from './types.ts';

// Мужская фамилия из пула → женская: Кленов → Кленова, Горский → Горская, Яровой → Яровая; «-ич» не меняется.
export function feminineSurname(last: string): string {
  return last.replace(/(ов|ев|ин)$/, '$1а').replace(/(ск|цк)ий$/, '$1ая').replace(/ой$/, 'ая');
}

// Основа фамилии из полного имени: «Ольга Яровая» и «Леонид Яровой» — одна семья для игрока.
export function surnameBase(name: string): string {
  return (name.trim().split(/\s+/).at(-1) ?? '')
    .replace(/(ов|ев|ин)а$/, '$1').replace(/(ск|цк)ая$/, '$1ий').replace(/ая$/, 'ой');
}

// Преемники, уже объявленные в открытом деле: их фамилии заняты до подписи, хотя в кабинет они ещё не вошли.
export function announcedHeirs(state: Pick<GameState, 'currentEvent'>): string[] {
  return state.currentEvent?.choices.flatMap(choice => (choice.deal?.replace ? [choice.deal.replace] : [])) ?? [];
}
