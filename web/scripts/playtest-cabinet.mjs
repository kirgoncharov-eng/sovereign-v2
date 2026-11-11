// Изолированный сценарий реального CabinetPanel; не заменяет плейтест интеграции в Chronicle.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = process.cwd();
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/cabinet');
await mkdir(out, { recursive: true });
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CabinetPanel from './app/game/CabinetPanel.tsx';
import PresidentialDesk from './app/game/PresidentialDesk.jsx';
import { applyCabinetAction, cabinetCandidates } from './lib/game/cabinet.ts';
import { stepGovernment } from './lib/game/government.ts';
import { readPresidentialMessages } from './lib/client/presidential-inbox.ts';
import { newTerm, nextCase, signChoice, startFromSeed } from './lib/client/chronicle.ts';
import { advisorOutlook } from './lib/client/advisor-outlook.ts';
import { parseSave } from './lib/client/save.ts';
import { SAVE_VERSION, RESOURCE_KEYS } from './lib/game/data.ts';
const key = 'cabinet-playtest';
async function main() {
  const mail = new URLSearchParams(location.search).get('mail');
  const old = localStorage.getItem(key);
  const fresh = await newTerm(startFromSeed(7, 'coalition'));
  fresh.resources = Object.fromEntries(RESOURCE_KEYS.map(key => [key, 90]));
  let initial = old ? parseSave(old)?.state : await nextCase(fresh);
  if (mail) {
    initial = fresh;
    for (let turn = 0; turn < 5; turn++) initial = await signChoice(await nextCase(initial), 'a');
    const author = initial.advisors.find(advisor => advisor.id === 'diplomat');
    Object.assign(initial.world.government.programs.find(program => program.id === 'exports'), {
      status: 'running', progress: 20, coordinator: author.id, name: author.name, started: 4, due: 8,
    });
    stepGovernment(initial, initial.world, initial.turn);
    initial = applyCabinetAction(initial, { kind: 'dismiss', seat: author.id, name: author.name });
    if (mail === 'vacant') stepGovernment(initial, initial.world, initial.turn);
    initial = applyCabinetAction(initial, { kind: 'hire', candidate: cabinetCandidates(initial, author.id)[0].id });
    document.documentElement.dataset.reportAuthor = mail === 'vacant' ? 'Канцелярия' : author.name;
    document.documentElement.dataset.nextAuthor = initial.advisors.find(advisor => advisor.id === author.id).name;
  }
  if (!initial) throw new Error('Сохранение не загрузилось');
  function Fixture() {
    const [state, setState] = useState(initial);
    const [error, setError] = useState('');
    const commit = next => {
      localStorage.setItem(key, JSON.stringify({ version: SAVE_VERSION, screen: 'chronicle', state: next }));
      setState(next);
    };
    const next = async () => {
      try {
        const signed = await signChoice(state, state.currentEvent.choices[0].id);
        commit(signed.ended ? signed : await nextCase(signed));
      } catch (error) { setError(error.message); }
    };
    if (mail) return <main>
      <button onClick={() => {
        const world = structuredClone(state.world);
        stepGovernment(state, world, state.turn + 1);
        commit({ ...state, world, turn: state.turn + 1 });
      }}>Получить следующий доклад</button>
      <PresidentialDesk gs={state} Portrait={() => null} Scene={() => null} onAction={() => {}}
        onRead={(person, key) => commit(readPresidentialMessages(state, person, key))}
        onViewChange={() => {}} onDesk={() => {}} onProject={() => {}}/>
    </main>;
    const outlook = advisorOutlook(state, state.currentEvent.choices[0]);
    return <main style={{maxWidth:480, margin:'auto'}}>
      <header style={{padding:16}}><strong>Проверка кадрового окна</strong>
        <p data-turn>Ход {state.turn + 1}</p><h1 style={{fontSize:22}}>{state.currentEvent.title}</h1>
        <p data-forecast>Экономика: {outlook?.success.resources.economy?.text ?? 'нет оценки'}</p>
        <p data-author>Советник: {state.advisors.find(person => person.id === 'economist')?.name ?? 'Вакансия'}</p>
        <button onClick={next} disabled={state.ended}>Подписать решение и перейти дальше</button>
        {error && <p role="alert">{error}</p>}
      </header>
      <CabinetPanel game={state} onAction={action => commit(applyCabinetAction(state, action))}/>
    </main>;
  }
  createRoot(document.getElementById('root')).render(<Fixture/>);
}
main().catch(error => { document.body.innerText = error.stack; throw error; });
`;
const result = await build({ stdin: { contents: fixture, resolveDir: root, loader: 'jsx' }, bundle: true,
  jsx: 'automatic', format: 'iife', outfile: join(out, 'fixture.js'), write: false,
  alias: { '@': root }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' });
const js = result.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
const file = join(out, 'cabinet.html');
await writeFile(file, `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Суверен · проверка кабинета</title><style>body{margin:0;background:#f1e8d6}*{box-sizing:border-box}${css}</style>
<body><div id="root"></div><script>${js}</script></body></html>`);
if (!process.argv.includes('--build-only')) {
  const browser = await chromium.launch({ headless: true });
  const summary = { isolatedComponent: true, problems: [], widths: [] };
  try {
    for (const width of [390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      page.on('pageerror', error => summary.problems.push(error.message));
      page.on('console', message => { if (message.type() === 'error') summary.problems.push(message.text()); });
      await page.goto(pathToFileURL(file).href);
      const panel = page.getByRole('region', { name: 'Совет президента', exact: true });
      await panel.waitFor();
      const before = await page.locator('[data-author]').innerText();
      await page.screenshot({ path: join(out, `${width}-decision-1.png`), fullPage: true });
      await page.getByRole('button', { name: 'Уволить без замены', exact: true }).click();
      const confirm = page.getByRole('region', { name: 'Подтверждение кадрового указа' });
      await confirm.waitFor();
      assert.equal(await confirm.evaluate(element => element === document.activeElement), true, 'подтверждение получает фокус');
      await page.screenshot({ path: join(out, `${width}-confirmation.png`), fullPage: false });
      await page.getByRole('button', { name: 'Отмена', exact: true }).click();
      assert.equal(await page.locator('[data-author]').innerText(), before);
      assert.equal(await page.evaluate(() => localStorage.getItem('cabinet-playtest')), null, 'отмена не сохраняет указ');
      await page.getByRole('button', { name: 'Уволить без замены', exact: true }).click();
      await page.getByRole('button', { name: 'Подписать кадровый указ', exact: true }).click();
      await page.getByText('Должность вакантна', { exact: true }).waitFor();
      assert.equal(await page.locator('[data-forecast]').innerText(), 'Экономика: ?');
      const vacancy = await page.evaluate(() => localStorage.getItem('cabinet-playtest'));
      await page.reload();
      await page.getByText('Должность вакантна', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('cabinet-playtest')), vacancy);
      assert.equal(await page.locator('[data-forecast]').innerText(), 'Экономика: ?');
      await page.screenshot({ path: join(out, `${width}-vacancy.png`), fullPage: true });
      await page.getByRole('button', { name: 'Рассмотреть назначение', exact: true }).first().click();
      await page.getByRole('button', { name: 'Подписать кадровый указ', exact: true }).click();
      await page.getByRole('button', { name: 'Уволить без замены', exact: true }).waitFor();
      const author = await page.locator('[data-author]').innerText();
      assert.notEqual(author, before);
      assert.notEqual(author, 'Советник: Вакансия');
      assert.notEqual(await page.locator('[data-forecast]').innerText(), 'Экономика: ?');
      await page.reload();
      await panel.waitFor();
      assert.equal(await page.locator('[data-author]').innerText(), author);
      for (const turn of [2, 3]) {
        await page.getByRole('button', { name: 'Подписать решение и перейти дальше' }).click();
        await page.getByText(`Ход ${turn}`, { exact: true }).waitFor();
        await page.screenshot({ path: join(out, `${width}-decision-${turn}.png`), fullPage: true });
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'нет горизонтального вылета');
      assert.equal(await page.getByRole('alert').count(), 0);
      for (const mail of ['former', 'vacant']) {
        await page.goto(pathToFileURL(file).href + '?mail=' + mail);
        await page.getByRole('button', { name: /^Сообщения/ }).click();
        const dialog = page.locator('.sv-desk-dialog');
        await dialog.locator('[data-correspondence="program:exports"]').click();
        const author = await page.locator('html').getAttribute('data-report-author');
        assert.equal(await dialog.locator('h3').innerText(), author, 'письмо открывается под прежним автором');
        await page.screenshot({ path: join(out, `${width}-mail-${mail}.png`), fullPage: false });
        await page.getByRole('button', { name: 'Закрыть и вернуться к главному делу', exact: true }).click();
        await page.getByRole('button', { name: 'Получить следующий доклад', exact: true }).click();
        await page.getByRole('button', { name: /^Сообщения/ }).click();
        await dialog.locator('[data-correspondence="program:exports"]').click();
        assert.equal(await dialog.locator('h3').innerText(), await page.locator('html').getAttribute('data-next-author'),
          'только новый доклад подписывает преемник');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      summary.widths.push(width);
      await context.close();
    }
    assert.deepEqual(summary.problems, []);
  } catch (error) { summary.problems.push(error.stack); throw error; }
  finally { await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2)); await browser.close(); }
}
console.log(`cabinet fixture: ${file}`);
