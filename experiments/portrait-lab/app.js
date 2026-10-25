import { pixelit } from './vendor/pixelit/pixelit.js';
import { PALETTES_BY_NAME } from './engine';

const byId = id => document.getElementById(id);
const assets = ASSET_MAP;
const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
const worker = new Worker(workerUrl);
let source = null;
let currentBlob = null;
let requestId = 0;
let renderTimer;
let selection = 'a';
let errors = 0;
let aReadyId = 0;
let bReadyId = 0;
const activePalette = () => PALETTES_BY_NAME[byId('palette').value];

function canvas(width, height) {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  return output;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось открыть изображение. Попробуйте JPEG или PNG.'));
    image.src = url;
  });
}

function notice(text) { byId('notice').textContent = text; }

function show(frame, target) {
  target.width = frame.width;
  target.height = frame.height;
  target.getContext('2d').putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
}

function describe(target, ms) {
  const data = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
  const colors = new Set();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3]) colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
  }
  const valid = [...colors].every(color => activePalette().some(item => item.join(',') === color));
  const text = `${target.width} × ${target.height} · ${colors.size} цветов · ${ms.toFixed(1)} мс`;
  byId(`${target.id}-stats`).textContent = text;
  byId(`${target.id}-stats`).dataset.paletteValid = String(valid);
  byId(`${target.id}-stats`).dataset.elapsed = ms.toFixed(1);
}

function updateId() {
  const selected = byId(selection);
  const target = byId('id-face');
  target.width = selected.width;
  target.height = selected.height;
  target.getContext('2d').drawImage(selected, 0, 0);
  byId('credential-name').textContent = byId('name').value.trim() || 'Ваше имя';
  byId('download').disabled = !source || aReadyId !== requestId || bReadyId !== requestId;
  byId('download-sheet').disabled = byId('download').disabled;
}

function complete(id) {
  if (id !== requestId || aReadyId !== id || bReadyId !== id) return;
  updateId();
  notice('Готово. Сравните узнаваемость лица и портреты игры ниже.');
  byId('notice').dataset.completed = String(id);
  byId('notice').dataset.errors = String(errors);
}

function crop() {
  const zoom = Number(byId('zoom').value);
  const fraction = Math.min(source.width / 3, source.height / 4) / zoom;
  const width = fraction * 3;
  const height = fraction * 4;
  const left = (source.width - width) * Number(byId('x').value) / 100;
  const top = (source.height - height) * Number(byId('y').value) / 100;
  const output = canvas(192, 256);
  const context = output.getContext('2d');
  context.fillStyle = '#ded1ac';
  context.fillRect(0, 0, 192, 256);
  context.drawImage(source, left, top, width, height, 0, 0, 192, 256);
  byId('original').width = 192;
  byId('original').height = 256;
  byId('original').getContext('2d').drawImage(output, 0, 0);
  return output;
}

async function render() {
  if (!source) return;
  const id = ++requestId;
  notice('Готовим два варианта…');
  byId('download').disabled = true;
  const input = crop();
  const width = Number(byId('resolution').value);
  const frame = { width: input.width, height: input.height,
    data: input.getContext('2d').getImageData(0, 0, input.width, input.height).data };
  const paletteName = byId('palette').value;
  worker.postMessage({ id, frame, width, strength: Number(byId('strength').value), paletteName });
  updateSwatches();
  try {
    // Pixel It uses an image source. Avoid its >300px border-correction branch by using a 192×256 crop.
    const image = await loadImage(input.toDataURL('image/png'));
    if (id !== requestId) return;
    const start = performance.now();
    const output = canvas(192, 256);
    new pixelit({ from: image, to: output, scale: width / 192 * 100, palette: activePalette() })
      .draw().pixelate().convertPalette();
    const target = byId('a');
    target.width = width;
    target.height = Math.round(width * 4 / 3);
    const context = target.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(output, 0, 0, target.width, target.height);
    describe(target, performance.now() - start);
    aReadyId = id;
    complete(id);
  } catch (error) {
    errors++;
    notice(error.message);
  }
}

worker.onmessage = event => {
  const { id, output, elapsed, error } = event.data;
  if (id !== requestId) return;
  if (error) { errors++; notice(error); return; }
  show(output, byId('b'));
  describe(byId('b'), elapsed);
  bReadyId = id;
  complete(id);
};
worker.onerror = () => { errors++; notice('Не удалось запустить обработку. Перезагрузите страницу.'); };

