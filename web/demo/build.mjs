// Сборка играбельного демо для артефакта claude.ai: один HTML-файл без сервера.
// Запуск: npm run build:demo → demo/dist/sovereign.html
import { build } from "esbuild";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// Пути «@/…» указывают на корень веб-приложения, как в Next.
const demoAliases = {
  name: "demo-aliases",
  setup(b) {
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
  outfile: path.join(here, "dist", "game.js"),
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SHARE_URL": '""', "process.env.NEXT_PUBLIC_ANALYTICS": '"off"', "process.env.NEXT_PUBLIC_BOT_USERNAME": '""' },
  plugins: [demoAliases],
  logLevel: "warning",
});

const js = result.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, "<\\/script");
const componentCss = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
// Стили общие с веб-версией: app/globals.css без директивы Tailwind.
const globals = (await readFile(path.join(root, "app", "globals.css"), "utf8")).replace(/@import\s+"tailwindcss";\s*/, "");
// Пиксельные шрифты из public/fonts встраиваются в страницу: у демо нет своего сервера.
const inlined = await Promise.all([...globals.matchAll(/url\(\/fonts\/([\w.-]+)\)/g)].map(async m =>
  [m[0], `url(data:font/woff2;base64,${(await readFile(path.join(root, "public", "fonts", m[1]))).toString("base64")})`]));
const css = (await readFile(path.join(here, "page.css"), "utf8")) + inlined.reduce((acc, [from, to]) => acc.replaceAll(from, to), globals);
const fonts = "https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400&family=PT+Mono&family=Marck+Script&display=swap";

// Inline the historical art so the standalone demo never depends on /art URLs.
const art = {};
for (const folder of ["scenes", "figures", "gemini-next"]) {
  for (const name of await readdir(path.join(root, "public", "art", folder))) {
    if (!name.endsWith(".webp")) continue;
    art[`/art/${folder}/${name}`] = `data:image/webp;base64,${(await readFile(path.join(root, "public", "art", folder, name))).toString("base64")}`;
  }
}

const html = `<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Суверен</title>
<link rel="stylesheet" href="${fonts}">
<style>${css}\n${componentCss}</style>
<div id="root"></div>
<script>window.__SOVEREIGN_ART__=${JSON.stringify(art)};${js}</script>
`;

await mkdir(path.join(here, "dist"), { recursive: true });
const out = path.join(here, "dist", "sovereign.html");
await writeFile(out, html);
console.log(`demo → ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
