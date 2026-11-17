// #104: настоящая production-сборка Next. Без токенов, Redis и внешних сообщений.
// Сначала npm run build; --http-only пропускает только браузерную часть.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { shareQuery } from '../lib/share.ts';

const root = resolve('.');
const out = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'playtest/next-upgrade');
const httpOnly = process.argv.includes('--http-only');
mkdirSync(out, { recursive: true });
const summary = { next: JSON.parse(readFileSync('node_modules/next/package.json', 'utf8')).version,
  httpOnly, checks: [], problems: [] };
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const base = `http://127.0.0.1:${port}`;
const isolatedEnv = { ...process.env, APP_URL: base, TELEGRAM_BOT_TOKEN: '', TELEGRAM_WEBHOOK_SECRET: '',
  UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_URL: '', KV_REST_API_TOKEN: '' };
let serverLog = '';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: root, env: isolatedEnv, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
let startupError;
server.on('error', error => { startupError = error; });
const get = path => fetch(`${base}${path}`, { signal: AbortSignal.timeout(30000) });

try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error(`Next завершился до готовности: ${server.exitCode}`);
    try {
      const response = await fetch(`${base}/api/card`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 400) break;
    } catch { /* Сервер ещё не слушает порт. */ }
    if (Date.now() >= deadline) throw new Error('Production-сервер Next не готов за 30 с');
    await delay(150);
  }
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Суверен/);
  summary.checks.push('home-200');
  const query = shareQuery({ name: 'Михаил Рович', country: 'Беларусь · 1978', end: 'reelected', title: 'Второй срок',
    turns: 16, from: 1978, to: 1982, rating: 63, score: 1500, kept: 2, promised: 3 });
  for (const [format, width, height] of [['wide', 1200, 630], ['story', 1080, 1920]]) {
    const response = await get(`/api/card?${query}${format === 'story' ? '&f=story' : ''}`);
    assert.equal(response.status, 200, format);
    assert.match(response.headers.get('content-type'), /^image\/png/);
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width, height]);
    writeFileSync(join(out, `card-${format}.png`), png);
    summary.checks.push(`card-${format}-${width}x${height}`);
  }
  assert.equal((await get('/api/card')).status, 400);
  const result = await get(`/r?${query}`);
  assert.equal(result.status, 200);
  const resultHtml = await result.text();
  assert.match(resultHtml, /og:image/);
  assert.match(resultHtml, /api\/card\?/);
  assert.match(resultHtml, /Михаил Рович/);
  summary.checks.push('result-page-and-og');
  const telegram = await get('/api/telegram');
  assert.equal(telegram.status, 200);
  const diagnostic = await telegram.json();
  assert.equal(diagnostic.botToken, 'НЕТ');
  assert.equal(diagnostic.webhookSecret, 'НЕТ');
  const rejected = await fetch(`${base}/api/telegram`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(30000) });
  assert.equal(rejected.status, 403, 'без секрета обновление не обрабатывается');
  summary.checks.push('telegram-diagnostic-and-secret-rejection');
  const image = await get('/_next/image?url=%2Fart%2Fscenes%2Farchive.webp&w=384&q=75');
  assert.equal(image.status, 200, 'штатный optimizer доступен даже без next/image в UI');
  assert.match(image.headers.get('content-type'), /^image\//);
  summary.checks.push('local-image-optimizer');
  if (!httpOnly) {
    const browserLog = [];
    const player = spawn(process.execPath, ['scripts/playtest-chronicle.mjs', `--url=${base}`, '--decisions=6', `--out=${join(out, 'chronicle')}`],
      { cwd: root, env: isolatedEnv, stdio: ['ignore', 'pipe', 'pipe'], signal: AbortSignal.timeout(180000) });
    player.stdout.on('data', data => { browserLog.push(data); });
    player.stderr.on('data', data => { browserLog.push(data); });
    try {
      const [code] = await once(player, 'exit');
      assert.equal(code, 0, 'production-партия, сохранение и reload');
      const chronicle = JSON.parse(readFileSync(join(out, 'chronicle/summary.json'), 'utf8'));
      assert.equal(chronicle.decisions, 6);
      assert.deepEqual(chronicle.problems, []);
      summary.checks.push('production-chronicle-6-decisions-save-reload');
    } finally { writeFileSync(join(out, 'browser.log'), Buffer.concat(browserLog)); }
  }
} catch (error) {
  summary.problems.push(error.stack ?? String(error));
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, 'exit');
    server.kill('SIGTERM');
    await Promise.race([stopped, delay(5000, null, { ref: false }).then(() => server.kill('SIGKILL'))]);
  }
  writeFileSync(join(out, 'server.log'), serverLog);
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
}
console.log(JSON.stringify(summary, null, 2));
assert.deepEqual(summary.problems, []);
