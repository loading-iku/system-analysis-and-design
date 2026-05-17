export type UmlShape =
  | "start"
  | "action"
  | "decision"
  | "alert"
  | "end"
  | "merge";

export type GridDir = "up" | "down" | "left" | "right";

export type ToolboxBlock = {
  id: string;
  shape: UmlShape;
  label: string;
};

export type Branch = {
  guardLabel: string;
  labyrinthDir: GridDir;
  nextStepId: string;
};

export type PlaceStep = {
  id: string;
  kind: "place";
  shape: UmlShape;
  expectedToolboxId: string;
  nodeLabel: string;
  labyrinthMove: GridDir;
  hint: string;
  nextStepId?: string;
};

export type DecisionStep = {
  id: string;
  kind: "decision";
  shape: "decision";
  nodeLabel: string;
  labyrinthMove: GridDir;
  hint: string;
  branches: Branch[];
};

export type Step = PlaceStep | DecisionStep;

export type LevelJSON = {
  id: string;
  title: string;
  scenario: string;
  objective: string;
  toolbox: ToolboxBlock[];
  labyrinth: {
    width: number;
    height: number;
    start: [number, number];
  };
  rootStepId: string;
  steps: Step[];
};

export type LevelManifestEntry = {
  id: string;
  title: string;
};

export type PlacedNode = {
  stepId: string;
  shape: UmlShape;
  label: string;
  branchGuard?: string;
  dimmed?: boolean;
};

export type WalkedEdge = {
  from: [number, number];
  to: [number, number];
  dimmed?: boolean;
};

export const AUTO_START_ID = "_auto_start";
export const AUTO_END_ID = "_auto_end";
