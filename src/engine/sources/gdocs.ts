/** Google Docs (self-managed connector) — pure helpers. The Drive/Docs HTTP
 *  calls live in scripts/gdocs-client.mjs; everything here is testable. */

export function extractDocText(doc: any): string {
  const parts: string[] = [];
  for (const el of doc?.body?.content ?? []) {
    const elements = el?.paragraph?.elements;
    if (!Array.isArray(elements)) continue;
    const line = elements.map((e: any) => e?.textRun?.content ?? "").join("");
    const trimmed = line.replace(/\n$/, "");
    if (trimmed.trim()) parts.push(trimmed);
  }
  return parts.join("\n");
}

export function buildGdocsNotes(
  files: Array<{ id: string; name?: string; modifiedTime?: string; createdTime?: string }>,
  docTextById: Map<string, string>,
): any[] {
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
