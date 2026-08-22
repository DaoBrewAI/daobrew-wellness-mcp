import { type CredentialBoundClientPlan } from "../../identity.js";
import { type RemoteLlmConsent } from "../local-config.js";
import { type DetectedLlmProvider, type LlmStation, type LlmStationEnvelope, type LlmStationRequest } from "./llm-station.js";
export interface TaskMapRemoteLlmPlanOverrides {
    remoteConsent?: RemoteLlmConsent;
    remoteCredentialPlan?: CredentialBoundClientPlan;
}
export interface TaskMapRemoteLlmPlan {
    consent: RemoteLlmConsent;
    credentialPlan: CredentialBoundClientPlan;
}
/** Resolve the consent and bearer/url pair from one consistent config read. */
export declare function resolveTaskMapRemoteLlmPlan(overrides?: TaskMapRemoteLlmPlanOverrides): TaskMapRemoteLlmPlan;
export interface GeminiRemoteLlmStationOptions {
    credentialPlan: Extract<CredentialBoundClientPlan, {
        ok: true;
    }>;
    fetchImpl?: typeof fetch;
    clock: () => Date;
    timeoutMs: number;
    requestGroupId?: string;
}
export declare class GeminiRemoteLlmStation implements LlmStation {
    private readonly options;
    private model;
    private readonly fetchImpl;
    constructor(options: GeminiRemoteLlmStationOptions);
    get provider(): DetectedLlmProvider;
    run(request: LlmStationRequest): Promise<LlmStationEnvelope>;
}
