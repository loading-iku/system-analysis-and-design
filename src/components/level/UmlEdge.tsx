import styles from "./UmlEdge.module.css";

type Props = {
  dimmed?: boolean;
};

export function UmlEdge({ dimmed }: Props) {
  return (
    <div
      className={`${styles.edge} ${dimmed ? styles.dimmed : ""}`}
      aria-hidden="true"
    >
      <span className={styles.shaft} />
      <span className={styles.head} />
    </div>
  );
}
