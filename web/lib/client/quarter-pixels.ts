import { drawScene } from './scenes.ts';
import { drawSquare } from './square.ts';
import type { QuarterTransition } from './quarter-transition.ts';

// Посыльный пересекает площадь; затем камера показывает жизнь у больницы или новый сезон.
export function drawQuarter(ctx: CanvasRenderingContext2D, width: number, height: number, scene: QuarterTransition, elapsed: number) {
  const progress = Math.max(0, Math.min(1, elapsed / scene.duration));
  const frame = Math.floor(elapsed / 120);
  const delivery = progress < .36;
  if (delivery) drawSquare(ctx, width, height, scene.before, frame);
  else if (scene.kind === 'hospital') drawScene(ctx, width, height, 'hospital', scene.after, frame, `clinic:${scene.staffing}`);
  else drawSquare(ctx, width, height, scene.after, frame);
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
