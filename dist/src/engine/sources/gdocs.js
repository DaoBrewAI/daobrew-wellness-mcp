"use strict";
/** Google Docs (self-managed connector) — pure helpers. The Drive/Docs HTTP
 *  calls live in scripts/gdocs-client.mjs; everything here is testable. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDocText = extractDocText;
exports.buildGdocsNotes = buildGdocsNotes;
function extractDocText(doc) {
    const parts = [];
    for (const el of doc?.body?.content ?? []) {
        const elements = el?.paragraph?.elements;
        if (!Array.isArray(elements))
            continue;
        const line = elements.map((e) => e?.textRun?.content ?? "").join("");
        const trimmed = line.replace(/\n$/, "");
        if (trimmed.trim())
            parts.push(trimmed);
    }
    return parts.join("\n");
}
function buildGdocsNotes(files, docTextById) {
    return files.filter((f) => f?.id).map((f) => ({
        id: `gdocs_${f.id}`,
        source: "gdocs",
        source_ref: String(f.id),
        title: f.name ?? null,
        created_at: f.modifiedTime ?? f.createdTime ?? null,
        summary: null,
        body: docTextById.get(f.id) ?? null,
        transcript: [],
        topics: [],
    }));
}
