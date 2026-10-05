import type { Metadata, Viewport } from "next";
import { Marck_Script, PT_Mono, PT_Serif } from "next/font/google";
import "./globals.css";

// Гарнитуры ParaType — шрифты российского делопроизводства; Marck Script — рукописные резолюции.
// Пиксельные шрифты интерфейса подключены в globals.css (public/fonts) с поправкой кегля.
const serif = PT_Serif({ variable: "--font-serif", subsets: ["latin", "cyrillic"], weight: ["400", "700"], style: ["normal", "italic"] });
const ptMono = PT_Mono({ variable: "--font-ptmono", subsets: ["latin", "cyrillic"], weight: "400" });
const hand = Marck_Script({ variable: "--font-hand", subsets: ["latin", "cyrillic"], weight: "400" });

const DESCRIPTION = "Сколько лет вы продержитесь у власти? Политический триллер, где каждый ход — глава детектива: заговоры, выборы, предатели в собственном совете.";

export const metadata: Metadata = {
  title: "Суверен — политический триллер",
  description: DESCRIPTION,
  openGraph: { title: "Суверен", description: DESCRIPTION, type: "website", locale: "ru_RU" },
  twitter: { card: "summary", title: "Суверен", description: DESCRIPTION },
  appleWebApp: { capable: true, title: "Суверен", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#2a2622",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${serif.variable} ${ptMono.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
