import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(root, '../../web/package.json'));
const { build, transform } = require('esbuild');
const worker = await build({
  entryPoints: [join(root, 'worker.ts')], bundle: true, format: 'iife', target: 'es2020', write: false,
});
const assets = {};
for (const name of await readdir(join(root, 'assets'))) {
  const mime = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const data = await readFile(join(root, 'assets', name));
  assets[name] = `data:${mime};base64,${data.toString('base64')}`;
}
const result = await build({
  entryPoints: [join(root, 'app.js')], bundle: true, format: 'iife', target: 'es2020', write: false,
  define: { ASSET_MAP: JSON.stringify(assets), WORKER_SOURCE: JSON.stringify(worker.outputFiles[0].text) },
  plugins: [{
    name: 'pixelit-export-adapter',
    setup(builder) {
      builder.onLoad({ filter: /vendor\/pixelit\/pixelit\.js$/ }, async args => ({
        contents: `${await readFile(args.path, 'utf8')}\nexport { pixelit };`, loader: 'js',
      }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const hash = createHash('sha256').update(js).digest('base64');
const css = (await transform(await readFile(join(root, 'style.css'), 'utf8'), { loader: 'css' })).code;
let html = await readFile(join(root, 'index.template.html'), 'utf8');
html = html.replace('/*STYLE*/', css).replace('/*SCRIPT*/', () => js).replace('SCRIPT_HASH', `'sha256-${hash}'`);
const licenses = await Promise.all(['pixelit', 'converter'].map(name =>
  readFile(join(root, 'vendor', name, 'LICENSE'), 'utf8')));
html = html.replace('</body>', `<!-- Third-party notices\n${licenses.join('\n\n')}\n-->\n</body>`);
await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/index.html'), html);
await build({
  entryPoints: [join(root, 'engine.ts')], bundle: true, platform: 'node', format: 'esm',
  outfile: join(root, 'dist/engine.mjs'),
});
console.log(`Built ${Math.round(Buffer.byteLength(html) / 1024)} KB standalone page. No runtime dependencies or network assets.`);
