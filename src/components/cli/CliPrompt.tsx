"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import styles from "./CliPrompt.module.css";

type Props = {
  label: string;
  type?: "text" | "email" | "password";
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  name?: string;
  required?: boolean;
};

export function CliPrompt({
  label,
  type = "text",
  value,
  defaultValue,
  onChange,
  autoComplete,
  autoFocus,
  name,
  required,
}: Props) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = isControlled ? value : internal;

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternal(e.target.value);
    onChange?.(e.target.value);
  };

  return (
    <label className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.caret}>&gt;</span>
      <input
        className={styles.input}
        type={type}
        value={current}
        onChange={handle}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        name={name}
        required={required}
        spellCheck={false}
      />
    </label>
  );
}
