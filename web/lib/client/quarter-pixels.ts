import { drawScene } from './scenes.ts';
import { drawSquare } from './square.ts';
import type { QuarterTransition } from './quarter-transition.ts';

// Посыльный пересекает площадь; затем камера показывает жизнь у больницы или на заводе.
export function drawQuarter(ctx: CanvasRenderingContext2D, width: number, height: number, scene: QuarterTransition, elapsed: number) {
  const progress = Math.max(0, Math.min(1, elapsed / scene.duration));
  const frame = Math.floor(elapsed / 120);
  const delivery = progress < .36;
  if (delivery) drawSquare(ctx, width, height, scene.before, frame);
  else if (scene.kind === 'factory') drawScene(ctx, width, height, 'factory', scene.after, frame);
  else drawScene(ctx, width, height, 'hospital', scene.after, frame, `clinic:${scene.staffing}`);
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  if (delivery) {
    const x = width * (.12 + progress / .36 * .78), y = height * .84;
    const step = frame % 2;
    px(x, y - 9, 3, 3, '#d6b48e'); px(x - 1, y - 7, 5, 1, '#35372e');
    px(x, y - 6, 3, 4, '#484d3a'); px(x - step, y - 2, 1, 3, '#23211e'); px(x + 2 + step, y - 2, 1, 3, '#23211e');
    px(x + 3, y - 5, 4, 3, '#e8dfc7'); px(x + 4, y - 4, 1, 1, '#a02f24');
  }
  if (!delivery && scene.factory) {
    const outcome = scene.factory;
    const movement = (progress - .36) / .64;
    const ground = Math.floor(height * .88);
    // Остановившийся грузовик при провале; при авансе — отгрузка по подписанному заказу.
    if ((!outcome.success && outcome.path !== 'a') || outcome.path === 'b') {
      const truck = outcome.success ? width * (.15 + movement * .6) : width * .55;
      px(truck, ground - 13, 26, 11, outcome.success ? '#a0a189' : '#5a615c');
      px(truck + 26, ground - 9, 9, 7, '#49594c');
      px(truck + 28, ground - 8, 5, 3, '#aebbae');
      px(truck + 4, ground - 2, 5, 5, '#202b26'); px(truck + 27, ground - 2, 5, 5, '#202b26');
    } else if (outcome.path === 'a') {
      // Рабочие расходятся с конвертами после фактической выплаты.
      for (let person = 0; person < 4; person++) {
        const x = width * .38 + person * 11 + (outcome.success ? movement * 28 : 0);
        px(x, ground - 10, 3, 3, '#d4b890'); px(x - 1, ground - 7, 5, 6, '#506351');
        if (outcome.success) px(x + 3, ground - 5, 4, 2, '#e5d8b9');
        px(x + frame % 2, ground - 1, 2, 3, '#29352d');
      }
    } else {
      // Переоборудование идёт; первая готовая продукция ещё не обещана.
      for (let crate = 0; crate < 3; crate++) {
        const x = width * .3 + crate * 19;
        px(x, ground - 12, 14, 12, '#a28c5c'); px(x + 6, ground - 12, 2, 12, '#685c42');
      }
      px(width * .65, ground - 19, 4, 4, '#ceb58e');
      px(width * .65 - 1, ground - 15, 6, 9, '#bd9e4d');
      px(width * .65 + 5, ground - 14 + frame % 2, 7, 2, '#a8aaa0');
    }
    if (!outcome.success && outcome.path !== 'a') {
      px(width * .72, ground - 16, 2, 18, '#483e32');
      px(width * .55, ground - 15, width * .2, 3, '#ab6545');
    }
  }
  // Та же погода и время года, что в датах партии; без декоративной вечной зимы.
  if (!delivery && scene.kind === 'hospital') {
    if (scene.after.season === 'winter') {
      px(0, height - 2, width, 2, '#c8cbd0');
      for (let i = 0; i < 15; i++) px((i * 17 + frame * 2) % width, (i * 11 + frame) % height, 1, 1, '#e3e5e7');
    } else {
      const color = scene.after.season === 'autumn' ? '#8d653e' : '#61794b';
      px(2, height - 3, 9, 2, color); px(width - 14, height - 3, 10, 2, color);
    }
  }
  // Кадровый резерв поступает в больницу. Это движение людей, а не новая прибавка прогресса.
  if (!delivery && scene.kind === 'hospital' && scene.staffing > 0) {
    const x = width * (.03 + Math.min(1, (progress - .36) / .64) * .44), y = height * .82;
    px(x, y - 6, 2, 2, '#d6b48e'); px(x, y - 4, 2, 4, '#e8e4d8'); px(x + 2, y - 3, 3, 2, '#755f43');
  }
}
