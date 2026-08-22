import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  assertConfirmedTaskMapOwner,
  loadConfirmedTaskMapOwner,
  loadConfirmedTaskMapOwnerSync,
  validateTaskMapOwnerEnrollment,
} from "../src/identity.js";
import { confirmedTestOwner } from "./support/confirmed-owner.js";
import {
  TASKMAP_OWNER_SCOPE_DOMAIN,
  createTaskMapOwnerScope,
  taskMapOwnerScopeDigest,
} from "../src/engine/taskmap/owner-scope.js";
import {
  taskMapAgentSessionOwnerScopeDigest,
} from "../src/engine/taskmap/agent-session-producer-freshness.js";
import {
  taskMapCalendarOwnerScopeDigest,
} from "../src/engine/taskmap/calendar-producer-freshness.js";
import {
  taskMapMeetingProducerOwnerScopeDigest,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  TASKMAP_NATIVE_REFRESH_STATE_VERSION,
  TaskMapNativeRefreshService,
  type TaskMapNativeSafeSlice,
} from "../src/engine/taskmap/native-refresh-service.js";
import {
  TASKMAP_OWNER_REFRESH_SOURCES,
  type TaskMapOwnerCollectedSlice,
  type TaskMapOwnerRefreshCollectors,
  type TaskMapOwnerRefreshSource,
} from "../src/engine/taskmap/owner-refresh-coordinator.js";

const OWNER_A = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const OWNER_B = "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1";
const DEVICE_CREDENTIAL =
  "dbd_owner_scope_123456789012345678901234";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(path.join(process.cwd(), `.${prefix}`));
  temporaryRoots.push(root);
  return root;
}

function expectedDigest(userId: string): string {
  return createHash("sha256")
    .update(`${TASKMAP_OWNER_SCOPE_DOMAIN}\0${userId}`, "utf8")
    .digest("hex");
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function ownedSlice(
  source: TaskMapOwnerRefreshSource,
  ownerScopeDigest: string,
): TaskMapOwnerCollectedSlice<TaskMapNativeSafeSlice> {
  const value: TaskMapNativeSafeSlice = {
    contractVersion: "taskmap-native-safe-source-slice.v1",
    ownerScopeDigest,
    source,
    recordCount: 1,
    records: [{
      identityDigest: expectedDigest(OWNER_A),
      revision: `${source}-r1`,
      occurredAtMs: 1_000,
    }],
    metadata: { synthetic: true },
  };
  return {
    ownerScopeDigest,
    revision: `${source}-r1`,
    sliceDigest: createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex"),
    value,
  };
}

function failingCollectors(
  calls: Map<TaskMapOwnerRefreshSource, number>,
): TaskMapOwnerRefreshCollectors<TaskMapNativeSafeSlice> {
  return Object.fromEntries(TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
    source,
    async () => {
      calls.set(source, (calls.get(source) ?? 0) + 1);
      throw new Error("synthetic source unavailable");
    },
  ])) as unknown as TaskMapOwnerRefreshCollectors<TaskMapNativeSafeSlice>;
}

