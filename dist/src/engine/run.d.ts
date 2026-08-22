#!/usr/bin/env node
import { GraphStoreKind } from "../graph-db.js";
import { BiometricSource } from "./signals/biometricsDb.js";
import type { BiometricsClient } from "./signals/biometrics.js";
import { TextGenerationProvider } from "./memory/llm.js";
export interface EngineRunOptions {
    once?: boolean;
    watch?: boolean;
    dryRun?: boolean;
    demo?: boolean;
    userId?: string;
    /** @deprecated Accepted for internal compatibility but never sent as backend identity. */
    deviceId?: string;
    /** Server-generated opaque generation for the token-gated production run. */
    generationId?: string;
    /** Exact backend lease authorizing that production generation commit. */
    leaseToken?: string;
    startTs?: number;
    endTs?: number;
    asOfTs?: number;
    memoryMode?: "as-of" | "through-now";
    biometricRange?: string;
    client?: BiometricsClient;
    stateChunkDays?: number;
    intervalSec?: number;
    maxRuns?: number;
    /** Test seam (pipeline completeness): injected query-embedding function for
     *  the semantic retrieval path; default resolves the Gemini provider. */
    semanticEmbedText?: (text: string) => Promise<number[]>;
    semanticEmbedTexts?: (texts: string[]) => Promise<number[][]>;
    /** Test seam (pipeline completeness): injected LLM for the theme proposer;
     *  default resolves GeminiTextProvider when a Gemini key is present. */
    proposerLlm?: TextGenerationProvider;
}
export interface EngineRunResult {
    status: "dry_run" | "written" | "skipped_done" | "no_signal";
    user_id: string;
    /** Echoed only after the graph delta and this marker co-commit. */
    generation_id?: string;
    demo: boolean;
    dry_run: boolean;
    triplet_count: number;
    node_count: number;
    edge_count: number;
    armed_node_id?: string;
    root_armed: boolean;
    /** Which graph store this run resolved to (same resolution graph-db.ts
     *  uses). Present on EVERY result — including no_signal — so the
     *  split-store trap ("write Postgres, read empty SQLite") is visible. */
    graph_store: GraphStoreKind;
    /** Per-source row counts collected this run. Present on EVERY result —
     *  all four result paths (dry_run, written/skipped_done, and both
     *  no_signal paths) build it before returning, so it is non-optional. */
    signal_counts: {
        calendar: number;
        granola: number;
        memory: number;
        biometric_episodes: number;
        /** Which source served the biometrics this run: "neon-direct" (warm-tier
         *  Postgres read by user_id), "api" (backend HTTP path), or "none"
         *  (demo input, or no source could serve — warnings say why). */
        biometric_source: BiometricSource;
    };
    /** Corpus enrichment axes derived live for the 7th gate. Present on
     *  reasoned runs (dry_run/written) ONLY when the v2 preview context
     *  activated (raw samples were present): 0 then means "v2 ran, no axes".
     *  Omitted when v2 never activated and on no_signal paths, so 0 is
     *  never ambiguous with "v2 never ran". */
    enrichment_axes_count?: number;
    /** LLM proposer observability (pipeline completeness stage 2). Present
     *  ONLY when the proposer actually attempted (window/replay run with a
     *  Gemini key or injected seam): the count of lint-surviving proposed
     *  themes. Omitted otherwise, so 0 always means "proposer ran, nothing
     *  survived", never "proposer never ran". */
    proposed_theme_count?: number;
    /** Of the enrichment axes above, how many were minted by llm_proposed
     *  themes. Present only when BOTH v2 activated and the proposer attempted
     *  (same non-ambiguity rule as enrichment_axes_count). */
    llm_proposed_axes_count?: number;
    warnings: string[];
}
export declare function runEngineOnce(options?: EngineRunOptions): Promise<EngineRunResult>;
