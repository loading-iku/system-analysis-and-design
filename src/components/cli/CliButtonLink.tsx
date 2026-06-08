"use client";

import type { ReactNode } from "react";
import styles from "./CliLink.module.css";

type Props = {
  onClick: () => void;
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
};

/** Button styled identically to CliLink — used in form submissions. */
export function CliButtonLink({
  onClick,
  children,
  type = "button",
  disabled = false,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={styles.link}
    >
      {children}
    </button>
  );
}
