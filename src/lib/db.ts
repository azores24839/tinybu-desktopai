import Dexie, { type Table } from "dexie";
import type {
  AppStateRecord,
  AppSettings,
  CaptureItem,
  ExpressionRecord,
  MemoryItem,
  PracticeSession,
  ReviewRecord,
  TalkSession,
  TopicItem
} from "../types";
import { defaultAppState } from "./defaults";

const CURRENT_DATABASE_NAME = "tinybu-desktop";
const LEGACY_DATABASE_NAME = "nomi-desktop";
const LEGACY_REVIEW_STORE = "mirrorCards";
const LEGACY_CLOUD_PROXY_URL = "http://127.0.0.1:8787/v1/nomi/task";
const CURRENT_STORES = {
  appState: "id",
  captures: "id,capturedAt,sourceKind,status,topicId",
  topics: "id,updatedAt,status",
  practiceSessions: "id,captureId,topicId,stage,status,createdAt,updatedAt",
  reviews: "id,sessionId,createdAt",
  expressions: "id,capturedAt,sourceTitle,sourceContentId,category,saved,usedInTalk,learned",
  talkSessions: "id,createdAt,contentId,status",
  memories: "id,type,updatedAt"
};
type ReadableDexieTable = { toArray: () => Promise<unknown[]> };
type ReadableDexieDatabase = {
  tables: Array<{ name: string }>;
  table: (tableName: string) => ReadableDexieTable;
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
    super(CURRENT_DATABASE_NAME);
    this.version(1).stores(CURRENT_STORES);
  }
}

class LegacyTinyBuDatabase extends Dexie {
  constructor() {
    super(LEGACY_DATABASE_NAME);
    this.version(1).stores({
      appState: CURRENT_STORES.appState,
      expressions: "id,capturedAt,sourceTitle,category,saved,usedInTalk,learned",
      talkSessions: CURRENT_STORES.talkSessions,
      [LEGACY_REVIEW_STORE]: "id,createdAt,sessionId",
      memories: CURRENT_STORES.memories
    });
    this.version(2).stores({
      appState: CURRENT_STORES.appState,
      captures: "id,capturedAt,sourceKind,status",
      practiceSessions: "id,captureId,stage,status,createdAt,updatedAt",
      reviews: CURRENT_STORES.reviews,
      expressions: "id,capturedAt,sourceTitle,category,saved,usedInTalk,learned",
      talkSessions: CURRENT_STORES.talkSessions,
      [LEGACY_REVIEW_STORE]: "id,createdAt,sessionId",
      memories: CURRENT_STORES.memories
    });
    this.version(3).stores({
      ...CURRENT_STORES,
      [LEGACY_REVIEW_STORE]: "id,createdAt,sessionId",
    });
  }
}

export const db = new TinyBuDatabase();
let initializeDatabasePromise: Promise<void> | null = null;

export function initializeDatabase() {
  initializeDatabasePromise ??= migrateLegacyDatabaseIfNeeded();
  return initializeDatabasePromise;
}

async function migrateLegacyDatabaseIfNeeded() {
  if (typeof indexedDB === "undefined") return;
  if (!(await Dexie.exists(LEGACY_DATABASE_NAME))) return;
  if (await currentDatabaseHasData()) return;

  const legacyDb = new LegacyTinyBuDatabase();
  try {
    const appState = (await readLegacyTable(legacyDb, "appState")) as AppStateRecord[];
    const captures = (await readLegacyTable(legacyDb, "captures")) as CaptureItem[];
    const topics = (await readLegacyTable(legacyDb, "topics")) as TopicItem[];
    const practiceSessions = (await readLegacyTable(legacyDb, "practiceSessions")) as PracticeSession[];
    const reviews = (await readLegacyTable(legacyDb, "reviews")) as ReviewRecord[];
    const mirrorCards = (await readLegacyTable(legacyDb, LEGACY_REVIEW_STORE)) as ReviewRecord[];
    const expressions = (await readLegacyTable(legacyDb, "expressions")) as ExpressionRecord[];
    const talkSessions = (await readLegacyTable(legacyDb, "talkSessions")) as TalkSession[];
    const memories = (await readLegacyTable(legacyDb, "memories")) as MemoryItem[];

    if (!hasLegacyData([appState, captures, topics, practiceSessions, reviews, mirrorCards, expressions, talkSessions, memories])) {
      return;
    }

    await db.transaction(
      "rw",
      [db.appState, db.captures, db.topics, db.practiceSessions, db.reviews, db.expressions, db.talkSessions, db.memories],
      async () => {
        await bulkPutIfAny(db.appState, appState);
        await bulkPutIfAny(db.captures, captures);
        await bulkPutIfAny(db.topics, topics);
        await bulkPutIfAny(db.practiceSessions, practiceSessions);
        await bulkPutIfAny(db.reviews, uniqueById([...reviews, ...mirrorCards]));
        await bulkPutIfAny(db.expressions, expressions);
        await bulkPutIfAny(db.talkSessions, talkSessions);
        await bulkPutIfAny(db.memories, memories);
      }
    );
  } finally {
    legacyDb.close();
  }
}

async function currentDatabaseHasData() {
  if (!(await Dexie.exists(CURRENT_DATABASE_NAME))) return false;
  const counts = await Promise.all([
    db.appState.count(),
    db.captures.count(),
    db.topics.count(),
    db.practiceSessions.count(),
    db.reviews.count(),
    db.expressions.count(),
    db.talkSessions.count(),
    db.memories.count()
  ]);
  return counts.some((count) => count > 0);
}

async function readLegacyTable(database: ReadableDexieDatabase, tableName: string): Promise<unknown[]> {
  if (!database.tables.some((table) => table.name === tableName)) return [];
  return database.table(tableName).toArray();
}

function hasLegacyData(tables: unknown[][]) {
  return tables.some((table) => table.length > 0);
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

async function bulkPutIfAny<T, TKey>(table: Table<T, TKey>, items: T[]) {
  if (items.length) await table.bulkPut(items);
}

export async function loadAppState(): Promise<AppStateRecord> {
  const existing = await db.appState.get("state");
  if (existing) {
    const normalizedState = {
      ...defaultAppState,
      ...existing,
      profile: { ...defaultAppState.profile, ...existing.profile },
      companion: { ...defaultAppState.companion, ...existing.companion },
      settings: normalizeSettings(existing.settings)
    };
    await db.appState.put(normalizedState);
    return normalizedState;
  }

  await db.appState.put(defaultAppState);
  return defaultAppState;
}

function normalizeSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  const merged = { ...defaultAppState.settings, ...settings };
  return {
    ...merged,
    cloudProxyUrl: merged.cloudProxyUrl === LEGACY_CLOUD_PROXY_URL ? defaultAppState.settings.cloudProxyUrl : merged.cloudProxyUrl
  };
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
