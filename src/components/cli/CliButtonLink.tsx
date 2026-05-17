"use client";

import type { ReactNode } from "react";
import styles from "./CliLink.module.css";

type Props = {
  onClick: () => void;
  children: ReactNode;
  type?: "button" | "submit";
};

/** Button styled identically to CliLink — used in form submissions. */
export function CliButtonLink({
  onClick,
  children,
  type = "button",
}: Props) {
  return (
    <button type={type} onClick={onClick} className={styles.link}>
      {children}
    </button>
  );
}
