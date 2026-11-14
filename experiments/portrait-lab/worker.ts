import { stylize } from './engine';

self.onmessage = event => {
  const { id, frame, width, strength, paletteName } = event.data;
  try {
    const start = performance.now();
    const output = stylize(frame, width, strength, paletteName);
    self.postMessage({ id, output, elapsed: performance.now() - start });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
