"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGranolaNotes = fetchGranolaNotes;
exports.normalizeGranolaNotes = normalizeGranolaNotes;
const node_crypto_1 = require("node:crypto");
const local_config_js_1 = require("../local-config.js");
function hash(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex").slice(0, 16);
}
function toTsOrNull(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const n = typeof value === "number" ? value : Date.parse(String(value));
    if (!Number.isFinite(n))
        return null;
    return Math.trunc(n > 10_000_000_000 ? n / 1000 : n);
}
const MEETING_KINDS = ["meeting", "call", "interview", "one_on_one", "standup", "other"];
function toSpans(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw
        .map((entry, idx) => {
        if (typeof entry === "string")
            return { idx, speaker: null, ts_offset_sec: null, text: entry };
        const offset = Number(entry?.ts_offset_sec ?? entry?.timestamp ?? entry?.offset_sec);
        return {
            idx: Number.isFinite(Number(entry?.idx)) ? Number(entry.idx) : idx,
            speaker: entry?.speaker ?? entry?.source ?? null,
            ts_offset_sec: Number.isFinite(offset) ? offset : null,
            text: String(entry?.text ?? entry?.content ?? ""),
        };
    })
        .filter((span) => span.text.trim().length > 0);
}
/**
 * Dual-mode Granola reader, routed by token prefix. Returns raw note objects
 * for normalizeGranolaNotes.
 *
 *  - Personal keys ("grn_...") hit the public v1 API — GET /v1/notes on
 *    https://public-api.granola.ai (per-mode default base) — mapped exactly
 *    like the SentinelMac ingest daemon maps them.
 *  - Any other token hits the v2 workspace API — POST /v2/get-documents +
 *    /v1/get-document-transcript on https://api.granola.ai (per-mode default
 *    base).
 *
 * Token resolution: options.token, then GRANOLA_API_TOKEN env, then
 * granola_api_token in ~/.daobrew/config.json (via resolveGranolaToken).
 * Callers without a token can still push rawNotes straight into the ingest
 * job.
 *
 * Base URL: options.baseUrl, then GRANOLA_API_BASE env — which overrides
 * BOTH modes despite their different defaults (beware when debugging one
 * mode with it set) — then the per-mode default above. Default limit also
 * differs per mode (v1: 50, daemon parity; v2: 100, legacy).
 */
async function fetchGranolaNotes(options) {
    const token = options.token ?? (0, local_config_js_1.resolveGranolaToken)() ?? undefined;
    if (!token) {
        throw new Error("Granola reader requires GRANOLA_API_TOKEN, granola_api_token in ~/.daobrew/config.json, or rawNotes in the ingest payload");
    }
    if (token.startsWith("grn_")) {
        return fetchPersonalV1(token, options);
    }
    return fetchWorkspaceV2(token, options);
}
/** Personal-key path: public v1 notes list, mapped like the daemon's python mapper. */
async function fetchPersonalV1(token, options) {
    const baseUrl = (options.baseUrl ?? process.env.GRANOLA_API_BASE ?? "https://public-api.granola.ai").replace(/\/$/, "");
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${baseUrl}/v1/notes?limit=${options.limit ?? 50}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new Error(`Granola v1 notes fetch failed (${response.status})`);
    }
    const payload = await response.json();
    const rows = Array.isArray(payload?.notes) ? payload.notes : [];
    // TODO: transcript enrichment for personal keys — see GranolaConnector.swift
    // (GET /v1/notes/{id}?include=transcript). Deferred; list-only for now,
    // matching the SentinelMac ingest daemon.
    return rows
        .filter((note) => note?.id)
        .map((note) => ({
        id: String(note.id),
        source: "granola",
        source_ref: String(note.id),
        title: note.title,
        // ?? not || — deliberate micro-divergence from the daemon's python `or`;
        // an empty-string createdAt is handled by toTsOrNull downstream.
        created_at: note.createdAt ?? note.created_at,
        summary: note.summary ?? null,
    }));
}
/** Workspace-token path: unchanged v2 documents + transcripts behavior. */
async function fetchWorkspaceV2(token, options) {
    const baseUrl = (options.baseUrl ?? process.env.GRANOLA_API_BASE ?? "https://api.granola.ai").replace(/\/$/, "");
    const fetchImpl = options.fetchImpl ?? fetch;
    const headers = {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
    };
    const docsResponse = await fetchImpl(`${baseUrl}/v2/get-documents`, {
        method: "POST",
        headers,
        body: JSON.stringify({ limit: options.limit ?? 100 }),
    });
    if (!docsResponse.ok) {
        throw new Error(`Granola get-documents failed (${docsResponse.status})`);
    }
    const docsPayload = await docsResponse.json();
    const docs = Array.isArray(docsPayload?.docs)
        ? docsPayload.docs
        : Array.isArray(docsPayload)
            ? docsPayload
            : [];
    const notes = [];
    for (const doc of docs) {
        if (!doc?.id)
            continue;
        let transcript = [];
        try {
            const transcriptResponse = await fetchImpl(`${baseUrl}/v1/get-document-transcript`, {
                method: "POST",
                headers,
                body: JSON.stringify({ document_id: doc.id }),
            });
            if (transcriptResponse.ok) {
                const transcriptPayload = await transcriptResponse.json();
                const segments = Array.isArray(transcriptPayload)
                    ? transcriptPayload
                    : Array.isArray(transcriptPayload?.transcript)
                        ? transcriptPayload.transcript
                        : [];
                transcript = segments
                    .map((segment) => ({
                    speaker: segment?.speaker ??
                        (segment?.source === "microphone" ? "Me" : segment?.source === "system" ? "Them" : segment?.source ?? null),
                    text: String(segment?.text ?? ""),
                }))
                    .filter((segment) => segment.text.trim().length > 0);
            }
        }
        catch {
            // Transcript is optional; the note still lands with title/summary.
        }
        notes.push({
            id: String(doc.id),
            source: "granola",
            source_ref: String(doc.id),
            title: doc.title,
            created_at: doc.created_at ?? doc.createdAt,
            summary: doc.overview ?? doc.summary ?? doc.notes_markdown ?? null,
            transcript,
            topics: Array.isArray(doc.tags) ? doc.tags : [],
        });
    }
    return notes;
}
function normalizeGranolaNotes(rawNotes) {
    return rawNotes.map((note) => {
        const sourceRef = String(note.source_ref ?? note.id ?? hash(JSON.stringify(note)));
        const spans = toSpans(note.transcript_spans ?? note.transcript_spans_json ?? note.transcript);
        const body = typeof note.body === "string" && note.body.trim()
            ? note.body
            : spans.map((span) => span.text).join("\n") || null;
        const kind = MEETING_KINDS.includes(note.kind) ? note.kind : "meeting";
        return {
            id: String(note.id ?? `meeting_${hash(sourceRef)}`),
            source: String(note.source ?? "granola"),
            source_ref: sourceRef,
            event_id: note.event_id ?? null,
            kind,
            title: String(note.title ?? "(untitled meeting)"),
            occurred_at_ts: toTsOrNull(note.occurred_at_ts ?? note.occurred_at ?? note.created_at ?? note.createdAt),
            duration_sec: Number.isFinite(Number(note.duration_sec)) && note.duration_sec !== null && note.duration_sec !== undefined
                ? Number(note.duration_sec)
                : null,
            participants: Array.isArray(note.participants) ? note.participants : [],
            summary: typeof note.summary === "string" && note.summary.trim() ? note.summary : null,
            body,
            transcript_spans: spans,
            topics: Array.isArray(note.topics) ? note.topics.map((topic) => String(topic)) : [],
        };
    });
}
