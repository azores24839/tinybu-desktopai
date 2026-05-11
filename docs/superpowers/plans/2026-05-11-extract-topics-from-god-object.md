# Extract Topics Logic from App.tsx

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Topics business logic out of App.tsx (1089-line God Object) into a dedicated `useTopics` hook, following the existing `useScreenshotCaptureFlow` pattern.

**Architecture:** Extract a `useTopics()` hook at `src/features/topics/useTopics.ts`. It takes external dependencies (captures, persistState, navigate, etc.) as parameters and returns topics state + handlers. App.tsx calls the hook and passes results down as props — no UI changes, no data structure changes, no behavior changes.

**Tech Stack:** React 19 + TypeScript + Dexie (IndexedDB)

---

## Dependency Map (before refactoring)

```
App.tsx owns:
  topics ← useState<TopicItem[]>([])
  captures ← useState<CaptureItem[]>([])
  expressions ← useState<ExpressionRecord[]>([])
  
  Handlers (topics-related):
    createTopicFromCaptures()    — writes topics + captures to DB, sets both states
    addCapturesToTopic()         — appends captures to topic, writes DB, sets both states
    openTopic()                  — sets activeTopicId, navigates
    markTopicStudied()           — marks captures studied, updates topic status
    updateTopic()                — simple DB put + state update
    startPracticeForTopic()      — practice flow (stays in App.tsx)
    finishPractice()             — practice flow (stays in App.tsx)

  Screen render (topics-related):
    <TopicsPage topics={...} captures={...} expressions={...} openTopic={...} startPractice={...} />
    <TopicDetailPage topic={activeTopic} captures={...} expressions={...} updateTopic={...} ... />
    <StudyRoomPage topic={activeTopic} captures={...} expressions={...} ... />
```

## Target Architecture

```
App.tsx owns:
  captures ← useState (shared with inbox, organize)
  expressions ← useState (shared with notebook)
  
  Handlers (topics-related, via hook):
    const { topics, setTopics, updateTopic, createTopicFromCaptures, addCapturesToTopic, openTopic, markTopicStudied } = useTopics({ captures, setCaptures, persistState, navigate, appState })

  Screen render: unchanged, just uses hook results instead of inline functions

useTopics.ts owns:
  topics ← useState (extracted from App.tsx)
  
  Handlers:
    updateTopic()
    createTopicFromCaptures()
    addCapturesToTopic()
    openTopic()
    markTopicStudied()
```

## Shared Dependency Contract

```typescript
type UseTopicsArgs = {
  captures: CaptureItem[];
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
  appState: AppStateRecord;
};

type UseTopicsResult = {
  topics: TopicItem[];
  setTopics: Dispatch<SetStateAction<TopicItem[]>>;
  updateTopic: (topic: TopicItem) => Promise<void>;
  createTopicFromCaptures: (captureIds: string[], name?: string, practiceGoal?: string) => Promise<void>;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => Promise<void>;
  openTopic: (topic: TopicItem, next?: Screen) => Promise<void>;
  markTopicStudied: (topic: TopicItem) => Promise<void>;
};
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Race condition: `createTopicFromCaptures` uses `captures` from closure — `captures` is provided as arg, always current | Same behavior as before (already reads `captures` from closure). Improvement: now an explicit parameter, easier to trace. |
| `markTopicStudied` also touches `captures` — `setCaptures` is injected | Same as before. |
| `openTopic` writes to `persistState` → `appState` — hook doesn't own `appState`, must be injected | `persistState` is injected, same pattern as `useScreenshotCaptureFlow`. |

---

### Task 1: Create `useTopics` hook

**Files:**
- Create: `src/features/topics/useTopics.ts`

- [ ] **Step 1: Create the file with dependency types and hook skeleton**

```typescript
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { db } from "../../lib/db";
import { nowIso, uid } from "../../lib/defaults";
import type { AppStateRecord, CaptureItem, Screen, TopicItem } from "../../types";
import { inferPracticeGoal } from "../captures/captureUtils";
import { topicCaptures } from "./topicUtils";

type UseTopicsArgs = {
  captures: CaptureItem[];
  setCaptures: Dispatch<SetStateAction<CaptureItem[]>>;
  persistState: (nextState: AppStateRecord) => Promise<void>;
  navigate: (next: Screen) => void;
  appState: AppStateRecord;
};

