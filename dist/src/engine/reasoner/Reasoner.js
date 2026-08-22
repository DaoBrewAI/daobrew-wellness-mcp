"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reasoner = exports.MVP_ROOT_CAUSE_ID = exports.NotEnoughSignalError = void 0;
exports.persistentRootId = persistentRootId;
exports.rootCauseId = rootCauseId;
exports.scorePatterns = scorePatterns;
exports.scoreTripletBreakdown = scoreTripletBreakdown;
const node_crypto_1 = require("node:crypto");
const biometric_endorsement_js_1 = require("./biometric-endorsement.js");
const LatentHypothesis_js_1 = require("./LatentHypothesis.js");
const v2Context_js_1 = require("./v2Context.js");
const require_user_id_js_1 = require("../require-user-id.js");
const DEFAULT_ROOT_THREAD_KEY = "converge-the-story";
const TEMPORAL_PRECEDENCE_GRACE_SEC = 60;
const ROOT_COOLDOWN_WEEKS = 3;
const ROOT_VERIFY_HORIZON_WEEKS = 2;
const MAX_WATCHING_SOURCE_NODES = 6;
class NotEnoughSignalError extends Error {
    constructor(message = "Sentinel needs more watch and source context before naming a work thread") {
        super(message);
        this.name = "NotEnoughSignalError";
    }
}
exports.NotEnoughSignalError = NotEnoughSignalError;
/** Run-scoped v2 context. Set at buildDelta entry, cleared in finally —
 *  the deterministic reasoner is synchronous per run, so an ambient
 *  context keeps the ~10 pattern call sites untouched. */
let v2Active = null;
/** v2 signature label -> reasoner pattern key. DEPLETION is deliberately
 *  absent: daytime signal never generates it (needs the nocturnal layer). */
