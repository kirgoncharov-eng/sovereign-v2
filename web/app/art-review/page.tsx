import type { Metadata } from "next";
import { ALTERNATE_COUNTRY } from "@/lib/game/alternate-world.ts";
import { createAdvisorArtScene } from "@/lib/client/advisor-art-review.ts";
import AdvisorArtReview from "./AdvisorArtReview";

export const metadata: Metadata = {
  title: "Суверен — эскиз спора советников",
  robots: { index: false, follow: false },
};

export default async function ArtReviewPage() {
  const scenes = await Promise.all([ALTERNATE_COUNTRY].map(createAdvisorArtScene));
  return <AdvisorArtReview scenes={scenes}/>;
}
