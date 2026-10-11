import type { Metadata } from "next";
import { COUNTRIES } from "@/lib/game/data.ts";
import { createAdvisorArtScene } from "@/lib/client/advisor-art-review.ts";
import TurnInterfaceReview from "./TurnInterfaceReview";

export const metadata: Metadata = {
  title: "Суверен — один ход на столе",
  robots: { index: false, follow: false },
};

export default async function InterfaceReviewPage() {
  const scenes = await Promise.all(Object.keys(COUNTRIES).map(createAdvisorArtScene));
  return <TurnInterfaceReview scenes={scenes}/>;
}
