import { SignOutLink } from "@/components/auth/SignOutLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliShell } from "@/components/cli/CliShell";
import { STUDENT_EMAIL_SUFFIX } from "@/lib/auth/student";

type Props = {
  email?: string | null;
};

export function StudentAccessDenied({ email }: Props) {
  return (
    <CliPage>
      <CliShell>
        <span>Access denied</span>
        <span>{`Only ${STUDENT_EMAIL_SUFFIX} accounts can open the game.`}</span>
        <span>Use a student account to continue.</span>
        {email ? <span>{`Current session: ${email}`}</span> : <CliShell.Blank />}
        <SignOutLink />
        <CliShell.Blank />
        <span>Loading Inc. © 2026</span>
      </CliShell>
    </CliPage>
  );
}
