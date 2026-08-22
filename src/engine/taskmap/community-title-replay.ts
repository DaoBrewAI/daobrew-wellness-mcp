import { lstat, unlink } from "node:fs/promises";
import path from "node:path";

import type {
  TaskMapCommunityGraphNodeInputV1,
  TaskMapCommunityGraphOutputV1,
} from "./community-graph-brain.js";
import {
  taskMapCommunityRecordedTitleEnvelope,
} from "./community-root-proposals.js";
import type {
  LlmStation,
  LlmStationEnvelope,
} from "./llm-station.js";
import {
  assertPrivateDirectory,
  atomicPrivateWriteNew,
  readAuthenticatedFile,
} from "./meeting-refresh-llm-replay.js";
import {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
} from "./mention-extraction.js";

export const TASKMAP_COMMUNITY_TITLE_ENVELOPE_MAX_BYTES = 256 * 1_024;

const SHA256 = /^[a-f0-9]{64}$/;

interface CommunityTitleReplayScopeV1 {
  directory: string;
  graphOutput: TaskMapCommunityGraphOutputV1;
  nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
}

function envelopePath(directory: string, inputDigest: string): string {
  if (!SHA256.test(inputDigest)) {
    throw new TypeError("community title replay input digest is invalid");
  }
  return path.join(directory, `${inputDigest}.json`);
}

async function ensureReplayDirectory(directory: string): Promise<void> {
  await assertPrivateDirectory(path.dirname(directory), true);
  await assertPrivateDirectory(directory, true);
}

/**
 * Best-effort load of the recorded batch title envelope for the current
 * community set. Any storage or validation failure returns null so the
 * caller falls back to the live station or the deterministic titles.
 */
export async function loadRecordedCommunityTitleEnvelope(
  scope: CommunityTitleReplayScopeV1,
  inputDigest: string,
): Promise<LlmStationEnvelope | null> {
  try {
    await ensureReplayDirectory(scope.directory);
    const filePath = envelopePath(scope.directory, inputDigest);
    try {
      await lstat(filePath);
    } catch {
      return null;
    }
    let recorded: LlmStationEnvelope | null = null;
    try {
      const file = await readAuthenticatedFile(
        filePath,
        TASKMAP_COMMUNITY_TITLE_ENVELOPE_MAX_BYTES,
        "owner_private",
      );
      const decoded = new TextDecoder("utf-8", { fatal: true })
        .decode(file.bytes);
      assertTaskMapStrictJsonSyntaxAndUniqueKeys(decoded);
      recorded = taskMapCommunityRecordedTitleEnvelope(
        JSON.parse(decoded),
        scope,
      );
    } catch {
      recorded = null;
    }
    if (recorded === null) {
      // An unreadable or mismatched recording would otherwise block every
      // future recording at this key, because recordings never overwrite.
      await unlink(filePath).catch(() => undefined);
    }
    return recorded;
  } catch {
    return null;
  }
}

/**
 * Wraps a live station so every valid community-title-v1 envelope it
 * produces is recorded for byte-identical replay in later generations.
 * Recording is best-effort and never affects the live result.
 */
export function withCommunityTitleEnvelopeRecording(
  station: LlmStation,
  scope: CommunityTitleReplayScopeV1,
): LlmStation {
  return {
    provider: station.provider,
    async run(request) {
      const envelope = await station.run(request);
      if (request.stationId === "community-title-v1") {
        const validated = taskMapCommunityRecordedTitleEnvelope(
          envelope,
          scope,
        );
        if (validated !== null) {
          try {
            await ensureReplayDirectory(scope.directory);
            await atomicPrivateWriteNew(
              envelopePath(scope.directory, validated.inputDigest),
              validated,
            );
          } catch {
            // A failed recording only costs one later live/deterministic run.
          }
        }
      }
      return envelope;
    },
  };
}
