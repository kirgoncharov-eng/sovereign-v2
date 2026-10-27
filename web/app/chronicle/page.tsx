import type { Metadata } from "next";
import Chronicle from "./Chronicle";

export const metadata: Metadata = {
  title: "Суверен — хроника срока",
  robots: { index: false, follow: false },
};

// Прототип #298: срок президента одной хроникой. В основную игру не подключён.
export default function ChroniclePage() {
  return <Chronicle />;
}
