// #387: проверяет настоящие реплики ResolutionChoices, без тестовой подмены словаря.
// #397, часть 3: то же для эпизода расследования — у него нет карточки, реплики ищутся по тексту варианта.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { launchChromium } from './browser.mjs';
import { newTerm, nextCase, signChoice, startFromSeed } from '../lib/client/chronicle.ts';
import { hasInvestigationDebate } from '../lib/content/investigation-debates.ts';
import { advisorDialogue } from '../lib/client/advisor-dialogue.ts';

const root = resolve('.');
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/factory-dialogue');
mkdirSync(out, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import ResolutionChoices from './app/game/ResolutionChoices.tsx';
      createRoot(document.getElementById('root')).render(<ResolutionChoices game={window.fixture} busy={false}
        onSign={choice=>{document.body.dataset.signed=choice.id;}}/>);`,
    resolveDir: root, loader: 'jsx',
  },
  bundle: true, write: false, outfile: 'factory-dialogue.js', jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'aliases', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => ({ path: join(root, args.path.slice(2)) }));
  } }],
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
const styles = readFileSync('demo/dist/sovereign.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const factory = await nextCase(await newTerm(startFromSeed(7)));
let investigation = factory;
while (!hasInvestigationDebate(investigation) && investigation.turn < 6) {
  investigation = await nextCase(await signChoice(investigation, investigation.currentEvent.choices[0].id));
}
assert.ok(hasInvestigationDebate(investigation), 'в партии встретился эпизод расследования');
const summary = { checks: [], problems: [] };
const browser = await launchChromium();
try {
  for (const [caseName, base, lead] of [['factory', factory, 'strategist'], ['investigation', investigation, 'security']])
  for (const width of [320, 390]) for (const diff of ['debut', 'crisis']) for (const team of ['weak', 'strong', 'mixed']) {
    const game = { ...base, diff, advisors: base.advisors.map(advisor => ({
      ...advisor, loyalty: 80, skill: team === 'strong' ? 3 : team === 'weak' || advisor.id !== lead ? 1 : 3,
    })) };
    const name = `${caseName}-${width}-${diff}-${team}`, file = join(out, `${name}.html`);
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>${styles}${css}body{margin:0;background:#e4dcbd}#root{max-width:640px;margin:12px auto}</style>
      <div id="root" class="sv-paper"></div><script>window.fixture=${JSON.stringify(game).replace(/</g, '\\u003c')};${js}</script>`);
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => summary.problems.push(String(error)));
    await page.goto(`file://${file}`);
    const choices = page.locator('[data-resolution-choices]');
    await choices.waitFor();
    assert.equal(await choices.locator('blockquote').count(), 0, 'до раскрытия нет дополнительного блока');
    for (const [index, choice] of game.currentEvent.choices.entries()) {
      await choices.locator(`#opt-${index + 1}`).click();
      const detail = choices.getByRole('group', { name: 'Последствия выбранного решения' });
      const speeches = advisorDialogue(game, choice);
      assert.equal(speeches.length, 2);
      assert.equal(await detail.locator('blockquote').count(), speeches.length);
      const text = await detail.innerText();
      for (const speech of speeches) {
        assert.ok(text.includes(speech.source.name));
        assert.ok(text.includes(speech.text));
        if (speech.correction) assert.ok(text.includes(speech.correction));
      }
      assert.equal(text.includes('★'), diff === 'debut', 'реплика не раскрывает скрытую компетентность');
      assert.doesNotMatch(text, /\{target\}|undefined/);
      assert.equal(await page.locator('body').getAttribute('data-signed'), null, 'просмотр не подписывает');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await page.screenshot({ path: join(out, `${name}-choice-${index + 1}.png`), fullPage: true });
      summary.checks.push({ case: caseName, width, diff, team, choice: choice.id, speeches: speeches.length });
    }
    await choices.getByRole('button', { name: 'Подписать', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-signed'), game.currentEvent.choices.at(-1).id);
    await page.reload();
    await choices.locator('#opt-1').click();
    const restored = await choices.getByRole('group', { name: 'Последствия выбранного решения' }).innerText();
    for (const speech of advisorDialogue(game, game.currentEvent.choices[0])) assert.ok(restored.includes(speech.text));
    await context.close();
  }
} catch (error) {
  summary.problems.push(error.stack ?? String(error));
} finally {
  await browser.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
assert.deepEqual(summary.problems, []);
