import Dexie, { type Table } from "dexie";
import type {
  AppStateRecord,
  CaptureItem,
  ExpressionRecord,
  MemoryItem,
  PracticeTask,
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
  practiceTasks: "id,taskType,status,createdAt,usedAt",
  practiceChatReviews: "id,topicId,createdAt"
};

export class TinyBuDatabase extends Dexie {
  appState!: Table<AppStateRecord, string>;
  captures!: Table<CaptureItem, string>;
  topics!: Table<TopicItem, string>;
  expressions!: Table<ExpressionRecord, string>;
  memories!: Table<MemoryItem, string>;
  practiceTasks!: Table<PracticeTask, string>;
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
    this.version(4).stores(STORES);
  }
}

export const db = new TinyBuDatabase();

export async function loadAppState(): Promise<AppStateRecord> {
  const existing = await db.appState.get("state");
  if (existing) {
    const mergedSettings = { ...defaultAppState.settings, ...existing.settings };
    if (/^(MiniMax|mini?max)/i.test(mergedSettings.aiModel.trim())) {
      mergedSettings.aiModel = defaultAppState.settings.aiModel;
    }
    const normalizedState = {
      ...defaultAppState,
      ...existing,
      profile: { ...defaultAppState.profile, ...existing.profile },
      companion: { ...defaultAppState.companion, ...existing.companion },
      settings: mergedSettings
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
    db.practiceTasks.clear(),
    db.memories.clear()
  ]);
}
