// Симуляция баланса: 2000 партий на каждую сложность для случайного и «умного» игрока.
// Запуск: npm run balance
import { ACTION_TAGS, COUNTRIES, IDEOLOGIES, RESOURCE_KEYS, DIFFICULTIES } from "../lib/game/data.ts";
import type { DifficultyId } from "../lib/game/types.ts";
import { createInitialState, startEvent, resolveTurn, planTurn, leaderRating } from "../lib/game/engine.ts";
const intro = { leader:{name:"L",party:"P",bio:""}, speech:"", situation:"", players:[] };
const pick = <T,>(a: T[]) => a[Math.floor(Math.random()*a.length)];
const narr = { headline:"h", narrative:"n", reactions:[], historianNote:"", crisisTitle:null, crisisDescription:null, powerLoss:null };
function play(diff: DifficultyId, strategy: "random"|"smart") {
  let s = createInitialState(pick(Object.keys(COUNTRIES)), diff, pick(IDEOLOGIES).id, intro);
  while (!s.ended) {
    const choices = ["a","b","c"].map(id => ({ id, text:id, hint:"", tags: Array.from({length: 1+Math.floor(Math.random()*2)}, () => pick(ACTION_TAGS)), resolvesCrisis: s.activeCrises.length && Math.random()<0.4 ? s.activeCrises[0].id : null }));
    const re = Math.random() < 0.28 ? { title:"r", description:"", resourceEffect: { [pick(RESOURCE_KEYS)]: Math.round(Math.random()*12-8) } } : null;
    s = startEvent(s, { title:"e", source:"", description:"", isCritical:false, affectedFactions:[], choices, randomEvent: re });
    let c = choices[0].id;
    if (strategy === "random") c = pick(choices).id;
    else {
      let best = -1e9;
      for (const ch of choices) { const p = planTurn(s, ch.id); const sc = Math.min(...RESOURCE_KEYS.map(k=>p.resources[k])) + leaderRating(p.factions, p.resources)*0.5; if (sc > best) { best = sc; c = ch.id; } }
    }
    s = resolveTurn(s, c, narr);
    if (process.env.TRACE && s.turn === 1) console.log(s.country, s.diff, s.ideo, "rating", leaderRating(s.factions, s.resources));
  }
  return s;
}
for (const strat of ["random","smart"] as const) for (const d of Object.keys(DIFFICULTIES) as DifficultyId[]) {
  const N=2000; let win=0, turns=0; const ends: Record<string,number> = {};
  for (let i=0;i<N;i++){ const s=play(d,strat); if(s.endType==="mandate"||s.endType==="reelected")win++; turns+=s.turn; ends[s.endType!]=(ends[s.endType!]||0)+1; }
  console.log(strat.padEnd(6), d.padEnd(9), "win", (win/N*100).toFixed(0)+"%", "avgTurns", (turns/N).toFixed(1), JSON.stringify(ends));
}
