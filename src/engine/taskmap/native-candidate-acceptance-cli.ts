#!/usr/bin/env node

import { homedir } from "node:os";
import path from "node:path";

import { loadConfirmedTaskMapOwner } from "../../identity.js";
import { formatTaskMapCliErrorDiagnostic } from "./cli-error-diagnostic.js";
import {
  loadTaskMapAgentSessionProducerResult,
} from "./agent-session-producer-freshness.js";
import {
  buildTaskMapAgentSessionSemanticAdmission,
} from "./agent-session-semantic-admission.js";
import {
  loadVerifiedTaskMapAgentSessionExtractionReport,
} from "./agent-session-refresh-llm-replay.js";
import {
  loadCurrentTaskMapCalendarExtractionProof,
} from "./calendar-refresh-llm-replay.js";
import {
  loadTaskMapMeetingProducerResult,
} from "./meeting-producer-freshness.js";
import {
  loadCurrentTaskMapOwnerGranolaExtractionReport,
} from "./native-refresh-service.js";
import {
  loadTaskMapNativeCandidateAcceptanceStore,
  promoteTaskMapAgentSessionCandidate,
  promoteTaskMapCalendarCandidate,
  promoteTaskMapNativeCandidate,
  promoteTaskMapVerifiedMeetingCandidate,
  taskMapNativeCandidateAcceptanceHeadDigest,
  writeTaskMapNativeCandidateAcceptanceStore,
  type TaskMapNativeCandidatePromotionReceiptV1,
} from "./native-candidate-acceptance.js";
import {
  buildTaskMapNativeCandidateReview,
  loadTaskMapNativeCandidateReview,
  withTaskMapNativeCandidateReviewTransaction,
} from "./native-candidate-review.js";
import {
  taskMapNativeCandidateReviewOverlayPath,
} from "./native-candidate-review-cli.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_IDEMPOTENCY_DOMAIN =
  "taskmap-native-candidate-acceptance-cli-idempotency.1" as const;
export const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_MAX_OUTPUT_BYTES =
  128 * 1_024;

const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY = /^[^\u0000-\u001f\u007f]{1,128}$/;
const STORE_FILE_NAME = "native-candidate-acceptance.v1.json";
const USAGE = "usage: native-candidate-acceptance-cli "
  + "--promote <candidateId> --revision <64hex> --statement <64hex> "
  + "--evidence-proofs <sorted-64hex[,64hex...]> --idempotency-key <key> | "
  + "--adopt-agent <candidateId> --revision <64hex> --statement <64hex> "
  + "--evidence-proofs <sorted-64hex[,64hex...]> --idempotency-key <key> | "
  + "--adopt-calendar <candidateId> --revision <64hex> --statement <64hex> "
  + "--evidence-proofs <sorted-64hex[,64hex...]> --idempotency-key <key>";

export interface TaskMapNativeCandidateAcceptanceCommandV1 {
  candidateId: string;
  candidateRevisionDigest: string;
  statementReferenceDigest: string;
  evidenceProofDigests: string[];
  idempotencyKey: string;
}

export interface TaskMapAgentSessionCandidateAcceptanceCommandV2
  extends TaskMapNativeCandidateAcceptanceCommandV1 {
  candidateFamily: "agent_session";
}

export interface TaskMapCalendarCandidateAcceptanceCommandV2
  extends TaskMapNativeCandidateAcceptanceCommandV1 {
  candidateFamily: "calendar";
}

function usageError(): never {
  throw new TypeError(USAGE);
}

