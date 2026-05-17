import { notFound } from "next/navigation";
import { LevelStage } from "@/components/level/LevelStage";
import { loadLevel } from "@/lib/level/loadLevel";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LevelPage({ params }: Props) {
  const { id } = await params;
  const level = loadLevel(id);
  if (!level) notFound();
  return <LevelStage level={level} />;
}
