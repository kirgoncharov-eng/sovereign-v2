import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, PT_Mono, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

// Share Tech Mono не содержит кириллицы — для неё браузер берёт PT Mono из того же стека.
const tech = Share_Tech_Mono({
  variable: "--font-tech",
  subsets: ["latin"],
  weight: "400",
});

const ptMono = PT_Mono({
  variable: "--font-ptmono",
  subsets: ["cyrillic"],
  weight: "400",
});

const DESCRIPTION = "Двадцать решений. Одна страна. Политический триллер, где каждый ход — глава детектива: заговоры, выборы, предатели в собственном совете.";

export const metadata: Metadata = {
  title: "Суверен — политический триллер",
  description: DESCRIPTION,
  openGraph: { title: "Суверен", description: DESCRIPTION, type: "website", locale: "ru_RU" },
  twitter: { card: "summary", title: "Суверен", description: DESCRIPTION },
  appleWebApp: { capable: true, title: "Суверен", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#07090e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${serif.variable} ${tech.variable} ${ptMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
