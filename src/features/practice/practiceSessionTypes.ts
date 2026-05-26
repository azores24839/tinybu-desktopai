import type { CaptureItem, PracticeTask, TopicItem } from "../../types";

export type PracticeSource =
  | { kind: "topic"; title: string; summary: string; practiceGoal: string; topic: TopicItem; captures: CaptureItem[] }
  | { kind: "task"; title: string; summary: string; practiceGoal: string; task: PracticeTask; captures: CaptureItem[] };
