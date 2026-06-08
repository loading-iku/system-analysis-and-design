import { StudentAccessDenied } from "@/components/auth/StudentAccessDenied";
import { SignOutLink } from "@/components/auth/SignOutLink";
import { CliBrand } from "@/components/cli/CliBrand";
import { CliLink } from "@/components/cli/CliLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliShell } from "@/components/cli/CliShell";
import { LeaderboardPanel } from "@/components/leaderboard/LeaderboardPanel";
import { StartSettingsPanel } from "@/components/start/StartSettingsPanel";
import { getCurrentStudentAccess } from "@/lib/auth/studentServer";
import { getLeaderboardEntries } from "@/lib/leaderboardServer";
import styles from "./start.module.css";

// ASCII desktop computer + monitor (8 rows), matching Figma node 1:51.
const ASCII_ROWS = [
  '            .------.',
  "  .--------. |  == |",
  ' .-""""""-. | |----|',
  ' ||      || | |  ==|',
  ' ||      || | |----|',
  " |'-....-'| | |::::|",
  ' `""")---("""`|___.|',
  ' /::::::::::\\" __',
  '/::::========:::\\`\\`\\',
  '`"""""""""""""`  `-`-`',
];

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function StartPage() {
  const access = await getCurrentStudentAccess();
  if (access.kind !== "allowed") {
    return <StudentAccessDenied email={access.kind === "forbidden" ? access.email : null} />;
  }

  const initialEntries = await getLeaderboardEntries();

  return (
    <CliPage wide>
      <section className={styles.layout}>
        <div className={styles.shellStack}>
          <div className={styles.shell}>
            <CliShell>
              <span>
                Welcome to the <CliBrand />!
              </span>
              <CliLink href="/levels">Start &gt;</CliLink>
              <SignOutLink />
              <CliShell.Group>
                {ASCII_ROWS.map((row, i) => (
                  <pre key={i} className={styles.ascii}>
                    {row}
                  </pre>
                ))}
              </CliShell.Group>
              <span>Loading Inc. © 2026</span>
            </CliShell>
          </div>

          <div className={styles.shell}>
            <StartSettingsPanel />
          </div>
        </div>

        <LeaderboardPanel initialEntries={initialEntries} />
      </section>
    </CliPage>
  );
}
