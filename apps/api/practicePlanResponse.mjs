import {
  parsePracticePlanCandidate,
  practicePlanIssueSummary
} from "../../shared/practicePlanContract.mjs";
import { extractJsonText } from "./requestBuilders.mjs";

function outputValue(data) {
  const messageContent = data?.choices?.[0]?.message?.content;
  const messageText = Array.isArray(messageContent)
    ? messageContent.find((item) => item?.type === "text")?.text
    : messageContent;
  return (
    data?.output_text ??
    data?.output
      ?.flatMap((item) => item?.content ?? [])
      ?.find((item) => item?.type === "output_text")?.text ??
    messageText
  );
}

function decodedCandidate(data) {
  const output = outputValue(data);
  if (typeof output !== "string") return output;
  try {
    return JSON.parse(output);
  } catch {
    try {
      return JSON.parse(extractJsonText(output));
    } catch {
      return output;
    }
  }
}

function canonicalResponse(result, plan) {
  return {
    response: result.response,
    data: { ...result.data, output_text: JSON.stringify(plan) }
  };
}

export async function requestValidatedPracticePlan({ task, payload, request, route, log }) {
  const first = await request(payload);
  if (task !== "practiceQuestions" || !first.response.ok) return first;

  const firstPlan = parsePracticePlanCandidate(decodedCandidate(first.data));
  if (firstPlan.ok) return canonicalResponse(first, firstPlan.value);

  log("WARN", `task=practiceQuestions route=${route} invalid plan`, practicePlanIssueSummary(firstPlan.issues));
  const correction = practicePlanIssueSummary(firstPlan.issues);
  const second = await request({
    ...payload,
    practicePlanCorrection: `The previous response failed validation: ${correction}. Return the exact required structure.`
  });
  if (!second.response.ok) return second;

  const secondPlan = parsePracticePlanCandidate(decodedCandidate(second.data));
  if (secondPlan.ok) return canonicalResponse(second, secondPlan.value);

  log("WARN", `task=practiceQuestions route=${route} invalid retry`, practicePlanIssueSummary(secondPlan.issues));
  return {
    response: { ok: false, status: 502 },
    data: { error: "AI returned an invalid practice plan after one retry." }
  };
}