const SIGNATURE_TO_KEY = {
    TENSION: "tension",
    OVERDRIVE: "overdrive",
    STAGNATION: "stagnation",
    CONSTRICTION: "constriction",
};
const PATTERNS = [
    {
        key: "overdrive",
        local_id: "p_overdrive",
        title: "OVERDRIVE",
        element: "fire",
        active_subtitle: "Fire · active candidate",
        quiet_subtitle: "Fire · quiet",
    },
    {
        key: "tension",
        local_id: "p_tension",
        title: "TENSION",
        element: "wood",
        active_subtitle: "Wood · active candidate",
        quiet_subtitle: "Wood · quiet",
    },
    {
        key: "depletion",
        local_id: "p_depletion",
        title: "DEPLETION",
        element: "water",
        active_subtitle: "Water · active candidate",
        quiet_subtitle: "Water · quiet",
    },
    {
        key: "stagnation",
        local_id: "p_stagnation",
        title: "STAGNATION",
        element: "earth",
        active_subtitle: "Earth · active candidate",
        quiet_subtitle: "Earth · quiet",
    },
    {
        key: "constriction",
        local_id: "p_constriction",
        title: "CONSTRICTION",
        element: "metal",
        active_subtitle: "Metal · active candidate",
        quiet_subtitle: "Metal · quiet",
    },
];
const CANONICAL_THEME_IDS = {
    "#investor-facing": "t_investor",
    "#high-stakes-public": "t_highstakes",
    "#delivery-readiness": "t_deliveryready",
    "#b2b-track": "t_b2btrack",
    "#work-context": "t_workcontext",
};
const TRIGGER_SUPPORT_WINDOW_SEC = 30 * 60;
const PLANNED_CONTEXT_WINDOW_SEC = 2 * 60 * 60;
const LONG_HORIZON_CONTEXT_WINDOW_SEC = 24 * 60 * 60;
const MAX_VISIBLE_TRIGGERS_PER_WEEK = 7;
const MAX_EPISODES_PER_PATTERN = 3;
const LA_TIME = "America/Los_Angeles";
const PATTERN_SCORE_THRESHOLD = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
function stableHash(parts) {
    return (0, node_crypto_1.createHash)("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}
/** Neutral local/demo root identity. Production user-scoped roots retain the
 * main-branch derivation below, so this vocabulary cleanup cannot migrate
 * enrolled users' graph ids. */
exports.MVP_ROOT_CAUSE_ID = `ghost_root_${stableHash(["root", "local", DEFAULT_ROOT_THREAD_KEY])}`;
function scopedHashParts(userId, parts) {
    return [userId, ...parts];
}
function normalizeThreadKey(threadKey) {
    return threadKey
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || DEFAULT_ROOT_THREAD_KEY;
}
function persistentRootId(userId, threadKey = DEFAULT_ROOT_THREAD_KEY) {
    const scopedUserId = (0, require_user_id_js_1.requireUserId)(userId, "Reasoner.persistentRootId");
    const normalized = normalizeThreadKey(threadKey);
    if (normalized === DEFAULT_ROOT_THREAD_KEY) {
        if (userId === "local")
            return exports.MVP_ROOT_CAUSE_ID;
        return `ghost_root_${stableHash(["root", userId, normalized])}`;
    }
    return `ghost_root_${stableHash(["root", scopedUserId, normalized])}`;
}
function rootCauseId(userId) {
    return persistentRootId(userId, DEFAULT_ROOT_THREAD_KEY);
}
function persistentRootSourceRef(userId, state) {
    // Keep the local/demo identity stable for legacy fixtures and existing local
    // graphs. Production roots use one neutral source identity across WATCHING
    // and armed states so an upsert advances the state machine instead of
    // creating two logical roots.
    if (userId === "local") {
        return `reasoner:${exports.MVP_ROOT_CAUSE_ID}${state === "watching" ? ":watching" : ""}`;
    }
    return `reasoner:${rootCauseId(userId)}`;
}
function b2bGhostId(userId) {
    return nodeId(userId, "ghost", "reasoner:ghost-b2b-track");
}
function nodeId(userId, kind, sourceRef) {
    return `${kind}_${stableHash(scopedHashParts(userId, [kind, sourceRef]))}`;
}
function edgeId(userId, srcId, dstId, kind) {
    return `edge_${stableHash(scopedHashParts(userId, [srcId, dstId, kind]))}`;
}
function addNode(nodes, node) {
    if (!nodes.has(node.id))
        nodes.set(node.id, node);
}
function addEdge(edges, edge) {
    if (!edges.has(edge.id))
        edges.set(edge.id, edge);
}
function patternDefinition(key) {
    return PATTERNS.find((pattern) => pattern.key === key) ?? PATTERNS[0];
}
function patternNodeId(userId, key) {
    return nodeId(userId, "pattern", `pattern:${key}`);
}
function normalizeTheme(topic) {
    const slug = topic
        .trim()
        .toLowerCase()
        .replace(/^#+/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `#${slug || "work-context"}`;
}
function themeRef(topic) {
    return `theme:${normalizeTheme(topic)}`;
}
function themeNodeId(userId, topic) {
    const normalized = normalizeTheme(topic);
    return nodeId(userId, "theme", themeRef(normalized));
}
function compactDateTime(ts) {
    if (!Number.isFinite(ts ?? NaN))
        return null;
    return new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TIME,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(ts * 1000));
}
function localDateParts(ts) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TIME,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(ts * 1000));
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    return {
        year: Number(byType.get("year")),
        month: Number(byType.get("month")),
        day: Number(byType.get("day")),
    };
}
function sameLocalDay(aTs, bTs) {
    if (!Number.isFinite(aTs ?? NaN) || !Number.isFinite(bTs ?? NaN))
        return false;
    const a = localDateParts(aTs);
    const b = localDateParts(bTs);
    return a.year === b.year && a.month === b.month && a.day === b.day;
}
function isoDate(date) {
    return date.toISOString().slice(0, 10);
}
function weekStartForTs(ts) {
    const { year, month, day } = localDateParts(ts);
    const localDayNoonUtc = Date.UTC(year, month - 1, day, 12);
    const dayOfWeek = new Date(localDayNoonUtc).getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    return isoDate(new Date(localDayNoonUtc - daysSinceMonday * DAY_MS));
}
function weekEndForStart(weekStart) {
    const start = Date.parse(`${weekStart}T12:00:00.000Z`);
    return isoDate(new Date(start + 6 * DAY_MS));
}
function compactDateForIso(iso) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
    }).format(new Date(`${iso}T12:00:00.000Z`));
}
function weekLabel(weekStart, weekEnd) {
    return `${compactDateForIso(weekStart)}-${compactDateForIso(weekEnd)}`;
}
function truncate(value, length) {
    if (!value)
        return null;
    const text = value.replace(/\s+/g, " ").trim();
    return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1))}...`;
}
function uniqueStrings(values) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const text = value?.replace(/\s+/g, " ").trim();
        if (!text)
            continue;
        const key = text.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(text);
    }
    return out;
}
function arrayFromUnknown(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => typeof entry === "string" ? entry : null)
        .filter((entry) => Boolean(entry?.trim()));
}
const STOP_WORDS = new Set([
    "about",
    "after",
    "again",
    "and",
    "are",
    "calendar",
    "call",
    "code",
    "for",
    "from",
    "granola",
    "meeting",
    "notes",
    "project",
    "sync",
    "the",
    "this",
    "with",
    "you",
]);
function termSet(values) {
    const terms = new Set();
    const text = values.filter(Boolean).join(" ").toLowerCase();
    for (const match of text.matchAll(/[a-z0-9][a-z0-9_-]{2,}/g)) {
        const token = match[0].replace(/^#+/, "");
        if (!STOP_WORDS.has(token))
            terms.add(token);
    }
    return terms;
}
function sharedTermCount(a, b) {
    let count = 0;
    for (const term of a) {
        if (b.has(term))
            count += 1;
    }
    return count;
}
function compactSentenceParts(text, max = 3) {
    const cleaned = text?.replace(/\s+/g, " ").trim();
    if (!cleaned)
        return [];
    return cleaned
        .split(/(?:[.!?]\s+|\n+)/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, max)
        .map((part) => truncate(part, 110) ?? part);
}
function metadataString(metadata, key) {
    const value = metadata[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function eventDescriptionText(event) {
    const centralBrain = event.metadata?.central_brain;
    const centralText = centralBrain && typeof centralBrain === "object" && !Array.isArray(centralBrain)
        ? [
            centralBrain.summary,
            ...arrayFromUnknown(centralBrain.key_points),
            ...arrayFromUnknown(centralBrain.topics),
        ].filter((value) => typeof value === "string")
        : [];
    return [
        event.title,
        event.calendar_name,
        event.location,
        metadataString(event.metadata, "description_excerpt"),
        metadataString(event.metadata, "import_policy"),
        metadataString(event.metadata, "evidence_strength"),
        ...arrayFromUnknown(event.metadata?.topic_tags),
        ...centralText,
    ].filter((value) => Boolean(value?.trim()));
}
function tripletText(triplet) {
    return [
        ...triplet.events.map((event) => eventDescriptionText(event).join(" ")),
        ...triplet.meetings.map((meeting) => [
            meeting.title,
            meeting.summary,
            meeting.body,
            meeting.topics.join(" "),
        ].join(" ")),
        ...triplet.memories.map((memory) => [memory.insight_text, memory.topics.join(" ")].join(" ")),
    ].join(" ").toLowerCase();
}
function scorePatterns(triplet) {
    const scores = biometricPatternScores(triplet);
    if (scores.length === 0)
        return [];
    const sorted = scores
        .map((entry) => ({ ...entry, score: Number(entry.score.toFixed(2)) }))
        .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    const top = sorted[0];
    return sorted.filter((entry) => (entry.key === top.key ||
        entry.score >= PATTERN_SCORE_THRESHOLD ||
        entry.score >= top.score * 0.55));
}
function pushPatternScore(scores, key, score, reason) {
    if (score <= 0)
        return;
    const previous = scores.find((entry) => entry.key === key);
    if (previous) {
        previous.score += score;
        if (!previous.reasons.includes(reason))
            previous.reasons.push(reason);
    }
    else {
        scores.push({ key, score, reasons: [reason] });
    }
}
function categoryFromScores(yin, yang) {
    const yinOk = yin >= 50;
    const yangOk = yang >= 50;
    if (yinOk && yangOk)
        return "in_flow";
    if (!yinOk && yangOk)
        return "pushing_it";
    if (yinOk && !yangOk)
        return "recharging";
    return "running_on_empty";
}
function normalizedStateCategory(triplet) {
    const state = triplet.episode.state;
    const raw = String(state.category ?? "").trim().toLowerCase();
    if (raw === "balanced" || raw === "peak")
        return "in_flow";
    if (raw === "yang_excess")
        return "pushing_it";
    if (raw === "yin_excess" || raw === "burnout")
        return "recharging";
    if (["in_flow", "pushing_it", "recharging", "running_on_empty"].includes(raw))
        return raw;
    return categoryFromScores(state.yin_score, state.yang_score);
}
function biometricPatternScores(triplet) {
    // v2: the raw multi-metric signature replaces the gated-quadrant
    // re-encoding entirely (findings F3 — the display quadrant is a
    // step-count artifact, never a claim basis).
    if (v2Active) {
        const day = (0, v2Context_js_1.localDayKey)(triplet.episode.occurred_at_ts, v2Active.timezoneOffsetHours);
        const signature = v2Active.signaturesByDate.get(day);
        const scores = [];
        if (signature && signature.quality === "real_inference") {
            for (const [label, key] of Object.entries(SIGNATURE_TO_KEY)) {
                const value = signature.scores[label];
                if (typeof value !== "number" || value <= 0)
                    continue;
                const reasons = [
                    `raw multi-metric signature (14-day baseline, no step gate) · coverage ${Math.round(signature.coverage * 100)}%`,
                ];
                if (key === "constriction") {
                    reasons.push("unmeasurable-with-current-sensors — flagged, low confidence");
                }
                pushPatternScore(scores, key, value / 20, reasons[0]);
                if (reasons[1])
                    scores.find((entry) => entry.key === key)?.reasons.push(reasons[1]);
            }
        }
        // No signature or no activation: return empty — the caller expresses
        // an explicit no-activation state instead of inventing a pattern.
        return scores;
    }
    const state = triplet.episode.state;
    const category = normalizedStateCategory(triplet);
    const yin = Math.max(0, Math.min(100, Number(state.yin_score)));
    const yang = Math.max(0, Math.min(100, Number(state.yang_score)));
    const activation = yang / 100;
    const recoveryDeficit = Math.max(0, 50 - yin) / 50;
    const lowActivation = Math.max(0, 50 - yang) / 50;
    const scores = [];
    if (category === "pushing_it") {
        pushPatternScore(scores, "overdrive", 3.2 + activation * 1.2 + recoveryDeficit * 0.8, "watch data shows high activation with low recovery");
        pushPatternScore(scores, "tension", 2.2 + activation * 0.8 + recoveryDeficit * 0.6, "watch data shows activation pressure with limited reserve");
    }
    else if (category === "recharging") {
        pushPatternScore(scores, "depletion", 3.0 + lowActivation * 1.1, "watch data shows low activation during recovery");
        pushPatternScore(scores, "constriction", 2.1 + lowActivation * 0.7, "watch data shows reduced outward activation");
    }
    else if (category === "running_on_empty") {
        pushPatternScore(scores, "depletion", 3.4 + recoveryDeficit * 0.9 + lowActivation * 0.7, "watch data shows low recovery and low activation");
        pushPatternScore(scores, "stagnation", 2.4 + lowActivation * 0.8, "watch data shows low movement and low activation");
    }
    return scores;
}
/** The dominant pattern, or null when nothing activates. The old
 *  `?? "depletion"` fallback is deleted (findings F2): a no-activation
 *  day is a real state and must never collapse into a fabricated
 *  depletion claim. */
function primaryPattern(triplet) {
    return scorePatterns(triplet)[0]?.key ?? null;
}
function classifyPattern(triplet) {
    return primaryPattern(triplet);
}
function normalizedPolicy(value) {
    return typeof value === "string" ? value.toLowerCase().trim() : "";
}
function meetingHasUsableSummary(meeting) {
    const summary = meeting.summary?.replace(/\s+/g, " ").trim().toLowerCase();
    return Boolean(summary && summary !== "no summary" && !summary.includes("too corrupted"));
}
function meetingEvidenceWeight(meeting) {
    if ((0, LatentHypothesis_js_1.meetingHasCitedTranscriptSpan)(meeting))
        return 1.15;
    return meetingHasUsableSummary(meeting) ? 0.4 : 0.15;
}
function sourceStartsBeforeOrNearTrigger(sourceTs, anchorTs) {
    if (!Number.isFinite(sourceTs ?? NaN))
        return false;
    return sourceTs <= anchorTs + TEMPORAL_PRECEDENCE_GRACE_SEC &&
        sourceInsideLongHorizonContext(sourceTs, anchorTs);
}
function stringList(value) {
    return Array.isArray(value)
        ? value.filter((entry) => typeof entry === "string")
        : [];
}
function eventHasGranolaAlignment(event) {
    const importPolicy = normalizedPolicy(event.metadata?.import_policy);
    const evidenceStrength = normalizedPolicy(event.metadata?.evidence_strength);
    return importPolicy.includes("granola_aligned") ||
        evidenceStrength.includes("granola_calendar") ||
        stringList(event.metadata?.matched_granola_refs).length > 0;
}
function plannedSourceStartsInsideContext(sourceTs, anchorTs) {
    if (!Number.isFinite(sourceTs ?? NaN))
        return false;
    const delta = sourceTs - anchorTs;
    return delta > TEMPORAL_PRECEDENCE_GRACE_SEC && delta <= PLANNED_CONTEXT_WINDOW_SEC;
}
function sourceInsideLongHorizonContext(sourceTs, anchorTs) {
    if (!Number.isFinite(sourceTs ?? NaN))
        return false;
    return Math.abs(sourceTs - anchorTs) <= LONG_HORIZON_CONTEXT_WINDOW_SEC &&
        sameLocalDay(sourceTs, anchorTs);
}
function eventTimingAllowed(event, anchorTs) {
    if (eventInsideLongHorizonContext(event, anchorTs))
        return true;
    if (sourceStartsBeforeOrNearTrigger(event.start_ts, anchorTs))
        return true;
    return eventHasGranolaAlignment(event) && plannedSourceStartsInsideContext(event.start_ts, anchorTs);
}
function eventEvidenceWeight(event) {
    const response = normalizedPolicy(event.metadata?.my_response_status);
    const status = normalizedPolicy(event.metadata?.status);
    const transparency = normalizedPolicy(event.metadata?.transparency);
    const importPolicy = normalizedPolicy(event.metadata?.import_policy);
    if (status === "cancelled" || response === "declined" || importPolicy.includes("declined"))
        return 0.15;
    if (transparency === "transparent" || importPolicy.includes("weak"))
        return 0.35;
    return 1;
}
function eventReferenceSet(event) {
    return new Set(uniqueStrings([event.id, event.source_ref, event.graph_source_ref]));
}
function eventOverlapsTriggerWindow(event, anchorTs) {
    const start = event.start_ts;
    const end = event.end_ts ?? event.start_ts;
    return start <= anchorTs + TRIGGER_SUPPORT_WINDOW_SEC && end >= anchorTs - TRIGGER_SUPPORT_WINDOW_SEC;
}
function eventInsideLongHorizonContext(event, anchorTs) {
    const start = event.start_ts;
    const end = event.end_ts ?? event.start_ts;
    if (eventOverlapsTriggerWindow(event, anchorTs))
        return true;
    return sourceInsideLongHorizonContext(start, anchorTs) ||
        sourceInsideLongHorizonContext(end, anchorTs) ||
        (start <= anchorTs && end >= anchorTs);
}
function meetingOverlapsTriggerWindow(meeting, anchorTs) {
    const occurredAt = meeting.occurred_at_ts;
    if (!Number.isFinite(occurredAt ?? NaN))
        return false;
    return Math.abs(occurredAt - anchorTs) <= TRIGGER_SUPPORT_WINDOW_SEC;
}
function meetingInsideLongHorizonContext(meeting, anchorTs) {
    const occurredAt = meeting.occurred_at_ts;
    return meetingOverlapsTriggerWindow(meeting, anchorTs) ||
        sourceInsideLongHorizonContext(occurredAt, anchorTs);
}
function meetingMatchesEvent(meeting, event) {
    if (!meeting.event_id)
        return false;
    return eventReferenceSet(event).has(meeting.event_id);
}
function meetingTimingAllowed(meeting, anchorTs, events) {
    if (meetingInsideLongHorizonContext(meeting, anchorTs))
        return true;
    if (sourceStartsBeforeOrNearTrigger(meeting.occurred_at_ts, anchorTs))
        return true;
    return plannedSourceStartsInsideContext(meeting.occurred_at_ts, anchorTs) &&
        events.some((event) => eventTimingAllowed(event, anchorTs) && meetingMatchesEvent(meeting, event));
}
function loadSignalText(values) {
    const text = values.filter(Boolean).join(" ").toLowerCase();
    return /\b(deadline|pressure|conflict|obligation|uncertain|uncertainty|risk|stakes|investor|decide|decision|blocked|urgent|public|must|push|pushed|choose|commit|launch|bet|wedge|value prop|positioning)\b/.test(text)
        || /决定|压力|风险|冲突|截止|必须|选择|定位|投资人/.test(text);
}
function meetingHasLoadSignal(meeting) {
    return loadSignalText([
        meeting.summary,
        meeting.body,
        meeting.topics.join(" "),
    ]);
}
function isWelcomeDavidWithoutMeetingLoad(events, meetings) {
    const titleText = [
        ...events.map((event) => event.title),
        ...meetings.map((meeting) => meeting.title),
    ].join(" ");
    if (!/\bwelcome\s+david!?\b/i.test(titleText))
        return false;
    return !meetings.some(meetingHasLoadSignal);
}
function eventMatchesMeetingRefs(event, refs) {
    for (const ref of eventReferenceSet(event)) {
        if (refs.has(ref))
            return true;
    }
    return false;
}
function eventSupportsBundle(event, anchorTs, meetingEventRefs, meetings) {
    if (eventOverlapsTriggerWindow(event, anchorTs))
        return true;
    if (eventMatchesMeetingRefs(event, meetingEventRefs))
        return true;
    if (eventHasGranolaAlignment(event))
        return true;
    if (!eventInsideLongHorizonContext(event, anchorTs))
        return false;
    if (meetings.length === 0)
        return false;
    const eventTerms = termSet(eventDescriptionText(event));
    const meetingTerms = termSet(meetings.flatMap((meeting) => [
        meeting.title,
        meeting.summary,
        meeting.body,
        meeting.topics.join(" "),
    ]));
    return sharedTermCount(eventTerms, meetingTerms) >= 2 &&
        loadSignalText(eventDescriptionText(event));
}
function isLogisticsCalendarEvent(event) {
    const text = eventDescriptionText(event).join(" ").toLowerCase();
    return /\b(flight|airport|hotel|airbnb|lodging|boarding|reservation|train|uber|lyft|rental car|check-in)\b/.test(text)
        || /#?(travel|lodging|flight|logistics)\b/.test(text);
}
function isProjectMemory(memory) {
    return /(codex|claude|project|session|capsule|memory)/i.test(memory.source);
}
function memoryContextTerms(events, meetings) {
    return termSet([
        ...events.flatMap(eventDescriptionText),
        ...meetings.flatMap((meeting) => [
            meeting.title,
            meeting.summary,
            meeting.body,
            meeting.topics.join(" "),
        ]),
    ]);
}
/**
 * Shared-term count between a project memory and the bundle's event/meeting
 * context (0 for non-project memories or empty term sets). The qualifying
 * threshold stays >= 2 (memorySupportsContext semantics); the raw count also
 * drives relevance-first support ranking, because per-source importance is
 * nearly constant (hardcoded per connector) and cannot separate a relevant
 * insight from an unrelated rollout digest.
 */
function memoryContextOverlap(memory, contextTerms) {
    if (!isProjectMemory(memory))
        return 0;
    const memoryTerms = termSet([memory.insight_text, memory.topics.join(" ")]);
    if (memoryTerms.size === 0)
        return 0;
    return sharedTermCount(memoryTerms, contextTerms);
}
function memorySupportsContext(memory, events, meetings) {
    return memoryContextOverlap(memory, memoryContextTerms(events, meetings)) >= 2;
}
function sourceRefsForTriplet(triplet, events, meetings, memories) {
    return uniqueStrings([
        triplet.episode.state.graph_source_ref,
        ...triplet.episode.samples.map((sample) => sample.graph_source_ref),
        ...events.flatMap((event) => [event.graph_source_ref, event.source_ref, event.id]),
        ...meetings.flatMap((meeting) => [meeting.graph_source_ref, meeting.source_ref, meeting.event_id]),
        ...memories.flatMap((memory) => [memory.graph_source_ref, memory.source_ref]),
    ]);
}
function triggerBundleFor(triplet) {
    const anchorTs = triplet.episode.occurred_at_ts;
    const patternScores = scorePatterns(triplet);
    const timingAllowedEvents = triplet.events.filter((event) => eventTimingAllowed(event, anchorTs));
    const supportMeetings = triplet.meetings.filter((meeting) => (meetingTimingAllowed(meeting, anchorTs, timingAllowedEvents) &&
        (meetingInsideLongHorizonContext(meeting, anchorTs) ||
            timingAllowedEvents.some((event) => meetingMatchesEvent(meeting, event)))));
    const meetingEventRefs = new Set(uniqueStrings(supportMeetings.map((meeting) => meeting.event_id)));
    const supportEvents = timingAllowedEvents.filter((event) => (eventSupportsBundle(event, anchorTs, meetingEventRefs, supportMeetings)));
    // Relevance-first memory ranking: context terms are tokenized once, every
    // memory is scored once, and support slots go to the memories that actually
    // overlap this bundle's meeting/event context. Sorting by strength or
    // importance first would let a high-importance-but-irrelevant source (per-
    // connector importance is nearly constant) monopolize all three slots.
    const contextTerms = memoryContextTerms(supportEvents, supportMeetings);
    const supportMemories = triplet.memories
        .map((memory) => ({ memory, overlap: memoryContextOverlap(memory, contextTerms) }))
        .filter((entry) => entry.overlap >= 2)
        .sort((a, b) => (b.overlap - a.overlap ||
        b.memory.strength - a.memory.strength ||
        b.memory.importance - a.memory.importance ||
        a.memory.id.localeCompare(b.memory.id)))
        .slice(0, 3)
        .map((entry) => entry.memory);
    const usableMeetings = supportMeetings.filter((meeting) => (meetingHasUsableSummary(meeting) || (0, LatentHypothesis_js_1.meetingHasCitedTranscriptSpan)(meeting)));
    const gapCandidate = (0, LatentHypothesis_js_1.detectLatentHypothesis)({
        meetings: supportMeetings,
        memories: supportMemories,
        biometric_patterns: patternScores.map((entry) => entry.key),
        event_titles: supportEvents.map((event) => event.title),
        anchor_ts: anchorTs,
    });
    const hasCitedGap = Boolean(gapCandidate?.evidence_spans.length);
    const hasCalendar = supportEvents.some((event) => (eventEvidenceWeight(event) >= 0.35 &&
        (!isLogisticsCalendarEvent(event) || usableMeetings.length > 0 || supportMemories.length > 0)));
    const hasUsableMeeting = usableMeetings.length > 0;
    const hasAnyMeeting = supportMeetings.length > 0;
    const hasMemory = supportMemories.length > 0;
    const hasJoinedMemory = triplet.memories.length > 0;
    const nonCarriedSampleCount = triplet.episode.samples.filter((sample) => sample.carried !== true).length;
    const benignWelcome = isWelcomeDavidWithoutMeetingLoad(supportEvents, supportMeetings);
    let grade = "weak";
    if (patternScores.length === 0) {
        grade = "source_only";
    }
    else if (benignWelcome) {
        grade = "weak";
    }
    else if (hasCitedGap && hasCalendar && hasUsableMeeting && triplet.episode.state.source_quality === "data_verified") {
        grade = "strong";
    }
    else if (hasCitedGap && ((hasCalendar && hasMemory) || (hasUsableMeeting && hasMemory) || (hasCalendar && hasAnyMeeting && supportMeetings.some(meetingHasLoadSignal)))) {
        grade = "candidate";
    }
    const weekStart = weekStartForTs(anchorTs);
    const weekEnd = weekEndForStart(weekStart);
    const hasEarlyContext = (supportEvents.some((event) => !isLogisticsCalendarEvent(event)) ||
        supportMeetings.length > 0 ||
        hasJoinedMemory);
    const early = (patternScores.length > 0 &&
        nonCarriedSampleCount >= 3 &&
        hasEarlyContext &&
        !benignWelcome &&
        grade === "weak");
    const contextTitleValue = (gapCandidate?.cause ??
        usableMeetings[0]?.title ??
        supportMeetings[0]?.title ??
        supportEvents.find((event) => !isLogisticsCalendarEvent(event))?.title ??
        supportEvents[0]?.title ??
        (supportMemories[0] ? memoryDisplayTitle(supportMemories[0]) : null)) ?? "local work context";
    const evidenceGap = grade === "strong"
        ? "Likely work thread: a meeting note names the open question, and your watch data shows the stress pattern."
        : grade === "candidate"
            ? "Possible work thread: the note names an open question, but Sentinel needs more support before treating it as strong."
            : early
                ? "Early causal scan: your watch data shows a worn-day stress pattern with one joined context signal. Treat this as visible context to review, not a causal verdict."
                : benignWelcome
                    ? "Hidden by default: this looks friendly or supportive, not like a stress-driving work thread."
                    : hasAnyMeeting && !hasCitedGap
                        ? "Watching: the meeting note does not include enough detail to name an open thread."
                        : "Hidden by default: there is not enough context to show this as a likely work thread.";
    return {
        events: supportEvents,
        meetings: supportMeetings,
        usableMeetings,
        memories: supportMemories,
        gapCandidate,
        grade,
        eligible: (patternScores.length > 0 && hasCitedGap && (grade === "strong" || grade === "candidate")) || early,
        early,
        weekStart,
        weekEnd,
        weekLabel: weekLabel(weekStart, weekEnd),
        contextTitle: contextTitleValue,
        evidenceGap,
        hiddenRawRefs: sourceRefsForTriplet(triplet, supportEvents, supportMeetings, supportMemories),
    };
}
function tripletSourceStrength(triplet) {
    const bundle = triggerBundleFor(triplet);
    const meetingStrength = bundle.meetings.reduce((sum, meeting) => sum + meetingEvidenceWeight(meeting), 0);
    const eventStrength = bundle.events.reduce((sum, event) => sum + eventEvidenceWeight(event), 0);
    return meetingStrength * 1.5 + eventStrength;
}
function hasSourceEvidence(triplet) {
    return triggerBundleFor(triplet).eligible;
}
function scoreTripletBreakdown(triplet) {
    const bundle = triggerBundleFor(triplet);
    const stateScore = triplet.episode.state.source_quality === "data_verified" ? 10 : 4;
    const biometricScore = Math.max(0, ...scorePatterns(triplet).map((entry) => entry.score)) * 4;
    const sourceStrength = tripletSourceStrength(triplet);
    const sourceContextScore = sourceStrength > 0 ? Math.min(25, 12 + sourceStrength * 6) : 0;
    const sampleScore = Math.min(triplet.episode.samples.length, 12) * 2;
    const meetingScore = bundle.meetings.reduce((sum, meeting) => sum + meetingEvidenceWeight(meeting) * 30, 0);
    const eventScore = bundle.events.reduce((sum, event) => sum + eventEvidenceWeight(event) * 20, 0);
    const memoryScore = Math.min(bundle.memories.length, 5) * 6;
    return {
        total: Number((stateScore + biometricScore + sourceContextScore + sampleScore + meetingScore + eventScore + memoryScore).toFixed(2)),
        state_score: stateScore,
        source_context_score: Number(sourceContextScore.toFixed(2)),
        sample_score: sampleScore,
        meeting_score: Number(meetingScore.toFixed(2)),
        event_score: Number(eventScore.toFixed(2)),
        memory_score: memoryScore,
    };
}
function scoreTriplet(triplet) {
    return scoreTripletBreakdown(triplet).total;
}
function compareTriplets(a, b) {
    return (scoreTriplet(b) - scoreTriplet(a) ||
        a.episode.occurred_at_ts - b.episode.occurred_at_ts ||
        a.id.localeCompare(b.id));
}
function patternScoreFor(triplet, pattern) {
    return scorePatterns(triplet).find((entry) => entry.key === pattern)?.score ?? 0;
}
function compareTripletsForPattern(pattern) {
    return (a, b) => (patternScoreFor(b, pattern) - patternScoreFor(a, pattern) ||
        tripletSourceStrength(b) - tripletSourceStrength(a) ||
        compareTriplets(a, b));
}
function chooseRootTriplet(triplets) {
    const eligible = triplets.filter((triplet) => triggerBundleFor(triplet).eligible);
    if (eligible.length === 0) {
        throw new NotEnoughSignalError("Watching: no meeting-note detail is strong enough to name an open work thread yet");
    }
    return eligible.sort(compareTriplets)[0];
}
/**
 * v2 additions to the armed-root props: signature provenance, the 7th
 * gate's verdict, and the coverage cap. The spread sits LAST in the
 * props_json literal so `biometric_pattern_source` and `claim_level`
 * are overridden only when v2 is active. Empty object on the legacy path.
 */
function v2RootProps(rootTriplet) {
    if (!v2Active)
        return {};
    const day = (0, v2Context_js_1.localDayKey)(rootTriplet.episode.occurred_at_ts, v2Active.timezoneOffsetHours);
    const signature = v2Active.signaturesByDate.get(day) ?? null;
    const props = {
        biometric_pattern_source: "raw_multi_metric_signature_v2",
        signature_day: day,
        signature_confidence: signature?.confidence ?? 0,
        signature_coverage: signature?.coverage ?? 0,
        signature_quality: signature?.quality ?? "no_data",
        signature_measurability: signature?.measurability ?? "unmeasurable",
    };
    const axis = v2Active.enrichmentAxes[0];
    if (axis) {
        const { gate, coverageCap } = (0, v2Context_js_1.runEnrichmentGateWithCoverage)(axis, v2Active.coverage, v2Active.thresholds);
        props.enrichment_gate = {
            theme: gate.theme,
            verdict: gate.verdict,
            control_ratio: Number.isFinite(gate.ratio) ? gate.ratio : "inf",
            backed_days: gate.backedDays,
            multi_source_backed_days: gate.multiSourceBackedDays,
            reasons: gate.reasons,
        };
        props.rtm_flags = gate.flags;
        props.coverage_cap = {
            level: coverageCap.level,
            unbacked_dates: coverageCap.unbackedDates,
            capped_because: coverageCap.cappedBecause,
        };
        props.claim_level = (0, v2Context_js_1.claimLevelForVerdict)(gate.verdict, "source_backed_hypothesis_not_settled_causality");
    }
    return props;
}
function contextKey(triplet) {
    const bundle = triggerBundleFor(triplet);
    const sourceKey = (bundle.meetings[0]?.graph_source_ref ??
        bundle.events[0]?.graph_source_ref ??
        bundle.memories[0]?.graph_source_ref ??
        triplet.episode.state.graph_source_ref);
    return `${sourceKey}:${primaryPattern(triplet) ?? "no-activation"}`;
}
function chooseGraphTriplets(triplets, rootTriplet) {
    const selected = new Map([[rootTriplet.id, rootTriplet]]);
    const contextWinners = new Map();
    const rootWeek = triggerBundleFor(rootTriplet).weekStart;
    const assignedPatternCounts = new Map();
    for (const score of scorePatterns(rootTriplet)) {
        assignedPatternCounts.set(`${rootWeek}:${score.key}`, 1);
    }
    const assignedWeekCounts = new Map([[rootWeek, 1]]);
    for (const triplet of triplets) {
        if (!hasSourceEvidence(triplet) && triplet.id !== rootTriplet.id)
            continue;
        const previous = contextWinners.get(contextKey(triplet));
        if (!previous || compareTriplets(triplet, previous) < 0) {
            contextWinners.set(contextKey(triplet), triplet);
        }
    }
    const byWeek = new Map();
    for (const triplet of contextWinners.values()) {
        const week = triggerBundleFor(triplet).weekStart;
        byWeek.set(week, [...(byWeek.get(week) ?? []), triplet]);
    }
    for (const [week, weekTriplets] of [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
        const candidates = weekTriplets.sort(compareTriplets);
        let madeProgress = true;
        while ((assignedWeekCounts.get(week) ?? 0) < MAX_VISIBLE_TRIGGERS_PER_WEEK && madeProgress) {
            madeProgress = false;
            for (const pattern of PATTERNS) {
                if ((assignedWeekCounts.get(week) ?? 0) >= MAX_VISIBLE_TRIGGERS_PER_WEEK)
                    break;
                const patternWeekKey = `${week}:${pattern.key}`;
                if ((assignedPatternCounts.get(patternWeekKey) ?? 0) >= MAX_EPISODES_PER_PATTERN)
                    continue;
                const candidate = candidates
                    .filter((triplet) => !selected.has(triplet.id) && patternScoreFor(triplet, pattern.key) > 0)
                    .sort(compareTripletsForPattern(pattern.key))[0];
                if (!candidate)
                    continue;
                selected.set(candidate.id, candidate);
                assignedWeekCounts.set(week, (assignedWeekCounts.get(week) ?? 0) + 1);
                for (const score of scorePatterns(candidate)) {
                    const key = `${week}:${score.key}`;
                    assignedPatternCounts.set(key, (assignedPatternCounts.get(key) ?? 0) + 1);
                }
                madeProgress = true;
            }
        }
    }
    return [...selected.values()].sort(compareTriplets);
}
function watchingSourceTriplets(triplets) {
    const seen = new Set();
    const out = [];
    const ranked = [...triplets]
        .filter((triplet) => triplet.meetings.length > 0 || triplet.events.length > 0)
        .sort(compareTriplets);
    for (const triplet of ranked) {
        const key = (triplet.meetings[0]?.graph_source_ref ??
            triplet.events[0]?.graph_source_ref ??
            triplet.id);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(triplet);
        if (out.length >= MAX_WATCHING_SOURCE_NODES)
            break;
    }
    return out;
}
function cappedPatternScores(triplets, rootTriplet) {
    const counts = new Map();
    const byTriplet = new Map();
    const ordered = [
        rootTriplet,
        ...triplets.filter((triplet) => triplet.id !== rootTriplet.id),
    ];
    for (const triplet of ordered) {
        const week = triggerBundleFor(triplet).weekStart;
        const visibleScores = [];
        for (const score of scorePatterns(triplet)) {
            const key = `${week}:${score.key}`;
            const count = counts.get(key) ?? 0;
            if (count >= MAX_EPISODES_PER_PATTERN)
                continue;
            visibleScores.push(score);
            counts.set(key, count + 1);
        }
        byTriplet.set(triplet.id, visibleScores);
    }
    return byTriplet;
}
function confidenceFor(triplet) {
    const bundle = triggerBundleFor(triplet);
    const sourceContext = bundle.events.length + bundle.meetings.length;
    const memoryCount = bundle.memories.length;
    const sampleCount = Math.min(triplet.episode.samples.length, 4);
    const gradeBoost = bundle.grade === "strong" ? 0.12 : bundle.grade === "candidate" ? 0.04 : 0;
    const raw = 0.36 + gradeBoost + sourceContext * 0.10 + memoryCount * 0.04 + sampleCount * 0.02;
    return Math.min(0.88, Number(raw.toFixed(2)));
}
function contextTitle(triplet) {
    return triggerBundleFor(triplet).contextTitle;
}
function attributionTitle(triplet) {
    const gap = triggerBundleFor(triplet).gapCandidate;
    if (gap)
        return `${gap.cause} attribution candidate`;
    if (!triplet.events.length && !triplet.meetings.length) {
        return triplet.memories.length ? "Weak memory attribution candidate" : "Unattributed biometric candidate";
    }
    return `${contextTitle(triplet)} attribution candidate`;
}
function attributionCause(triplet) {
    const bundle = triggerBundleFor(triplet);
    const scoredPatterns = scorePatterns(triplet);
    const pattern = patternDefinition(scoredPatterns[0]?.key ?? "stagnation").title.toLowerCase();
    const patternPhrase = pattern.charAt(0).toUpperCase() + pattern.slice(1);
    const secondary = scoredPatterns
        .slice(1, 3)
        .map((entry) => patternDefinition(entry.key).title.toLowerCase())
        .join(" / ");
    const context = contextTitle(triplet);
    const span = bundle.gapCandidate?.evidence_spans[0];
    if (bundle.eligible && span) {
        return `${context}. Sentinel found this open thread in a meeting note from the same day your watch data showed a ${patternPhrase} pattern${secondary ? `, with ${secondary} also visible` : ""}. Treat this as a ${bundle.grade} lead to review, not a final answer.`;
    }
    return "Watching: your watch data shows a stress pattern, but Sentinel did not find enough meeting-note detail to name what set it off. Event and meeting titles stay as context, not causes.";
}
function calendarEvidence(event) {
    const when = compactDateTime(event.start_ts);
    return `Calendar: ${event.title}${when ? ` at ${when}` : ""}`;
}
function meetingEvidence(meeting) {
    const cited = (meeting.transcript_spans ?? []).find((span) => span.text?.trim());
    if (cited) {
        return `Granola note: ${meeting.title} - linked meeting-note detail`;
    }
    const summary = truncate(meeting.summary, 120);
    return `Granola: ${meeting.title}${summary ? ` - ${summary}` : ""}`;
}
function memoryEvidence(memory) {
    const title = memoryDisplayTitle(memory);
    return `Local memory: ${title}`;
}
function sampleEvidence(triplet) {
    return triplet.episode.samples.slice(0, 2).map((sample) => {
        const when = compactDateTime(Math.trunc(Date.parse(sample.timestamp) / 1000));
        return `Watch signal: ${sample.metric} sample ${sample.value}${when ? ` at ${when}` : ""}`;
    });
}
function biometricPatternEvidence(triplet) {
    const primary = scorePatterns(triplet)[0];
    const pattern = patternDefinition(primary?.key ?? "depletion").title.toLowerCase();
    const phrase = pattern.charAt(0).toUpperCase() + pattern.slice(1);
    return `Watch pattern: ${phrase}${primary?.reasons[0] ? ` - ${primary.reasons[0]}` : ""}`;
}
function buildBrief(triplet) {
    const state = triplet.episode.state;
    const bundle = triggerBundleFor(triplet);
    const when = compactDateTime(state.bucket_ts);
    const evidence = [
        ...bundle.events.slice(0, 2).map(calendarEvidence),
        ...bundle.meetings.slice(0, 2).map(meetingEvidence),
        `Watch history: ${state.graph_source_ref}${when ? ` at ${when}` : ""}`,
        biometricPatternEvidence(triplet),
        ...sampleEvidence(triplet),
        ...bundle.memories.slice(0, 1).map(memoryEvidence),
    ].filter((line) => line.trim().length > 0);
    return {
        cause: attributionCause(triplet),
        evidence,
        context: [
            bundle.events.length ? `${bundle.events.length} calendar anchor(s)` : null,
            bundle.meetings.length ? `${bundle.meetings.length} meeting note(s)` : null,
            bundle.memories.length ? `${bundle.memories.length} project context match(es)` : null,
        ].filter(Boolean).join(", ") || "Watch data only",
        artifact_spec: "Draft a short review note with the suspected work thread, supporting context, open gaps, and a next step.",
        suggested_block: {
            title: "Review this likely thread",
            start_offset_min: 30,
            duration_min: 25,
        },
    };
}
function triggerCountsByWeek(triplets) {
    const counts = new Map();
    for (const triplet of triplets) {
        const week = triggerBundleFor(triplet).weekStart;
        counts.set(week, (counts.get(week) ?? 0) + 1);
    }
    return counts;
}
function bestTripletByWeek(triplets) {
    const byWeek = new Map();
    for (const triplet of triplets) {
        const week = triggerBundleFor(triplet).weekStart;
        const previous = byWeek.get(week);
        if (!previous || compareTriplets(triplet, previous) < 0) {
            byWeek.set(week, triplet);
        }
    }
    return byWeek;
}
function weeklyBriefSnapshot(triplet, triggerCount, currentBrief) {
    const bundle = triggerBundleFor(triplet);
    return {
        week_start: bundle.weekStart,
        week_end: bundle.weekEnd,
        week_label: bundle.weekLabel,
        title: attributionTitle(triplet),
        cause: currentBrief?.cause ?? attributionCause(triplet),
        evidence_grade: bundle.grade,
        trigger_count: triggerCount,
        selected_triplet_id: triplet.id,
        selected_pattern: primaryPattern(triplet),
        linked_patterns: scorePatterns(triplet).map((entry) => entry.key),
        supporting_source_counts: {
            calendar: bundle.events.length,
            granola: bundle.meetings.length,
            memory: bundle.memories.length,
        },
        citation_gate: {
            has_cited_transcript_span: Boolean(bundle.gapCandidate?.evidence_spans.length),
            thread_key: bundle.gapCandidate?.thread_key ?? null,
            evidence_spans: citedSpanRefs(bundle.gapCandidate?.evidence_spans),
        },
    };
}
function rootCarryForwardProps(rootTriplet, graphTriplets, brief) {
    const counts = triggerCountsByWeek(graphTriplets);
    const activeWeeks = [...counts.keys()].sort();
    const byWeek = bestTripletByWeek(graphTriplets);
    const weeklyBriefs = Object.fromEntries(activeWeeks.map((week) => {
        const triplet = byWeek.get(week) ?? rootTriplet;
        return [week, weeklyBriefSnapshot(triplet, counts.get(week) ?? 1, triplet.id === rootTriplet.id ? brief : undefined)];
    }));
    const rootWeek = triggerBundleFor(rootTriplet).weekStart;
    return {
        thread_key: DEFAULT_ROOT_THREAD_KEY,
        first_seen_week: activeWeeks[0] ?? rootWeek,
        last_active_week: activeWeeks[activeWeeks.length - 1] ?? rootWeek,
        active_weeks: activeWeeks.length ? activeWeeks : [rootWeek],
        recurrence_count: activeWeeks.length || 1,
        weekly_briefs: weeklyBriefs,
        cooldown: {
            cooldown_weeks: ROOT_COOLDOWN_WEEKS,
            last_armed_week: rootWeek,
            rearm_requires_current_week_trigger: true,
        },
        cooldown_weeks: ROOT_COOLDOWN_WEEKS,
        verify_horizon_weeks: ROOT_VERIFY_HORIZON_WEEKS,
    };
}
function timeAlignmentLine(triplet) {
    const when = compactDateTime(triplet.episode.occurred_at_ts);
    return `Linked because this source happened on the same day as the stress pattern${when ? ` around ${when}` : ""}.`;
}
function metadataCentralBrain(event) {
    const raw = event.metadata?.central_brain;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const value = raw;
    return {
        display_title: typeof value.display_title === "string" ? value.display_title : undefined,
        summary: typeof value.summary === "string" ? value.summary : undefined,
        key_points: arrayFromUnknown(value.key_points),
        topics: arrayFromUnknown(value.topics),
        why_linked: typeof value.why_linked === "string" ? value.why_linked : undefined,
        evidence_gap: typeof value.evidence_gap === "string" ? value.evidence_gap : undefined,
    };
}
function sourceCardProps(card) {
    return {
        source_kind: card.source_kind,
        display_title: card.display_title,
        summary: card.summary,
        key_points: card.key_points,
        topics: card.topics,
        why_linked: card.why_linked,
        ...(card.evidence_gap ? { evidence_gap: card.evidence_gap } : {}),
        hidden_raw_refs: card.hidden_raw_refs,
        source_card: card,
        snippet: card.summary,
    };
}
function sourceCardForMeeting(meeting, triplet) {
    const usableSummary = meetingHasUsableSummary(meeting);
    const hasTranscript = (0, LatentHypothesis_js_1.meetingHasCitedTranscriptSpan)(meeting);
    const summary = usableSummary
        ? (truncate(meeting.summary ?? meeting.body, 720)
            ?? `${meeting.title} has a Granola source row, but no summary text was imported.`)
        : hasTranscript
            ? (truncate(meeting.body, 720) ?? `${meeting.title} has linked meeting-note detail.`)
            : `${meeting.title} has a Granola source row, but no usable summary text was imported.`;
    const keyPoints = compactSentenceParts(summary, 3);
    return {
        source_kind: "granola_note",
        display_title: meeting.title,
        summary,
        key_points: keyPoints.length ? keyPoints : ["Meeting note linked to the same-day stress pattern."],
        topics: uniqueStrings(meeting.topics),
        why_linked: timeAlignmentLine(triplet),
        evidence_gap: hasTranscript
            ? undefined
            : usableSummary
                ? (meeting.body ? "The note has more detail, but Sentinel did not import a clean cited passage for this run." : "Summary-only: the full note was not imported for this run.")
                : "This meeting note does not include enough imported detail to name a cause.",
        hidden_raw_refs: uniqueStrings([meeting.graph_source_ref, meeting.source_ref, meeting.event_id]),
    };
}
function sourceCardForEvent(event, triplet) {
    const centralBrain = metadataCentralBrain(event);
    const when = compactDateTime(event.start_ts);
    const metadataTopics = arrayFromUnknown(event.metadata?.topic_tags);
    const description = metadataString(event.metadata, "description_excerpt");
    const importPolicy = metadataString(event.metadata, "import_policy");
    const evidenceStrength = metadataString(event.metadata, "evidence_strength");
    const topics = uniqueStrings([
        ...metadataTopics,
        ...(centralBrain?.topics ?? []),
        event.calendar_name ? `#${event.calendar_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null,
    ]);
    const location = event.location ? ` at ${event.location}` : "";
    const summary = truncate(centralBrain?.summary ?? description, 720) ?? `${event.title} was on the calendar${when ? ` on ${when}` : ""}${location}. It can add context, but without a matching meeting note it is not enough by itself to name a cause.`;
    const keyPoints = (centralBrain?.key_points?.length ? centralBrain.key_points : compactSentenceParts(summary, 3));
    const policyGap = eventEvidenceWeight(event) < 1
        ? `Calendar-only context: Sentinel needs a matching note or stronger watch-pattern support before treating it as a likely thread.`
        : undefined;
    return {
        source_kind: "calendar_event",
        display_title: centralBrain?.display_title ?? event.title,
        summary,
        key_points: keyPoints.length ? keyPoints : ["Calendar context from the same day."],
        topics,
        why_linked: centralBrain?.why_linked ?? timeAlignmentLine(triplet),
        evidence_gap: centralBrain?.evidence_gap ?? policyGap ?? "Calendar-only: no matching meeting note was available.",
        hidden_raw_refs: uniqueStrings([event.graph_source_ref, event.source_ref, event.id]),
    };
}
function memoryDisplayTitle(memory) {
    if (memory.source === "codex_project_capsule") {
        return truncate(memory.insight_text.split(/[:.\n]/)[0], 72) ?? "Project memory";
    }
    const text = `${memory.insight_text} ${memory.topics.join(" ")}`.toLowerCase();
    if (/(release|launch|delivery|readiness)/.test(text))
        return "Delivery readiness";
    if (/(uuid|device|postgres|source table|user_insights|backend|migration|import)/.test(text)) {
        return "Backend UID and source-table migration";
    }
    if (/(sentinel|swift|ui|screenshot|graph|pattern)/.test(text))
        return "Sentinel graph UI repair";
    if (/(detonator|entitlement|license|paid|paywall)/.test(text))
        return "Detonator entitlement gate";
    if (/(loop|tracker|handoff|verification|session)/.test(text))
        return "Loop handoff and verification";
    return "Project memory capsule";
}
function memorySummary(memory) {
    if (memory.source === "codex_project_capsule") {
        return truncate(memory.insight_text, 720) ?? "Project memory capsule from local agent sessions.";
    }
    const title = memoryDisplayTitle(memory);
    const summaries = {
        "Delivery readiness": "Local project memory connects delivery readiness, verification, and evidence quality. Raw agent-session refs stay hidden; this capsule is used only as supporting context.",
        "Backend UID and source-table migration": "Project context confirms the local source setup and device connection used for this run.",
        "Sentinel graph UI repair": "Project context confirms that Sentinel should show real source context without turning titles into causes.",
        "Detonator entitlement gate": "Local project memory records that Detonator close-loop remains entitlement gated and should not be bypassed or marked complete without an issued license.",
        "Loop handoff and verification": "Local project memory records the loop discipline: read tracker and handoff first, verify with commands, update docs, and preserve existing uncommitted work.",
    };
    return summaries[title] ?? "Local project memory supports this attribution, but the raw session text is hidden from the graph card.";
}
function sourceCardForMemory(memory, triplet) {
    const summary = memorySummary(memory);
    const topics = uniqueStrings(memory.topics);
    const keyPoints = compactSentenceParts(summary, 3);
    const isCapsule = memory.source === "codex_project_capsule";
    return {
        source_kind: "project_memory_capsule",
        display_title: memoryDisplayTitle(memory),
        summary,
        key_points: keyPoints.length ? keyPoints : ["Project-memory capsule derived from local agent sessions."],
        topics,
        why_linked: isCapsule
            ? "Linked by project-history overlap with the meeting/calendar context; raw local session refs stay hidden."
            : memory.occurred_at_ts
                ? timeAlignmentLine(triplet)
                : "Linked by overlapping project terms with the meeting/calendar context.",
        evidence_gap: isCapsule ? "Capsule grouping is regex-derived from overlapping project-session terms, not a causal source row." : "Raw project-session memory is backing evidence only; use a capsule row for visible UI when available.",
        hidden_raw_refs: uniqueStrings([memory.graph_source_ref, memory.source_ref]),
    };
}
function visibleMemories(triplet) {
    return triplet.memories
        .filter((memory) => memory.source === "codex_project_capsule")
        .slice(0, 3);
}
function deriveThemes(triplet) {
    const text = tripletText(triplet);
    const themes = new Set();
    for (const meeting of triplet.meetings) {
        for (const topic of meeting.topics) {
            const normalized = normalizeTheme(topic);
            if (/(release|launch|delivery|readiness|verification)/.test(normalized)) {
                themes.add("#delivery-readiness");
            }
            if (/(stakeholder|customer|interview|fundraising)/.test(normalized)) {
                themes.add("#investor-facing");
                themes.add("#high-stakes-public");
            }
            if (/(b2b|brand|go-to-market|consumer|partnership)/.test(normalized)) {
                themes.add("#b2b-track");
            }
        }
    }
    if (/(stakeholder|customer|interview|fundraising)/.test(text)) {
        themes.add("#investor-facing");
        themes.add("#high-stakes-public");
    }
    if (/(release|launch|delivery|readiness|verification)/.test(text)) {
        themes.add("#delivery-readiness");
    }
    if (/(b2b|brand|go-to-market|consumer|partnership)/.test(text)) {
        themes.add("#b2b-track");
    }
    if (themes.size === 0)
        themes.add("#work-context");
    return [...themes].sort();
}
function contextNodesFor(userId, triplet, meetings = triplet.meetings, events = triplet.events) {
    const nodes = [];
    for (const meeting of meetings) {
        const card = sourceCardForMeeting(meeting, triplet);
        nodes.push({
            id: nodeId(userId, "meeting", meeting.graph_source_ref),
            kind: "meeting",
            title: card.display_title,
            subtitle: compactDateTime(meeting.occurred_at_ts) ?? truncate(card.summary, 70),
            occurred_at_ts: meeting.occurred_at_ts,
            source: meeting.source,
            source_ref: meeting.graph_source_ref,
            props_json: {
                kind: meeting.kind,
                event_id: meeting.event_id,
                duration_sec: meeting.duration_sec,
                participants: meeting.participants,
                topics: card.topics,
                ...sourceCardProps(card),
            },
        });
    }
    for (const event of events) {
        const card = sourceCardForEvent(event, triplet);
        nodes.push({
            id: nodeId(userId, "meeting", event.graph_source_ref),
            kind: "meeting",
            title: card.display_title,
            subtitle: compactDateTime(event.start_ts),
            occurred_at_ts: event.start_ts,
            source: event.source,
            source_ref: event.graph_source_ref,
            props_json: {
                kind: "calendar_event",
                event_id: event.id,
                calendar_name: event.calendar_name,
                attendee_count: event.attendee_count,
                location: event.location,
                topics: card.topics,
                event,
                ...sourceCardProps(card),
            },
        });
    }
    return nodes;
}
// Week-agnostic on purpose: the graph store's dedup identity for
// source_ref'd nodes is ux_nodes_dedup (user_id, kind, source, source_ref),
// which carries no week. A week-scoped id would mint a NEW id for the same
// memory in a later week while its dedup tuple stays the same, so the
// INSERT ... ON CONFLICT(id) upsert (which only targets id) trips the
// unique index instead of updating. One node per (user, memory) across
// weeks; the week travels on the suggests edge props (week_start).
function memoryHitNodeId(userId, memoryId) {
    return `memoryhit_${stableHash([userId, memoryId])}`;
}
/**
 * Surfaces project-memory support (the bundle's supportMemories) as
 * first-class memory_hit nodes plus `suggests` edges into the root ghost
 * node. `suggests` (not `evidence_for`) because the Mac app's memory-citation
 * surfaces (RootLoopQueue.citedSources, LoopFocusView.heroCitedSources,
 * InspectorPanel CITED chips) select `.suggests` edges into the ghost, while
 * its `.evidenceFor` chip path assumes biometric episode nodes ("DIP"
 * labels). `suggests` is also in nightly's TRAVERSAL_EDGE_KINDS, so Layer-2
 * behavior stays neutral. Emitted alongside the meeting context nodes so
 * upsert replace semantics and retention treat them uniformly. These nodes
 * complement the root's supporting_project_memories props — they do not
 * replace them. Zero supportMemories -> zero nodes/edges.
 */