describe("Task Map confirmed owner scope", () => {
  it("derives the frozen v1 digest from the canonical uppercase UUID", () => {
    assert.equal(TASKMAP_OWNER_SCOPE_DOMAIN, "taskmap-owner-scope.v1");
    assert.equal(
      taskMapOwnerScopeDigest(OWNER_A),
      expectedDigest(OWNER_A),
    );
    assert.equal(
      taskMapAgentSessionOwnerScopeDigest(OWNER_A),
      expectedDigest(OWNER_A),
    );
    assert.equal(
      taskMapMeetingProducerOwnerScopeDigest(OWNER_A),
      expectedDigest(OWNER_A),
    );
    assert.equal(
      taskMapCalendarOwnerScopeDigest(OWNER_A),
      expectedDigest(OWNER_A),
    );
    assert.match(taskMapOwnerScopeDigest(OWNER_A), /^[a-f0-9]{64}$/u);
    for (const invalid of [
      OWNER_A.toLowerCase(),
      ` ${OWNER_A}`,
      "local",
      "local-calendar-owner",
      "local-agent-session-owner-501",
      "",
    ]) {
      assert.throws(
        () => taskMapOwnerScopeDigest(invalid),
        /canonical uppercase UUID/u,
      );
    }
  });

  it("derives disjoint production roots below the per-owner digest", () => {
    const home = "/tmp/taskmap-owner-scope-home";
    const first = createTaskMapOwnerScope(OWNER_A, home);
    const second = createTaskMapOwnerScope(OWNER_B, home);

    assert.notEqual(first.ownerScopeDigest, second.ownerScopeDigest);
    assert.equal(
      first.ownerRoot,
      path.join(
        home,
        "Library",
        "Application Support",
        "DaoBrew",
        "owners",
        first.ownerScopeDigest,
      ),
    );
    assert.equal(first.runtimeRoot, path.join(first.ownerRoot, "taskmap-refresh"));
    assert.equal(first.taskMapRoot, path.join(first.ownerRoot, "taskmap"));
    assert.equal(first.sourceRoot, path.join(first.ownerRoot, "sources"));
    assert.notEqual(first.ownerRoot, second.ownerRoot);
  });

  it("requires one persisted confirmed credential and safe HTTPS issuer", () => {
    const home = "/tmp/taskmap-confirmed-owner-home";
    const accepted = validateTaskMapOwnerEnrollment({
      user_id: OWNER_A,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_url: "https://api.example.test/api/v1/",
    }, {}, home);

    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.owner.userId, OWNER_A);
    assert.equal(accepted.owner.deviceCredential, DEVICE_CREDENTIAL);
    assert.equal(accepted.owner.issuerUrl, "https://api.example.test/api/v1");
    assert.equal(
      accepted.owner.ownerScopeDigest,
      taskMapOwnerScopeDigest(OWNER_A),
    );

    const incomplete = [
      { user_id: OWNER_A, api_url: "https://api.example.test" },
      {
        user_id: OWNER_A,
        device_credential: DEVICE_CREDENTIAL,
        api_url: "https://api.example.test",
      },
      {
        user_id: OWNER_A,
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: false,
        api_url: "https://api.example.test",
      },
      {
        user_id: OWNER_A,
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
      },
      {
        user_id: OWNER_A,
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
        api_url: "http://api.example.test",
      },
      {
        user_id: OWNER_A,
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
        api_url: "https://owner:secret@api.example.test",
      },
    ];
    for (const config of incomplete) {
      assert.equal(
        validateTaskMapOwnerEnrollment(config, {}, home).ok,
        false,
      );
    }
  });

  it("rejects an explicit UUID mismatch and never lets environment URL rebind enrollment", () => {
    const config = {
      user_id: OWNER_A,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_url: "https://issuer.example.test/api/v1",
    };
    const mismatch = validateTaskMapOwnerEnrollment(config, {
      userId: OWNER_B,
      apiUrl: "https://attacker.example.test/api/v1",
    }, "/tmp/taskmap-owner-mismatch-home");
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) {
      assert.match(mismatch.reason, /explicit owner.*changed/u);
    }

    const bound = validateTaskMapOwnerEnrollment(config, {
      userId: OWNER_A,
      apiUrl: "https://attacker.example.test/api/v1",
    }, "/tmp/taskmap-owner-bound-home");
    assert.equal(bound.ok, true);
    if (bound.ok) {
      assert.equal(bound.owner.issuerUrl, config.api_url);
    }
  });

  it("mints service authority only from the fixed owner-only persisted enrollment", async () => {
    const home = temporaryRoot("taskmap-persisted-owner-");
    writeJson(path.join(home, ".daobrew", "config.json"), {
      user_id: OWNER_A,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_url: "https://issuer.example.test/api/v1",
    });

    const loaded = await loadConfirmedTaskMapOwner(home, {
      userId: OWNER_A,
      apiUrl: "https://attacker.example.test/api/v1",
    });

    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assertConfirmedTaskMapOwner(loaded.owner);
    assert.equal(
      loaded.owner.issuerUrl,
      "https://issuer.example.test/api/v1",
    );
    assert.equal(loaded.owner.homeDirectory, home);
  });

  it("fails closed when the confirmed enrollment parent is rebound after open", async () => {
    const home = temporaryRoot("taskmap-persisted-owner-parent-race-");
    const original = path.join(home, ".daobrew");
    const replacement = path.join(home, "replacement");
    writeJson(path.join(original, "config.json"), {
      user_id: OWNER_A,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_url: "https://issuer.example.test/api/v1",
    });
    writeJson(path.join(replacement, "config.json"), {
      user_id: OWNER_B,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_url: "https://issuer.example.test/api/v1",
    });

    const loaded = await loadConfirmedTaskMapOwner(home, {}, async () => {
      renameSync(original, path.join(home, "original-detached"));
      renameSync(replacement, original);
    });

    assert.equal(loaded.ok, false);
  });

  it("fails closed when the synchronous enrollment parent is rebound after open", () => {
    const home = temporaryRoot("taskmap-persisted-owner-sync-parent-race-");
    const original = path.join(home, ".daobrew");
    const replacement = path.join(home, "replacement");
    writeJson(path.join(original, "config.json"), {
      user_id: OWNER_A,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_url: "https://issuer.example.test/api/v1",
    });
    writeJson(path.join(replacement, "config.json"), {
      user_id: OWNER_B,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_url: "https://issuer.example.test/api/v1",
    });

    const loaded = loadConfirmedTaskMapOwnerSync(home, {}, () => {
      renameSync(original, path.join(home, "original-detached"));
      renameSync(replacement, original);
    });

    assert.equal(loaded.ok, false);
  });

  it("fails before collector callbacks when no confirmed owner is bound", () => {
    assert.equal(
      (TASKMAP_OWNER_REFRESH_SOURCES as readonly string[]).includes("gmail"),
      false,
    );
    const root = temporaryRoot("taskmap-unpaired-service-");
    const calls = new Map<TaskMapOwnerRefreshSource, number>();
    assert.throws(
      () => new TaskMapNativeRefreshService({
        runtimeRoot: path.join(root, "runtime"),
        projectionPath: path.join(root, "taskmap", "taskmap-projection.v1.json"),
        currentnessPath: path.join(root, "taskmap", "taskmap-currentness.v1.json"),
        collectors: failingCollectors(calls),
        graphBuilder: async () => {
          throw new Error("graph builder must not run while unpaired");
        },
      } as unknown as ConstructorParameters<
        typeof TaskMapNativeRefreshService
      >[0]),
      /confirmed owner authority/u,
    );
    assert.equal([...calls.values()].reduce((sum, value) => sum + value, 0), 0);
  });

  it("rejects a structurally forged owner scope without confirmed authority", () => {
    const root = temporaryRoot("taskmap-forged-owner-service-");
    const calls = new Map<TaskMapOwnerRefreshSource, number>();
    assert.throws(
      () => new TaskMapNativeRefreshService({
        ownerScope: createTaskMapOwnerScope(OWNER_A, path.join(root, "home")),
        runtimeRoot: path.join(root, "runtime"),
        projectionPath: path.join(root, "taskmap", "taskmap-projection.v1.json"),
        currentnessPath: path.join(root, "taskmap", "taskmap-currentness.v1.json"),
        collectors: failingCollectors(calls),
        graphBuilder: async () => {
          throw new Error("forged owner graph must not run");
        },
      } as unknown as ConstructorParameters<
        typeof TaskMapNativeRefreshService
      >[0]),
      /confirmed owner authority/u,
    );
  });

  it("does not restore another owner's state or last-good source slices", async () => {
    const root = temporaryRoot("taskmap-owner-isolation-");
    const sharedRuntimeRoot = path.join(root, "runtime");
    const sharedTaskMapRoot = path.join(root, "taskmap");
    const first = createTaskMapOwnerScope(OWNER_A, path.join(root, "home"));
    const second = createTaskMapOwnerScope(OWNER_B, path.join(root, "home"));
    const firstSlice = ownedSlice("agent_session", first.ownerScopeDigest);
    writeJson(path.join(sharedRuntimeRoot, "taskmap-refresh-state.v1.json"), {
      contractVersion: TASKMAP_NATIVE_REFRESH_STATE_VERSION,
      ownerScopeDigest: first.ownerScopeDigest,
      lastAttemptAtMs: 1_000,
      lastSuccessfulRefreshAtMs: 1_000,
      lastRefreshStatus: "published",
      lastPublicationBlockReason: null,
      verifiedGraphInputDigest: null,
      verifiedCandidateDigest: null,
      verifiedProjectionDigest: null,
      lastSourceStatuses: [{
        source: "agent_session",
        disposition: "fresh",
      }],
      lastSourceSuccessAtMs: { agent_session: 1_000 },
      calendarProviderStatuses: [],
      sources: { agent_session: firstSlice },
    });
    const calls = new Map<TaskMapOwnerRefreshSource, number>();
    let observedDispositions: string[] = [];
    const service = new TaskMapNativeRefreshService({
      confirmedOwner: confirmedTestOwner(OWNER_B),
      runtimeRoot: sharedRuntimeRoot,
      projectionPath: path.join(sharedTaskMapRoot, "taskmap-projection.v1.json"),
      currentnessPath: path.join(sharedTaskMapRoot, "taskmap-currentness.v1.json"),
      collectors: failingCollectors(calls),
      graphBuilder: async (input) => {
        observedDispositions = input.graphInput.sources.map(
          (source) => source.disposition,
        );
        throw new Error("synthetic graph unavailable");
      },
      nowMs: () => 2_000,
    });

    const result = await service.requestRefresh("manual");

    assert.equal(result.refreshStatus, "unavailable");
    assert.deepEqual(observedDispositions, [
      "unavailable",
      "unavailable",
      "unavailable",
      "unavailable",
    ]);
    assert.equal(
      result.sourceStatuses.find((status) => status.source === "agent_session")
        ?.state,
      "unavailable",
    );
  });
});
