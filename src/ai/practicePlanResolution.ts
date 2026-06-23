import type { PracticePlan } from "../types";
import {
  parsePracticePlanCandidate,
  practicePlanIssueSummary
} from "../../shared/practicePlanContract.mjs";

export async function resolvePracticePlan({
  request,
  fallback
}: {
  request: (correction?: string) => Promise<unknown>;
  fallback: PracticePlan;
}): Promise<PracticePlan> {
  const first = parsePracticePlanCandidate(await request());
  if (first.ok) return first.value;

  const correction = practicePlanIssueSummary(first.issues);
  const second = parsePracticePlanCandidate(await request(correction));
  if (second.ok) return second.value;

  console.warn("TinyBu practice plan validation failed; using local fallback", {
    firstIssues: first.issues,
    secondIssues: second.issues
  });
  return fallback;
}
