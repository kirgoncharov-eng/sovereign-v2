// 12 зёрен, coalition, первые варианты, максимум 26 кварталов.
// node scripts/measure-cabinet.mjs /path/to/repo /tmp/cabinet-measurement.json
import { writeFile } from 'node:fs/promises';

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error('Укажите корень репозитория и путь JSON результата');
const { newTerm, startFromSeed, nextCase, signChoice } = await import(`${root}/web/lib/client/chronicle.ts`);
const { cabinetCandidates, cabinetPreview, applyCabinetAction } = await import(`${root}/web/lib/game/cabinet.ts`);
const rows = [];

for (const policy of ['baseline', 'hire']) for (let seed = 1; seed <= 12; seed++) {
  let state = await newTerm(startFromSeed(seed, 'coalition'));
  let hires = 0, bonus = 0;
  while (!state.ended && state.turn < 26) {
    state = await nextCase(state);
    if (policy === 'hire') {
      const candidate = cabinetCandidates(state).find(person => {
        const preview = cabinetPreview(state, { kind: 'hire', candidate: person.id });
        return !preview.unavailable && (preview.cost.economy ?? 0) > 0;
      });
      if (candidate) {
        const action = { kind: 'hire', candidate: candidate.id };
        bonus += cabinetPreview(state, action).cost.economy;
        state = applyCabinetAction(state, action);
        hires++;
      }
    }
    state = await signChoice(state, state.currentEvent.choices[0].id);
  }
  rows.push({ policy, seed, turn: state.turn, hires, bonus, economy: state.resources.economy,
    total: Object.values(state.resources).reduce((sum, value) => sum + value, 0) });
}

await writeFile(output, JSON.stringify(rows, null, 2));
for (const policy of ['baseline', 'hire']) {
  const selected = rows.filter(row => row.policy === policy);
  const average = key => +(selected.reduce((sum, row) => sum + row[key], 0) / selected.length).toFixed(2);
  console.log({ policy, turn: average('turn'), hires: average('hires'), bonus: average('bonus'),
    economy: average('economy'), total: average('total'), reach20: selected.filter(row => row.turn >= 20).length });
}