type UseTopicsResult = {
  topics: TopicItem[];
  setTopics: Dispatch<SetStateAction<TopicItem[]>>;
  updateTopic: (topic: TopicItem) => Promise<void>;
  createTopicFromCaptures: (captureIds: string[], name?: string, practiceGoal?: string) => Promise<void>;
  addCapturesToTopic: (captureIds: string[], topic: TopicItem) => Promise<void>;
  openTopic: (topic: TopicItem, next?: Screen) => Promise<void>;
  markTopicStudied: (topic: TopicItem) => Promise<void>;
};
```

- [ ] **Step 2: Run typecheck to verify skeleton compiles**

```bash
npm run typecheck
```

- [ ] **Step 3: Copy handlers from App.tsx into the hook**

Copy these functions from App.tsx into `useTopics` (inside the function body, before the return statement):

- `updateTopic` (App.tsx lines 515-518)
- `createTopicFromCaptures` (App.tsx lines 524-551)
- `addCapturesToTopic` (App.tsx lines 553-570)
- `openTopic` (App.tsx lines 581-589)
- `markTopicStudied` (App.tsx lines 591-605)

And add `topics`/`setTopics` state:

```typescript
export function useTopics({
  captures,
  setCaptures,
  persistState,
  navigate,
  appState
}: UseTopicsArgs): UseTopicsResult {
  const [topics, setTopics] = useState<TopicItem[]>([]);

  async function updateTopic(nextTopic: TopicItem) {
    await db.topics.put(nextTopic);
    setTopics((items) => items.map((item) => (item.id === nextTopic.id ? nextTopic : item)));
  }

  async function createTopicFromCaptures(captureIds: string[], name?: string, practiceGoal?: string) {
    const selectedCaptures = captures.filter((capture) => captureIds.includes(capture.id));
    if (!selectedCaptures.length) return;
    const first = selectedCaptures[0];
    const topic: TopicItem = {
      id: uid("topic"),
      name: name?.trim() || first.topic || "New Topic",
      summary: first.summary || selectedCaptures.map((capture) => capture.title).join(", "),
      captureIds: selectedCaptures.map((capture) => capture.id),
      tags: Array.from(new Set(selectedCaptures.flatMap((capture) => capture.keywords ?? []).slice(0, 4))),
      practiceGoal: practiceGoal?.trim() || inferPracticeGoal(selectedCaptures),
      status: "ready",
      savedExpressionCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const updatedCaptures: CaptureItem[] = selectedCaptures.map((capture) => ({
      ...capture,
      topicId: topic.id,
      topic: topic.name,
      status: "in-topic"
    }));
    await Promise.all([db.topics.put(topic), db.captures.bulkPut(updatedCaptures)]);
    setTopics((items) => [topic, ...items]);
    setCaptures((items) => items.map((item) => updatedCaptures.find((c) => c.id === item.id) ?? item));
    await persistState({ ...appState, activeTopicId: topic.id, activeCaptureId: updatedCaptures[0].id });
    navigate("topic-detail");
  }

  async function addCapturesToTopic(captureIds: string[], topic: TopicItem) {
    const selectedCaptures = captures.filter((capture) => captureIds.includes(capture.id));
    if (!selectedCaptures.length) return;
    const nextTopic: TopicItem = {
      ...topic,
      captureIds: Array.from(new Set([...topic.captureIds, ...captureIds])),
      updatedAt: nowIso()
    };
    const updatedCaptures = selectedCaptures.map((capture) => ({
      ...capture,
      topicId: topic.id,
      topic: topic.name,
      status: "in-topic" as const
    }));
    await Promise.all([db.topics.put(nextTopic), db.captures.bulkPut(updatedCaptures)]);
    setTopics((items) => items.map((item) => (item.id === topic.id ? nextTopic : item)));
    setCaptures((items) => items.map((item) => updatedCaptures.find((c) => c.id === item.id) ?? item));
  }

  async function openTopic(topic: TopicItem, next: Screen = "topic-detail") {
    const capturesForTopic = topicCaptures(topic, captures);
    await persistState({
      ...appState,
      activeTopicId: topic.id,
      activeCaptureId: capturesForTopic[0]?.id ?? appState.activeCaptureId
    });
    navigate(next);
  }

  async function markTopicStudied(topic: TopicItem) {
    const capturesForTopic = topicCaptures(topic, captures);
    const updatedCaptures: CaptureItem[] = capturesForTopic.map((capture) =>
      capture.status === "practiced" ? capture : { ...capture, status: "studied" }
    );
    const nextTopic: TopicItem = {
      ...topic,
      status: topic.status === "practiced" ? "practiced" : "in-progress",
      lastStudiedAt: nowIso(),
      updatedAt: nowIso()
    };
    await Promise.all([db.topics.put(nextTopic), db.captures.bulkPut(updatedCaptures)]);
    setTopics((items) => items.map((item) => (item.id === topic.id ? nextTopic : item)));
    setCaptures((items) => items.map((item) => updatedCaptures.find((c) => c.id === item.id) ?? item));
  }

  return { topics, setTopics, updateTopic, createTopicFromCaptures, addCapturesToTopic, openTopic, markTopicStudied };
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/features/topics/useTopics.ts
git commit -m "refactor: extract useTopics hook from App.tsx"
```

---

### Task 2: Wire `useTopics` into App.tsx, remove old handlers

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import for useTopics**

At line 29 (after `import { topicCaptures, topicExpressions } from "./features/topics/topicUtils"`), add:

```typescript
import { useTopics } from "./features/topics/useTopics";
```

- [ ] **Step 2: Remove `topics` useState, add hook call**

Replace this (App.tsx line 117):
```typescript
const [topics, setTopics] = useState<TopicItem[]>([]);
```

With:
```typescript
const { topics, setTopics, updateTopic, createTopicFromCaptures, addCapturesToTopic, openTopic, markTopicStudied } = useTopics({
  captures,
  setCaptures,
  persistState,
  navigate,
  appState
});
```

- [ ] **Step 3: Remove the old handler functions from App.tsx**

Delete these functions:
- `updateTopic` (lines 515-518)
- `createTopicFromCaptures` (lines 524-551)
- `addCapturesToTopic` (lines 553-570)
- `openTopic` (lines 581-589)
- `markTopicStudied` (lines 591-605)

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors. If `topics` or `setTopics` are used in places that conflict with destructuring, fix the destructuring.

- [ ] **Step 5: Run build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: wire useTopics hook into App.tsx, remove moved handlers"
```

---

### Task 3: Verify and final cleanup

**Files:**
- Modify: `src/App.tsx` (unused imports only)

- [ ] **Step 1: Check for unused imports**

The removed handlers used:
- `nowIso` — still used by practice functions (finishPractice, startPractice, etc.)
- `uid` — still used by practice functions
- `db` — still used by capture handlers
- `inferPracticeGoal` — used in createTopicFromCaptures (now in hook) — **can be removed from App.tsx import**
- `topicCaptures` — still used by `activeCapture` memo and practice flows
- `saveAppState` — still used by boot()
- `persistState` — still used, defined in App.tsx

- [ ] **Step 2: Remove unused imports from App.tsx**

From line 23-26, remove `inferPracticeGoal` if no longer used:
```typescript
// Before:
import { captureText, inferPracticeGoal, splitCaptureText } from "./features/captures/captureUtils";

// After:
import { captureText, splitCaptureText } from "./features/captures/captureUtils";
```

- [ ] **Step 3: Run typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "chore: remove unused import from App.tsx after useTopics extraction"
```

---

## Verification Summary

After all tasks:

```bash
npm run typecheck   # zero errors
npm run build       # clean build
```

Manual verification checklist:
- [ ] Topics page: list renders, click topic opens detail
- [ ] Topic detail: name/summary editable, Study Room button works
- [ ] Study Room: source navigator works, Start Practice button works
- [ ] Create topic from captures: still works (from Organize/Inbox)
- [ ] Add captures to topic: still works

## Files Changed

| File | Change |
|------|--------|
| `src/features/topics/useTopics.ts` | **Created** — new hook |
| `src/App.tsx` | **Modified** — wire hook, remove 45 lines of handlers |

No deletions, no UI changes, no data structure changes.
