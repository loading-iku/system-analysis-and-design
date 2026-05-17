import type { UmlShape } from "@/lib/level/types";
import styles from "./UmlNode.module.css";

type Props = {
  shape: UmlShape;
  label: string;
  branchGuard?: string;
  dimmed?: boolean;
};

const shapeClass: Record<UmlShape, string> = {
  start: styles.start,
  action: styles.action,
  decision: styles.decision,
  alert: styles.alert,
  end: styles.end,
  merge: styles.merge,
};

export function UmlNode({ shape, label, branchGuard, dimmed }: Props) {
  return (
    <div
      className={`${styles.node} ${shapeClass[shape]} ${dimmed ? styles.dimmed : ""}`}
      data-shape={shape}
    >
      <span className={styles.label}>{label}</span>
      {branchGuard ? (
        <span className={styles.guard}>[{branchGuard}]</span>
      ) : null}
    </div>
  );
}
