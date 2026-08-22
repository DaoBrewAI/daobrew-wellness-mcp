"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.citedTranscriptSpans = citedTranscriptSpans;
exports.meetingHasCitedTranscriptSpan = meetingHasCitedTranscriptSpan;
exports.proposeLatentHypotheses = proposeLatentHypotheses;
exports.verifyLatentHypothesis = verifyLatentHypothesis;
exports.detectLatentHypothesis = detectLatentHypothesis;
const LA_TIME = "America/Los_Angeles";
const SEED_THREAD_VOCABULARY = [
    {
        key: "converge-the-story",
        cause: "Unresolved B2B/B2C / one wedge positioning decision remains the open thread",
        summary: "Transcript spans repeatedly circle surface value-proposition and wedge questions; Project Memory supports that the deeper unresolved thread is the B2B/B2C positioning decision.",
        spanTerms: [
            "b2b",
            "b2c",
            "consumer",
            "enterprise",
            "partner",
            "wedge",
            "positioning",
            "value proposition",
            "value prop",
            "primary value",
            "pick one",
            "choose",
            "story",
            "brand",
            "focus",
        ],
        memoryTerms: [
            "b2b",
            "b2c",
            "consumer",
            "enterprise",
            "partner",
            "wedge",
            "positioning",
            "one wedge",
            "story",
            "brand",
        ],
        requiredAnyTerms: [
            "b2b",
            "b2c",
            "consumer",
            "enterprise",
            "partner",
        ],
        seedPattern: /\b(value prop|value proposition|primary value|pick one|one wedge|wedge|b2b|b2c|positioning|brand|story|strategy|customer acquisition|which one|focus)\b|定位|选择|決定|决定|没有完全\s*decide/i,
    },
    {
        key: "delivery-readiness",
        cause: "Closing the evidence-backed delivery loop remains the unresolved gap",
        summary: "Transcript spans and Project Memory support an unresolved delivery-verification thread; seed vocabulary still requires citation plus memory verification.",
        spanTerms: [
            "delivery",
            "release",
            "launch",
            "proof",
            "verify",
            "handoff",
            "artifact",
            "closed end to end",
            "end to end",
            "one wedge",
            "pick one",
        ],
        memoryTerms: [
            "delivery",
            "release",
            "launch",
            "proof",
            "verify",
            "handoff",
            "one wedge",
        ],
        seedPattern: /\b(delivery|release|launch|proof|handoff|artifact|verify|closed end to end|end to end|one wedge|pick one)\b|交付|证明|闭环/i,
    },
    {
        key: "causal-model-definition",
        cause: "Defining the stress-to-productivity causal model and trigger mechanism remains the open thread",
        summary: "Transcript spans keep circling trigger rationale, metrics, and causal-model definition work; Project Memory supports that the deeper unresolved thread is pinning down the causal model end to end.",
        spanTerms: [
            "causal",
            "trigger",
            "reasoner",
            "metrics",
            "correlation",
            "stress",
            "productivity",
            "biometric",
            "biometrics",
            "taxonomy",
            "configuration",
            "delivery mechanism",
            "intervention",
            "scoping",
        ],
        memoryTerms: [
            "causal",
            "reasoner",
            "trigger",
            "metrics",
            "biometric",
            "biometrics",
            "stress",
            "productivity",
            "intervention",
            "engine",
            "graph",
        ],
        requiredAnyTerms: [
            "causal",
            "trigger",
            "reasoner",
            "metrics",
            "biometric",
            "biometrics",
        ],
        seedPattern: /\b(causal (?:model|chain|graph|brain)|trigger rationale|delivery mechanism|stress[- ]to[- ]productivity|correlation criteria|activity type taxonomy|configuration defaults)\b/i,
    },
];
const OPEN_LOOP_PATTERN = /(?:\b(need to|needs to|still need|haven't|not sure|unclear|open question|question is|blocked|pending|decide|decision|choose|choosing|pick|push|pushed|commit|close|resolve|unresolved|follow[- ]?through|trade[- ]?off|what is your|which one|which wedge|to be defined|to be confirmed|to be scoped|still to be|needs further|needs clearer|open questions|still in discussion|not captured|define|clarify|scope|scoping)\b|\?|还没|没有|不确定|纠结|决定|选择|推进|闭环|仍在讨论)/i;
const NON_CLINICAL_BAN = /\b(caused|diagnose|diagnosis|disorder|symptom|symptoms|treat|treatment|disease|cure|burnout)\b/i;
const GENERIC_TITLE_BAN = [
    "event",
    "weekly sync - daobrew",
    "team meeting",
];
function normalizeText(value) {
    return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
function displayText(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
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
function spanTextIsCited(meeting, span) {
    const spanText = normalizeText(span.text);
    if (spanText.length < 16)
        return false;
    const body = normalizeText(meeting.body);
    return Boolean(body && body.includes(spanText));
}
function citedTranscriptSpans(meeting) {
    return (meeting.transcript_spans ?? [])
        .filter((span) => spanTextIsCited(meeting, span))
        .map((span) => ({
        meeting_id: meeting.id,
        meeting_title: meeting.title,
        source_ref: meeting.graph_source_ref,
        speaker: span.speaker ?? null,
        ts_offset_sec: span.ts_offset_sec ?? null,
        text: displayText(span.text),
    }));
}
function meetingHasCitedTranscriptSpan(meeting) {
    return citedTranscriptSpans(meeting).length > 0;
}
function textMatchesTerms(text, terms) {
    const normalized = normalizeText(text);
    return terms.reduce((count, term) => (normalized.includes(term.toLowerCase()) ? count + 1 : count), 0);
}
function frameHasRequiredTerm(frame, span, memories) {
    if (!frame.requiredAnyTerms?.length)
        return true;
    const haystack = [
        span.text,
        ...memories.flatMap((memory) => [memory.insight_text, ...memory.topics]),
    ].join(" ");
    return textMatchesTerms(haystack, frame.requiredAnyTerms) > 0;
}
function spanMatchesFrame(span, frame, memories) {
    if (!OPEN_LOOP_PATTERN.test(span.text))
        return false;
    if (!frameHasRequiredTerm(frame, span, memories))
        return false;
    const seedMatch = frame.seedPattern.test(span.text);
    const termMatches = textMatchesTerms(span.text, frame.spanTerms);
    return seedMatch || termMatches >= 2;
}
function memorySupportForFrame(memories, frame) {
    return memories
        .map((memory) => {
        const text = [memory.insight_text, ...memory.topics].join(" ");
        const matches = textMatchesTerms(text, frame.memoryTerms);
        if (matches < 2)
            return null;
        return {
            memory_id: memory.id,
            source_ref: memory.graph_source_ref,
            reason: "project_memory_semantic_support",
            text: displayText(memory.insight_text).slice(0, 240),
            topics: memory.topics,
        };
    })
        .filter((entry) => entry !== null)
        .slice(0, 3);
}
function weekBucketForSpan(span, meetings) {
    const meeting = meetings.find((entry) => entry.graph_source_ref === span.source_ref);
    const ts = meeting?.occurred_at_ts ?? 0;
    if (!Number.isFinite(ts) || ts <= 0)
        return span.source_ref;
    const week = Math.floor(ts / (7 * 24 * 60 * 60));
    return String(week);
}
function surfaceTermsFor(spans, frame) {
    const out = [];
    for (const term of frame.spanTerms) {
        if (spans.some((span) => normalizeText(span.text).includes(term.toLowerCase()))) {
            out.push(term);
        }
    }
    return out.slice(0, 8);
}
function proposeLatentHypotheses(context) {
    const citedSpans = context.meetings.flatMap(citedTranscriptSpans);
    const proposals = [];
    for (const frame of SEED_THREAD_VOCABULARY) {
        const evidenceSpans = citedSpans
            .filter((span) => spanMatchesFrame(span, frame, context.memories))
            .sort((a, b) => (textMatchesTerms(b.text, frame.spanTerms) - textMatchesTerms(a.text, frame.spanTerms) ||
            a.source_ref.localeCompare(b.source_ref)))
            .slice(0, 6);
        if (evidenceSpans.length === 0)
            continue;
        const memorySupport = memorySupportForFrame(context.memories, frame);
        const recurrenceWeeks = new Set(evidenceSpans.map((span) => weekBucketForSpan(span, context.meetings))).size;
        const unresolvedness = Math.min(1, Number((evidenceSpans.length / Math.max(1, context.meetings.length)).toFixed(2)));
        proposals.push({
            thread_key: frame.key,
            cause: frame.cause,
            summary: frame.summary,
            evidence_spans: evidenceSpans.slice(0, 4),
            memory_support: memorySupport,
            recurrence_weeks: recurrenceWeeks,
            unresolvedness,
            proposed_by: "deterministic_semantic_proposer",
            proposal_strategy: "semantic_frame_from_transcript_spans_plus_project_memory_seed_vocabulary",
            surface_terms: surfaceTermsFor(evidenceSpans, frame),
        });
    }
    return proposals.sort((a, b) => (b.memory_support.length - a.memory_support.length ||
        b.evidence_spans.length - a.evidence_spans.length ||
        b.recurrence_weeks - a.recurrence_weeks ||
        a.thread_key.localeCompare(b.thread_key)));
}
function proposalHasCitedSpans(proposal, meetings) {
    if (proposal.evidence_spans.length === 0)
        return false;
    const citedByRef = new Map();
    for (const meeting of meetings) {
        citedByRef.set(meeting.graph_source_ref, new Set(citedTranscriptSpans(meeting).map((span) => normalizeText(span.text))));
    }
    return proposal.evidence_spans.every((span) => (citedByRef.get(span.source_ref)?.has(normalizeText(span.text)) ?? false));
}
function titleBanPass(proposal, context) {
    const cause = normalizeText(proposal.cause);
    const bannedTitles = [
        ...GENERIC_TITLE_BAN,
        ...(context.event_titles ?? []),
        ...context.meetings.map((meeting) => meeting.title),
    ]
        .map(normalizeText)
        .filter(Boolean);
    return !bannedTitles.some((title) => (cause === title
        || (GENERIC_TITLE_BAN.includes(title) && cause.includes(title))));
}
// User decision 2026-07-05: same-day discipline applies to the CITED evidence, not the
// proposal's existence. Spans on the anchor's local day stay citable; other-day spans are
// demoted to recurrence context (recurrence_weeks stays computed from the full span set).
function partitionSpansByAnchorDay(spans, context) {
    if (!Number.isFinite(context.anchor_ts ?? NaN)) {
        return { sameDay: spans, otherDay: [] };
    }
    const anchorTs = context.anchor_ts;
    const byRef = new Map(context.meetings.map((meeting) => [meeting.graph_source_ref, meeting]));
    const sameDay = [];
    const otherDay = [];
    for (const span of spans) {
        const meeting = byRef.get(span.source_ref);
        if (meeting && Number.isFinite(meeting.occurred_at_ts ?? NaN) && sameLocalDay(meeting.occurred_at_ts, anchorTs)) {
            sameDay.push(span);
        }
        else {
            otherDay.push(span);
        }
    }
    return { sameDay, otherDay };
}
function timePlausibilityPass(proposal, context) {
    if (!Number.isFinite(context.anchor_ts ?? NaN))
        return true;
    // Filter, don't veto: the gate passes when at least one span anchors the same local
    // day; multi-day history is legitimate recurrence context, not a disqualifier.
    return partitionSpansByAnchorDay(proposal.evidence_spans, context).sameDay.length >= 1;
}
function verifyLatentHypothesis(proposal, context) {
    const gates = {
        citation: proposalHasCitedSpans(proposal, context.meetings) ? "pass" : "fail",
        title_ban: titleBanPass(proposal, context) ? "pass" : "fail",
        time_plausibility: timePlausibilityPass(proposal, context) ? "pass" : "fail",
        biometrics_firewall: context.biometric_patterns.length > 0 ? "pass" : "fail",
        recurrence_cross_source: proposal.memory_support.length > 0 ? "pass" : "fail",
        non_clinical_language: NON_CLINICAL_BAN.test(`${proposal.cause} ${proposal.summary}`) ? "fail" : "pass",
    };
    const rejectedReasons = [];
    if (gates.citation === "fail")
        rejectedReasons.push("citation check failed: the meeting note needs a specific imported passage for this claim");
    if (gates.title_ban === "fail")
        rejectedReasons.push("title check failed: event or meeting titles can be context only, not final cause text");
    if (gates.time_plausibility === "fail")
        rejectedReasons.push("timing check failed: the source note is not close enough to the watch pattern");
    if (gates.biometrics_firewall === "fail")
        rejectedReasons.push("watch-pattern check failed: the pattern must come from watch data");
    if (gates.recurrence_cross_source === "fail")
        rejectedReasons.push("support check failed: project context is required before accepting this work thread");
    if (gates.non_clinical_language === "fail")
        rejectedReasons.push("language check failed: the proposal overstates causality or uses clinical language");
    const accepted = rejectedReasons.length === 0;
    return {
        accepted,
        claim_level: accepted ? "source_backed_hypothesis_not_settled_causality" : "insufficient_evidence",
        gates,
        rejected_reasons: rejectedReasons,
    };
}
function detectLatentHypothesis(context) {
    for (const proposal of proposeLatentHypotheses(context)) {
        const verification = verifyLatentHypothesis(proposal, context);
        if (!verification.accepted)
            continue;
        if (!Number.isFinite(context.anchor_ts ?? NaN)) {
            return { ...proposal, verification };
        }
        // Cite only the anchor-day spans; other-day spans already contributed to
        // recurrence_weeks (kept from the full pre-filter span set) and stay uncited.
        const { sameDay } = partitionSpansByAnchorDay(proposal.evidence_spans, context);
        const frame = SEED_THREAD_VOCABULARY.find((entry) => entry.key === proposal.thread_key);
        return {
            ...proposal,
            evidence_spans: sameDay,
            surface_terms: frame ? surfaceTermsFor(sameDay, frame) : proposal.surface_terms,
            verification,
        };
    }
    return null;
}
