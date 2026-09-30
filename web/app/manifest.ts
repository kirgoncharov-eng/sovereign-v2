import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Суверен — политический триллер",
    short_name: "Суверен",
    description: "Двадцать решений. Одна страна. Политический триллер, где каждый ход — глава детектива.",
    start_url: "/",
    display: "standalone",
    background_color: "#07090e",
    theme_color: "#07090e",
    lang: "ru",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
