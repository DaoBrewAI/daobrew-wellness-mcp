"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeProjectDir = claudeProjectDir;
exports.claudeFileInProject = claudeFileInProject;
exports.parseCodexSessionText = parseCodexSessionText;
exports.parseClaudeSessionText = parseClaudeSessionText;
exports.discoverMemoryProjects = discoverMemoryProjects;
exports.buildDiscoveredMemoryRows = buildDiscoveredMemoryRows;
exports.buildMemoryRows = buildMemoryRows;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_readline_1 = require("node:readline");
/**
 * Pure parsing of local Codex/Claude project session JSONL into warm-tier
 * insight rows. Filesystem walking stays here; SQL never does — rows go
 * through PostgresIngestSink.
 */
function hash(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex").slice(0, 16);
}
function truncate(value, limit) {
    const compact = String(value ?? "").replace(/\s+/g, " ").trim();
    return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}
function redactSecrets(value) {
    return String(value ?? "")
        .replace(/sk-proj-[A-Za-z0-9_-]+/g, "sk-proj-[redacted]")
        .replace(/grn_[A-Za-z0-9_-]+/g, "grn_[redacted]")
        .replace(/dbk_[A-Za-z0-9_-]+/g, "dbk_[redacted]")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}
function contentText(content) {
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return "";
    return content
        .map((part) => part?.text ?? part?.input_text ?? part?.output_text ?? "")
        .filter(Boolean)
        .join("\n");
}
function extractDelegationInput(text) {
    const match = /<input>([\s\S]*?)<\/input>/.exec(text);
    return match?.[1] ?? text;
}
function isUsefulUserText(text) {
    const t = text.trim();
    if (!t)
        return false;
    if (t.startsWith("<environment_context>"))
        return false;
    if (t.startsWith("<permissions instructions>"))
        return false;
    return true;
}
function projectTopic(projectPath) {
    return `#${(0, node_path_1.basename)(projectPath) || "project"}`;
}
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
function claudeProjectDir(projectPath) {
    return projectPath.replace(/[^A-Za-z0-9]/g, "-");
}
function claudeFileInProject(file, projectPath) {
    return file.split(node_path_1.sep).includes(claudeProjectDir(projectPath));
}
/**
 * Shared cwd extraction for one parsed session-JSONL line. Claude session
 * lines carry a top-level `cwd`; Codex `turn_context` lines carry
 * `payload.cwd` plus optional `payload.workspace_roots` (the same shape
 * parseCodexSessionText matches against).
 */
