import {
  TASKMAP_BODY_CONTEXT_CONTRACT_VERSION,
  TaskMapBodyAxis,
  TaskMapBodyContextDisclosureV1,
  TaskMapEvent,
  TaskMapInput,
  TaskMapProjectionV1,
  TaskMapSourcePointer,
} from "./types.js";
import {
  TASKMAP_ALGORITHM_POLICY,
  taskMapInputDigest,
} from "./harness.js";

const STRICT_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_CLASSIFIER_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const OURA_CONTEXT_CONTRACT_VERSION = "oura-taskmap-context.v1";

export interface PrivacySafeOuraContext {
  contractVersion: string;
  generatedAt: string;
  sourceKind: "oura";
  coverage: TaskMapBodyContextDisclosureV1["coverage"];
  classifier: TaskMapBodyContextDisclosureV1["classifier"];
  days: Array<{
    dayKey: string;
    axis: "composite_recovery";
    category: "below_baseline" | "within_baseline" | "above_baseline" | "unknown";
  }>;
  privacy: {
    rawBiometricsStored: false;
    sourceBodiesStored: false;
    localPathsStored: false;
  };
}

function isStrictDay(value: string): boolean {
  if (!STRICT_DAY.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function isStrictTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function nonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validateSafeContext(context: PrivacySafeOuraContext): void {
  if (
    context.contractVersion !== OURA_CONTEXT_CONTRACT_VERSION
    ||
    context.sourceKind !== "oura"
    || !isStrictTimestamp(context.generatedAt)
    || !isStrictDay(context.coverage.startDay)
    || !isStrictDay(context.coverage.endDay)
    || context.coverage.startDay > context.coverage.endDay
  ) {
    throw new Error("Oura context identity or coverage range is invalid");
  }
  const coverageCounts = [
    context.coverage.dailyActivityDays,
    context.coverage.dailyReadinessDays,
    context.coverage.dailySleepDays,
    context.coverage.sleepRecords,
    context.coverage.heartRateSamples,
    context.coverage.classifiedDays,
    context.coverage.unknownDays,
  ];
  for (const value of coverageCounts) {
    if (!nonNegativeInteger(value)) {
      throw new Error("Oura context coverage counts must be non-negative integers");
    }
  }
  if (
    !SAFE_CLASSIFIER_VERSION.test(context.classifier.version)
    || context.classifier.axis !== "composite_recovery"
    || context.classifier.method.length === 0
    || context.classifier.method.length > 160
    || !nonNegativeInteger(context.classifier.minimumMetricsPerDay)
    || !Number.isFinite(context.classifier.lowerThreshold)
    || !Number.isFinite(context.classifier.upperThreshold)
    || context.classifier.lowerThreshold >= context.classifier.upperThreshold
  ) {
    throw new Error("Oura context classifier is invalid");
  }
  if (
    context.privacy.rawBiometricsStored
    || context.privacy.sourceBodiesStored
    || context.privacy.localPathsStored
  ) {
    throw new Error("Oura context privacy contract is invalid");
  }
  const seenDays = new Set<string>();
  for (const day of context.days) {
    if (
      !isStrictDay(day.dayKey)
      || day.dayKey < context.coverage.startDay
      || day.dayKey > context.coverage.endDay
      || day.axis !== "composite_recovery"
      || !["below_baseline", "within_baseline", "above_baseline", "unknown"].includes(day.category)
      || seenDays.has(day.dayKey)
    ) {
      throw new Error("Oura context day is invalid");
    }
    seenDays.add(day.dayKey);
  }
  const classifiedDays = context.days.filter((day) => day.category !== "unknown").length;
  const unknownDays = context.days.length - classifiedDays;
  if (
    classifiedDays !== context.coverage.classifiedDays
    || unknownDays !== context.coverage.unknownDays
  ) {
    throw new Error("Oura context day counts do not match coverage");
  }
}

function pointerMap(input: TaskMapInput): Map<string, TaskMapSourcePointer> {
  return new Map(input.pointers.map((pointer) => [pointer.id, pointer]));
}

function eventMap(input: TaskMapInput): Map<string, TaskMapEvent> {
  return new Map(input.events.map((event) => [event.id, event]));
}

function actionableBodyEvents(
  input: TaskMapInput,
  projection: TaskMapProjectionV1,
): TaskMapEvent[] {
  const now = Date.parse(projection.generatedAt);
  return input.events
    .filter((event) => (
      event.recordKind === "body_context"
      && event.activity === "body_window_observed"
      && event.dayKey !== undefined
      && event.bodyAxis !== undefined
      && ["below_baseline", "above_baseline"].includes(event.bodyCategory ?? "")
      && now - Date.parse(event.occurredAt) >= 0
      && now - Date.parse(event.occurredAt) <= TASKMAP_ALGORITHM_POLICY.bodyFreshnessWindowMs
    ))
    .sort((left, right) => left.dayKey!.localeCompare(right.dayKey!));
}

function nodeMatches(
  citationEventIds: readonly string[],
  bodyEvents: readonly TaskMapEvent[],
  events: ReadonlyMap<string, TaskMapEvent>,
  pointers: ReadonlyMap<string, TaskMapSourcePointer>,
): TaskMapBodyContextDisclosureV1["nodes"][number]["matches"] {
  const evidence = citationEventIds
    .map((id) => events.get(id))
    .filter((event): event is TaskMapEvent => (
      event !== undefined && event.bodyJoinEligible === true
    ));
  const matches = bodyEvents.flatMap((body) => {
    const bodyTime = Date.parse(body.occurredAt);
    const backingPointers = new Set(evidence
      .filter((event) => (
        Math.abs(Date.parse(event.occurredAt) - bodyTime)
          <= TASKMAP_ALGORITHM_POLICY.bodyJoinWindowMs
      ))
      .filter((event) => pointers.has(event.pointerId))
      .map((event) => event.pointerId));
    if (backingPointers.size === 0) return [];
    return [{
      dayKey: body.dayKey!,
      axis: body.bodyAxis as TaskMapBodyAxis,
      category: body.bodyCategory as "below_baseline" | "above_baseline",
      backingSourceCount: backingPointers.size,
      sourceKind: "oura" as const,
    }];
  });
  return matches;
}

/**
 * Bind a privacy-safe Oura snapshot to the exact accepted projection.
 *
 * The function recomputes the existing post-membership body join from cited
 * work events and fails if the disclosure count diverges from the projection.
 */
export function buildTaskMapBodyContextDisclosure(
  input: TaskMapInput,
  projection: TaskMapProjectionV1,
  context: PrivacySafeOuraContext,
): TaskMapBodyContextDisclosureV1 {
  validateSafeContext(context);
  if (
    projection.runStatus !== "accepted"
    || projection.rejections.length !== 0
    || projection.inputDigest !== taskMapInputDigest(input)
    || projection.privacy.rawBiometricsStored
    || projection.privacy.sourceBodiesStored
    || projection.privacy.localPathsStored
  ) {
    throw new Error("Body context requires an accepted matching privacy-safe projection");
  }
  if (Date.parse(context.generatedAt) > Date.parse(projection.generatedAt)) {
    throw new Error("Oura context cannot be newer than the projection");
  }

  const events = eventMap(input);
  const pointers = pointerMap(input);
  const bodyEvents = actionableBodyEvents(input, projection);
  const contextDays = new Map(context.days.map((day) => [day.dayKey, day]));
  for (const body of input.events.filter((event) => event.recordKind === "body_context")) {
    const safe = body.dayKey ? contextDays.get(body.dayKey) : undefined;
    if (
      !safe
      || safe.axis !== body.bodyAxis
      || safe.category !== body.bodyCategory
    ) {
      throw new Error("Task Map body events do not match the Oura context snapshot");
    }
  }

  const nodes = [...projection.roots, ...projection.tasks].flatMap((node) => {
    const matches = nodeMatches(
      node.citations.map((citation) => citation.eventId),
      bodyEvents,
      events,
      pointers,
    );
    if (matches.length !== node.bodyContextCount) {
      throw new Error(`Body context count mismatch for node ${node.id}`);
    }
    return matches.length === 0 ? [] : [{ nodeId: node.id, matches }];
  }).sort((left, right) => left.nodeId.localeCompare(right.nodeId));

  return {
    contractVersion: TASKMAP_BODY_CONTEXT_CONTRACT_VERSION,
    projectionRunId: projection.runId,
    projectionInputDigest: projection.inputDigest,
    generatedAt: projection.generatedAt,
    sourceKind: "oura",
    coverage: { ...context.coverage },
    classifier: { ...context.classifier },
    nodes,
    privacy: {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
    },
  };
}
