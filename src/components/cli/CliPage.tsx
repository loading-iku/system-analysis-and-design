import type { ReactNode } from "react";
import styles from "./CliPage.module.css";

type Props = {
  children: ReactNode;
};

/** Centers a CliShell on the page with the standard terminal padding. */
export function CliPage({ children }: Props) {
  return (
    <div className={styles.page}>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
