// Страница итога для ссылки «Поделиться»: Telegram берёт из неё превью с карточкой (og:image),
// а человек, открывший ссылку, видит итог друга и кнопку «Играть».
import type { Metadata } from "next";
import { headers } from "next/headers";
import { botLink, parseShare, shareCaption, shareQuery } from "@/lib/share.ts";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function origin() {
  const env = (process.env.APP_URL ?? "").trim().replace(/\/$/, "");
  if (env) return env;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const r = parseShare(await searchParams);
  if (!r) return { title: "Суверен — политический триллер" };
  const cap = shareCaption(r);
  const image = { url: `${await origin()}/api/card?${shareQuery(r)}`, width: 1200, height: 630, alt: cap.title };
  return {
    title: `${cap.title} · Суверен`,
    description: `${cap.description} ${cap.challenge}`,
    openGraph: { title: cap.title, description: `${cap.description} ${cap.challenge}`, images: [image], type: "website", locale: "ru_RU" },
    twitter: { card: "summary_large_image", title: cap.title, description: cap.description, images: [image.url] },
  };
}

export default async function ResultPage({ searchParams }: Props) {
  const r = parseShare(await searchParams);
  const cap = r && shareCaption(r);
  return (
    <main style={{ minHeight: "100vh", background: "#2a2622", display: "flex", justifyContent: "center", padding: "32px 16px", fontFamily: "var(--font-serif), Georgia, serif" }}>
      <div style={{ maxWidth: 640, width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
        {r && cap ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- картинка рисуется сервером по параметрам ссылки */}
            <img src={`/api/card?${shareQuery(r)}`} alt={cap.title} width={1200} height={630} style={{ width: "100%", height: "auto", boxShadow: "6px 6px 0 #0008" }} />
            <p style={{ color: "#e8dfc8", fontSize: 18, lineHeight: 1.6, margin: 0 }}>{cap.description} {cap.challenge}</p>
          </>
        ) : (
          <p style={{ color: "#e8dfc8", fontSize: 18, lineHeight: 1.6, margin: 0 }}>«Суверен» — политический триллер в Telegram: одна страна, один президент — кто продержится у власти дольше.</p>
        )}
        <a href={botLink()} style={{ alignSelf: "flex-start", background: "#c9a227", color: "#2a2622", padding: "14px 28px", fontSize: 18, fontWeight: 700, textDecoration: "none", border: "2px solid #0008", boxShadow: "3px 3px 0 #0008" }}>
          Играть в Telegram →
        </a>
      </div>
    </main>
  );
}