function addMemoryHitNodes(nodes, edges, userId, memories, weekStart, rootId, overlay) {
    // Per-delta (source, source_ref) dedupe: two DIFFERENT memories can share
    // one source_ref (e.g. two claude_sessions insights extracted from the same
    // session file). Their ids differ (hash of user+memory id) but their
    // ux_nodes_dedup tuple (user_id, 'memory_hit', source, source_ref) is the
    // same, so emitting both would violate the unique index inside one upsert.
    // First-write-wins, consistent with the addNode Map idiom: one citation
    // node per source file per delta, and every later supporting memory from
    // that file reuses it for its edge (multiple memories collapse to one
    // citation node — fine for UI honesty). Seeded from the shared nodes map
    // because the watching path calls this once per triplet.
    const nodeIdByDedupTuple = new Map();
    for (const node of nodes.values()) {
        if (node.kind === "memory_hit" && node.source_ref) {
            nodeIdByDedupTuple.set(`${node.source}|${node.source_ref}`, node.id);
        }
    }
    for (const memory of memories) {
        const sourceRef = memory.source_ref ?? memory.graph_source_ref;
        const dedupTuple = `${memory.source}|${sourceRef}`;
        const existingId = nodeIdByDedupTuple.get(dedupTuple);
        const memoryId = existingId ?? memoryHitNodeId(userId, memory.id);
        if (!existingId) {
            nodeIdByDedupTuple.set(dedupTuple, memoryId);
            // Compact citation title for the Mac UI, using the same truncate()
            // convention as sibling memory titles (memoryDisplayTitle's 72-char cap).
            const memoryTitle = truncate(memory.insight_text, 72) || memoryDisplayTitle(memory);
            addNode(nodes, {
                id: memoryId,
                user_id: userId,
                kind: "memory_hit",
                title: memoryTitle,
                subtitle: memory.source,
                occurred_at_ts: memory.occurred_at_ts,
                source: memory.source,
                source_ref: sourceRef,
                props_json: {
                    insight_id: memory.id,
                    topics: memory.topics,
                    strength: memory.strength,
                    importance: memory.importance,
                    ...(overlay?.node_props ?? {}),
                },
            });
        }
        addEdge(edges, {
            id: edgeId(userId, memoryId, rootId, "suggests"),
            user_id: userId,
            src_id: memoryId,
            dst_id: rootId,
            kind: "suggests",
            label: "project memory support",
            // user_insights strength lives in 0..1, but clamp defensively; the
            // watching overlay caps it further at the watching-context weight.
            weight: Math.min(overlay?.edge_weight_cap ?? 1, Math.max(0, memory.strength)),
            props_json: {
                evidence_role: "memory_support",
                insight_id: memory.id,
                week_start: weekStart,
            },
        });
    }
}
function addPatternNodes(nodes, userId, activePatterns) {
    for (const pattern of PATTERNS) {
        const active = activePatterns.has(pattern.key);
        addNode(nodes, {
            id: patternNodeId(userId, pattern.key),
            user_id: userId,
            kind: "pattern",
            title: pattern.title,
            subtitle: active ? pattern.active_subtitle : pattern.quiet_subtitle,
            element: pattern.element,
            occurred_at_ts: null,
            source: "pattern_catalog",
            source_ref: `pattern:${pattern.key}`,
            props_json: {
                status: active ? "active_candidate" : "quiet",
                pattern: pattern.key,
            },
        });
    }
}
function heartRateValue(triplet) {
    const sample = triplet.episode.samples.find((entry) => entry.metric === "heart_rate");
    return typeof sample?.value === "number" ? sample.value : undefined;
}
function supportCalendarProps(event) {
    return {
        id: event.id,
        title: event.title,
        start_ts: event.start_ts,
        end_ts: event.end_ts,
        source_ref: event.graph_source_ref,
        evidence_weight: eventEvidenceWeight(event),
        evidence_role: isLogisticsCalendarEvent(event) ? "logistics_context" : "calendar_context",
    };
}
function supportMeetingProps(meeting) {
    const citedSpans = (meeting.transcript_spans ?? [])
        .filter((span) => typeof span.text === "string" && span.text.trim().length > 0)
        .slice(0, 3)
        .map((span) => ({
        idx: span.idx,
        speaker: span.speaker ?? null,
        ts_offset_sec: span.ts_offset_sec ?? null,
        text_redacted: true,
    }));
    return {
        id: meeting.id,
        title: meeting.title,
        occurred_at_ts: meeting.occurred_at_ts,
        source_ref: meeting.graph_source_ref,
        event_id: meeting.event_id,
        usable_summary: meetingHasUsableSummary(meeting),
        has_cited_transcript_span: (0, LatentHypothesis_js_1.meetingHasCitedTranscriptSpan)(meeting),
        transcript_span_count: (meeting.transcript_spans ?? []).length,
        cited_transcript_spans: citedSpans,
        summary: truncate(meeting.summary ?? meeting.body, 220),
        topics: meeting.topics,
    };
}
function citedSpanRefs(spans) {
    return (spans ?? []).map((span) => ({
        meeting_id: span.meeting_id,
        meeting_title: span.meeting_title,
        source_ref: span.source_ref,
        speaker: span.speaker ?? null,
        ts_offset_sec: span.ts_offset_sec ?? null,
        text_redacted: true,
    }));
}
function supportMemoryProps(memory) {
    return {
        id: memory.id,
        title: memoryDisplayTitle(memory),
        source_ref: memory.graph_source_ref,
        strength: memory.strength,
        summary: truncate(memorySummary(memory), 220),
        topics: memory.topics,
    };
}
function triggerSummary(triplet, bundle) {
    const patterns = scorePatterns(triplet)
        .slice(0, 3)
        .map((score) => patternDefinition(score.key).title.toLowerCase())
        .join(" / ");
    return `${bundle.contextTitle} lines up with a watch-detected stress pattern${patterns ? ` (${patterns})` : ""}. Sources name the likely work thread; watch data sets the pattern.`;
}
function triggerKeyPoints(bundle, triplet) {
    return uniqueStrings([
        bundle.events[0] ? `Calendar: ${bundle.events[0].title}` : null,
        bundle.meetings[0] ? `Granola: ${bundle.meetings[0].title}${meetingHasUsableSummary(bundle.meetings[0]) ? "" : " (no usable summary)"}` : null,
        bundle.memories[0] ? `Memory: ${memoryDisplayTitle(bundle.memories[0])}` : null,
        biometricPatternEvidence(triplet),
    ]);
}
function triggerWhyLinked(triplet) {
    const when = compactDateTime(triplet.episode.occurred_at_ts);
    return `Linked because this work thread and stress pattern appeared on the same local day${when ? ` around ${when}` : ""}. Meeting and calendar context name the possible thread; watch data sets the pattern.`;
}
/** Units are not carried on BiometricSampleSignal; derive them per metric for
 *  the endorsement string. Unknown metrics get an empty unit (the builder just
 *  renders "TYPE 12  avg" with a doubled space collapsed by the caller's copy). */
