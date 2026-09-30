// Сборка играбельного демо для артефакта claude.ai: один HTML-файл без сервера.
// Запуск: npm run build:demo → demo/dist/sovereign.html
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// В браузерном демо запросы к /api/ai заменяются вызовами Claude со страницы.
const demoAliases = {
  name: "demo-aliases",
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/client\/api\.ts$/ }, () => ({ path: path.join(here, "claudeApi.ts") }));
    b.onResolve({ filter: /^@\// }, args => ({ path: path.join(root, args.path.slice(2)) }));
  },
};

const result = await build({
  entryPoints: [path.join(here, "entry.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [demoAliases],
  logLevel: "warning",
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = await readFile(path.join(here, "page.css"), "utf8");
const fonts = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=PT+Mono&family=Share+Tech+Mono&display=swap";

const html = `<title>Суверен</title>
<link rel="stylesheet" href="${fonts}">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;

await mkdir(path.join(here, "dist"), { recursive: true });
const out = path.join(here, "dist", "sovereign.html");
await writeFile(out, html);
console.log(`demo → ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
