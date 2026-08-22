import { type TaskMapCanonicalMeetingV1, type TaskMapCapability, type TaskMapConnectorCheckpointV1, type TaskMapConnectorWatermarkV1, type TaskMapDeterministicGate, type TaskMapDiscoveryChannel, type TaskMapDiscoveryPointerV1, type TaskMapGateDecisionV1, type TaskMapMeetingIdentityHintV1, type TaskMapProjectionDiffV1, type TaskMapProjectionParityV1, type TaskMapProjectionTargetRecordV1, type TaskMapProjectionTargetV1, type TaskMapProjectionV1, type TaskMapReplayManifestV1, type TaskMapReplayPolicyBindingV1, type SemanticBrainOutput, type TaskMapSemanticProposalReferenceV1, type TaskMapSourceAuthorityBindingV1, type TaskMapSourceEnvelopeV1, type TaskMapSourceKind, type TaskMapSourceSnapshotV1 } from "./types.js";
export type TaskMapSourceEnvelopeDraftV1 = Omit<TaskMapSourceEnvelopeV1, "contractVersion" | "envelopeId" | "sourceObjectKeyDigest" | "sourceIdentityDigest" | "privacy">;
export interface TaskMapGmailDiscoveryDraftV1 {
    binding: TaskMapSourceAuthorityBindingV1;
    channel: TaskMapDiscoveryChannel;
    opaqueMessageId: string;
    resolvedDocumentUrl: string;
}
export interface TaskMapGeminiMeetDraftV1 {
    ownerScopeDigest: string;
    binding: TaskMapSourceAuthorityBindingV1;
    documentId: string;
    revisionId: string;
    eventTime: string;
    contentDigest: string;
    quality: "structured_generated" | "degraded_summary";
    meetingIdentity: TaskMapMeetingIdentityHintV1;
    gmailDiscoveries: TaskMapGmailDiscoveryDraftV1[];
}
export interface TaskMapConnectorPollDraftV1 {
    binding: TaskMapSourceAuthorityBindingV1;
    sourceKind: TaskMapSourceKind;
    adapterVersion: string;
    capabilities: TaskMapCapability[];
    state: "success" | "partial" | "failed";
    attemptedAt: string;
    proposedWatermark?: TaskMapConnectorWatermarkV1;
    acceptedSourceIdentityDigests?: string[];
    errorCode?: string;
    errorDetailDigest?: string;
}
export interface TaskMapSemanticBrainArtifactV1 {
    sourceSemanticInputDigest: string;
    attestationKeyId: string;
    attestationMac: string;
    brain: SemanticBrainOutput;
}
export interface TaskMapSemanticProposalReferenceDraftV1 {
    sourceSnapshot: TaskMapSourceSnapshotV1;
    semanticBrainArtifact: TaskMapSemanticBrainArtifactV1;
    semanticBrainAttestationKey: string;
}
export interface TaskMapGateDecisionDraftV1 {
    subjectId: string;
    gate: TaskMapDeterministicGate;
    outcome: TaskMapGateDecisionV1["outcome"];
    reasonCodes: string[];
}
export interface TaskMapProjectionTargetDraftV1 {
    target: TaskMapProjectionTargetV1["target"];
    acceptedDeltaDigest: string;
    records: TaskMapProjectionTargetRecordV1[];
}
export interface TaskMapReplayManifestDraftV1 {
    fixedNow: string;
    sourceSnapshot: TaskMapSourceSnapshotV1;
    semanticBrainArtifact: TaskMapSemanticBrainArtifactV1;
    semanticBrainAttestationKey: string;
    previousProjection: TaskMapProjectionV1 | null;
    currentProjection: TaskMapProjectionV1;
    policyBindings: TaskMapReplayPolicyBindingV1[];
    connectorCheckpoints: TaskMapConnectorCheckpointV1[];
    gateDecisions: TaskMapGateDecisionV1[];
    projectionParity?: TaskMapProjectionParityV1;
}
export declare function taskMapContractCanonicalJson(value: unknown): string;
export declare function taskMapContractDigest(value: unknown): string;
export declare function attestTaskMapSemanticBrain(sourceSemanticInputDigest: string, brain: SemanticBrainOutput, semanticBrainAttestationKey: string): TaskMapSemanticBrainArtifactV1;
export declare function buildTaskMapSourceEnvelope(draft: TaskMapSourceEnvelopeDraftV1): TaskMapSourceEnvelopeV1;
export declare function canonicalGoogleDocumentId(url: string): string;
export declare function buildGeminiMeetSource(draft: TaskMapGeminiMeetDraftV1): {
    envelope: TaskMapSourceEnvelopeV1;
    discoveryPointers: TaskMapDiscoveryPointerV1[];
};
export declare function advanceTaskMapConnectorCheckpoint(previous: TaskMapConnectorCheckpointV1 | null, poll: TaskMapConnectorPollDraftV1): TaskMapConnectorCheckpointV1;
export declare function assertTaskMapConnectorCheckpoint(checkpoint: TaskMapConnectorCheckpointV1): TaskMapConnectorCheckpointV1;
export declare function canonicalizeTaskMapMeetings(envelopes: readonly TaskMapSourceEnvelopeV1[], previousMeetings?: readonly TaskMapCanonicalMeetingV1[]): TaskMapCanonicalMeetingV1[];
export declare function buildTaskMapSourceSnapshot(envelopesInput: readonly TaskMapSourceEnvelopeV1[], discoveryInput: readonly TaskMapDiscoveryPointerV1[], previousMeetings?: readonly TaskMapCanonicalMeetingV1[]): TaskMapSourceSnapshotV1;
export declare function assertTaskMapSourceSnapshot(snapshot: TaskMapSourceSnapshotV1): TaskMapSourceSnapshotV1;
export declare function buildTaskMapSemanticProposalReference(draft: TaskMapSemanticProposalReferenceDraftV1): TaskMapSemanticProposalReferenceV1;
export declare function assertTaskMapSemanticProposalCurrent(snapshot: TaskMapSourceSnapshotV1, proposal: TaskMapSemanticProposalReferenceV1): void;
export declare function buildTaskMapGateDecision(draft: TaskMapGateDecisionDraftV1): TaskMapGateDecisionV1;
export declare function diffTaskMapProjections(previous: TaskMapProjectionV1 | null, current: TaskMapProjectionV1): TaskMapProjectionDiffV1;
export declare function buildTaskMapProjectionTarget(draft: TaskMapProjectionTargetDraftV1): TaskMapProjectionTargetV1;
export declare function compareTaskMapProjectionTargets(strategy: TaskMapProjectionTargetV1, taskMap: TaskMapProjectionTargetV1): TaskMapProjectionParityV1;
export declare function buildTaskMapReplayManifest(draft: TaskMapReplayManifestDraftV1): TaskMapReplayManifestV1;