// Canonical metric names (DEFAULT_BIOMETRIC_METRICS) + the "hrv" short form.
// Keep in sync with DEFAULT_UNITS in biometric-endorsement.ts — this maps the
// unit at the sample source; that module's fallback is the defensive backstop.
const METRIC_UNITS = {
    heart_rate: "bpm",
    hrv: "ms",
    heart_rate_variability: "ms",
    active_energy_burned: "kcal",
    resting_heart_rate: "bpm",
    respiratory_rate: "brpm",
    step_count: "count",
};
/** Reasoner episode claim_level → endorsement claim gate. The episode-level
 *  vocabulary is only ever "source_backed_hypothesis_not_settled_causality" or
 *  "insufficient_evidence" — NEITHER asserts attribution, so episode
 *  endorsements stay observational (context_only). The attribution_candidate
 *  gate ("coincided with") is reserved for callers that actually reach that
 *  claim strength; wiring it here would overclaim. */
function endorsementClaimLevel(_episodeClaimLevel) {
    return "context_only";
}
/**
 * Build the per-episode biometric_summary + pattern_endorsements payload from
 * the triplet's raw samples and the run's 30-day baselines. Returns undefined
 * when the episode carries no samples (props stay byte-identical to today's).
 */
function biometricEndorsementProps(triplet, visiblePatternScores, claimLevel, baselines) {
    const rawSamples = triplet.episode.samples;
    if (!rawSamples.length)
        return undefined;
    const samples = [];
    for (const sample of rawSamples) {
        const ts = Date.parse(sample.timestamp);
        if (!Number.isFinite(ts) || typeof sample.value !== "number")
            continue;
        samples.push({
            metric_type: sample.metric,
            value: sample.value,
            unit: METRIC_UNITS[sample.metric] ?? "",
            start_time_ts: ts,
        });
    }
    if (!samples.length)
        return undefined;
    // Window = the actual data span (epoch ms; used only for HH:MM rendering).
    let startTs = samples[0].start_time_ts;
    let endTs = samples[0].start_time_ts;
    for (const sample of samples) {
        if (sample.start_time_ts < startTs)
            startTs = sample.start_time_ts;
        if (sample.start_time_ts > endTs)
            endTs = sample.start_time_ts;
    }
    const endorsement = (0, biometric_endorsement_js_1.buildBiometricEndorsement)({
        samples,
        baselines: baselines ?? [],
        window: { start_ts: startTs, end_ts: endTs },
        patterns: visiblePatternScores.map((entry) => entry.key),
        claimLevel: endorsementClaimLevel(claimLevel),
        timeZone: LA_TIME,
    });
    if (endorsement.biometric_summary.sample_count <= 0)
        return undefined;
    return {
        biometric_summary: endorsement.biometric_summary,
        pattern_endorsements: endorsement.pattern_endorsements,
    };
}
function buildEpisodeProps(triplet, visiblePatternScores, bundle, themes, baselines) {
    const hr = heartRateValue(triplet);
    const claimLevel = bundle.gapCandidate?.verification.claim_level ?? "insufficient_evidence";
    const endorsement = biometricEndorsementProps(triplet, visiblePatternScores, claimLevel, baselines);
    const patternScores = visiblePatternScores.map((entry) => ({
        pattern: entry.key,
        score: entry.score,
        reasons: entry.reasons,
    }));
    return {
        display_kind: "trigger_bundle",
        source_kind: "trigger_bundle",
        display_title: bundle.contextTitle,
        summary: triggerSummary(triplet, bundle),
        key_points: triggerKeyPoints(bundle, triplet),
        why_linked: triggerWhyLinked(triplet),
        evidence_gap: bundle.evidenceGap,
        citation_gate: {
            has_cited_transcript_span: Boolean(bundle.gapCandidate?.evidence_spans.length),
            thread_key: bundle.gapCandidate?.thread_key ?? null,
            gap_summary: bundle.gapCandidate?.summary ?? null,
            evidence_spans: citedSpanRefs(bundle.gapCandidate?.evidence_spans),
            proposal_strategy: bundle.gapCandidate?.proposal_strategy ?? null,
            surface_terms: bundle.gapCandidate?.surface_terms ?? [],
            memory_support: bundle.gapCandidate?.memory_support ?? [],
            verifier_gates: bundle.gapCandidate?.verification.gates ?? null,
            verifier_rejected_reasons: bundle.gapCandidate?.verification.rejected_reasons ?? [],
        },
        claim_level: bundle.gapCandidate?.verification.claim_level ?? "insufficient_evidence",
        evidence_grade: bundle.grade,
        evidence_ticks: {
            calendar: bundle.events.length > 0,
            granola: bundle.meetings.length > 0,
            memory: bundle.memories.length > 0,
        },
        support_window_min: TRIGGER_SUPPORT_WINDOW_SEC / 60,
        long_horizon_context: "same_local_day",
        week_start: bundle.weekStart,
        week_end: bundle.weekEnd,
        week_label: bundle.weekLabel,
        supporting_calendar_events: bundle.events.map(supportCalendarProps),
        supporting_meeting_notes: bundle.meetings.map(supportMeetingProps),
        supporting_project_memories: bundle.memories.map(supportMemoryProps),
        topics: themes,
        linked_patterns: visiblePatternScores.map((entry) => entry.key),
        ...(hr !== undefined ? { hr } : {}),
        backend_state_ref: triplet.episode.state.graph_source_ref,
        biometric_pattern_source: "watch_data_only",
        biometric_state_hidden: {
            category: triplet.episode.state.category,
            yin_score: triplet.episode.state.yin_score,
            yang_score: triplet.episode.state.yang_score,
        },
        source_quality: triplet.episode.state.source_quality,
        sample_refs: triplet.episode.samples.map((sample) => sample.graph_source_ref),
        triplet_id: triplet.id,
        pattern_scores: patternScores,
        pattern_lenses: patternLenses(triplet),
        hidden_raw_refs: bundle.hiddenRawRefs,
        hidden_pattern_scores: scorePatterns(triplet).map((entry) => ({
            pattern: entry.key,
            score: entry.score,
            reasons: entry.reasons,
        })),
        // Biometric endorsement (design 2026-07-07): structured summary + prebuilt
        // per-pattern data lines. Emitted ONLY when the episode has samples — an
        // episode with no samples keeps today's props exactly.
        ...(endorsement ?? {}),
    };
}
function evidenceGrade(triplet) {
    return triggerBundleFor(triplet).grade;
}
function rootScaleLabel(triplet) {
    const grade = evidenceGrade(triplet);
    if (grade === "strong")
        return "Primary";
    if (grade === "candidate")
        return "Candidate";
    if (grade === "weak")
        return "Weak";
    return "Source-only";
}
function patternLenses(triplet) {
    const context = contextTitle(triplet);
    return Object.fromEntries(scorePatterns(triplet).map((score) => {
        const pattern = patternDefinition(score.key).title;
        return [score.key, {
                pattern,
                score: score.score,
                why: `${pattern} is linked here because watch data matched this pattern around ${context}; source context only names the possible work thread.`,
                biometric_reason: score.reasons[0] ?? "watch data matched this pattern",
            }];
    }));
}
function daypart(ts) {
    const hourText = new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TIME,
        hour: "numeric",
        hour12: false,
    }).format(new Date(ts * 1000));
    const hour = Number(hourText);
    if (hour < 12)
        return "morning";
    if (hour < 17)
        return "afternoon";
    return "evening";
}
function episodeTitle(triplet) {
    const date = new Intl.DateTimeFormat("en-US", {
        timeZone: LA_TIME,
        month: "short",
        day: "numeric",
    }).format(new Date(triplet.episode.occurred_at_ts * 1000));
    return `${date} ${daypart(triplet.episode.occurred_at_ts)} state episode`;
}
function watchingBrief(reason) {
    return {
        cause: "Watching: not enough meeting-note detail to name a work thread yet.",
        evidence: [
            reason,
            "Calendar and meeting titles stay as context only.",
            "Watch data decides the pattern.",
        ],
        context: "Sentinel is waiting for enough meeting-note detail before naming a cause.",
        artifact_spec: "No task package is available yet; keep collecting clearer meeting-note evidence.",
        suggested_block: {
            title: "No action yet - keep watching for clearer notes",
            start_offset_min: 0,
            duration_min: 0,
        },
    };
}
/** Cap on Layer 2 threads carried on the armed root node. The reader already
 *  orders by strength DESC, so "first 5" is also "strongest 5". */
