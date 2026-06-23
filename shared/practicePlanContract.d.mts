import type { PracticePlan } from "../src/types";

export type PracticePlanIssue = { path: string; message: string };
export type PracticePlanParseResult =
  | { ok: true; value: PracticePlan; normalized: boolean }
  | { ok: false; issues: PracticePlanIssue[] };

export const practicePlanJsonSchema: Record<string, unknown>;
export const practicePlanContractInstruction: string;
export function parsePracticePlanCandidate(candidate: unknown): PracticePlanParseResult;
export function practicePlanIssueSummary(issues: PracticePlanIssue[]): string;
