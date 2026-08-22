import { GranolaMeetingSignal } from "../signals/granola.js";
import { MemoryInsightSignal } from "../signals/memory.js";
export interface CitedTranscriptSpan {
    meeting_id: string;
    meeting_title: string;
    source_ref: string;
    speaker?: string | null;
    ts_offset_sec?: number | null;
    text: string;
}
export interface LatentMemorySupport {
    memory_id: string;
    source_ref: string;
    reason: "project_memory_semantic_support";
    text: string;
    topics: string[];
}
export type ClaimLevel = "source_backed_hypothesis_not_settled_causality" | "insufficient_evidence";
export interface LatentHypothesisProposal {
    thread_key: string;
    cause: string;
    summary: string;
    evidence_spans: CitedTranscriptSpan[];
    memory_support: LatentMemorySupport[];
    recurrence_weeks: number;
    unresolvedness: number;
    proposed_by: "deterministic_semantic_proposer";
    proposal_strategy: string;
    surface_terms: string[];
}
type VerifierGate = "pass" | "fail";
export interface EvidenceVerification {
    accepted: boolean;
    claim_level: ClaimLevel;
    gates: {
        citation: VerifierGate;
        title_ban: VerifierGate;
        time_plausibility: VerifierGate;
        biometrics_firewall: VerifierGate;
        recurrence_cross_source: VerifierGate;
        non_clinical_language: VerifierGate;
    };
    rejected_reasons: string[];
}
export type GapCandidate = LatentHypothesisProposal & {
    verification: EvidenceVerification;
};
export interface LatentHypothesisContext {
    meetings: GranolaMeetingSignal[];
    memories: MemoryInsightSignal[];
    biometric_patterns: string[];
    event_titles?: string[];
    anchor_ts?: number;
}
export declare function citedTranscriptSpans(meeting: GranolaMeetingSignal): CitedTranscriptSpan[];
export declare function meetingHasCitedTranscriptSpan(meeting: GranolaMeetingSignal): boolean;
export declare function proposeLatentHypotheses(context: LatentHypothesisContext): LatentHypothesisProposal[];
export declare function verifyLatentHypothesis(proposal: LatentHypothesisProposal, context: LatentHypothesisContext): EvidenceVerification;
export declare function detectLatentHypothesis(context: LatentHypothesisContext): GapCandidate | null;
export {};
