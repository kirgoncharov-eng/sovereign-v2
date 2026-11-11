import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const base = process.argv[2];
const { classicApi } = await import(pathToFileURL(`${base}/web/lib/game/classic.ts`));
const { createInitialState, startEvent, resolveTurn, seededRandom } = await import(pathToFileURL(`${base}/web/lib/game/engine.ts`));
const { ALTERNATE_COUNTRY } = await import(pathToFileURL(`${base}/web/lib/game/alternate-world.ts`));
const output=[];
for(const country of ['Беларусь','Украина','Грузия','Армения','Казахстан','Молдова',ALTERNATE_COUNTRY]) {
 for(const difficulty of ['debut','coalition','crisis','ruins']) for(const seed of [1,7,21,42]) {
  let state=createInitialState(country,difficulty,'pragmatist',await classicApi.setup(country,difficulty,'pragmatist',seed),seededRandom(seed));
  if(country===ALTERNATE_COUNTRY)state={...state,daily:'2026-10-19'};
  const frames=[];
  for(let turn=0;turn<24&&!state.ended;turn++){
   state=startEvent(state,await classicApi.event(state));
   const event=state.currentEvent;
   const choice=(event.press||event.call||event.budget ? event.choices[1] : event.choices[turn%event.choices.length]);
   const narration=await classicApi.consequence(state,choice.id);
   state=resolveTurn(state,choice.id,narration);frames.push(state);
  }
  output.push({country,difficulty,seed,turns:frames.length,sha:createHash('sha256').update(JSON.stringify(frames)).digest('hex')});
 }
}
console.log(JSON.stringify(output,null,2));
