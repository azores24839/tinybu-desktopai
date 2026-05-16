import Dexie, { type Table } from "dexie";
import type {
  AppStateRecord,
  CaptureItem,
  ExpressionRecord,
  MemoryItem,
  PracticeChatReview,
  TopicItem
} from "../types";
import { defaultAppState } from "./defaults";

const DATABASE_NAME = "tinybu-desktop";
const STORES = {
  appState: "id",
  captures: "id,capturedAt,sourceKind,status,topicId",
  topics: "id,updatedAt,status",
  expressions: "id,capturedAt,sourceTitle,sourceContentId,category,saved,usedInTalk,learned",
  memories: "id,type,updatedAt",
  practiceChatReviews: "id,topicId,createdAt"
};

class TinyBuDatabase extends Dexie {
  appState!: Table<AppStateRecord, string>;
  captures!: Table<CaptureItem, string>;
  topics!: Table<TopicItem, string>;
  expressions!: Table<ExpressionRecord, string>;
  memories!: Table<MemoryItem, string>;
  practiceChatReviews!: Table<PracticeChatReview, string>;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores(STORES);
    this.version(2).stores({
      ...STORES,
      practiceChatReviews: "id,topicId,createdAt"
    });
    this.version(3).stores({
      ...STORES,
      practiceSessions: null,
      reviews: null,
      talkSessions: null
    });
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
    db.practiceChatReviews.clear(),
    db.memories.clear()
  ]);
}
