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

const DATABASE_NAME = "tinybu-desktop";
const STORES = {
  appState: "id",
  captures: "id,capturedAt,sourceKind,status,topicId",
  topics: "id,updatedAt,status",
  practiceSessions: "id,captureId,topicId,stage,status,createdAt,updatedAt",
  reviews: "id,sessionId,createdAt",
  expressions: "id,capturedAt,sourceTitle,sourceContentId,category,saved,usedInTalk,learned",
  talkSessions: "id,createdAt,contentId,status",
  memories: "id,type,updatedAt"
};

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
    super(DATABASE_NAME);
    this.version(1).stores(STORES);
  }
}

export const db = new TinyBuDatabase();

export async function loadAppState(): Promise<AppStateRecord> {
  const existing = await db.appState.get("state");
  if (existing) {
    const normalizedState = {
      ...defaultAppState,
      ...existing,
      profile: { ...defaultAppState.profile, ...existing.profile },
      companion: { ...defaultAppState.companion, ...existing.companion },
      settings: { ...defaultAppState.settings, ...existing.settings }
    };
    await db.appState.put(normalizedState);
    return normalizedState;
  }

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
    db.topics.clear(),
    db.practiceSessions.clear(),
    db.reviews.clear(),
    db.talkSessions.clear(),
    db.memories.clear()
  ]);
}
