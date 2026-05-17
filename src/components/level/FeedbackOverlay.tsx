"use client";

import { useEffect } from "react";
import styles from "./FeedbackOverlay.module.css";

type Props = {
  feedback: { kind: "hint" | "success"; text: string } | null;
  onDismiss: () => void;
};

export function FeedbackOverlay({ feedback, onDismiss }: Props) {
  useEffect(() => {
    if (!feedback || feedback.kind !== "success") return;
    const t = setTimeout(onDismiss, 1200);
    return () => clearTimeout(t);
  }, [feedback, onDismiss]);

  if (!feedback) return null;
  const marker = feedback.kind === "success" ? "// ok" : "// hint";
  return (
    <div
      className={`${styles.overlay} ${
        feedback.kind === "success" ? styles.success : styles.hint
      }`}
      role="status"
    >
      <span className={styles.marker}>{marker}</span>
      <span className={styles.text}>{feedback.text}</span>
      {feedback.kind === "hint" ? (
        <button
          type="button"
          onClick={onDismiss}
          className={styles.close}
          aria-label="Dismiss hint"
        >
          [x]
        </button>
      ) : null}
    </div>
  );
}
