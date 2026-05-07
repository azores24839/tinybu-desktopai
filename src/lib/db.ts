import Dexie, { type Table } from "dexie";
import type {
  AppStateRecord,
  CaptureItem,
  ExpressionRecord,
  MemoryItem,
  PracticeSession,
  ReviewRecord,
  TalkSession,
  TopicItem
} from "../types";
import { defaultAppState } from "./defaults";

const LEGACY_DATABASE_NAME = "nomi-desktop";
const LEGACY_REVIEW_STORE = "mirrorCards";

class TinyBuDatabase extends Dexie {
  appState!: Table<AppStateRecord, string>;
  captures!: Table<CaptureItem, string>;
  practiceSessions!: Table<PracticeSession, string>;
  topics!: Table<TopicItem, string>;
  reviews!: Table<ReviewRecord, string>;
  expressions!: Table<ExpressionRecord, string>;
  talkSessions!: Table<TalkSession, string>;
  memories!: Table<MemoryItem, string>;

  constructor() {
    super(LEGACY_DATABASE_NAME);
    this.version(1).stores({
      appState: "id",
      expressions: "id,capturedAt,sourceTitle,category,saved,usedInTalk,learned",
      talkSessions: "id,createdAt,contentId,status",
      [LEGACY_REVIEW_STORE]: "id,createdAt,sessionId",
      memories: "id,type,updatedAt"
    });
    this.version(2).stores({
      appState: "id",
      captures: "id,capturedAt,sourceKind,status",
      practiceSessions: "id,captureId,stage,status,createdAt,updatedAt",
      reviews: "id,sessionId,createdAt",
      expressions: "id,capturedAt,sourceTitle,category,saved,usedInTalk,learned",
      talkSessions: "id,createdAt,contentId,status",
      [LEGACY_REVIEW_STORE]: "id,createdAt,sessionId",
      memories: "id,type,updatedAt"
    });
    this.version(3).stores({
      appState: "id",
      captures: "id,capturedAt,sourceKind,status,topicId",
      topics: "id,updatedAt,status",
      practiceSessions: "id,captureId,topicId,stage,status,createdAt,updatedAt",
      reviews: "id,sessionId,createdAt",
      expressions: "id,capturedAt,sourceTitle,sourceContentId,category,saved,usedInTalk,learned",
      talkSessions: "id,createdAt,contentId,status",
      [LEGACY_REVIEW_STORE]: "id,createdAt,sessionId",
      memories: "id,type,updatedAt"
    });
  }
}

export const db = new TinyBuDatabase();

export async function loadAppState(): Promise<AppStateRecord> {
  const existing = await db.appState.get("state");
  if (existing) {
    return {
      ...defaultAppState,
      ...existing,
      profile: { ...defaultAppState.profile, ...existing.profile },
      companion: { ...defaultAppState.companion, ...existing.companion },
      settings: { ...defaultAppState.settings, ...existing.settings }
    };
  }

  await db.appState.put(defaultAppState);
  return defaultAppState;
}

export function normalizeCaptureStatus(status: CaptureItem["status"]) {
  if (status === "new") return "unsorted";
  if (status === "in-practice") return "studied";
  if (status === "completed") return "practiced";
  return status;
}

export function normalizeCapture(capture: CaptureItem): CaptureItem {
  return {
    ...capture,
    status: normalizeCaptureStatus(capture.status)
  };
}

export async function saveAppState(nextState: AppStateRecord) {
  await db.appState.put(nextState);
}

export async function clearLearningData() {
  await Promise.all([
    db.expressions.clear(),
    db.captures.clear(),
    db.topics.clear(),
    db.practiceSessions.clear(),
    db.reviews.clear(),
    db.talkSessions.clear(),
    db.table(LEGACY_REVIEW_STORE).clear(),
    db.memories.clear()
  ]);
}
