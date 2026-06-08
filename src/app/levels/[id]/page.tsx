import { notFound } from "next/navigation";
import { StudentAccessDenied } from "@/components/auth/StudentAccessDenied";
import { LevelStage } from "@/components/level/LevelStage";
import { getCurrentStudentAccess } from "@/lib/auth/studentServer";
import { loadLevel } from "@/lib/level/loadLevel";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LevelPage({ params }: Props) {
  const access = await getCurrentStudentAccess();
  if (access.kind !== "allowed") {
    return <StudentAccessDenied email={access.kind === "forbidden" ? access.email : null} />;
  }

  const { id } = await params;
  const level = loadLevel(id);
  if (!level) notFound();
  return <LevelStage level={level} />;
}
