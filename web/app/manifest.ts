import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Суверен — политический триллер",
    short_name: "Суверен",
    description: "Одна страна. Один президент. Сколько лет вы продержитесь у власти? Политический триллер, где каждый ход — глава детектива.",
    start_url: "/",
    display: "standalone",
    background_color: "#2a2622",
    theme_color: "#2a2622",
    lang: "ru",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
