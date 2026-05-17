import { CliBrand } from "@/components/cli/CliBrand";
import { CliLink } from "@/components/cli/CliLink";
import { CliPage } from "@/components/cli/CliPage";
import { CliShell } from "@/components/cli/CliShell";
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

export default function StartPage() {
  return (
    <CliPage>
      <CliShell>
        <span>
          Welcome to the <CliBrand />!
        </span>
        <CliLink href="/levels/place-order">Start &gt;</CliLink>
        <CliShell.Group>
          {ASCII_ROWS.map((row, i) => (
            <pre key={i} className={styles.ascii}>
              {row}
            </pre>
          ))}
        </CliShell.Group>
        <span>Loading Inc. © 2026</span>
      </CliShell>
    </CliPage>
  );
}
