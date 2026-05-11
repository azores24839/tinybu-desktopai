import type { Dispatch, SetStateAction } from "react";
import { db } from "../../lib/db";
import { nowIso, uid } from "../../lib/defaults";
import { showToast } from "../../lib/toast";
import type { CaptureItem, ExpressionRecord } from "../../types";

export async function saveExpressionFromCapture(
  capture: CaptureItem,
  expression: string,
  setExpressions: Dispatch<SetStateAction<ExpressionRecord[]>>
) {
  try {
    const record: ExpressionRecord = {
      id: uid("expression"),
      original: expression,
      meaning: capture.summary || "Saved from Study Room",
      keywords: capture.keywords ?? [],
      pattern: expression,
      scene: capture.topic || "Study Room",
      practiceStem: expression,
      sourceTitle: capture.title,
      sourceContentId: capture.id,
      capturedAt: nowIso(),
      saved: true,
      useLater: true,
      usedInTalk: false,
      userSentence: "",
      practiceCount: 0,
      learned: false,
      category: "captured"
    };
    await db.expressions.put(record);
    setExpressions((items) => [record, ...items]);
  } catch (error) {
    console.error("saveExpressionFromCapture failed", error);
    showToast("Failed to save expression. Please try again.");
  }
}
