import { StudentAccessDenied } from "@/components/auth/StudentAccessDenied";
import { LevelsIndexClient } from "@/components/levels/LevelsIndexClient";
import { getCurrentStudentAccess } from "@/lib/auth/studentServer";

export const runtime = "edge";

export default async function LevelsIndexPage() {
  const access = await getCurrentStudentAccess();
  if (access.kind !== "allowed") {
    return <StudentAccessDenied email={access.kind === "forbidden" ? access.email : null} />;
  }

  return <LevelsIndexClient />;
}
