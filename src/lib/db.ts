import Dexie, { type Table } from "dexie";
import type {
  AppStateRecord,
  CaptureItem,
  ExpressionRecord,
  MemoryItem,
  MirrorCard,
  PracticeSession,
  ReviewRecord,
  TalkSession
} from "../types";
import { defaultAppState } from "./defaults";

class NomiDatabase extends Dexie {
  appState!: Table<AppStateRecord, string>;
  captures!: Table<CaptureItem, string>;
  practiceSessions!: Table<PracticeSession, string>;
  reviews!: Table<ReviewRecord, string>;
  expressions!: Table<ExpressionRecord, string>;
  talkSessions!: Table<TalkSession, string>;
  mirrorCards!: Table<MirrorCard, string>;
  memories!: Table<MemoryItem, string>;

  constructor() {
    super("nomi-desktop");
    this.version(1).stores({
      appState: "id",
      expressions: "id,capturedAt,sourceTitle,category,saved,usedInTalk,learned",
      talkSessions: "id,createdAt,contentId,status",
      mirrorCards: "id,createdAt,sessionId",
      memories: "id,type,updatedAt"
    });
    this.version(2).stores({
      appState: "id",
      captures: "id,capturedAt,sourceKind,status",
      practiceSessions: "id,captureId,stage,status,createdAt,updatedAt",
      reviews: "id,sessionId,createdAt",
      expressions: "id,capturedAt,sourceTitle,category,saved,usedInTalk,learned",
      talkSessions: "id,createdAt,contentId,status",
      mirrorCards: "id,createdAt,sessionId",
      memories: "id,type,updatedAt"
    });
  }
}

export const db = new NomiDatabase();

export async function loadAppState(): Promise<AppStateRecord> {
  const existing = await db.appState.get("state");
  if (existing) return { ...defaultAppState, ...existing };

  await db.appState.put(defaultAppState);
  return defaultAppState;
}

export async function saveAppState(nextState: AppStateRecord) {
  await db.appState.put(nextState);
}

export async function clearLearningData() {
  await Promise.all([
    db.expressions.clear(),
    db.captures.clear(),
    db.practiceSessions.clear(),
    db.reviews.clear(),
    db.talkSessions.clear(),
    db.mirrorCards.clear(),
    db.memories.clear()
  ]);
}
