// #357: сравнение до касания, раскрытие и подпись; все форматы знаний на телефоне и широком экране.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { newTerm, nextCase, startFromSeed } from '../lib/client/chronicle.ts';
import { advisorOutlook } from '../lib/client/advisor-outlook.ts';

const root = resolve('.');
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/advisor-outlook');
mkdirSync(out, { recursive: true });
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import ResolutionChoices from './app/game/ResolutionChoices.tsx';
  import { AdvisorCard } from './app/game/AdvisorCard.jsx';
  createRoot(document.getElementById('root')).render(<><ResolutionChoices game={window.fixture} busy={false}
    onSign={choice=>{document.body.dataset.signed=choice.id;}}/><details id="dossier"><summary>Досье команды</summary>
    <AdvisorCard gs={window.fixture} advisor={window.fixture.advisors[0]} id="advisor-card"/></details></>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, outfile: 'outlook.js', jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'aliases', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => ({ path: join(root, args.path.slice(2)) }));
  } }],
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
const styles = readFileSync('demo/dist/sovereign.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const base = await nextCase(await newTerm(startFromSeed(7)));
const browser = await chromium.launch();
const summary = { checks: [], problems: [] };
try {
  for (const width of [320, 390, 1440]) for (const diff of ['debut', 'crisis']) for (const skill of [1, 2, 3]) {
    const game = { ...base, diff, advisors: base.advisors.map(advisor => ({ ...advisor, skill })) };
    const name = `${width}-${diff}-skill-${skill}`, file = join(out, `${name}.html`);
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>${styles}${css}body{margin:0;background:#e4dcbd}#root{max-width:640px;margin:12px auto}</style>
      <div id="root"></div><script>window.fixture=${JSON.stringify(game).replace(/</g, '\\u003c')};${js}</script>`);
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => summary.problems.push(String(error)));
    await page.goto(`file://${file}`);
    const choices = page.locator('[data-resolution-choices]');
    await choices.waitFor();
    assert.equal(await choices.locator('section').count(), 3);
    assert.equal(await choices.getByRole('button', { name: 'Подписать', exact: true }).count(), 0);
    const text = await choices.innerText();
    assert.equal(text.includes('★'), diff === 'debut');
    for (const choice of game.currentEvent.choices) {
      const forecast = advisorOutlook(game, choice);
      const option = choices.locator('section').filter({ has: page.getByText(choice.text, { exact: true }) });
      const rowText = await option.innerText();
      assert.ok(rowText.includes(forecast.risk.text));
      assert.ok(rowText.includes(forecast.risk.source.name));
      for (const estimate of Object.values(forecast.success.resources)) if (estimate.value) assert.ok(rowText.includes(estimate.text));
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: join(out, `${name}-compare.png`), fullPage: true });
    await choices.locator('#opt-1').click();
    assert.equal(await page.locator('body').getAttribute('data-signed'), null);
    const details = page.getByRole('group', { name: 'Последствия выбранного решения' });
    assert.ok((await details.innerText()).includes(skill === 1 && diff === 'debut' ? 'не обсуждали' : 'Срыв'));
    assert.equal(await details.locator('table').count(), 0);
    const risk = advisorOutlook(game, game.currentEvent.choices[0]).risk;
    assert.ok((await details.innerText()).includes(risk.text));
    await details.locator('summary').click();
    assert.equal((await details.innerText()).includes('★'), diff === 'debut');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({ path: join(out, `${name}-selected.png`), fullPage: true });
    await page.locator('#dossier > summary').click();
    const dossier = await page.locator('#dossier').innerText();
    assert.equal(dossier.includes('★'), diff === 'debut', 'досье не раскрывает скрытую компетентность');
    await details.getByRole('button', { name: 'Подписать', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-signed'), game.currentEvent.choices[0].id);
    await page.reload();
    assert.equal(await choices.innerText(), text, 'reload не меняет доклад');
    summary.checks.push({ width, diff, skill });
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
