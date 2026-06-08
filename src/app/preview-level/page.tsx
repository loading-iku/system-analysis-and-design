import { notFound } from "next/navigation";
import { LevelStage } from "@/components/level/LevelStage";
import { loadLevel } from "@/lib/level/loadLevel";

// TEMPORARY dev-only verification route (ungated). Delete after QA.
export default function PreviewLevelPage() {
  const level = loadLevel("place-order");
  if (!level) notFound();
  return <LevelStage level={level} />;
}
