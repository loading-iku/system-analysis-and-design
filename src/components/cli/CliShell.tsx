import { Children, isValidElement } from "react";
import type { ReactNode } from "react";
import styles from "./CliShell.module.css";

type Props = {
  children: ReactNode;
  // Optional starting line number (defaults to 1)
  startLine?: number;
  // If true, hides the line numbers (used for nested rows inside a parent shell)
  bare?: boolean;
};

/**
 * Renders its children as a line-numbered "code editor" — each direct child
 * becomes one line. Blank lines are rendered as <CliShell.Blank /> or by
 * passing `null` siblings. Children may also be ReactFragment whose children
 * are flattened.
 */
export function CliShell({ children, startLine = 1, bare = false }: Props) {
  const lines = flatten(children);
  return (
    <div className={`${styles.shell} ${bare ? styles.bare : ""}`}>
      {lines.map((line, idx) => {
        const lineNum = startLine + idx;
        return (
          <div className={styles.row} key={idx}>
            {!bare ? (
              <span className={styles.gutter} aria-hidden="true">
                {lineNum}
              </span>
            ) : null}
            <div className={styles.content}>{line}</div>
          </div>
        );
      })}
    </div>
  );
}

function flatten(node: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  Children.forEach(node, (child) => {
    if (child === null || child === undefined || child === false) {
      out.push(null);
      return;
    }
    if (
      isValidElement<{ children?: ReactNode }>(child) &&
      child.type === FragmentMarker
    ) {
      out.push(...flatten(child.props.children));
      return;
    }
    out.push(child);
  });
  return out;
}

// Marker fragment so callers can group multiple lines inside one expression.
function FragmentMarker({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

CliShell.Group = FragmentMarker;
CliShell.Blank = function Blank() {
  return <span className={styles.blank}>&nbsp;</span>;
};
