// Карточка итога картинкой: /api/card?<параметры из lib/share.ts>. Широкая (1200×630) — для превью
// ссылки в Telegram, &f=story — вертикальная (1080×1920) для историй.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { END_TYPES } from "@/lib/game/data.ts";
import { BOT_USERNAME, parseShare, shareCaption, survived } from "@/lib/share.ts";

const PAPER = "#d9cfb2", INK = "#2a241d", INK2 = "#5a5040", RED = "#a02f24", GREEN = "#3d6a27", RULE = "#2a241d";

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" | "italic" }[]> | null = null;
const loadFonts = () => fonts ??= Promise.all([
  ["Handjet", "handjet-bold.ttf", 700, "normal"], ["Handjet", "handjet-regular.ttf", 400, "normal"],
  ["Serif", "LiberationSerif-Bold.ttf", 700, "normal"], ["Serif", "LiberationSerif-Regular.ttf", 400, "normal"],
  ["Serif", "LiberationSerif-Italic.ttf", 400, "italic"],
].map(async ([name, file, weight, style]) => ({
  name: name as string, data: await readFile(join(process.cwd(), "assets/fonts", file as string)),
  weight: weight as 400 | 700, style: style as "normal" | "italic",
})));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = parseShare(url.searchParams);
  if (!r) return new Response("bad request", { status: 400 });
  const story = url.searchParams.get("f") === "story";
  const W = story ? 1080 : 1200, H = story ? 1920 : 630;
  const s = story ? 1.5 : 1; // масштаб шрифтов
  const loss = !survived(r);
  const cap = shareCaption(r);
  const stampColor = loss ? RED : GREEN;
  const stats: [string, string][] = [
    [`${r.turns}`, "решений из 20"], [`${r.rating}%`, "рейтинг"],
    ...(r.promised ? [[`${r.kept}/${r.promised}`, "обещаний сдержано"] as [string, string]] : []),
    [`${r.score}`, "очков"],
  ];

  const stamp = (
    <div style={{ display: "flex", transform: "rotate(-6deg)", border: `${5 * s}px solid ${stampColor}`, padding: `${6 * s}px`, opacity: 0.88, alignSelf: story ? "center" : "flex-start" }}>
      <div style={{ display: "flex", border: `${2 * s}px solid ${stampColor}`, padding: `${8 * s}px ${22 * s}px`, color: stampColor, fontFamily: "Handjet", fontWeight: 700, fontSize: 40 * s, textTransform: "uppercase", letterSpacing: 2 }}>
        {r.title || END_TYPES[r.end as keyof typeof END_TYPES]}
      </div>
    </div>
  );

  const img = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, padding: story ? "110px 90px" : "44px 60px", fontFamily: "Serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontFamily: "Handjet", fontWeight: 700, fontSize: 64 * s, lineHeight: 1 }}>СУВЕРЕН</div>
        <div style={{ fontFamily: "Handjet", fontSize: 34 * s, color: INK2 }}>{r.daily ? `Дело дня · ${r.daily.slice(8)}.${r.daily.slice(5, 7)}` : "Итоги правления"}</div>
      </div>
      <div style={{ display: "flex", height: 5 * s, background: RULE, marginTop: 14 * s }} />
      <div style={{ display: "flex", height: 2 * s, background: RULE, marginTop: 5 * s }} />

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 22 * s, alignItems: story ? "center" : "flex-start", textAlign: story ? "center" : "left" }}>
        <div style={{ fontFamily: "Handjet", fontSize: 36 * s, color: INK2 }}>{`${r.country} · ${r.from}–${r.to}`}</div>
        <div style={{ fontWeight: 700, fontSize: (r.name.length > 22 ? 58 : 70) * s, lineHeight: 1.05 }}>{r.name}</div>
        {stamp}
        {r.arc ? <div style={{ fontFamily: "Handjet", fontSize: 32 * s, color: r.solved ? GREEN : RED }}>{`Интрига «${r.arc}»: ${r.solved ? "раскрыта" : "осталась тайной"}`}</div> : null}
      </div>

      <div style={{ display: "flex", height: 2 * s, background: RULE, marginBottom: 16 * s }} />
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: story ? 40 : 0 }}>
        {stats.map(([n, l]) => (
          <div key={l} style={{ display: "flex", flexDirection: "column", width: story ? "45%" : "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 56 * s, lineHeight: 1.05 }}>{n}</div>
            <div style={{ fontFamily: "Handjet", fontSize: 28 * s, color: INK2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 * s, flexDirection: story ? "column" : "row", gap: story ? 16 : 0, textAlign: story ? "center" : "left" }}>
        <div style={{ fontStyle: "italic", fontSize: 30 * s }}>{cap.challenge}</div>
        <div style={{ fontFamily: "Handjet", fontWeight: 700, fontSize: 32 * s, color: INK2 }}>{`Играть: t.me/${BOT_USERNAME}`}</div>
      </div>
    </div>
  );

  return new ImageResponse(img, {
    width: W, height: H, fonts: await loadFonts(),
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
