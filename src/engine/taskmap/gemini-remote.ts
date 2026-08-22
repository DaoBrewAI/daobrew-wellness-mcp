import {
  credentialBoundApiEndpoint,
  resolveCredentialBoundClient,
  type CredentialBoundClientPlan,
} from "../../identity.js";
import {
  readLocalConfig,
  resolveRemoteLlmConsent,
  type RemoteLlmConsent,
} from "../local-config.js";
import {
  LLM_STATION_MAX_OUTPUT_BYTES,
  LlmStationUnavailableError,
  isValidLlmStationId,
  strictLlmProducedAt,
  stripTaskMapModelOutputFences,
  type DetectedLlmProvider,
  type LlmStation,
  type LlmStationEnvelope,
  type LlmStationRequest,
} from "./llm-station.js";
import {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
} from "./mention-extraction.js";
import { taskMapContractDigest } from "./source-contracts.js";

const INPUT_DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_GROUP_ID = /^[A-Za-z0-9_-]{16,96}$/;
const REMOTE_PROVIDER_ARGS = Object.freeze([] as const);

export interface TaskMapRemoteLlmPlanOverrides {
  remoteConsent?: RemoteLlmConsent;
  remoteCredentialPlan?: CredentialBoundClientPlan;
}

export interface TaskMapRemoteLlmPlan {
  consent: RemoteLlmConsent;
  credentialPlan: CredentialBoundClientPlan;
}

/** Resolve the consent and bearer/url pair from one consistent config read. */
export function resolveTaskMapRemoteLlmPlan(
  overrides: TaskMapRemoteLlmPlanOverrides = {},
): TaskMapRemoteLlmPlan {
  const config = readLocalConfig();
  return {
    consent: overrides.remoteConsent ?? resolveRemoteLlmConsent(config),
    credentialPlan: overrides.remoteCredentialPlan
      ?? resolveCredentialBoundClient(config),
  };
}

export interface GeminiRemoteLlmStationOptions {
  credentialPlan: Extract<CredentialBoundClientPlan, { ok: true }>;
  fetchImpl?: typeof fetch;
  clock: () => Date;
  timeoutMs: number;
  requestGroupId?: string;
}

function validModel(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function responseReason(status: number): LlmStationUnavailableError {
  if (status === 401 || status === 403) {
    return new LlmStationUnavailableError(
      "provider_unauthenticated",
      "gemini-remote",
    );
  }
  if (status === 429) {
    return new LlmStationUnavailableError(
      "provider_rate_limited",
      "gemini-remote",
    );
  }
  return new LlmStationUnavailableError("runner_failure", "gemini-remote");
}

export class GeminiRemoteLlmStation implements LlmStation {
  private model = "gemini-remote";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiRemoteLlmStationOptions) {
    if (
      options.requestGroupId !== undefined
      && !REQUEST_GROUP_ID.test(options.requestGroupId)
    ) {
      throw new LlmStationUnavailableError(
        "runner_failure",
        "gemini-remote",
      );
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get provider(): DetectedLlmProvider {
    return Object.freeze({
      transport: "gemini-remote" as const,
      executable: "",
      args: REMOTE_PROVIDER_ARGS,
      model: this.model,
    });
  }

  async run(request: LlmStationRequest): Promise<LlmStationEnvelope> {
    if (!isValidLlmStationId(request.stationId)) {
      throw new LlmStationUnavailableError(
        "invalid_station",
        "gemini-remote",
      );
    }
    if (!INPUT_DIGEST.test(request.inputDigest)) {
      throw new LlmStationUnavailableError(
        "invalid_input_digest",
        "gemini-remote",
      );
    }

    const abortController = new AbortController();
    const abortFromCaller = () =>
      abortController.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (request.signal?.aborted) abortFromCaller();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        abortController.abort();
        reject(new LlmStationUnavailableError("timeout", "gemini-remote"));
      }, this.options.timeoutMs);
    });
    timer?.unref();

    let response: Response;
    let responseText: string;
    try {
      [response, responseText] = await Promise.race([
        (async (): Promise<[Response, string]> => {
          const fetched = await this.fetchImpl(
            credentialBoundApiEndpoint(
              this.options.credentialPlan.apiUrl,
              "/api/v1/device/llm/gemini/generate",
            ),
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.options.credentialPlan.deviceCredential}`,
              },
              body: JSON.stringify({
                station_id: request.stationId,
                prompt_text: request.promptText,
                ...(this.options.requestGroupId === undefined
                  ? {}
                  : { request_group_id: this.options.requestGroupId }),
              }),
              signal: abortController.signal,
            },
          );
          if (!fetched.ok) throw responseReason(fetched.status);
          const declaredLength = Number(fetched.headers.get("Content-Length"));
          if (
            Number.isFinite(declaredLength)
            && declaredLength > LLM_STATION_MAX_OUTPUT_BYTES
          ) {
            throw new LlmStationUnavailableError(
              "malformed_wrapper",
              "gemini-remote",
            );
          }
          return [fetched, await fetched.text()];
        })(),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof LlmStationUnavailableError) throw error;
      if (abortController.signal.aborted) {
        throw new LlmStationUnavailableError("timeout", "gemini-remote");
      }
      throw new LlmStationUnavailableError("runner_failure", "gemini-remote");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
    void response;

    if (Buffer.byteLength(responseText, "utf8") > LLM_STATION_MAX_OUTPUT_BYTES) {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "gemini-remote",
      );
    }
    let wrapper: unknown;
    try {
      assertTaskMapStrictJsonSyntaxAndUniqueKeys(responseText);
      wrapper = JSON.parse(responseText);
    } catch {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "gemini-remote",
      );
    }
    if (wrapper === null || Array.isArray(wrapper) || typeof wrapper !== "object") {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "gemini-remote",
      );
    }
    const record = wrapper as Record<string, unknown>;
    const data = record.data;
    if (
      record.status !== "success"
      || data === null
      || Array.isArray(data)
      || typeof data !== "object"
    ) {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "gemini-remote",
      );
    }
    const dataRecord = data as Record<string, unknown>;
    if (
      typeof dataRecord.output_json !== "string"
      || !validModel(dataRecord.model)
    ) {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "gemini-remote",
      );
    }
    const outputJson = stripTaskMapModelOutputFences(dataRecord.output_json);
    if (Buffer.byteLength(outputJson, "utf8") > LLM_STATION_MAX_OUTPUT_BYTES) {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "gemini-remote",
      );
    }
    if (outputJson.trim().length === 0) {
      throw new LlmStationUnavailableError(
        "empty_final_output",
        "gemini-remote",
      );
    }
    this.model = dataRecord.model;
    return Object.freeze({
      stationId: request.stationId,
      model: dataRecord.model,
      promptDigest: taskMapContractDigest(request.promptText),
      inputDigest: request.inputDigest,
      outputJson,
      producedAt: strictLlmProducedAt(this.options.clock),
      transport: "gemini-remote",
    });
  }
}
