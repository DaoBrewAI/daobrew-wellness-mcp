/** Pure assembly of one Plaud MCP file + transcript + note into the raw-note
 *  shape normalizeGranolaNotes accepts (the normalizer is source-passthrough,
 *  so no new normalizer is needed). The MCP tool RESULT SHAPES must be
 *  verified live (`node scripts/plaud-mcp-client.mjs --list-tools`) before
 *  first import — adjust the field fallbacks here if they differ. */
export function buildPlaudNote(
  file: { id: string; title?: string | null; created_at?: string | null },
  transcript: Array<{ speaker?: string | null; text: string }>,
  noteText: string | null,
): any {
  return {
    id: `plaud_${file.id}`,
    source: "plaud",
    source_ref: String(file.id),
    title: file.title ?? null,
    created_at: file.created_at ?? null,
    summary: noteText && noteText.trim() ? noteText : null,
    transcript: transcript.filter((s) => s?.text?.trim()),
    topics: [],
  };
}
