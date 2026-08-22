import { EmbeddingProvider, Float16Vector } from "../embeddings/provider.js";

/**
 * Canonical texts for the two 5B vector spaces. These are the ONLY strings
 * that ever reach the embedding provider for transfer purposes, and they are
 * built from closed vocabularies (pattern keys, root classes, thread keys) —
 * never from insight prose, transcripts, or snapshot text. Determinism
 * matters: the same trigger must embed to the same vector across runs, so
 * terms are lowercased, deduped, and sorted before joining.
 */

function normalizedTerms(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const term = value.trim().toLowerCase().replace(/^#+/, "");
    if (term) seen.add(term);
  }
  return [...seen].sort();
}

export interface TriggerBasisInput {
  /** Selected stress pattern key on the armed root (e.g. "overdrive"). */
  stressPattern: string;
  /** Root cause class (today always "productivity"). */
  rootCauseClass: string;
  /** Closed-vocabulary context terms (linked pattern keys), NOT prose. */
  contextTerms: string[];
}

export function canonicalTriggerText(input: TriggerBasisInput): string {
  const head = `trigger ${input.stressPattern.trim().toLowerCase()} ${input.rootCauseClass.trim().toLowerCase()}`;
  const ctx = normalizedTerms(input.contextTerms);
  return ctx.length ? `${head} | ctx: ${ctx.join(" ")}` : head;
}

export interface ProfileBasisInput {
  /** Pattern keys dominating the user's active threads. */
  dominantPatterns: string[];
  /** Active thread keys (already hashed/opaque — root:<id> or sem:v1:<sha>). */
  threadKeys: string[];
  /** Latest snapshot claim ceiling — a vocabulary token, never snapshot_text. */
  snapshotClaimCeiling?: string | null;
}

export function canonicalProfileText(input: ProfileBasisInput): string {
  const parts = [
    `profile patterns: ${normalizedTerms(input.dominantPatterns).join(" ")}`,
    `threads: ${[...new Set(input.threadKeys)].sort().join(" ")}`,
  ];
  if (input.snapshotClaimCeiling) parts.push(`ceiling: ${input.snapshotClaimCeiling}`);
  return parts.join(" | ");
}

export interface EmbeddedText {
  text: string;
  vector: Float16Vector;
}

export async function embedTriggerVector(
  provider: EmbeddingProvider,
  input: TriggerBasisInput,
): Promise<EmbeddedText> {
  const text = canonicalTriggerText(input);
  const [vector] = await provider.embed([text]);
  return { text, vector };
}

export async function embedProfileVector(
  provider: EmbeddingProvider,
  input: ProfileBasisInput,
): Promise<EmbeddedText> {
  const text = canonicalProfileText(input);
  const [vector] = await provider.embed([text]);
  return { text, vector };
}