const MEMORY_CONTEXT_THREAD_CAP = 5;
/**
 * Layer 2 causal-memory attachment for the armed root node.
 *
 * BOUNDARY: context only — this props fragment MUST NOT influence scoring,
 * claims, gate outcomes, or arming without separate design + sign-off from
 * the reasoner owner. It is written into props_json for downstream readers
 * (Detonator/Sentinel) and never read back by any reasoner code path.
 *
 * Returns {} when no context was read (SQLite runs, read failure, or zero
 * active threads) so the root props carry NO memory_context key at all.
 * Only stable per-thread fields are copied, keeping root props deterministic
 * across identical runs.
 */
function memoryContextProps(memoryContext) {
    if (!memoryContext || memoryContext.threads.length === 0)
        return {};
    return {
        memory_context: {
            threads: memoryContext.threads.slice(0, MEMORY_CONTEXT_THREAD_CAP).map((thread) => ({
                id: thread.id,
                thread_key: thread.thread_key,
                claim_level: thread.claim_level,
                influence: thread.influence,
                strength: thread.strength,
                last_seen_ts: thread.last_seen_ts,
                // V7 (G5): settled-verdict rollup from the reader — DB-derived and
                // stable across identical runs, so root props stay deterministic.
                verification: {
                    confirmations: thread.verification.confirmations,
                    contradictions: thread.verification.contradictions,
                    last_verdict_at_ts: thread.verification.last_verdict_at_ts,
                },
            })),
            snapshot_id: memoryContext.snapshotId,
            snapshot_fresh: memoryContext.snapshotFresh,
        },
    };
}
class Reasoner {
    async buildWatchingDelta(input, reason = "No meeting-note detail is strong enough to name an open work thread yet") {
        const userId = (0, require_user_id_js_1.requireUserId)(input.user_id, "Reasoner.buildWatchingDelta");
        const nodes = new Map();
        const edges = new Map();
        const activePatterns = new Set(input.triplets.flatMap((triplet) => (scorePatterns(triplet).map((entry) => entry.key))));
        const generatedAt = input.generated_at_ts ?? Math.floor(Date.now() / 1000);
        const rootId = rootCauseId(userId);
        const brief = watchingBrief(reason);
        addPatternNodes(nodes, userId, activePatterns);
        addNode(nodes, {
            id: rootId,
            user_id: userId,
            kind: "ghost",
            title: "WATCHING",
            subtitle: "insufficient evidence",
            occurred_at_ts: generatedAt,
            source: "reasoner",
            source_ref: persistentRootSourceRef(userId, "watching"),
            props_json: {
                status: "watching",
                root_cause_class: "productivity",
                causality_level: "insufficient_evidence",
                root_scale: "Watching",
                root_rank: 1,
                evidence_grade: "insufficient_evidence",
                display_kind: "watching_state",
                source_context_role: "context_only_until_note_detail_is_clear",
                biometric_pattern_source: "watch_data_only",
                graph_grammar: "weekly_stress_moment_nodes_with_supporting_context",
                citation_gate: {
                    has_cited_transcript_span: false,
                    thread_key: null,
                    gap_summary: null,
                    evidence_spans: [],
                },
                evidence_gap: reason,
                summary: "Sentinel found watch and work context, but not enough meeting-note detail to name a cause.",
                key_points: [
                    "Meeting titles stay as context, not causes.",
                    "A root appears only when the note names an open work thread.",
                    "Sentinel keeps watching instead of inventing a cause.",
                ],
                evidence_ticks: {
                    calendar: false,
                    granola: false,
                    memory: false,
                },
                triplet_count: input.triplets.length,
                linked_patterns: [...activePatterns],
                brief,
            },
        });
        for (const triplet of watchingSourceTriplets(input.triplets)) {
            for (const sourceNode of contextNodesFor(userId, triplet)) {
                addNode(nodes, {
                    ...sourceNode,
                    user_id: userId,
                    props_json: {
                        ...sourceNode.props_json,
                        source_context_role: "watching_context_only",
                        causality_level: "insufficient_evidence",
                    },
                });
                addEdge(edges, {
                    id: edgeId(userId, sourceNode.id, rootId, "relates_to"),
                    user_id: userId,
                    src_id: sourceNode.id,
                    dst_id: rootId,
                    kind: "relates_to",
                    label: "watching evidence",
                    weight: 0.28,
                    props_json: {
                        causality_level: "insufficient_evidence",
                        evidence_role: "source_context_not_root_cause",
                        pattern_source: "none",
                    },
                });
            }
            // Watching-with-support: project memories that survive the bundle's
            // memorySupportsContext filter still surface as memory_hit citations
            // on the watching root. No supportMemories -> nothing emitted. The
            // overlay stamps the watching invariant (context-only, insufficient
            // evidence) and caps edge weight at the watching-context 0.28.
            const bundle = triggerBundleFor(triplet);
            addMemoryHitNodes(nodes, edges, userId, bundle.memories, bundle.weekStart, rootId, {
                node_props: {
                    source_context_role: "watching_context_only",
                    causality_level: "insufficient_evidence",
                },
                edge_weight_cap: 0.28,
            });
        }
        return {
            user_id: userId,
            nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
            edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
            root_armed: false,
            armed_root_cause: {
                node_id: rootId,
                confidence: 0,
                root_cause_class: "productivity",
                brief,
            },
            assumptions: [
                { key: "reasoner", value: "deterministic_mvp" },
                { key: "external_llm", value: false },
                { key: "causality_level", value: "insufficient_evidence" },
                { key: "root_state", value: "WATCHING" },
                { key: "graph_grammar", value: "weekly_stress_moment_nodes_with_supporting_context" },
                { key: "pattern_source", value: "watch_data_only_calendar_granola_memory_never_assign_patterns" },
                { key: "source_refs", value: input.triplets.flatMap((triplet) => triplet.source_refs).slice(0, 80) },
            ],
        };
    }
    async buildDelta(input) {
        if (input.triplets.length === 0) {
            throw new NotEnoughSignalError();
        }
        v2Active = input.v2 ?? null;
        try {
            return await this.buildDeltaInner(input);
        }
        finally {
            v2Active = null;
        }
    }
    async buildDeltaInner(input) {
        const userId = (0, require_user_id_js_1.requireUserId)(input.user_id, "Reasoner.buildDelta");
        const nodes = new Map();
        const edges = new Map();
        const rootTriplet = chooseRootTriplet(input.triplets);
        const graphTriplets = chooseGraphTriplets(input.triplets, rootTriplet);
        const patternScoresByTriplet = cappedPatternScores(graphTriplets, rootTriplet);
        const activePatterns = new Set(graphTriplets.flatMap((triplet) => ((patternScoresByTriplet.get(triplet.id) ?? []).map((entry) => entry.key))));
        const brief = buildBrief(rootTriplet);
        const rootBundle = triggerBundleFor(rootTriplet);
        const rootId = rootCauseId(userId);
        const rootThemes = deriveThemes(rootTriplet);
        const rootCarryForward = rootCarryForwardProps(rootTriplet, graphTriplets, brief);
        const triggerCounts = triggerCountsByWeek(graphTriplets);
        addPatternNodes(nodes, userId, activePatterns);
        addNode(nodes, {
            id: rootId,
            user_id: userId,
            kind: "ghost",
            title: attributionTitle(rootTriplet),
            subtitle: "attribution candidate",
            occurred_at_ts: rootTriplet.episode.occurred_at_ts,
            source: "reasoner",
            source_ref: persistentRootSourceRef(userId),
            props_json: {
                status: "suggested",
                root_cause_class: "productivity",
                causality_level: "source_backed_hypothesis_not_settled_causality",
                claim_level: rootBundle.gapCandidate?.verification.claim_level ?? "source_backed_hypothesis_not_settled_causality",
                root_scale: "Primary",
                root_rank: 1,
                evidence_grade: rootBundle.grade,
                ...rootCarryForward,
                week_start: rootBundle.weekStart,
                week_end: rootBundle.weekEnd,
                week_label: rootBundle.weekLabel,
                biometric_pattern_source: "watch_data_only",
                source_context_role: "work_thread_naming_and_clustering_only",
                citation_gate: {
                    has_cited_transcript_span: Boolean(rootBundle.gapCandidate?.evidence_spans.length),
                    thread_key: rootBundle.gapCandidate?.thread_key ?? null,
                    gap_summary: rootBundle.gapCandidate?.summary ?? null,
                    evidence_spans: citedSpanRefs(rootBundle.gapCandidate?.evidence_spans),
                    proposal_strategy: rootBundle.gapCandidate?.proposal_strategy ?? null,
                    surface_terms: rootBundle.gapCandidate?.surface_terms ?? [],
                    memory_support: rootBundle.gapCandidate?.memory_support ?? [],
                    verifier_gates: rootBundle.gapCandidate?.verification.gates ?? null,
                    verifier_rejected_reasons: rootBundle.gapCandidate?.verification.rejected_reasons ?? [],
                },
                pattern_lenses: patternLenses(rootTriplet),
                linked_patterns: scorePatterns(rootTriplet).map((entry) => entry.key),
                biometric_episode_count: 1,
                selected_triplet_id: rootTriplet.id,
                selected_pattern: primaryPattern(rootTriplet),
                pattern_scores: scorePatterns(rootTriplet),
                graph_grammar: "weekly_stress_moment_nodes_with_supporting_context",
                supporting_calendar_events: rootBundle.events.map(supportCalendarProps),
                supporting_meeting_notes: rootBundle.meetings.map(supportMeetingProps),
                supporting_project_memories: rootBundle.memories.map(supportMemoryProps),
                hidden_raw_refs: rootBundle.hiddenRawRefs,
                brief,
                ...v2RootProps(rootTriplet),
                // Layer 2 causal memory: context only — MUST NOT influence
                // scoring/claims/arming without reasoner-owner sign-off.
                ...memoryContextProps(input.memoryContext),
            },
        });
        // Root-bundle project memories become first-class memory_hit citation
        // nodes next to the other context nodes (same delta, same upsert
        // replace/retention semantics as meeting nodes).
        addMemoryHitNodes(nodes, edges, userId, rootBundle.memories, rootBundle.weekStart, rootId);
        const b2bThemes = new Set();
        for (const triplet of graphTriplets) {
            const patternScores = patternScoresByTriplet.get(triplet.id) ?? [];
            if (!patternScores.length)
                continue;
            const bundle = triggerBundleFor(triplet);
            const primaryPatternKey = patternScores[0]?.key ?? "stagnation";
            const primary = patternDefinition(primaryPatternKey);
            const episodeId = nodeId(userId, "episode", triplet.episode.state.graph_source_ref);
            const episodeWhen = compactDateTime(triplet.episode.occurred_at_ts);
            const themes = deriveThemes(triplet);
            addNode(nodes, {
                id: episodeId,
                user_id: userId,
                kind: "episode",
                title: bundle.contextTitle,
                subtitle: `${bundle.weekLabel} · ${patternScores.length} pattern${patternScores.length === 1 ? "" : "s"}${episodeWhen ? ` · ${episodeWhen}` : ""}`,
                element: primary.element,
                occurred_at_ts: triplet.episode.occurred_at_ts,
                source: "backend",
                source_ref: triplet.episode.state.graph_source_ref,
                props_json: buildEpisodeProps(triplet, patternScores, bundle, themes, input.baselines),
            });
            for (const sourceNode of contextNodesFor(userId, triplet, bundle.meetings, bundle.events)) {
                addNode(nodes, {
                    ...sourceNode,
                    user_id: userId,
                    props_json: {
                        ...sourceNode.props_json,
                        source_context_role: "supporting_evidence_only",
                        causality_level: "source_backed_hypothesis_not_settled_causality",
                        pattern_source: "none",
                    },
                });
                addEdge(edges, {
                    id: edgeId(userId, sourceNode.id, episodeId, "relates_to"),
                    user_id: userId,
                    src_id: sourceNode.id,
                    dst_id: episodeId,
                    kind: "relates_to",
                    label: "source evidence",
                    weight: triplet.id === rootTriplet.id ? 0.48 : 0.34,
                    props_json: {
                        causality_level: "source_context_not_pattern_assignment",
                        evidence_role: "source_context_supports_hypothesis_name",
                        pattern_source: "none",
                        week_start: bundle.weekStart,
                    },
                });
            }
            for (const patternScore of patternScores) {
                const patternId = patternNodeId(userId, patternScore.key);
                const edgeWeight = Math.min(1, Math.max(0.35, patternScore.score / Math.max(patternScores[0]?.score ?? 1, 1)));
                addEdge(edges, {
                    id: edgeId(userId, episodeId, patternId, "manifested"),
                    user_id: userId,
                    src_id: episodeId,
                    dst_id: patternId,
                    kind: "manifested",
                    label: patternScore.reasons.slice(0, 2).join(" · ") || "pattern candidate",
                    weight: triplet.id === rootTriplet.id ? edgeWeight : Number((edgeWeight * 0.82).toFixed(2)),
                    props_json: {
                        causality_level: "pattern_candidate",
                        score: patternScore.score,
                        reasons: patternScore.reasons,
                    },
                });
            }
            for (const theme of themes) {
                if (theme === "#b2b-track")
                    b2bThemes.add(theme);
            }
            addEdge(edges, {
                id: edgeId(userId, episodeId, rootId, "suggests"),
                user_id: userId,
                src_id: episodeId,
                dst_id: rootId,
                kind: "suggests",
                label: rootScaleLabel(triplet).toLowerCase(),
                weight: triplet.id === rootTriplet.id ? 0.9 : (bundle.grade === "strong" ? 0.68 : 0.48),
                props_json: {
                    causality_level: "source_backed_hypothesis_not_settled_causality",
                    claim_level: bundle.gapCandidate?.verification.claim_level ?? "source_backed_hypothesis_not_settled_causality",
                    evidence_grade: bundle.grade,
                    week_start: bundle.weekStart,
                },
            });
            addEdge(edges, {
                id: edgeId(userId, episodeId, rootId, "evidence_for"),
                user_id: userId,
                src_id: episodeId,
                dst_id: rootId,
                kind: "evidence_for",
                label: "carry-forward evidence",
                weight: triplet.id === rootTriplet.id ? 0.86 : (bundle.grade === "strong" ? 0.62 : 0.42),
                props_json: {
                    label: "carry_forward",
                    week_start: bundle.weekStart,
                    week_label: bundle.weekLabel,
                    evidence_grade: bundle.grade,
                    claim_level: bundle.gapCandidate?.verification.claim_level ?? "source_backed_hypothesis_not_settled_causality",
                    trigger_count: triggerCounts.get(bundle.weekStart) ?? 1,
                    selected_triplet_id: triplet.id,
                },
            });
        }
        if (b2bThemes.size > 0 || rootThemes.includes("#b2b-track")) {
            const secondaryGhostId = b2bGhostId(userId);
            addNode(nodes, {
                id: secondaryGhostId,
                user_id: userId,
                kind: "ghost",
                title: "B2B/B2C positioning evidence gap",
                subtitle: "needs more evidence",
                source: "reasoner",
                source_ref: "reasoner:ghost-b2b-track",
                props_json: {
                    status: "suggested",
                    causality_level: "needs_more_evidence",
                    root_scale: "Candidate",
                    root_rank: 2,
                    evidence_grade: "weak",
                    source_context_role: "context_gap_not_pattern_assignment",
                },
            });
            for (const triplet of graphTriplets.filter((candidate) => deriveThemes(candidate).some((theme) => theme === "#b2b-track" || theme === "#investor-facing"))) {
                const episodeId = nodeId(userId, "episode", triplet.episode.state.graph_source_ref);
                if (!nodes.has(episodeId))
                    continue;
                addEdge(edges, {
                    id: edgeId(userId, episodeId, secondaryGhostId, "suggests"),
                    user_id: userId,
                    src_id: episodeId,
                    dst_id: secondaryGhostId,
                    kind: "suggests",
                    label: "needs evidence",
                    weight: 0.45,
                });
            }
        }
        return {
            user_id: userId,
            nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
            edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
            armed_root_cause: {
                node_id: rootId,
                confidence: confidenceFor(rootTriplet),
                root_cause_class: "productivity",
                brief,
            },
            assumptions: [
                { key: "reasoner", value: "deterministic_mvp" },
                { key: "external_llm", value: false },
                { key: "causality_level", value: "source_backed_hypothesis_not_settled_causality" },
                { key: "graph_grammar", value: "weekly_stress_moment_nodes_with_supporting_context" },
                { key: "pattern_source", value: "watch_data_only_calendar_granola_memory_never_assign_patterns" },
                { key: "selection", value: `root_always_included_max_${MAX_VISIBLE_TRIGGERS_PER_WEEK}_stress_moments_per_week_max_${MAX_EPISODES_PER_PATTERN}_per_pattern_per_week` },
                { key: "source_strength", value: "strong_calendar_plus_usable_granola_candidate_calendar_or_granola_plus_project_memory_calendar_only_and_memory_only_hidden" },
                { key: "scoring", value: scoreTripletBreakdown(rootTriplet) },
                { key: "source_refs", value: rootTriplet.source_refs },
            ],
        };
    }
}
exports.Reasoner = Reasoner;
