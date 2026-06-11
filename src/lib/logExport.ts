export const GPAF_LOG_FORMAT = "1.0" as const;
export const DEFAULT_GPAF_GAME_ID = "GM-LOGICPATHV2";

export type GpafLogEventType =
  | "session_start"
  | "score_update"
  | "level_complete"
  | "level_progress"
  | "session_end";

export type GpafLogEvent = {
  ts: string;
  playerPseudoId: string;
  playerName: string;
  studentNumber: string;
  sessionId: string;
  gameId: string;
  eventType: GpafLogEventType;
  payload: Record<string, unknown>;
};

export type GpafLogExportFile = {
  format: typeof GPAF_LOG_FORMAT;
  generatedAt: string;
  eventCount: number;
  content: string;
};

export function serializeGpafLogEvents(events: GpafLogEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n");
}
