import type { Metadata, Viewport } from "next";
import { Marck_Script, PT_Mono, PT_Sans_Narrow, PT_Serif } from "next/font/google";
import "./globals.css";

// Гарнитуры ParaType — шрифты российского делопроизводства; Marck Script — рукописные резолюции.
const serif = PT_Serif({ variable: "--font-serif", subsets: ["latin", "cyrillic"], weight: ["400", "700"], style: ["normal", "italic"] });
const narrow = PT_Sans_Narrow({ variable: "--font-narrow", subsets: ["latin", "cyrillic"], weight: ["400", "700"] });
const ptMono = PT_Mono({ variable: "--font-ptmono", subsets: ["latin", "cyrillic"], weight: "400" });
const hand = Marck_Script({ variable: "--font-hand", subsets: ["latin", "cyrillic"], weight: "400" });

const DESCRIPTION = "Двадцать решений. Одна страна. Политический триллер, где каждый ход — глава детектива: заговоры, выборы, предатели в собственном совете.";

export const metadata: Metadata = {
  title: "Суверен — политический триллер",
  description: DESCRIPTION,
  openGraph: { title: "Суверен", description: DESCRIPTION, type: "website", locale: "ru_RU" },
  twitter: { card: "summary", title: "Суверен", description: DESCRIPTION },
  appleWebApp: { capable: true, title: "Суверен", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#17221b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${serif.variable} ${narrow.variable} ${ptMono.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