function sessionLineCwds(item) {
    const values = [];
    if (typeof item?.cwd === "string" && item.cwd)
        values.push(item.cwd);
    if (typeof item?.payload?.cwd === "string" && item.payload.cwd)
        values.push(item.payload.cwd);
    const roots = item?.payload?.workspace_roots;
    if (Array.isArray(roots)) {
        for (const root of roots) {
            if (typeof root === "string" && root)
                values.push(root);
        }
    }
    return values;
}
function parseCodexSessionText(file, projectPath, raw) {
    const lines = raw.split(/\n/);
    let matchesProject = false;
    let firstTs = null;
    let sessionId = null;
    let firstUser = "";
    let lastAssistant = "";
    for (const line of lines) {
        if (!line.trim())
            continue;
        let item;
        try {
            item = JSON.parse(line);
        }
        catch {
            continue;
        }
        if (!firstTs && item.timestamp)
            firstTs = item.timestamp;
        if (item.type === "session_meta") {
            sessionId = item.payload?.id ?? sessionId;
        }
        if (item.type === "turn_context" && sessionLineCwds(item).includes(projectPath)) {
            matchesProject = true;
        }
        if (item.type !== "response_item" || item.payload?.type !== "message")
            continue;
        const role = item.payload.role;
        const text = redactSecrets(contentText(item.payload.content));
        if (role === "user" && isUsefulUserText(text) && !firstUser) {
            firstUser = extractDelegationInput(text);
        }
        else if (role === "assistant" && text.trim()) {
            lastAssistant = text;
        }
    }
    if (!matchesProject || (!firstUser && !lastAssistant))
        return null;
    const occurred = firstTs ? Math.floor(new Date(firstTs).getTime() / 1000) : null;
    const task = truncate(firstUser, 420);
    const outcome = truncate(lastAssistant, 520);
    return {
        id: `codex_session_${hash(file)}`,
        source: "codex_project_session",
        source_ref: file,
        insight_text: truncate(`Codex project session${sessionId ? ` ${sessionId}` : ""}: ${task}${outcome ? ` Outcome: ${outcome}` : ""}`, 1100),
        topics: ["#codex-session", projectTopic(projectPath)],
        importance: 0.82,
        strength: 1,
        occurred_at_ts: occurred,
        last_accessed_ts: null,
    };
}
function parseClaudeSessionText(file, projectPath, raw) {
    const projectName = (0, node_path_1.basename)(projectPath).toLowerCase();
    if (projectName && !raw.toLowerCase().includes(projectName) && !file.toLowerCase().includes(projectName)) {
        return null;
    }
    const lines = raw.split(/\n/);
    let firstTs = null;
    let firstUser = "";
    let lastAssistant = "";
    for (const line of lines) {
        if (!line.trim())
            continue;
        let item;
        try {
            item = JSON.parse(line);
        }
        catch {
            continue;
        }
        if (!firstTs && item.timestamp)
            firstTs = item.timestamp;
        const role = item.type === "user" || item.type === "assistant" ? item.type : item.message?.role;
        const text = redactSecrets(contentText(item.message?.content ?? item.content));
        if (role === "user" && isUsefulUserText(text) && !firstUser)
            firstUser = text;
        else if (role === "assistant" && text.trim())
            lastAssistant = text;
    }
    if (!firstUser && !lastAssistant)
        return null;
    const occurred = firstTs ? Math.floor(new Date(firstTs).getTime() / 1000) : null;
    return {
        id: `claude_session_${hash(file)}`,
        source: "claude_project_session",
        source_ref: file,
        insight_text: truncate(`Claude Code project session: ${truncate(firstUser, 420)}${lastAssistant ? ` Outcome: ${truncate(lastAssistant, 520)}` : ""}`, 1100),
        topics: ["#claude-session", projectTopic(projectPath)],
        importance: 0.78,
        strength: 1,
        occurred_at_ts: occurred,
        last_accessed_ts: null,
    };
}
function walk(dir, predicate, out = []) {
    if (!(0, node_fs_1.existsSync)(dir))
        return out;
    for (const entry of (0, node_fs_1.readdirSync)(dir, { withFileTypes: true })) {
        const path = (0, node_path_1.join)(dir, entry.name);
        if (entry.isDirectory())
            walk(path, predicate, out);
        else if (predicate(path))
            out.push(path);
    }
    return out;
}
/** Bounded per-file read caps for discovery (matches Sentinel's ConfigManager). */
const DISCOVERY_MAX_BYTES = 256 * 1024;
const DISCOVERY_MAX_LINES = 50;
// The final line may be truncated mid-JSON; callers' JSON.parse catch silently drops it — acceptable for discovery.
function readBoundedLines(file) {
    let raw;
    try {
        const fd = (0, node_fs_1.openSync)(file, "r");
        try {
            const buffer = Buffer.alloc(DISCOVERY_MAX_BYTES);
            const bytesRead = (0, node_fs_1.readSync)(fd, buffer, 0, DISCOVERY_MAX_BYTES, 0);
            raw = buffer.toString("utf-8", 0, bytesRead);
        }
        finally {
            (0, node_fs_1.closeSync)(fd);
        }
    }
    catch {
        return [];
    }
    return raw.split(/\n/).slice(0, DISCOVERY_MAX_LINES);
}
/**
 * Zero-config discovery: scan Claude Code and Codex session JSONL files for
 * the real project `cwd` values they record, so memory ingest can run
 * without a pasted projectPath. Pure filesystem read — bounded per file,
 * deduped, sorted; missing roots yield [].
 */