function schedule() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 120);
}

async function sample(key) {
  if (currentBlob) { URL.revokeObjectURL(currentBlob); currentBlob = null; }
  try {
    source = await loadImage(assets[key]);
    byId('zoom').value = key === 'collins.png' ? '1.65' : '3';
    byId('x').value = key === 'collins.png' ? '34' : '68';
    byId('y').value = key === 'collins.png' ? '12' : '20';
    byId('sample-label').textContent = key === 'collins.png' ? 'Образец: Эйлин Коллинз, NASA' : 'Образец: Нил Армстронг, NASA';
    render();
  } catch (error) { notice(error.message); }
}

byId('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { notice('Выберите фотографию до 20 МБ.'); return; }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    notice('Поддерживаются JPEG, PNG и WebP. HEIC сначала сохраните как JPEG.'); return;
  }
  const blob = URL.createObjectURL(file);
  try {
    const image = await loadImage(blob);
    if (image.width * image.height > 40_000_000) throw new Error('Фотография слишком большая. Уменьшите её до 40 мегапикселей.');
    if (currentBlob) URL.revokeObjectURL(currentBlob);
    currentBlob = blob;
    source = image;
    byId('zoom').value = '1'; byId('x').value = '50'; byId('y').value = '30';
    byId('sample-label').textContent = 'Ваша фотография · только в этой вкладке';
    render();
  } catch (error) { URL.revokeObjectURL(blob); notice(error.message); }
});

for (const name of ['resolution', 'palette', 'strength', 'zoom', 'x', 'y']) byId(name).addEventListener('input', schedule);
byId('name').addEventListener('input', updateId);
for (const key of ['a', 'b']) byId(`choose-${key}`).addEventListener('click', () => {
  selection = key;
  for (const value of ['a', 'b']) byId(`choose-${value}`).setAttribute('aria-pressed', String(value === key));
  updateId();
});
byId('collins').addEventListener('click', () => sample('collins.png'));
byId('armstrong').addEventListener('click', () => sample('armstrong.jpg'));
function download(target, filename) {
  target.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
}
byId('download').addEventListener('click', () => download(byId(selection), 'sovereign-portrait.png'));
byId('download-sheet').addEventListener('click', () => {
  const sheet = canvas(1200, 650);
  const context = sheet.getContext('2d');
  context.fillStyle = '#191b19'; context.fillRect(0, 0, sheet.width, sheet.height);
  context.fillStyle = '#e1d5b7'; context.font = '28px Georgia';
  context.fillText('СУВЕРЕН / ОПЫТ ПОРТРЕТА БЕЗ МОДЕЛЕЙ', 35, 48);
  context.font = '15px Arial'; context.fillStyle = '#b8bfad';
  context.fillText(`${byId('sample-label').textContent} · ${byId('resolution').value} px`, 35, 80);
  const items = [['original', 'Фотография'], ['a', 'А · Pixel It'], ['b', 'Б · Converter'], ['ref1', 'Персонаж игры']];
  for (const [index, [id, title]] of items.entries()) {
    const left = 35 + index * 294;
    context.imageSmoothingEnabled = id === 'original';
    context.drawImage(byId(id), left, 132, 250, 333);
    context.fillStyle = '#e1d5b7'; context.font = '21px Georgia'; context.fillText(title, left, 508);
    context.font = '12px Arial'; context.fillStyle = '#b8bfad';
    if (id === 'a' || id === 'b') context.fillText(byId(`${id}-stats`).textContent, left, 538);
  }
  context.font = '14px Arial';
  context.fillText('Тестовые фото NASA. Палитра предварительная. Фото не становятся персонажами игры.', 35, 600);
  download(sheet, 'sovereign-portrait-comparison.png');
});

for (const [id, key] of Object.entries({ ref1: 'amb_russia.webp', ref2: 'amb_eu.webp', ref3: 'journalist.webp' })) {
  byId(id).src = assets[key];
}
function updateSwatches() {
  byId('swatches').replaceChildren();
  byId('swatches').setAttribute('aria-label', `Пробная палитра из ${activePalette().length} цветов`);
  for (const color of activePalette()) {
    const swatch = document.createElement('span');
    swatch.style.backgroundColor = `rgb(${color.join(',')})`; byId('swatches').append(swatch);
  }
}
sample('collins.png');