export function parseTaskMapNativeCandidateAcceptanceCommand(
  argv: readonly string[],
):
  | TaskMapNativeCandidateAcceptanceCommandV1
  | TaskMapAgentSessionCandidateAcceptanceCommandV2
  | TaskMapCalendarCandidateAcceptanceCommandV2 {
  const operation = argv[0];
  if (
    argv.length !== 10
    || (
      operation !== "--promote"
      && operation !== "--adopt-agent"
      && operation !== "--adopt-calendar"
    )
    || !CANDIDATE_ID.test(argv[1] ?? "")
    || argv[2] !== "--revision"
    || !SHA256.test(argv[3] ?? "")
    || argv[4] !== "--statement"
    || !SHA256.test(argv[5] ?? "")
    || argv[6] !== "--evidence-proofs"
    || argv[8] !== "--idempotency-key"
    || !SAFE_KEY.test(argv[9] ?? "")
  ) usageError();
  const proofs = argv[7]!.split(",");
  if (
    proofs.length === 0
    || proofs.length > 128
    || proofs.some((item) => !SHA256.test(item))
    || new Set(proofs).size !== proofs.length
    || proofs.some((item, index) => index > 0 && proofs[index - 1]! >= item)
  ) usageError();
  const command = {
    candidateId: argv[1]!,
    candidateRevisionDigest: argv[3]!,
    statementReferenceDigest: argv[5]!,
    evidenceProofDigests: proofs,
    idempotencyKey: argv[9]!,
  };
  return operation === "--adopt-agent"
    ? {
        candidateFamily: "agent_session",
        ...command,
      }
    : operation === "--adopt-calendar"
      ? {
          candidateFamily: "calendar",
          ...command,
        }
      : command;
}

export function taskMapNativeCandidateAcceptanceStorePath(
  taskMapRoot: string,
): string {
  const storePath = path.join(taskMapRoot, STORE_FILE_NAME);
  if (!path.isAbsolute(storePath) || path.normalize(storePath) !== storePath) {
    throw new Error("candidate acceptance storage is unavailable");
  }
  return storePath;
}

async function confirmedOwner(homeDirectory: string) {
  const environment = (process.env.DAOBREW_USER_ID ?? "").trim();
  const plan = await loadConfirmedTaskMapOwner(
    homeDirectory,
    environment.length === 0 ? {} : { userId: environment },
  );
  if (!plan.ok) throw new Error("candidate acceptance owner is unavailable");
  return plan.owner;
}

function idempotencyDigest(
  ownerScopeDigest: string,
  rawKey: string,
): string {
  return taskMapContractDigest({
    domain: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_IDEMPOTENCY_DOMAIN,
    ownerScopeDigest,
    rawKey,
  });
}