function discoverMemoryProjects(options) {
    const claudeProjectsRoot = options?.claudeProjectsRoot ?? (0, node_path_1.join)((0, node_os_1.homedir)(), ".claude", "projects");
    const codexSessionsRoot = options?.codexSessionsRoot ?? (0, node_path_1.join)((0, node_os_1.homedir)(), ".codex", "sessions");
    const files = [
        ...walk(claudeProjectsRoot, (path) => path.endsWith(".jsonl")),
        ...walk(codexSessionsRoot, (path) => path.endsWith(".jsonl")),
    ];
    const projects = new Set();
    for (const file of files) {
        for (const line of readBoundedLines(file)) {
            if (!line.trim())
                continue;
            let item;
            try {
                item = JSON.parse(line);
            }
            catch {
                continue;
            }
            for (const cwd of sessionLineCwds(item))
                projects.add(cwd);
        }
    }
    return [...projects].sort();
}
function codexRowFromSummary(summary, projectPath) {
    if (!summary.firstUser && !summary.lastAssistant)
        return null;
    const occurred = summary.firstTs
        ? Math.floor(new Date(summary.firstTs).getTime() / 1000)
        : null;
    const task = truncate(summary.firstUser, 420);
    const outcome = truncate(summary.lastAssistant, 520);
    return {
        id: `codex_session_${hash(summary.file)}`,
        source: "codex_project_session",
        source_ref: summary.file,
        insight_text: truncate(`Codex project session${summary.sessionId ? ` ${summary.sessionId}` : ""}: ${task}${outcome ? ` Outcome: ${outcome}` : ""}`, 1100),
        topics: ["#codex-session", projectTopic(projectPath)],
        importance: 0.82,
        strength: 1,
        occurred_at_ts: occurred,
        last_accessed_ts: null,
    };
}
function claudeRowFromSummary(summary, projectPath) {
    if (!summary.firstUser && !summary.lastAssistant)
        return null;
    const occurred = summary.firstTs
        ? Math.floor(new Date(summary.firstTs).getTime() / 1000)
        : null;
    return {
        id: `claude_session_${hash(summary.file)}`,
        source: "claude_project_session",
        source_ref: summary.file,
        insight_text: truncate(`Claude Code project session: ${truncate(summary.firstUser, 420)}${summary.lastAssistant ? ` Outcome: ${truncate(summary.lastAssistant, 520)}` : ""}`, 1100),
        topics: ["#claude-session", projectTopic(projectPath)],
        importance: 0.78,
        strength: 1,
        occurred_at_ts: occurred,
        last_accessed_ts: null,
    };
}
async function streamSessionSummary(file, kind, onFileRead) {
    onFileRead?.(file);
    const input = (0, node_fs_1.createReadStream)(file, { encoding: "utf8" });
    const lines = (0, node_readline_1.createInterface)({ input, crlfDelay: Infinity });
    const summary = {
        file,
        firstTs: null,
        sessionId: null,
        firstUser: "",
        lastAssistant: "",
        discoveredProjects: new Set(),
        matchedCodexProjects: new Set(),
    };
    let lineIndex = 0;
    try {
        for await (const line of lines) {
            if (!line.trim()) {
                lineIndex += 1;
                continue;
            }
            let item;
            try {
                item = JSON.parse(line);
            }
            catch {
                lineIndex += 1;
                continue;
            }
            // Keep discovery's historical bounded-first-50-lines contract while the
            // same stream continues to collect the row summary.
            if (lineIndex < DISCOVERY_MAX_LINES) {
                for (const cwd of sessionLineCwds(item)) {
                    summary.discoveredProjects.add(cwd);
                }
            }
            lineIndex += 1;
            if (!summary.firstTs && item.timestamp)
                summary.firstTs = item.timestamp;
            if (kind === "codex") {
                if (item.type === "session_meta") {
                    summary.sessionId = item.payload?.id ?? summary.sessionId;
                }
                if (item.type === "turn_context") {
                    for (const cwd of sessionLineCwds(item)) {
                        summary.matchedCodexProjects.add(cwd);
                    }
                }
                if (item.type !== "response_item" || item.payload?.type !== "message") {
                    continue;
                }
                const role = item.payload.role;
                const text = redactSecrets(contentText(item.payload.content));
                if (role === "user" && isUsefulUserText(text) && !summary.firstUser) {
                    summary.firstUser = truncate(extractDelegationInput(text), 420);
                }
                else if (role === "assistant" && text.trim()) {
                    summary.lastAssistant = truncate(text, 520);
                }
            }
            else {
                const role = item.type === "user" || item.type === "assistant"
                    ? item.type
                    : item.message?.role;
                const text = redactSecrets(contentText(item.message?.content ?? item.content));
                if (role === "user" && isUsefulUserText(text) && !summary.firstUser) {
                    summary.firstUser = truncate(text, 420);
                }
                else if (role === "assistant" && text.trim()) {
                    summary.lastAssistant = truncate(text, 520);
                }
            }
        }
    }
    catch {
        return null;
    }
    finally {
        lines.close();
        input.destroy();
    }
    return summary;
}
/**
 * Discovery-mode ingest in one corpus pass. The former project-major caller
 * reopened and reparsed every Codex JSONL once per discovered project. This
 * scans each file once, retains only the bounded row summary, then replays the
 * historical project-major output ordering without retaining transcript text.
 */
