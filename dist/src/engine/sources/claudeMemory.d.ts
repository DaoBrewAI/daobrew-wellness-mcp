import { InsightRow } from "../ingest/types.js";
/**
 * Claude Code stores each session under ~/.claude/projects/<dir>/ where <dir>
 * is the session's cwd with every non-alphanumeric character replaced by "-"
 * (for example, a nested project path becomes a dash-separated name; a worktree's
 * .claude segment becomes --claude-worktrees-…). Session files are attributed
 * to a project by matching that encoded directory EXACTLY as a path segment.
 * The previous substring match (path.includes(basename(projectPath))) let one
 * project claim another's files — a broad home path matched every nested
 * project directory — so overlapping configured projects
 * re-stamped the same user_insights row with their own #<project> topic on
 * every ingest cycle, defeating dedup and rewriting ~all rows every 10 min.
 */
export declare function claudeProjectDir(projectPath: string): string;
export declare function claudeFileInProject(file: string, projectPath: string): boolean;
export declare function parseCodexSessionText(file: string, projectPath: string, raw: string): InsightRow | null;
export declare function parseClaudeSessionText(file: string, projectPath: string, raw: string): InsightRow | null;
export interface DiscoverMemoryProjectsOptions {
    claudeProjectsRoot?: string;
    codexSessionsRoot?: string;
}
/**
 * Zero-config discovery: scan Claude Code and Codex session JSONL files for
 * the real project `cwd` values they record, so memory ingest can run
 * without a pasted projectPath. Pure filesystem read — bounded per file,
 * deduped, sorted; missing roots yield [].
 */
export declare function discoverMemoryProjects(options?: DiscoverMemoryProjectsOptions): string[];
export interface BuildMemoryRowsOptions {
    projectPath: string;
    codexFiles?: string[];
    claudeFiles?: string[];
}
export interface BuildDiscoveredMemoryRowsOptions extends DiscoverMemoryProjectsOptions {
    /** Test/benchmark seam. Production walks the configured roots once. */
    codexFiles?: string[];
    /** Test/benchmark seam. Production walks the configured roots once. */
    claudeFiles?: string[];
    /** Called exactly once immediately before one JSONL file is streamed. */
    onFileRead?: (file: string) => void;
}
export interface DiscoveredMemoryRows {
    rows: InsightRow[];
    projects: {
        path: string;
        rows: number;
    }[];
}
/**
 * Discovery-mode ingest in one corpus pass. The former project-major caller
 * reopened and reparsed every Codex JSONL once per discovered project. This
 * scans each file once, retains only the bounded row summary, then replays the
 * historical project-major output ordering without retaining transcript text.
 */
export declare function buildDiscoveredMemoryRows(options?: BuildDiscoveredMemoryRowsOptions): Promise<DiscoveredMemoryRows>;
export declare function buildMemoryRows(options: BuildMemoryRowsOptions): InsightRow[];
