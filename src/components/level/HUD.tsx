import styles from "./HUD.module.css";

type Props = {
  title: string;
};

export function HUD({ title }: Props) {
  return (
    <header className={styles.hud}>
      <span className={styles.title}>{title}</span>
    </header>
  );
}
