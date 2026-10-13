import type { Metadata } from "next";
import NarrativeReview from "./NarrativeReview";

export const metadata: Metadata = {
  title: "Суверен — Неманская республика",
  robots: { index: false, follow: false },
};

export default function NarrativeReviewPage() {
  return <NarrativeReview />;
}