export async function runTaskMapNativeCandidateAcceptanceCommand(
  argv: readonly string[],
): Promise<TaskMapNativeCandidatePromotionReceiptV1> {
  const command = parseTaskMapNativeCandidateAcceptanceCommand(argv);
  const ownerHome = homedir();
  const owner = await confirmedOwner(ownerHome);
  const expectedOwnerScopeDigest = owner.ownerScopeDigest;
  const overlayPath = taskMapNativeCandidateReviewOverlayPath(owner.taskMapRoot);
  const storePath = taskMapNativeCandidateAcceptanceStorePath(owner.taskMapRoot);
  const producerPath = path.join(
    owner.sourceRoot,
    "meeting-producer-snapshot.v1.json",
  );
  const keyDigest = idempotencyDigest(
    expectedOwnerScopeDigest,
    command.idempotencyKey,
  );
  return withTaskMapNativeCandidateReviewTransaction({
    overlayPath,
    expectedOwnerScopeDigest,
  }, async () => {
    const previousStore = await loadTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest,
    });
    if (previousStore?.receipts.some((receipt) =>
      receipt.idempotencyKeyDigest === keyDigest
    )) {
      return promoteTaskMapNativeCandidate({
        result: null,
        overlay: null,
        previousStore,
        expectedOwnerScopeDigest,
        assessedAt: new Date().toISOString(),
        candidateId: command.candidateId,
        expectedCandidateRevisionDigest: command.candidateRevisionDigest,
        expectedStatementReferenceDigest: command.statementReferenceDigest,
        expectedEvidenceProofDigests: command.evidenceProofDigests,
        idempotencyKeyDigest: keyDigest,
        confirmedAt: new Date().toISOString(),
      }).receipt;
    }
    const assessedAt = new Date().toISOString();
    if ("candidateFamily" in command) {
      if (command.candidateFamily === "calendar") {
        const proof = await loadCurrentTaskMapCalendarExtractionProof({
          localExportPath: path.join(
            owner.sourceRoot,
            "calendar-export.json",
          ),
          googleSnapshotPath: path.join(
            owner.sourceRoot,
            "calendar-google-provider-snapshot.v1.json",
          ),
          taskMapRoot: owner.taskMapRoot,
          runtimeRoot: owner.runtimeRoot,
          ownerScopeDigest: expectedOwnerScopeDigest,
          promptTemplatePath: path.resolve(
            __dirname,
            "../../../../prompts/calendar-extraction-v1.md",
          ),
          currentAssessedAt: assessedAt,
        });
        if (proof === null) {
          throw new Error("calendar candidate acceptance proof is unavailable");
        }
        const currentOverlay = await loadTaskMapNativeCandidateReview({
          overlayPath,
          expectedOwnerScopeDigest,
        });
        const promoted = promoteTaskMapCalendarCandidate({
          result: proof.result,
          extraction: proof.extraction,
          overlay: currentOverlay,
          previousStore,
          expectedOwnerScopeDigest,
          expectedAcceptanceHeadDigest:
            taskMapNativeCandidateAcceptanceHeadDigest(previousStore),
          assessedAt: proof.result.assessedAt,
          candidateId: command.candidateId,
          expectedCandidateRevisionDigest: command.candidateRevisionDigest,
          expectedStatementReferenceDigest: command.statementReferenceDigest,
          expectedEvidenceProofDigests: command.evidenceProofDigests,
          idempotencyKeyDigest: keyDigest,
          confirmedAt: assessedAt,
        });
        await writeTaskMapNativeCandidateAcceptanceStore({
          storePath,
          expectedOwnerScopeDigest,
          store: promoted.store,
        });
        return promoted.receipt;
      }
      const agentResult = await loadTaskMapAgentSessionProducerResult({
        snapshotPath: path.join(
          owner.sourceRoot,
          "agent-session-producer-snapshot.v1.json",
        ),
        assessedAt,
        expectedOwnerScopeDigest,
      });
      if (
        agentResult.availability !== "available"
        || agentResult.snapshot === null
        || agentResult.freshness.decision !== "fresh"
        || agentResult.freshness.currentSemanticInputEligible !== true
      ) throw new Error("agent candidate acceptance proof is unavailable");
      const currentOverlay = await loadTaskMapNativeCandidateReview({
        overlayPath,
        expectedOwnerScopeDigest,
      });
      const admission = buildTaskMapAgentSessionSemanticAdmission(
        agentResult.snapshot,
      );
      const extraction =
        await loadVerifiedTaskMapAgentSessionExtractionReport({
          admission,
          taskMapRoot: owner.taskMapRoot,
          runtimeRoot: owner.runtimeRoot,
          ownerScopeDigest: expectedOwnerScopeDigest,
          promptTemplatePath: path.resolve(
            __dirname,
            "../../../../prompts/agent-session-extraction-v1.md",
          ),
        });
      if (extraction === null) {
        throw new Error("agent candidate extraction proof is unavailable");
      }
      const promoted = promoteTaskMapAgentSessionCandidate({
        admission,
        extraction,
        overlay: currentOverlay,
        previousStore,
        expectedOwnerScopeDigest,
        expectedAcceptanceHeadDigest:
          taskMapNativeCandidateAcceptanceHeadDigest(previousStore),
        assessedAt,
        candidateId: command.candidateId,
        expectedCandidateRevisionDigest: command.candidateRevisionDigest,
        expectedStatementReferenceDigest: command.statementReferenceDigest,
        expectedEvidenceProofDigests: command.evidenceProofDigests,
        idempotencyKeyDigest: keyDigest,
        confirmedAt: assessedAt,
      });
      await writeTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest,
        store: promoted.store,
      });
      return promoted.receipt;
    }
    let result: Awaited<ReturnType<typeof loadTaskMapMeetingProducerResult>> | null = null;
    try {
      result = await loadTaskMapMeetingProducerResult({
        snapshotPath: producerPath,
        assessedAt,
        expectedOwnerScopeDigest,
      });
      if (
        result.availability !== "available"
        || result.snapshot === null
        || result.freshness.decision !== "fresh"
      ) result = null;
    } catch {
      result = null;
    }
    let rawReport: Awaited<
      ReturnType<typeof loadCurrentTaskMapOwnerGranolaExtractionReport>
    > | null = null;
    try {
      rawReport = await loadCurrentTaskMapOwnerGranolaExtractionReport({
        snapshotPath: path.join(
          owner.sourceRoot,
          "granola-mcp-snapshot.json",
        ),
        residentReceiptPath: path.join(
          owner.sourceRoot,
          "taskmap-resident-receipt.v1.json",
        ),
        assessedAt,
        taskMapRoot: owner.taskMapRoot,
        runtimeRoot: owner.runtimeRoot,
        ownerScopeDigest: expectedOwnerScopeDigest,
        promptTemplatePath: path.resolve(
          __dirname,
          "../../../../prompts/mention-extraction-v1.md",
        ),
      });
    } catch {
      rawReport = null;
    }
    if (result === null && rawReport === null) {
      throw new Error("candidate acceptance proof is unavailable");
    }
    const previousOverlay = await loadTaskMapNativeCandidateReview({
      overlayPath,
      expectedOwnerScopeDigest,
    });
    const overlay = rawReport !== null || result === null
      ? previousOverlay
      : buildTaskMapNativeCandidateReview({
          result,
          previous: previousOverlay,
          expectedOwnerScopeDigest,
          assessedAt,
        });
    const promoted = rawReport === null
      ? promoteTaskMapNativeCandidate({
          result,
          overlay,
          previousStore,
          expectedOwnerScopeDigest,
          assessedAt,
          candidateId: command.candidateId,
          expectedCandidateRevisionDigest: command.candidateRevisionDigest,
          expectedStatementReferenceDigest: command.statementReferenceDigest,
          expectedEvidenceProofDigests: command.evidenceProofDigests,
          idempotencyKeyDigest: keyDigest,
          confirmedAt: assessedAt,
        })
      : promoteTaskMapVerifiedMeetingCandidate({
          result,
          overlay,
          rawReport,
          previousStore,
          expectedOwnerScopeDigest,
          assessedAt,
          candidateId: command.candidateId,
          expectedCandidateRevisionDigest: command.candidateRevisionDigest,
          expectedStatementReferenceDigest: command.statementReferenceDigest,
          expectedEvidenceProofDigests: command.evidenceProofDigests,
          idempotencyKeyDigest: keyDigest,
          confirmedAt: assessedAt,
        });
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest,
      store: promoted.store,
    });
    return promoted.receipt;
  });
}

export function taskMapNativeCandidateAcceptanceOutput(
  receipt: TaskMapNativeCandidatePromotionReceiptV1,
): string {
  const output = taskMapContractCanonicalJson(receipt);
  if (Buffer.byteLength(output, "utf8") > TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_MAX_OUTPUT_BYTES) {
    throw new Error("candidate acceptance output is unavailable");
  }
  return output;
}

async function main(): Promise<void> {
  try {
    const receipt = await runTaskMapNativeCandidateAcceptanceCommand(
      process.argv.slice(2),
    );
    process.stdout.write(`${taskMapNativeCandidateAcceptanceOutput(receipt)}\n`);
  } catch (error) {
    process.stderr.write(
      `taskmap-native-candidate-acceptance: unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
