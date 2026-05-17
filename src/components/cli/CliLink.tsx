import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./CliLink.module.css";

type Props = {
  href: string;
  children: ReactNode;
};

export function CliLink({ href, children }: Props) {
  return (
    <Link href={href} className={styles.link}>
      {children}
    </Link>
  );
}
