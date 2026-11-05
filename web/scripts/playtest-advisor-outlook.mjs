// #356: разные назначения и ширины; старое предложение советника не раскрывает точный расчёт.
// npm run build:demo && node scripts/playtest-advisor-outlook.mjs
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { newTerm, nextCase, startFromSeed } from '../lib/client/chronicle.ts';
import { advisorOutlook } from '../lib/client/advisor-outlook.ts';
import { choiceOutcomes } from '../lib/client/choice-outcomes.ts';

const root = resolve('.');
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/advisor-outlook');
mkdirSync(out, { recursive: true });
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import ResolutionOutcomes from './app/game/ResolutionOutcomes.tsx';
  import {ChoicePreview} from './app/game/SovereignGame.jsx';
  const {game,choice}=window.fixture;
  createRoot(document.getElementById('root')).render(<><div id="choice"><ChoicePreview gs={game} c={choice}/></div>
    <ResolutionOutcomes game={game} choice={choice}/></>);`, resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, outfile: 'outlook.js', jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ANALYTICS': '"off"',
    'process.env.NEXT_PUBLIC_SHARE_URL': '""', 'process.env.NEXT_PUBLIC_BOT_USERNAME': '""' },
  plugins: [{ name: 'aliases', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => ({ path: join(root, args.path.slice(2)) }));
  } }],
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
const demo = readFileSync('demo/dist/sovereign.html', 'utf8');
const styles = demo.match(/<style>([\s\S]*?)<\/style>/)[1];
const base = await nextCase(await newTerm(startFromSeed(7)));
const browser = await chromium.launch();
const summary = { checks: [], problems: [] };

try {
  for (const width of [320, 390, 1440]) {
    const shown = [];
    for (const skill of [0, 1, 3]) {
      const game = { ...base, advisors: skill ? base.advisors.map(advisor => ({ ...advisor, skill })) : [] };
      const choice = { ...base.currentEvent.choices[0], advisor: { ...base.advisors[0], skill: 3 } };
      const outlook = advisorOutlook(game, choice), raw = choiceOutcomes(game, choice);
      const name = `${width}-skill-${skill}`, fixture = join(out, `${name}.html`);
      writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>${styles}${css}body{margin:0;background:#e4dcbd}#root{max-width:600px;margin:12px}#choice{padding:12px}</style>
        <div id="root"></div><script>window.fixture=${JSON.stringify({ game, choice }).replace(/</g, '\\u003c')};${js}</script>`);
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      page.on('pageerror', error => summary.problems.push(String(error)));
      await page.goto(`file://${fixture}`);
      const group = page.getByRole('group', { name: 'Последствия выбранного решения' });
      await group.waitFor();
      const text = await group.innerText();
      assert.ok(text.includes('Оценка советников'));
      assert.ok(text.includes(outlook.risk.text));
      assert.ok(text.includes(outlook.success.resources.economy.text));
      const row = await page.locator('#choice').innerText();
      assert.ok(row.includes(outlook.risk.text));
      assert.ok(!row.includes(`шанс исполнения ${100 - raw.failurePercent}%`));
      const titles = await page.locator('#choice span[title]').evaluateAll(spans => spans.map(span => span.title));
      assert.ok(!titles.some(title => /: [＋+−]\d/.test(title)), 'нет точных числовых chips под старым предложением');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      const box = await group.locator('table').boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      const camps = group.getByText('Отношения с лагерями', { exact: true });
      await camps.focus();
      await page.keyboard.press('Enter');
      assert.notEqual(await group.locator('details').getAttribute('open'), null);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      shown.push(outlook.success.resources.economy.text);
      summary.checks.push({ width, skill, risk: outlook.risk.text, economy: outlook.success.resources.economy.text });
      await context.close();
    }
    assert.equal(new Set(shown).size, 3, 'без специалиста, слабый и сильный советники дают разную точность');
  }
} catch (error) {
  summary.problems.push(error.stack ?? String(error));
} finally {
  await browser.close();
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
assert.deepEqual(summary.problems, []);
