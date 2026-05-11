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
