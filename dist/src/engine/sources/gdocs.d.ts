/** Google Docs (self-managed connector) — pure helpers. The Drive/Docs HTTP
 *  calls live in scripts/gdocs-client.mjs; everything here is testable. */
export declare function extractDocText(doc: any): string;
export declare function buildGdocsNotes(files: Array<{
    id: string;
    name?: string;
    modifiedTime?: string;
    createdTime?: string;
}>, docTextById: Map<string, string>): any[];