async function buildDiscoveredMemoryRows(options = {}) {
    const claudeProjectsRoot = options.claudeProjectsRoot
        ?? (0, node_path_1.join)((0, node_os_1.homedir)(), ".claude", "projects");
    const codexSessionsRoot = options.codexSessionsRoot
        ?? (0, node_path_1.join)((0, node_os_1.homedir)(), ".codex", "sessions");
    const codexFiles = options.codexFiles
        ?? walk(codexSessionsRoot, (path) => path.endsWith(".jsonl"));
    const claudeFiles = options.claudeFiles
        ?? walk(claudeProjectsRoot, (path) => path.endsWith(".jsonl"));
    const codexSummaries = [];
    const claudeSummaries = [];
    const discoveredProjects = new Set();
    for (const file of codexFiles) {
        const summary = await streamSessionSummary(file, "codex", options.onFileRead);
        if (summary === null)
            continue;
        codexSummaries.push(summary);
        for (const project of summary.discoveredProjects)
            discoveredProjects.add(project);
    }
    for (const file of claudeFiles) {
        const summary = await streamSessionSummary(file, "claude", options.onFileRead);
        if (summary === null)
            continue;
        claudeSummaries.push(summary);
        for (const project of summary.discoveredProjects)
            discoveredProjects.add(project);
    }
    const rows = [];
    const projects = [];
    for (const projectPath of [...discoveredProjects].sort()) {
        const projectRows = [];
        for (const summary of codexSummaries) {
            if (!summary.matchedCodexProjects.has(projectPath))
                continue;
            const row = codexRowFromSummary(summary, projectPath);
            if (row !== null)
                projectRows.push(row);
        }
        for (const summary of claudeSummaries) {
            if (!claudeFileInProject(summary.file, projectPath))
                continue;
            const row = claudeRowFromSummary(summary, projectPath);
            if (row !== null)
                projectRows.push(row);
        }
        const seen = new Set();
        const uniqueRows = projectRows.filter((row) => {
            const key = `${row.source}:${row.source_ref}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        projects.push({ path: projectPath, rows: uniqueRows.length });
        rows.push(...uniqueRows);
    }
    return { rows, projects };
}
function buildMemoryRows(options) {
    const codexFiles = options.codexFiles ?? walk((0, node_path_1.join)((0, node_os_1.homedir)(), ".codex", "sessions"), (path) => path.endsWith(".jsonl"));
    // Injected lists are filtered too: attribution to the encoded project dir
    // is the contract, not an optimization of the default walk.
    const claudeFiles = (options.claudeFiles ?? walk((0, node_path_1.join)((0, node_os_1.homedir)(), ".claude", "projects"), (path) => path.endsWith(".jsonl"))).filter((file) => claudeFileInProject(file, options.projectPath));
    const rows = [];
    for (const [files, parse] of [
        [codexFiles, parseCodexSessionText],
        [claudeFiles, parseClaudeSessionText],
    ]) {
        for (const file of files) {
            let raw;
            try {
                raw = (0, node_fs_1.readFileSync)(file, "utf-8");
            }
            catch {
                continue;
            }
            const row = parse(file, options.projectPath, raw);
            if (row)
                rows.push(row);
        }
    }
    const seen = new Set();
    return rows.filter((row) => {
        const key = `${row.source}:${row.source_ref}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
