import styles from "./PixelArt.module.css";

// Monochrome pixel glyphs drawn with full-block characters, in keeping with
// the terminal/pixel aesthetic. Mirrors the key (unlocked) and padlock
// (locked) icons from the //levels design.

export const KEY_ART = [
  " ████ ",
  "█    █",
  "█ ██ █",
  "█    █",
  " ████ ",
  "  ██  ",
  "  ██  ",
  "  ██  ",
  "  ███ ",
  "  ██  ",
  "  ███ ",
];

export const LOCK_ART = [
  "  ████  ",
  " █    █ ",
  " █    █ ",
  "████████",
  "█      █",
  "█  ██  █",
  "█  ██  █",
  "█      █",
  "████████",
];

type Props = {
  rows: string[];
  label: string;
  muted?: boolean;
};

export function PixelArt({ rows, label, muted = false }: Props) {
  return (
    <pre
      className={`${styles.art} ${muted ? styles.muted : ""}`}
      role="img"
      aria-label={label}
    >
      {rows.join("\n")}
    </pre>
  );
}
