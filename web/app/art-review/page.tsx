import type { Metadata } from "next";
import { COUNTRIES } from "@/lib/game/data.ts";
import { createAdvisorArtScene } from "@/lib/client/advisor-art-review.ts";
import AdvisorArtReview from "./AdvisorArtReview";

export const metadata: Metadata = {
  title: "Суверен — эскиз спора советников",
  robots: { index: false, follow: false },
};

export default async function ArtReviewPage() {
  const scenes = await Promise.all(Object.keys(COUNTRIES).map(createAdvisorArtScene));
  return <AdvisorArtReview scenes={scenes}/>;
}
